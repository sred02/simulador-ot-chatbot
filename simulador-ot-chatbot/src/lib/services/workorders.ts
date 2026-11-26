import "server-only";
// ═══════════════════════════════════════════════════════════════════════
//  Servicio de Órdenes de Trabajo — ÚNICO punto de entrada a los datos.
//  Lo usan por igual la interfaz (API Routes) y el chatbot (herramientas),
//  por eso las reglas de RBAC, transición de estados, validación y
//  auditoría se aplican siempre, sin importar el canal.
// ═══════════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";
import { getRepository } from "../data/repository";
import { buildSeed } from "../data/seed";
import {
  ACTIVE_STATUSES,
  LOCKED_STATUSES,
  STATUS_LABEL,
  isValidPriority,
  isValidStatus,
  isValidWorkType,
  todayISO,
} from "../domain";
import { allowedNextStatuses, can, canSeeWorkOrder, checkStatusChange } from "../rbac";
import type {
  AuditAction,
  AuditEntry,
  AuditResult,
  Channel,
  Kpis,
  Priority,
  PublicUser,
  WoStatus,
  WorkLog,
  WorkOrder,
  WorkOrderFilters,
  WorkType,
} from "../types";

export type ErrorCode = "NO_ENCONTRADA" | "DENEGADO" | "VALIDACION" | "CONFLICTO" | "SOLO_LECTURA";

export class ServiceError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
  get httpStatus() {
    return { NO_ENCONTRADA: 404, DENEGADO: 403, VALIDACION: 422, CONFLICTO: 409, SOLO_LECTURA: 423 }[this.code];
  }
}

export interface Ctx {
  user: PublicUser;
  channel: Channel;
  ref?: string | null;
}

export const TZ = () => process.env.APP_TIMEZONE || "America/Bogota";
export const isReadOnlyMode = () => process.env.MODO_SOLO_LECTURA === "true";

// ── Auditoría ──────────────────────────────────────────────────────────
export async function audit(
  ctx: Ctx,
  action: AuditAction,
  result: AuditResult,
  detail: string,
  wonum: string | null = null,
  before: Record<string, unknown> | null = null,
  after: Record<string, unknown> | null = null,
): Promise<AuditEntry> {
  const repo = await getRepository();
  return repo.insertAudit({
    ts: new Date().toISOString(),
    user_id: ctx.user.id,
    user_name: ctx.user.name,
    role: ctx.user.role,
    action,
    wonum,
    channel: ctx.channel,
    result,
    detail,
    ref: ctx.ref ?? null,
    before_data: before,
    after_data: after,
  });
}

async function deny(ctx: Ctx, action: AuditAction, reason: string, wonum: string | null, attempted?: Record<string, unknown>): Promise<never> {
  await audit(ctx, action, "DENEGADO", reason, wonum, null, attempted ?? null);
  throw new ServiceError("DENEGADO", reason);
}

async function ensureWritable(ctx: Ctx, action: AuditAction, wonum: string | null) {
  if (isReadOnlyMode())
    await deny(ctx, action, "El sistema está en MODO SOLO LECTURA: ningún usuario puede modificar datos.", wonum).catch((e) => {
      throw new ServiceError("SOLO_LECTURA", (e as Error).message);
    });
}

// ── Lectura ────────────────────────────────────────────────────────────
export function normalizeWonum(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  const full = s.match(/^OT-?(\d{4})-?(\d{1,4})$/);
  if (full) return `OT-${full[1]}-${full[2].padStart(3, "0")}`;
  const short = s.match(/^(?:OT-?)?(\d{1,3})$/);
  if (short) return `OT-${todayISO(TZ()).slice(0, 4)}-${short[1].padStart(3, "0")}`;
  return s;
}

function scope(user: PublicUser, wos: WorkOrder[]): WorkOrder[] {
  return wos.filter((w) => canSeeWorkOrder(user, w));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export async function listWorkOrders(ctx: Ctx, f: WorkOrderFilters = {}): Promise<WorkOrder[]> {
  const repo = await getRepository();
  const today = todayISO(TZ());
  let rows = scope(ctx.user, await repo.listWorkOrders());
  if (f.wonum) rows = rows.filter((w) => w.wonum.includes(f.wonum!.toUpperCase().trim()));
  if (f.assetnum) {
    const a = norm(f.assetnum);
    rows = rows.filter((w) => norm(w.assetnum).includes(a));
  }
  if (f.location) {
    const l = norm(f.location);
    rows = rows.filter((w) => norm(w.location).includes(l));
  }
  if (f.status === "ABIERTAS") rows = rows.filter((w) => ACTIVE_STATUSES.includes(w.status));
  else if (f.status === "ASIGNADAS") rows = rows.filter((w) => w.status === "APPR" || w.status === "WMATL");
  else if (f.status) rows = rows.filter((w) => w.status === f.status);
  if (f.priority) rows = rows.filter((w) => w.wopriority === f.priority);
  if (f.lead) {
    const lead = f.lead === "me" ? ctx.user.id : f.lead;
    rows = rows.filter((w) => w.lead === lead);
  }
  if (f.dueToday) rows = rows.filter((w) => ACTIVE_STATUSES.includes(w.status) && !!w.target_finish && w.target_finish <= today);
  if (f.q) {
    const q = norm(f.q);
    rows = rows.filter((w) =>
      [w.wonum, w.description, w.assetnum, w.location, w.long_description ?? "", w.vendor ?? ""].some((v) => norm(v).includes(q)),
    );
  }
  // Orden operativo: prioridad, luego fecha objetivo
  return rows.sort(
    (a, b) => a.wopriority - b.wopriority || (a.target_finish ?? "9999").localeCompare(b.target_finish ?? "9999") || a.wonum.localeCompare(b.wonum),
  );
}

export async function getKpis(ctx: Ctx): Promise<Kpis> {
  const repo = await getRepository();
  const rows = scope(ctx.user, await repo.listWorkOrders());
  const today = todayISO(TZ());
  const c = (s: WoStatus[]) => rows.filter((w) => s.includes(w.status)).length;
  return {
    total: rows.length,
    waitingApproval: c(["WAPPR"]),
    openAssigned: c(["APPR", "WMATL"]),
    inProgress: c(["INPRG"]),
    critical: rows.filter((w) => w.wopriority === 1 && ACTIVE_STATUSES.includes(w.status)).length,
    completed: c(["COMP"]),
    closed: c(["CLOSE"]),
    overdue: rows.filter((w) => ACTIVE_STATUSES.includes(w.status) && !!w.target_finish && w.target_finish <= today).length,
  };
}

/** Devuelve la OT si existe y el usuario puede verla; si no, audita y lanza error */
export async function getVisibleWorkOrder(ctx: Ctx, wonumRaw: string, actionOnDeny: AuditAction = "CONSULTA"): Promise<WorkOrder> {
  const repo = await getRepository();
  const wonum = normalizeWonum(wonumRaw);
  const wo = await repo.getWorkOrder(wonum);
  if (!wo) throw new ServiceError("NO_ENCONTRADA", `No existe la orden ${wonum}.`);
  if (!canSeeWorkOrder(ctx.user, wo))
    await deny(ctx, actionOnDeny, `La ${wonum} no pertenece a su empresa (${ctx.user.company}); acceso fuera de alcance.`, wonum);
  return wo;
}

export interface WorkOrderDetail {
  wo: WorkOrder;
  worklogs: WorkLog[];
  audit: AuditEntry[];
  allowedNext: WoStatus[];
  canLog: boolean;
}

export async function getWorkOrderDetail(ctx: Ctx, wonum: string): Promise<WorkOrderDetail> {
  const repo = await getRepository();
  const wo = await getVisibleWorkOrder(ctx, wonum);
  const [worklogs, auditRows] = await Promise.all([repo.listWorkLogs(wo.wonum), repo.listAudit({ wonum: wo.wonum, limit: 100 })]);
  const readOnly = isReadOnlyMode();
  return {
    wo,
    worklogs,
    audit: can(ctx.user, "audit.read.all") ? auditRows : auditRows.filter((a) => a.user_id === ctx.user.id),
    allowedNext: readOnly ? [] : allowedNextStatuses(ctx.user, wo),
    canLog: !readOnly && can(ctx.user, "wo.worklog") && !LOCKED_STATUSES.includes(wo.status),
  };
}

export async function listAuditScoped(ctx: Ctx, limit = 150): Promise<AuditEntry[]> {
  const repo = await getRepository();
  if (can(ctx.user, "audit.read.all")) return repo.listAudit({ limit });
  return repo.listAudit({ userId: ctx.user.id, limit });
}

export async function logConsulta(ctx: Ctx, detail: string, wonum: string | null = null) {
  await audit(ctx, "CONSULTA", "OK", detail, wonum);
}

// ── Escritura: registro de avance / cambio de estado ───────────────────
export interface ProgressInput {
  description: string;
  newStatus?: WoStatus | null;
}

/**
 * Verificación previa (sin escribir). El chatbot la usa ANTES de pedir confirmación,
 * para no ofrecer acciones que el rol no puede ejecutar. Las denegaciones se auditan.
 */
export async function precheckProgress(ctx: Ctx, wonumRaw: string, newStatus?: WoStatus | null): Promise<WorkOrder> {
  const action: AuditAction = newStatus ? "CAMBIO_ESTADO" : "REGISTRO_AVANCE";
  await ensureWritable(ctx, action, normalizeWonum(wonumRaw));
  const wo = await getVisibleWorkOrder(ctx, wonumRaw, action);
  const attempted = newStatus ? { status_solicitado: newStatus, status_actual: wo.status } : null;
  if (!can(ctx.user, "wo.worklog")) await deny(ctx, action, `El rol ${ctx.user.role} es de solo consulta: no puede registrar avances ni modificar OT.`, wo.wonum, attempted ?? undefined);
  if (LOCKED_STATUSES.includes(wo.status))
    await deny(ctx, action, `La ${wo.wonum} está ${STATUS_LABEL[wo.status]}: el registro histórico no admite cambios.`, wo.wonum, attempted ?? undefined);
  if (newStatus && newStatus !== wo.status) {
    if (!isValidStatus(newStatus)) throw new ServiceError("VALIDACION", `Estado desconocido: ${newStatus}`);
    const chk = checkStatusChange(ctx.user, wo, newStatus);
    if (!chk.ok) await deny(ctx, action, chk.reason, wo.wonum, attempted ?? undefined);
  }
  return wo;
}

export async function reportProgress(ctx: Ctx, wonumRaw: string, input: ProgressInput): Promise<{ wo: WorkOrder; log: WorkLog }> {
  const description = (input.description ?? "").trim();
  const newStatus = (input.newStatus as string | null | undefined) ? (input.newStatus as WoStatus) : null;
  const before = await precheckProgress(ctx, wonumRaw, newStatus);
  if (description.length < 10)
    throw new ServiceError("VALIDACION", "La descripción del trabajo realizado es obligatoria (mínimo 10 caracteres).");
  if (description.length > 2000) throw new ServiceError("VALIDACION", "La descripción supera 2000 caracteres.");

  const repo = await getRepository();
  const now = new Date().toISOString();
  const changes = !!newStatus && newStatus !== before.status;
  let wo = before;
  if (changes) {
    const patch: Partial<WorkOrder> = { status: newStatus!, status_date: now, updated_at: now };
    if (newStatus === "INPRG" && !before.actual_start) patch.actual_start = now;
    if (newStatus === "COMP") patch.actual_finish = now;
    if (newStatus === "INPRG" && before.status === "COMP") patch.actual_finish = null; // reapertura
    wo = await repo.updateWorkOrder(before.wonum, patch);
  } else {
    wo = await repo.updateWorkOrder(before.wonum, { updated_at: now });
  }
  const log = await repo.insertWorkLog({
    wonum: wo.wonum,
    created_by: ctx.user.id,
    created_at: now,
    log_type: changes ? "CAMBIO_ESTADO" : "AVANCE",
    description: changes ? `${before.status} → ${newStatus}: ${description}` : description,
    channel: ctx.channel,
  });
  await audit(
    ctx,
    changes ? "CAMBIO_ESTADO" : "REGISTRO_AVANCE",
    "OK",
    changes ? `Estado ${before.status} → ${newStatus}. ${description}` : `Avance registrado: ${description}`,
    wo.wonum,
    changes ? { status: before.status } : null,
    changes ? { status: newStatus, worklog_id: log.id } : { worklog_id: log.id },
  );
  return { wo, log };
}

// ── Escritura: creación de OT ──────────────────────────────────────────
export interface CreateInput {
  assetnum?: string | null;
  location?: string | null;
  description?: string | null;
  long_description?: string | null;
  wopriority?: number | null;
  worktype?: string | null;
  lead?: string | null;
  target_finish?: string | null;
  est_hours?: number | null;
  est_cost?: number | null;
}

export interface CreateValidation {
  missing: string[];
  errors: string[];
  normalized: {
    assetnum: string;
    location: string;
    description: string;
    long_description: string | null;
    wopriority: Priority;
    worktype: WorkType;
    lead: string | null;
    target_finish: string | null;
    est_hours: number | null;
    est_cost: number | null;
  } | null;
}

export async function validateCreate(input: CreateInput): Promise<CreateValidation> {
  const repo = await getRepository();
  const missing: string[] = [];
  const errors: string[] = [];
  const [assets, locations, users] = await Promise.all([repo.listAssets(), repo.listLocations(), repo.listUsers()]);

  const assetnum = (input.assetnum ?? "").trim().toUpperCase();
  const asset = assets.find((a) => a.assetnum === assetnum);
  if (!assetnum) missing.push("activo (ASSETNUM)");
  else if (!asset) errors.push(`El activo ${assetnum} no existe en el catálogo.`);

  let location = (input.location ?? "").trim().toUpperCase();
  if (!location && asset) location = asset.location; // por defecto, la ubicación del activo
  if (!location) missing.push("ubicación (LOCATION)");
  else if (!locations.some((l) => l.location === location)) errors.push(`La ubicación ${location} no existe.`);
  else if (asset && asset.location !== location)
    errors.push(`El activo ${asset.assetnum} está instalado en ${asset.location}, no en ${location}.`);

  const description = (input.description ?? "").trim();
  if (!description) missing.push("descripción de la falla");
  else if (description.length < 10) errors.push("La descripción de la falla debe tener al menos 10 caracteres.");
  else if (description.length > 200) errors.push("La descripción corta no debe superar 200 caracteres.");

  const p = input.wopriority == null ? null : Number(input.wopriority);
  if (p == null || Number.isNaN(p)) missing.push("prioridad (1 a 4)");
  else if (!isValidPriority(p)) errors.push("La prioridad debe ser 1 (crítica), 2, 3 o 4 (baja).");

  const wt = (input.worktype ?? "CM").toString().trim().toUpperCase();
  if (!isValidWorkType(wt)) errors.push("Tipo de trabajo inválido: use CM, PM, EM o CP.");

  let lead: string | null = (input.lead ?? "").trim() || null;
  if (lead) {
    const u = users.find((x) => x.id === lead || x.name.toLowerCase() === lead!.toLowerCase());
    if (!u) errors.push(`El técnico ${lead} no existe.`);
    else if (u.role !== "CONTRATISTA") errors.push(`${u.name} no es un técnico contratista.`);
    else lead = u.id;
  }

  const tf = (input.target_finish ?? "").trim() || null;
  if (tf && !/^\d{4}-\d{2}-\d{2}$/.test(tf)) errors.push("La fecha objetivo debe tener formato AAAA-MM-DD.");

  const ok = missing.length === 0 && errors.length === 0;
  return {
    missing,
    errors,
    normalized: ok
      ? {
          assetnum,
          location,
          description,
          long_description: (input.long_description ?? "").trim() || null,
          wopriority: p as Priority,
          worktype: wt as WorkType,
          lead,
          target_finish: tf,
          est_hours: input.est_hours == null ? null : Number(input.est_hours),
          est_cost: input.est_cost == null ? null : Number(input.est_cost),
        }
      : null,
  };
}

export async function precheckCreate(ctx: Ctx) {
  await ensureWritable(ctx, "CREAR_OT", null);
  if (!can(ctx.user, "wo.create"))
    await deny(ctx, "CREAR_OT", `Solo Planeación y verificación puede crear órdenes de trabajo. Su rol (${ctx.user.role}) no tiene este permiso.`, null);
}

export async function createWorkOrder(ctx: Ctx, input: CreateInput): Promise<WorkOrder> {
  await precheckCreate(ctx);
  const v = await validateCreate(input);
  if (!v.normalized)
    throw new ServiceError("VALIDACION", [...v.missing.map((m) => `Falta: ${m}`), ...v.errors].join(" "));
  const n = v.normalized;
  const repo = await getRepository();
  const [assets, locations, users] = await Promise.all([repo.listAssets(), repo.listLocations(), repo.listUsers()]);
  const asset = assets.find((a) => a.assetnum === n.assetnum)!;
  const loc = locations.find((l) => l.location === n.location)!;
  const leadUser = n.lead ? users.find((u) => u.id === n.lead) : null;
  const now = new Date().toISOString();
  const today = todayISO(TZ());
  const year = Number(today.slice(0, 4));

  // Reintento simple ante colisión de consecutivo (dos creaciones simultáneas)
  for (let attempt = 0; attempt < 3; attempt++) {
    const wonum = await repo.nextWonum(year);
    const wo: WorkOrder = {
      wonum,
      description: n.description,
      long_description: n.long_description,
      assetnum: asset.assetnum,
      location: loc.location,
      site: loc.site,
      service: asset.service,
      worktype: n.worktype,
      wopriority: n.wopriority,
      status: leadUser ? "APPR" : "WAPPR",
      status_date: now,
      reported_by: ctx.user.id,
      report_date: now,
      supervisor: ctx.user.id,
      lead: leadUser?.id ?? null,
      vendor: leadUser?.company ?? null,
      target_start: today,
      target_finish: n.target_finish,
      actual_start: null,
      actual_finish: null,
      est_hours: n.est_hours,
      est_cost: n.est_cost,
      actual_cost: null,
      updated_at: now,
    };
    try {
      const saved = await repo.insertWorkOrder(wo);
      await repo.insertWorkLog({
        wonum,
        created_by: ctx.user.id,
        created_at: now,
        log_type: "CREACION",
        description: `OT creada (${ctx.channel === "CHATBOT" ? "asistente conversacional" : "formulario"}). ${n.long_description ?? ""}`.trim(),
        channel: ctx.channel,
      });
      await audit(ctx, "CREAR_OT", "OK", `OT creada: ${n.description}`, wonum, null, {
        status: saved.status,
        wopriority: saved.wopriority,
        assetnum: saved.assetnum,
        location: saved.location,
        lead: saved.lead,
      });
      return saved;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new ServiceError("CONFLICTO", "No fue posible asignar un consecutivo a la OT.");
}

// ── Eliminación (siempre denegada) ─────────────────────────────────────
export async function requestDelete(ctx: Ctx, wonumRaw: string, motivo?: string): Promise<never> {
  const wonum = normalizeWonum(wonumRaw);
  return deny(
    ctx,
    "ELIMINAR",
    `Ningún rol puede eliminar órdenes de trabajo: el registro debe conservarse para auditoría. ${
      can(ctx.user, "wo.status") && ctx.user.role === "PLANEACION"
        ? "Si la OT no procede, cámbiela a estado CAN (Cancelada) con su justificación."
        : "Si la OT no procede, solicite a Planeación su cancelación (estado CAN)."
    }`,
    wonum,
    motivo ? { motivo } : undefined,
  );
}

// ── Exportación con código de verificación ─────────────────────────────
export async function exportCsv(ctx: Ctx, f: WorkOrderFilters): Promise<{ csv: string; code: string }> {
  if (!can(ctx.user, "export")) await deny(ctx, "EXPORTAR", `Su rol (${ctx.user.role}) no puede exportar información.`, null);
  const rows = await listWorkOrders(ctx, f);
  const cols: (keyof WorkOrder)[] = [
    "wonum", "description", "assetnum", "location", "service", "worktype", "wopriority", "status",
    "lead", "vendor", "target_start", "target_finish", "actual_start", "actual_finish", "est_cost", "actual_cost",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const stamp = new Date().toISOString();
  const code = createHash("sha256").update(`${body}|${stamp}|${ctx.user.id}`).digest("hex").slice(0, 16).toUpperCase();
  await audit({ ...ctx, ref: code }, "EXPORTAR", "OK", `Exportación de ${rows.length} OT con filtros ${JSON.stringify(f)}`, null);
  const footer = `\n# Generado: ${stamp} | Usuario: ${ctx.user.id} | Registros: ${rows.length} | Código de verificación: ${code}`;
  return { csv: body + footer, code };
}

// ── Restablecer datos de demostración ─────────────────────────────────
export async function resetData(ctx: Ctx) {
  if (!can(ctx.user, "data.reset")) await deny(ctx, "RESET_DATOS", "Su rol no puede restablecer los datos de demostración.", null);
  const repo = await getRepository();
  await repo.reset(buildSeed(new Date(), TZ()));
  await audit(ctx, "RESET_DATOS", "OK", "Datos de demostración restablecidos al estado inicial.", null);
}

export function serviceErrorResponse(e: unknown): Response {
  if (e instanceof ServiceError) return Response.json({ error: e.message, code: e.code }, { status: e.httpStatus });
  console.error(e);
  return Response.json({ error: "Error interno del servidor", code: "ERROR" }, { status: 500 });
}
