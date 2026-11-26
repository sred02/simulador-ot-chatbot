import "server-only";
// Herramientas (Function Calling / Tool Use) que el chatbot puede invocar.
// Tanto el LLM como el modo demo pasan por aquí → mismo RBAC y misma auditoría.
import { getRepository } from "../data/repository";
import { ACTIVE_STATUSES, PRIORITY_LABEL, STATUS_LABEL, WORKTYPE_LABEL, formatCOP, isValidStatus, todayISO } from "../domain";
import { allowedNextStatuses, can } from "../rbac";
import {
  ServiceError,
  TZ,
  getKpis,
  getVisibleWorkOrder,
  listWorkOrders,
  logConsulta,
  precheckCreate,
  precheckProgress,
  requestDelete,
  validateCreate,
  type Ctx,
} from "../services/workorders";
import type { WoStatus, WorkOrder } from "../types";
import { createPendingCard } from "./pending";
import type { PendingCard } from "./types";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const STATUS_ENUM = ["WAPPR", "APPR", "WMATL", "INPRG", "COMP", "CLOSE", "CAN"];

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "buscar_ordenes",
    description:
      "Busca órdenes de trabajo visibles para el usuario (el alcance por rol se aplica automáticamente). Úsala para '¿qué órdenes tengo pendientes?', 'órdenes críticas', 'órdenes del activo X', etc.",
    parameters: {
      type: "object",
      properties: {
        estado: { type: "string", enum: [...STATUS_ENUM, "ABIERTAS"], description: "Estado Maximo o ABIERTAS (WAPPR, APPR, WMATL, INPRG)" },
        prioridad: { type: "integer", minimum: 1, maximum: 4 },
        activo: { type: "string", description: "Código ASSETNUM o parte de él" },
        ubicacion: { type: "string", description: "Código LOCATION o parte de él" },
        tecnico: { type: "string", description: "'yo' para el usuario actual, o el id del técnico" },
        texto: { type: "string", description: "Texto libre a buscar en la descripción" },
        vencen_hoy: { type: "boolean", description: "Solo OT activas cuya fecha objetivo es hoy o ya venció" },
      },
    },
  },
  {
    name: "consultar_orden",
    description: "Devuelve el detalle de una OT (estado, activo, ubicación, técnico, fechas, costos, últimos avances y campos vacíos).",
    parameters: {
      type: "object",
      properties: { wonum: { type: "string", description: "Número de OT, ej. OT-2026-004" } },
      required: ["wonum"],
    },
  },
  {
    name: "resumen_indicadores",
    description: "KPIs del tablero dentro del alcance del usuario: total, por estado, críticas y vencidas.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "listar_catalogo",
    description: "Lista activos, ubicaciones o técnicos contratistas. Úsala para ayudar a completar la creación de una OT.",
    parameters: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["activos", "ubicaciones", "tecnicos"] },
        texto: { type: "string", description: "Filtro opcional" },
      },
      required: ["tipo"],
    },
  },
  {
    name: "proponer_reporte_avance",
    description:
      "Prepara (NO ejecuta) el registro de avance de una OT y, opcionalmente, un cambio de estado. Muestra al usuario una tarjeta para confirmar. Requiere WONUM y descripción del trabajo realizado (mínimo 10 caracteres).",
    parameters: {
      type: "object",
      properties: {
        wonum: { type: "string" },
        descripcion: { type: "string", description: "Trabajo realizado, mínimo 10 caracteres" },
        nuevo_estado: { type: "string", enum: STATUS_ENUM, description: "Omitir si el estado no cambia" },
      },
      required: ["wonum", "descripcion"],
    },
  },
  {
    name: "proponer_creacion_ot",
    description:
      "Prepara (NO ejecuta) la creación de una OT. Solo rol PLANEACION. Si faltan campos devuelve FALTAN_DATOS con la lista para preguntarlos al usuario.",
    parameters: {
      type: "object",
      properties: {
        activo: { type: "string", description: "ASSETNUM" },
        ubicacion: { type: "string", description: "LOCATION (por defecto la del activo)" },
        descripcion: { type: "string", description: "Descripción de la falla, 10 a 200 caracteres" },
        prioridad: { type: "integer", minimum: 1, maximum: 4 },
        tipo_trabajo: { type: "string", enum: ["CM", "PM", "EM", "CP"] },
        tecnico: { type: "string", description: "id del técnico contratista (opcional)" },
        fecha_objetivo: { type: "string", description: "AAAA-MM-DD (opcional)" },
      },
    },
  },
  {
    name: "solicitar_eliminacion",
    description: "Úsala cuando el usuario pida borrar/eliminar una OT o un registro. La política lo prohíbe: queda auditado.",
    parameters: {
      type: "object",
      properties: { wonum: { type: "string" }, motivo: { type: "string" } },
      required: ["wonum"],
    },
  },
];

type Args = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

async function userNames(): Promise<Map<string, string>> {
  const repo = await getRepository();
  return new Map((await repo.listUsers()).map((u) => [u.id, u.name]));
}

function brief(w: WorkOrder, names: Map<string, string>, today: string) {
  return {
    wonum: w.wonum,
    descripcion: w.description,
    estado: w.status,
    estado_desc: STATUS_LABEL[w.status],
    prioridad: w.wopriority,
    activo: w.assetnum,
    ubicacion: w.location,
    tecnico: w.lead ? names.get(w.lead) ?? w.lead : null,
    fecha_objetivo: w.target_finish,
    vencida: ACTIVE_STATUSES.includes(w.status) && !!w.target_finish && w.target_finish < today,
  };
}

export type ToolResult = Record<string, unknown> & { estado_herramienta: "OK" | "DENEGADO" | "NO_ENCONTRADA" | "VALIDACION" | "FALTAN_DATOS" | "PENDIENTE_CONFIRMACION" | "SOLO_LECTURA" | "ERROR" };

export async function executeTool(ctx: Ctx, name: string, args: Args, cards: PendingCard[]): Promise<ToolResult> {
  try {
    const repo = await getRepository();
    const today = todayISO(TZ());
    switch (name) {
      case "buscar_ordenes": {
        const estado = str(args.estado)?.toUpperCase();
        const rows = await listWorkOrders(ctx, {
          status: estado === "ABIERTAS" || isValidStatus(estado) ? (estado as WoStatus | "ABIERTAS") : "",
          priority: [1, 2, 3, 4].includes(Number(args.prioridad)) ? (Number(args.prioridad) as 1 | 2 | 3 | 4) : 0,
          assetnum: str(args.activo),
          location: str(args.ubicacion),
          lead: str(args.tecnico)?.toLowerCase() === "yo" ? "me" : str(args.tecnico),
          q: str(args.texto),
          dueToday: args.vencen_hoy === true,
        });
        const names = await userNames();
        await logConsulta(ctx, `Búsqueda de OT ${JSON.stringify(args)} → ${rows.length} resultados`);
        return {
          estado_herramienta: "OK",
          total: rows.length,
          alcance: can(ctx.user, "wo.read.all") ? "todas las OT" : `OT de ${ctx.user.company}`,
          ordenes: rows.slice(0, 25).map((w) => brief(w, names, today)),
          truncado: rows.length > 25,
        };
      }
      case "consultar_orden": {
        const wonum = str(args.wonum);
        if (!wonum) return { estado_herramienta: "VALIDACION", mensaje: "Indique el número de OT (WONUM)." };
        const wo = await getVisibleWorkOrder(ctx, wonum);
        const [logs, names, assets, locations] = await Promise.all([repo.listWorkLogs(wo.wonum), userNames(), repo.listAssets(), repo.listLocations()]);
        await logConsulta(ctx, `Consulta del detalle de ${wo.wonum}`, wo.wonum);
        const vacios: string[] = [];
        if (!wo.lead) vacios.push("técnico asignado");
        if (!wo.target_finish) vacios.push("fecha objetivo");
        if (!wo.actual_start && ["INPRG", "COMP", "CLOSE"].includes(wo.status)) vacios.push("inicio real");
        if (!wo.actual_finish && ["COMP", "CLOSE"].includes(wo.status)) vacios.push("fin real");
        if (wo.actual_cost == null && ["COMP", "CLOSE"].includes(wo.status)) vacios.push("costo real");
        if (wo.est_cost == null) vacios.push("presupuesto");
        return {
          estado_herramienta: "OK",
          orden: {
            ...brief(wo, names, today),
            descripcion_larga: wo.long_description,
            activo_desc: assets.find((a) => a.assetnum === wo.assetnum)?.description,
            ubicacion_desc: locations.find((l) => l.location === wo.location)?.description,
            servicio: wo.service,
            tipo_trabajo: `${wo.worktype} · ${WORKTYPE_LABEL[wo.worktype]}`,
            prioridad_desc: PRIORITY_LABEL[wo.wopriority],
            contratista: wo.vendor,
            fecha_estado: wo.status_date,
            inicio_objetivo: wo.target_start,
            inicio_real: wo.actual_start,
            fin_real: wo.actual_finish,
            presupuesto: formatCOP(wo.est_cost),
            costo_real: formatCOP(wo.actual_cost),
            horas_estimadas: wo.est_hours,
          },
          ultimos_avances: logs.slice(0, 5).map((l) => ({
            fecha: l.created_at,
            por: names.get(l.created_by) ?? l.created_by,
            tipo: l.log_type,
            texto: l.description,
            canal: l.channel,
          })),
          estados_permitidos_para_usted: allowedNextStatuses(ctx.user, wo),
          campos_vacios: vacios,
        };
      }
      case "resumen_indicadores": {
        const k = await getKpis(ctx);
        await logConsulta(ctx, "Consulta de indicadores del tablero");
        return { estado_herramienta: "OK", alcance: can(ctx.user, "wo.read.all") ? "todas las OT" : `OT de ${ctx.user.company}`, indicadores: k };
      }
      case "listar_catalogo": {
        const tipo = str(args.tipo);
        const t = (str(args.texto) ?? "").toLowerCase();
        const has = (...v: string[]) => !t || v.some((x) => x.toLowerCase().includes(t));
        if (tipo === "activos")
          return {
            estado_herramienta: "OK",
            activos: (await repo.listAssets()).filter((a) => has(a.assetnum, a.description, a.location)).map((a) => ({ assetnum: a.assetnum, descripcion: a.description, ubicacion: a.location, servicio: a.service })),
          };
        if (tipo === "ubicaciones")
          return { estado_herramienta: "OK", ubicaciones: (await repo.listLocations()).filter((l) => has(l.location, l.description)) };
        if (tipo === "tecnicos")
          return {
            estado_herramienta: "OK",
            tecnicos: (await repo.listUsers()).filter((u) => u.role === "CONTRATISTA" && has(u.id, u.name, u.company)).map((u) => ({ id: u.id, nombre: u.name, empresa: u.company })),
          };
        return { estado_herramienta: "VALIDACION", mensaje: "tipo debe ser activos, ubicaciones o tecnicos" };
      }
      case "proponer_reporte_avance": {
        const wonum = str(args.wonum);
        const descripcion = str(args.descripcion) ?? "";
        const nuevo = str(args.nuevo_estado)?.toUpperCase() ?? null;
        if (!wonum) return { estado_herramienta: "FALTAN_DATOS", faltan: ["wonum"] };
        if (nuevo && !isValidStatus(nuevo)) return { estado_herramienta: "VALIDACION", mensaje: `Estado desconocido: ${nuevo}` };
        const wo = await precheckProgress(ctx, wonum, nuevo as WoStatus | null); // audita si se deniega
        if (descripcion.length < 10)
          return { estado_herramienta: "FALTAN_DATOS", faltan: ["descripción del trabajo realizado (mínimo 10 caracteres)"] };
        const newStatus = nuevo && nuevo !== wo.status ? (nuevo as WoStatus) : null;
        cards.push(createPendingCard(ctx.user, { kind: "PROGRESO", wonum: wo.wonum, description: descripcion, newStatus, currentStatus: wo.status }));
        return {
          estado_herramienta: "PENDIENTE_CONFIRMACION",
          mensaje: "Se mostró al usuario una tarjeta de confirmación. Aún NO se ha modificado nada: pídale revisar y presionar «Confirmar».",
        };
      }
      case "proponer_creacion_ot": {
        await precheckCreate(ctx); // audita si el rol no puede crear
        const v = await validateCreate({
          assetnum: str(args.activo),
          location: str(args.ubicacion),
          description: str(args.descripcion),
          wopriority: args.prioridad == null || args.prioridad === "" ? null : Number(args.prioridad),
          worktype: str(args.tipo_trabajo) ?? "CM",
          lead: str(args.tecnico),
          target_finish: str(args.fecha_objetivo),
        });
        if (!v.normalized) return { estado_herramienta: "FALTAN_DATOS", faltan: v.missing, errores: v.errors };
        cards.push(createPendingCard(ctx.user, { kind: "CREAR", input: v.normalized }));
        return {
          estado_herramienta: "PENDIENTE_CONFIRMACION",
          mensaje: "Se mostró al usuario la tarjeta de confirmación de la nueva OT. Aún NO se ha creado: pídale presionar «Confirmar».",
        };
      }
      case "solicitar_eliminacion": {
        const wonum = str(args.wonum) ?? "(sin OT)";
        await requestDelete(ctx, wonum, str(args.motivo));
        return { estado_herramienta: "DENEGADO" };
      }
      default:
        return { estado_herramienta: "ERROR", mensaje: `Herramienta desconocida: ${name}` };
    }
  } catch (e) {
    if (e instanceof ServiceError) {
      const map = { DENEGADO: "DENEGADO", NO_ENCONTRADA: "NO_ENCONTRADA", VALIDACION: "VALIDACION", CONFLICTO: "ERROR", SOLO_LECTURA: "SOLO_LECTURA" } as const;
      return {
        estado_herramienta: map[e.code],
        mensaje: e.message,
        auditado: e.code === "DENEGADO" || e.code === "SOLO_LECTURA",
      };
    }
    console.error("[tool]", name, e);
    return { estado_herramienta: "ERROR", mensaje: "Error interno al ejecutar la herramienta." };
  }
}

