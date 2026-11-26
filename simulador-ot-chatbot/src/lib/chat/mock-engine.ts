import "server-only";
// ═══════════════════════════════════════════════════════════════════════
//  Modo "Demo inteligente": motor conversacional por reglas para usar el
//  simulador sin API Key. Reconoce intenciones, completa datos paso a paso
//  (slot filling) y llama EXACTAMENTE a las mismas herramientas que el LLM,
//  así que el RBAC, las confirmaciones y la auditoría son idénticos.
// ═══════════════════════════════════════════════════════════════════════
import { getRepository } from "../data/repository";
import { STATUS_LABEL, formatDate, formatDateTime, isValidStatus, todayISO } from "../domain";
import { ROLE_DESCRIPTION, allowedNextStatuses } from "../rbac";
import { ServiceError, TZ, getVisibleWorkOrder, precheckProgress, type Ctx } from "../services/workorders";
import type { WoStatus } from "../types";
import type { ToolResult } from "./tools";
import type { MockState } from "./types";

type Exec = (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
type Out = { reply: string; state: MockState | null };
type Data = MockState["data"];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!.,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function extractWonum(text: string): string | null {
  const m = text.match(/OT[-\s]?(\d{4})[-\s]?(\d{1,3})\b/i);
  if (m) return `OT-${m[1]}-${m[2].padStart(3, "0")}`;
  const n = norm(text).match(/\b(?:ot|orden)\s*(?:#|no|nro|numero)?\s*(\d{1,3})\b/);
  if (n) return `OT-${todayISO(TZ()).slice(0, 4)}-${n[1].padStart(3, "0")}`;
  return null;
}

type StatusPick = WoStatus | "SIN_CAMBIO";
function extractStatus(n: string): StatusPick | null {
  if (/\b(wappr|esperando aprobacion|pendiente de aprobacion)\b/.test(n)) return "WAPPR";
  if (/\b(wmatl|esperando material|espera de material|falta (de )?material|sin material|esperando repuesto)\b/.test(n)) return "WMATL";
  if (/\b(inprg|en progreso|en proceso|en ejecucion|inicie|inicio|empece|empezamos|iniciamos)\b/.test(n)) return "INPRG";
  if (/\b(comp|completad[ao]|complete|completo|termine|terminad[ao]|terminamos|finalice|finalizad[ao]|ejecutad[ao])\b/.test(n)) return "COMP";
  if (/\b(close|cerrar|cerrad[ao]|cierre|cierra|cierro)\b/.test(n)) return "CLOSE";
  if (/\b(can|cancelad[ao]|cancelar la orden|anular|anulad[ao])\b/.test(n)) return "CAN";
  if (/\b(appr|aprobar|aprobad[ao]|apruebo|aprueba)\b/.test(n)) return "APPR";
  if (/\b(sin cambio|igual|mantener|mantiene|no cambia|ninguno|no)\b/.test(n)) return "SIN_CAMBIO";
  return null;
}

const YES = /^(si|sí|ok|okay|dale|listo|confirmo|correcto|esa|asi es|de acuerdo|claro)\b/;

function deniedText(r: ToolResult): string {
  const audited = r.auditado ? "\n\n_El intento quedó registrado en el historial de auditoría._" : "";
  if (r.estado_herramienta === "NO_ENCONTRADA") return `No encontré esa orden. ${r.mensaje ?? ""}`;
  if (r.estado_herramienta === "SOLO_LECTURA") return `🔒 **Modo solo lectura.** ${r.mensaje}${audited}`;
  return `⛔ **Acción no permitida.** ${r.mensaje ?? ""}${audited}`;
}
const isError = (r: ToolResult) => ["DENEGADO", "NO_ENCONTRADA", "SOLO_LECTURA", "ERROR", "VALIDACION"].includes(r.estado_herramienta);

interface Brief {
  wonum: string;
  descripcion: string;
  estado: string;
  estado_desc: string;
  prioridad: number;
  tecnico: string | null;
  fecha_objetivo: string | null;
  vencida: boolean;
}

function fmtList(r: ToolResult, titulo: string): string {
  if (isError(r)) return deniedText(r);
  const rows = (r.ordenes as Brief[]) ?? [];
  if (!rows.length) return `${titulo}: no encontré órdenes con esos criterios (alcance: ${r.alcance}).`;
  const lines = rows.slice(0, 10).map(
    (o) =>
      `- **${o.wonum}** · P${o.prioridad} · ${o.estado} (${o.estado_desc}) — ${o.descripcion}` +
      (o.tecnico ? ` · ${o.tecnico}` : " · _sin técnico_") +
      (o.fecha_objetivo ? ` · objetivo ${formatDate(o.fecha_objetivo)}` : "") +
      (o.vencida ? " · ⚠️ vencida" : ""),
  );
  const more = (r.total as number) > 10 ? `\n…y ${(r.total as number) - 10} más (vea el tablero con filtros).` : "";
  return `${titulo}: **${r.total}** (alcance: ${r.alcance})\n${lines.join("\n")}${more}`;
}

function fmtDetail(r: ToolResult): string {
  if (isError(r)) return deniedText(r);
  const o = r.orden as Record<string, string | number | boolean | null>;
  const logs = (r.ultimos_avances as { fecha: string; por: string; texto: string; canal: string }[]) ?? [];
  const vacios = (r.campos_vacios as string[]) ?? [];
  const next = (r.estados_permitidos_para_usted as string[]) ?? [];
  return [
    `**${o.wonum}** — ${o.descripcion}`,
    `- Estado: **${o.estado}** (${o.estado_desc}) desde ${formatDateTime(o.fecha_estado as string)}`,
    `- Prioridad: ${o.prioridad_desc} · Tipo: ${o.tipo_trabajo}`,
    `- Activo: ${o.activo} — ${o.activo_desc ?? ""}`,
    `- Ubicación: ${o.ubicacion} — ${o.ubicacion_desc ?? ""}`,
    `- Técnico: ${o.tecnico ?? "sin asignar"}${o.contratista ? ` (${o.contratista})` : ""}`,
    `- Fecha objetivo: ${formatDate(o.fecha_objetivo as string | null)}${o.vencida ? " ⚠️ vencida" : ""}`,
    `- Presupuesto: ${o.presupuesto} · Costo real: ${o.costo_real}`,
    logs.length ? `- Último avance (${formatDateTime(logs[0].fecha)}, ${logs[0].por}, vía ${logs[0].canal}): ${logs[0].texto}` : "- Sin avances registrados en bitácora.",
    vacios.length ? `\nCampos vacíos: ${vacios.join(", ")}.` : "",
    next.length ? `Usted puede llevarla a: ${next.map((s) => `${s} (${STATUS_LABEL[s as WoStatus]})`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function help(ctx: Ctx): string {
  const base = [
    `Hola, ${ctx.user.name.split(" ")[0]}. Soy el asistente de órdenes de trabajo (modo demo).`,
    `Su rol: **${ctx.user.role}** — ${ROLE_DESCRIPTION[ctx.user.role]}`,
    "",
    "Pruebe con:",
  ];
  const ex: Record<string, string[]> = {
    CONTRATISTA: [
      "«¿Qué órdenes tengo pendientes hoy?»",
      "«¿Cuál es el estado de la OT-2026-004?»",
      "«Quiero reportar avance en la OT-2026-002»",
      "«Cerrar definitivamente la OT-2026-001» (verá cómo se bloquea)",
    ],
    PLANEACION: [
      "«Crear una nueva orden de trabajo»",
      "«Órdenes esperando aprobación»",
      "«Cerrar la OT-2026-005»",
      "«Resumen de indicadores»",
    ],
    ANALISTA: ["«Resumen de indicadores»", "«Órdenes vencidas»", "«Órdenes del activo TR-SEO-01»", "«Estado de la OT-2026-012»"],
  };
  return [...base, ...ex[ctx.user.role].map((e) => `- ${e}`)].join("\n");
}

async function bestMatch<T>(items: T[], text: string, fields: (t: T) => string[]): Promise<T[]> {
  const up = text.toUpperCase();
  const exact = items.filter((i) => fields(i).some((f, idx) => idx === 0 && up.includes(f.toUpperCase())));
  if (exact.length) return exact;
  const tokens = norm(text)
    .split(" ")
    .filter((t) => t.length > 3);
  if (!tokens.length) return [];
  const scored = items
    .map((i) => ({ i, s: tokens.filter((t) => fields(i).some((f) => norm(f).includes(t))).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return [];
  return scored.filter((x) => x.s === scored[0].s).map((x) => x.i);
}

// ── Flujo: reporte de avance ───────────────────────────────────────────
async function advanceAvance(ctx: Ctx, data: Data, exec: Exec): Promise<Out> {
  const ask = (step: string, reply: string): Out => ({ reply, state: { flow: "AVANCE", step, data } });
  if (!data.wonum) return ask("wonum", "¿En qué orden desea reportar avance? Indique el WONUM (ej. **OT-2026-002**).");
  if (!data.checked) {
    try {
      const preset = data.nuevo_estado && data.nuevo_estado !== "SIN_CAMBIO" ? (data.nuevo_estado as WoStatus) : null;
      const wo = await precheckProgress(ctx, String(data.wonum), preset); // audita si se deniega
      data.wonum = wo.wonum;
      data.estado_actual = wo.status;
      data.checked = 1;
    } catch (e) {
      if (e instanceof ServiceError)
        return {
          reply: deniedText({ estado_herramienta: e.code === "CONFLICTO" ? "ERROR" : e.code, mensaje: e.message, auditado: e.code === "DENEGADO" || e.code === "SOLO_LECTURA" }),
          state: null,
        };
      throw e;
    }
  }
  if (!data.descripcion)
    return ask(
      "descripcion",
      `**${data.wonum}** está en **${data.estado_actual}** (${STATUS_LABEL[data.estado_actual as WoStatus]}).\nDescriba el **trabajo realizado** (mínimo 10 caracteres). Escriba «cancelar» para salir.`,
    );
  if (!data.nuevo_estado) {
    const wo = await getVisibleWorkOrder(ctx, String(data.wonum));
    const opts = allowedNextStatuses(ctx.user, wo);
    return ask(
      "estado",
      `¿Cambia el estado de la orden?\n${opts.map((s) => `- **${s}** · ${STATUS_LABEL[s]}`).join("\n")}\n- **sin cambio** · solo registrar el avance`,
    );
  }
  const r = await exec("proponer_reporte_avance", {
    wonum: data.wonum,
    descripcion: data.descripcion,
    nuevo_estado: data.nuevo_estado === "SIN_CAMBIO" ? undefined : data.nuevo_estado,
  });
  if (r.estado_herramienta === "PENDIENTE_CONFIRMACION")
    return { reply: "Preparé el registro. Revise la tarjeta y presione **Confirmar** para guardarlo en la orden, o **Cancelar** para descartarlo.", state: null };
  if (r.estado_herramienta === "DENEGADO") {
    data.nuevo_estado = null; // permite elegir otro estado
    const again = await advanceAvance(ctx, data, exec);
    return { reply: `${deniedText(r)}\n\n${again.reply}`, state: again.state };
  }
  return { reply: deniedText(r), state: null };
}

async function stepAvance(ctx: Ctx, st: MockState, text: string, exec: Exec): Promise<Out> {
  const n = norm(text);
  const data = st.data;
  if (st.step === "wonum") {
    const w = extractWonum(text) ?? (/^\d{1,3}$/.test(n) ? extractWonum(`OT ${n}`) : null);
    if (!w) return { reply: "No reconocí el número de orden. Escríbalo así: **OT-2026-002**.", state: st };
    data.wonum = w;
  } else if (st.step === "descripcion") {
    if (text.trim().length < 10) return { reply: "La descripción es obligatoria y debe tener al menos 10 caracteres. ¿Qué trabajo se realizó?", state: st };
    data.descripcion = text.trim().slice(0, 2000);
  } else if (st.step === "estado") {
    const code = text.trim().toUpperCase();
    const s = isValidStatus(code) ? code : extractStatus(n);
    if (!s) return { reply: "Indique el código del estado (por ejemplo **INPRG** o **COMP**) o escriba «sin cambio».", state: st };
    data.nuevo_estado = s;
  }
  return advanceAvance(ctx, data, exec);
}

// ── Flujo: creación de OT ──────────────────────────────────────────────
async function advanceCrear(ctx: Ctx, data: Data, exec: Exec): Promise<Out> {
  const ask = (step: string, reply: string): Out => ({ reply, state: { flow: "CREAR", step, data } });
  const repo = await getRepository();
  if (!data.activo) {
    const assets = await repo.listAssets();
    return ask(
      "activo",
      `Paso 1/6 · ¿Sobre qué **activo** se reporta la falla? Escriba el código o una parte de la descripción:\n${assets
        .map((a) => `- **${a.assetnum}** — ${a.description} (${a.location})`)
        .join("\n")}`,
    );
  }
  if (!data.ubicacion) {
    const a = (await repo.listAssets()).find((x) => x.assetnum === data.activo)!;
    const l = (await repo.listLocations()).find((x) => x.location === a.location);
    return ask("ubicacion", `Paso 2/6 · La ubicación registrada del activo es **${a.location}** — ${l?.description}. ¿La confirmo? (sí / escriba otra ubicación)`);
  }
  if (!data.descripcion) return ask("descripcion", "Paso 3/6 · Describa la **falla** o el trabajo requerido (10 a 200 caracteres).");
  if (!data.prioridad) return ask("prioridad", "Paso 4/6 · **Prioridad**: 1 crítica · 2 alta · 3 media · 4 baja.");
  if (!data.tipo) return ask("tipo", "Paso 5/6 · **Tipo de trabajo**: CM correctivo · PM preventivo · EM emergencia · CP predictivo (o «omitir» = CM).");
  if (data.tecnico === undefined) {
    const techs = (await repo.listUsers()).filter((u) => u.role === "CONTRATISTA");
    return ask(
      "tecnico",
      `Paso 6/6 · ¿Asigno un **técnico**? (opcional)\n${techs.map((t) => `- **${t.id}** — ${t.name} (${t.company})`).join("\n")}\n- **sin asignar** · queda en WAPPR esperando aprobación`,
    );
  }
  const r = await exec("proponer_creacion_ot", {
    activo: data.activo,
    ubicacion: data.ubicacion,
    descripcion: data.descripcion,
    prioridad: data.prioridad,
    tipo_trabajo: data.tipo,
    tecnico: data.tecnico || undefined,
  });
  if (r.estado_herramienta === "PENDIENTE_CONFIRMACION")
    return { reply: "Todos los campos críticos están completos y validados. Revise la tarjeta y presione **Confirmar** para crear la OT.", state: null };
  if (r.estado_herramienta === "FALTAN_DATOS") {
    const errs = [...((r.faltan as string[]) ?? []).map((f) => `Falta: ${f}`), ...((r.errores as string[]) ?? [])];
    const t = norm(errs.join(" "));
    if (t.includes("ubicacion") || t.includes("instalado")) data.ubicacion = null;
    if (t.includes("activo") && !t.includes("instalado")) data.activo = null;
    if (t.includes("descripcion")) data.descripcion = null;
    if (t.includes("prioridad")) data.prioridad = null;
    if (t.includes("tecnico")) delete data.tecnico;
    const again = await advanceCrear(ctx, data, exec);
    return { reply: `Hay datos por corregir:\n${errs.map((e) => `- ${e}`).join("\n")}\n\n${again.reply}`, state: again.state };
  }
  return { reply: deniedText(r), state: null };
}

async function stepCrear(ctx: Ctx, st: MockState, text: string, exec: Exec): Promise<Out> {
  const n = norm(text);
  const data = st.data;
  const repo = await getRepository();
  switch (st.step) {
    case "activo": {
      const m = await bestMatch(await repo.listAssets(), text, (a) => [a.assetnum, a.description, a.location]);
      if (m.length === 1) data.activo = m[0].assetnum;
      else if (m.length > 1)
        return { reply: `Encontré varios activos, ¿cuál es?\n${m.map((a) => `- **${a.assetnum}** — ${a.description}`).join("\n")}`, state: st };
      else return { reply: "No encontré ese activo en el catálogo. Escriba el código exacto, por ejemplo **BOM-PAL-03**.", state: st };
      break;
    }
    case "ubicacion": {
      if (YES.test(n)) {
        data.ubicacion = (await repo.listAssets()).find((a) => a.assetnum === data.activo)?.location ?? null;
      } else {
        const m = await bestMatch(await repo.listLocations(), text, (l) => [l.location, l.description]);
        if (m.length !== 1) return { reply: "No identifiqué la ubicación. Responda «sí» para usar la del activo o escriba el código (ej. **PTAP-PAL**).", state: st };
        data.ubicacion = m[0].location;
      }
      break;
    }
    case "descripcion":
      if (text.trim().length < 10 || text.trim().length > 200) return { reply: "La descripción debe tener entre 10 y 200 caracteres.", state: st };
      data.descripcion = text.trim();
      break;
    case "prioridad": {
      const d = n.match(/\b([1-4])\b/);
      const w = /critic/.test(n) ? 1 : /\balta\b/.test(n) ? 2 : /\bmedia\b/.test(n) ? 3 : /\bbaja\b/.test(n) ? 4 : null;
      const p = d ? Number(d[1]) : w;
      if (!p) return { reply: "La prioridad debe ser 1, 2, 3 o 4.", state: st };
      data.prioridad = p;
      break;
    }
    case "tipo": {
      const code = text.trim().toUpperCase();
      const t = ["CM", "PM", "EM", "CP"].includes(code)
        ? code
        : /correct/.test(n) ? "CM" : /prevent/.test(n) ? "PM" : /emergen/.test(n) ? "EM" : /predict|condicion/.test(n) ? "CP" : /omitir|no se|ninguno/.test(n) ? "CM" : null;
      if (!t) return { reply: "Indique CM, PM, EM o CP (o «omitir»).", state: st };
      data.tipo = t;
      break;
    }
    case "tecnico": {
      if (/\b(sin asignar|ninguno|no|omitir|nadie|despues)\b/.test(n)) {
        data.tecnico = "";
        break;
      }
      const techs = (await repo.listUsers()).filter((u) => u.role === "CONTRATISTA");
      const m = await bestMatch(techs, text, (u) => [u.id, u.name, u.company]);
      if (m.length !== 1) return { reply: "No identifiqué al técnico. Escriba su id (ej. **tec.lherrera**) o «sin asignar».", state: st };
      data.tecnico = m[0].id;
      break;
    }
  }
  return advanceCrear(ctx, data, exec);
}

// ── Punto de entrada ───────────────────────────────────────────────────
export async function runMock(ctx: Ctx, text: string, state: MockState | null, exec: Exec): Promise<Out> {
  const n = norm(text);

  if (state?.flow) {
    if (/^(cancelar|cancela|salir|abortar|olvidalo|detener)$/.test(n))
      return { reply: "Listo, descarté el proceso. No se modificó ningún dato.", state: null };
    return state.flow === "AVANCE" ? stepAvance(ctx, state, text, exec) : stepCrear(ctx, state, text, exec);
  }

  const wonum = extractWonum(text);

  if (!n || /^(hola|buen[oa]s?|ayuda|help|menu|opciones|que puedes|que sabes|inicio)\b/.test(n)) return { reply: help(ctx), state: null };

  if (/\b(elimin|borr|suprim|destru)\w*/.test(n)) {
    if (!wonum) return { reply: "¿Qué orden desea eliminar? Indique el WONUM.", state: null };
    const r = await exec("solicitar_eliminacion", { wonum, motivo: text.slice(0, 200) });
    return { reply: deniedText(r), state: null };
  }

  if (/\b(crear|crea|creame|nueva|registrar una|abrir una|generar|levantar)\b.*\b(orden|ot|ots)\b|\bnueva ot\b/.test(n)) {
    const r = await exec("proponer_creacion_ot", {});
    if (isError(r)) return { reply: deniedText(r), state: null };
    const repo = await getRepository();
    const data: Data = {};
    const a = (await repo.listAssets()).find((x) => text.toUpperCase().includes(x.assetnum));
    if (a) data.activo = a.assetnum;
    const p = n.match(/prioridad\s*([1-4])\b/);
    if (p) data.prioridad = Number(p[1]);
    if (/correctiv/.test(n)) data.tipo = "CM";
    else if (/preventiv/.test(n)) data.tipo = "PM";
    else if (/emergenc/.test(n)) data.tipo = "EM";
    const out = await advanceCrear(ctx, data, exec);
    return { reply: `Vamos a crear la orden paso a paso (escriba «cancelar» en cualquier momento).\n\n${out.reply}`, state: out.state };
  }

  const wantsClose = /\b(cerrar|cierra|cierre|cierro|close)\b/.test(n);
  const wantsProgress = /\b(report\w*|avance|actualiz\w*|cambi\w* (el )?estado|marcar|termine|complete|finalice|inicie|empece|pasar a|registrar)\b/.test(n);
  if (wantsClose || wantsProgress) {
    const data: Data = {};
    if (wonum) data.wonum = wonum;
    const s = extractStatus(n);
    if (wantsClose) data.nuevo_estado = "CLOSE";
    else if (s && s !== "SIN_CAMBIO") data.nuevo_estado = s;
    const colon = text.indexOf(":");
    if (colon > -1 && text.slice(colon + 1).trim().length >= 10) data.descripcion = text.slice(colon + 1).trim();
    return advanceAvance(ctx, data, exec);
  }

  if (/\b(resumen|indicador\w*|kpi\w*|cuant[ao]s|estadistic\w*|tablero|metricas)\b/.test(n)) {
    const r = await exec("resumen_indicadores", {});
    if (isError(r)) return { reply: deniedText(r), state: null };
    const k = r.indicadores as Record<string, number>;
    return {
      reply: [
        `**Indicadores** (alcance: ${r.alcance})`,
        `- Total OT: **${k.total}**`,
        `- Esperando aprobación (WAPPR): ${k.waitingApproval}`,
        `- Abiertas / asignadas (APPR + WMATL): ${k.openAssigned}`,
        `- En progreso (INPRG): ${k.inProgress}`,
        `- Críticas activas (prioridad 1): **${k.critical}**`,
        `- Completadas (COMP): ${k.completed} · Cerradas (CLOSE): ${k.closed}`,
        `- Vencen hoy o vencidas: ${k.overdue > 0 ? `**${k.overdue}** ⚠️` : 0}`,
      ].join("\n"),
      state: null,
    };
  }

  if (wonum) return { reply: fmtDetail(await exec("consultar_orden", { wonum })), state: null };

  if (/\b(critic\w*|prioridad 1|urgente\w*|emergencia\w*)\b/.test(n))
    return { reply: fmtList(await exec("buscar_ordenes", { prioridad: 1, estado: "ABIERTAS" }), "Órdenes críticas activas"), state: null };

  const statusQueries: [RegExp, string, string][] = [
    [/esperando aprobacion|por aprobar|sin aprobar/, "WAPPR", "Órdenes esperando aprobación"],
    [/esperando material|sin material|falta de material/, "WMATL", "Órdenes esperando material"],
    [/en progreso|en ejecucion|en proceso/, "INPRG", "Órdenes en progreso"],
    [/completad|terminad|por cerrar|por verificar/, "COMP", "Órdenes completadas (pendientes de cierre)"],
    [/cerrad/, "CLOSE", "Órdenes cerradas"],
    [/cancelad/, "CAN", "Órdenes canceladas"],
    [/abiertas|activas/, "ABIERTAS", "Órdenes abiertas"],
  ];
  for (const [re, estado, titulo] of statusQueries)
    if (re.test(n)) return { reply: fmtList(await exec("buscar_ordenes", { estado }), titulo), state: null };

  const hoy = /\b(hoy|vencid\w*|atrasad\w*|vencen)\b/.test(n);
  if (/\b(pendiente\w*|tengo|mis|asignad\w*|hoy|vencid\w*|atrasad\w*)\b/.test(n)) {
    const mine = ctx.user.role === "CONTRATISTA" && /\b(tengo|mis|asignad\w*|me)\b/.test(n);
    const args: Record<string, unknown> = { estado: "ABIERTAS", vencen_hoy: hoy };
    if (mine) args.tecnico = "yo";
    const titulo = `${mine ? "Sus órdenes" : "Órdenes"} ${hoy ? "pendientes para hoy o vencidas" : "pendientes"}`;
    const r = await exec("buscar_ordenes", args);
    let reply = fmtList(r, titulo);
    if (hoy && r.total === 0) {
      const all = await exec("buscar_ordenes", { ...args, vencen_hoy: false });
      reply += `\nEn total hay ${all.total} OT abiertas en su alcance.`;
    }
    return { reply, state: null };
  }

  const repo = await getRepository();
  const asset = (await repo.listAssets()).find((a) => text.toUpperCase().includes(a.assetnum));
  if (asset) return { reply: fmtList(await exec("buscar_ordenes", { activo: asset.assetnum }), `Órdenes del activo ${asset.assetnum} (${asset.description})`), state: null };
  const loc = (await repo.listLocations()).find((l) => text.toUpperCase().includes(l.location));
  if (loc) return { reply: fmtList(await exec("buscar_ordenes", { ubicacion: loc.location }), `Órdenes en ${loc.location} (${loc.description})`), state: null };

  const free = await exec("buscar_ordenes", { texto: text.slice(0, 60) });
  if (!isError(free) && (free.total as number) > 0) return { reply: fmtList(free, `Órdenes que coinciden con «${text.slice(0, 60)}»`), state: null };

  return { reply: `No entendí la solicitud.\n\n${help(ctx)}`, state: null };
}
