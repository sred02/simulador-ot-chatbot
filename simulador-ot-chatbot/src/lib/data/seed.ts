// Datos semilla realistas del sector de distribución de energía, agua y gas.
// Las fechas son RELATIVAS al momento de la carga para que la demo siempre tenga
// órdenes "para hoy", vencidas y futuras. Este archivo no tiene dependencias de
// ejecución propias del proyecto para poder reutilizarlo en scripts/generate-seed-sql.mts.
import { createHash } from "node:crypto";
import type {
  AppUser,
  Asset,
  AuditEntry,
  Location,
  Priority,
  WoStatus,
  WorkLog,
  WorkLogType,
  WorkOrder,
  WorkType,
} from "../types";

export const SEED_YEAR = 2026;

export function hashPin(userId: string, pin: string): string {
  return createHash("sha256").update(`${userId}:${pin}`).digest("hex");
}

/** PINs de demostración (se documentan en el README y en la pantalla de acceso) */
export const DEMO_PINS: Record<string, string> = {
  "tec.cramirez": "1111",
  "tec.pvelez": "1212",
  "tec.lherrera": "2222",
  "tec.jmoreno": "5555",
  "plan.arestrepo": "3333",
  "anal.jgomez": "4444",
};

const RAW_USERS: Omit<AppUser, "pin_hash">[] = [
  { id: "tec.cramirez", name: "Carlos Ramírez", role: "CONTRATISTA", company: "Servieléctricos del Valle S.A.S.", email: "cramirez@servielectricos.example" },
  { id: "tec.pvelez", name: "Paula Vélez", role: "CONTRATISTA", company: "Servieléctricos del Valle S.A.S.", email: "pvelez@servielectricos.example" },
  { id: "tec.lherrera", name: "Luisa Herrera", role: "CONTRATISTA", company: "Hidroservicios Antioquia S.A.S.", email: "lherrera@hidroservicios.example" },
  { id: "tec.jmoreno", name: "Julián Moreno", role: "CONTRATISTA", company: "Gasred Montajes S.A.S.", email: "jmoreno@gasred.example" },
  { id: "plan.arestrepo", name: "Ana María Restrepo", role: "PLANEACION", company: "Planeación y Verificación de Mantenimiento", email: "arestrepo@empresa.example" },
  { id: "anal.jgomez", name: "Jorge Gómez", role: "ANALISTA", company: "Gestión de Información", email: "jgomez@empresa.example" },
];

export const LOCATIONS: Location[] = [
  { location: "SE-ORIENTE", description: "Subestación Oriente 110/13,2 kV", site: "TRANSMISION", service: "ENERGIA" },
  { location: "SE-NORTE", description: "Subestación Norte 44/13,2 kV", site: "TRANSMISION", service: "ENERGIA" },
  { location: "CIR-1205", description: "Circuito de distribución 13,2 kV R-1205 (Bello)", site: "DISTRIBUCION", service: "ENERGIA" },
  { location: "PTAP-PAL", description: "Planta potabilizadora Las Palmas", site: "ACUEDUCTO", service: "AGUA" },
  { location: "TQ-ROB", description: "Tanque de almacenamiento El Robledal", site: "ACUEDUCTO", service: "AGUA" },
  { location: "RED-ACU-BEL", description: "Red de acueducto sector Bello Norte", site: "ACUEDUCTO", service: "AGUA" },
  { location: "PTAR-OCC", description: "Planta de tratamiento de aguas residuales Occidente", site: "SANEAMIENTO", service: "AGUA" },
  { location: "ERM-SUR", description: "Estación de regulación y medición de gas Sur", site: "GAS", service: "GAS" },
  { location: "RED-GAS-ITA", description: "Red de distribución de gas natural Itagüí", site: "GAS", service: "GAS" },
];

export const ASSETS: Asset[] = [
  { assetnum: "TR-SEO-01", description: "Transformador de potencia 40 MVA 110/13,2 kV", location: "SE-ORIENTE", service: "ENERGIA", criticality: "ALTA" },
  { assetnum: "INT-SEO-12", description: "Interruptor de potencia SF6 13,2 kV — celda 12", location: "SE-ORIENTE", service: "ENERGIA", criticality: "ALTA" },
  { assetnum: "BAT-SEN-01", description: "Banco de baterías 125 Vcc", location: "SE-NORTE", service: "ENERGIA", criticality: "MEDIA" },
  { assetnum: "MED-SEN-05", description: "Medidor de calidad de potencia", location: "SE-NORTE", service: "ENERGIA", criticality: "BAJA" },
  { assetnum: "RECL-1205", description: "Reconectador automático R-1205", location: "CIR-1205", service: "ENERGIA", criticality: "ALTA" },
  { assetnum: "TD-1205-07", description: "Transformador de distribución 75 kVA — poste 07", location: "CIR-1205", service: "ENERGIA", criticality: "MEDIA" },
  { assetnum: "BOM-PAL-03", description: "Bomba centrífuga 250 HP — línea 3", location: "PTAP-PAL", service: "AGUA", criticality: "ALTA" },
  { assetnum: "FIL-PAL-02", description: "Filtro rápido de arena N.º 2", location: "PTAP-PAL", service: "AGUA", criticality: "MEDIA" },
  { assetnum: "VAL-ROB-01", description: "Válvula de compuerta DN 600 — salida tanque", location: "TQ-ROB", service: "AGUA", criticality: "ALTA" },
  { assetnum: "MAC-BEL-14", description: "Macromedidor electromagnético DN 300", location: "RED-ACU-BEL", service: "AGUA", criticality: "MEDIA" },
  { assetnum: "SOP-OCC-01", description: "Soplador de aireación N.º 2", location: "PTAR-OCC", service: "AGUA", criticality: "MEDIA" },
  { assetnum: "REG-ERM-01", description: "Regulador de presión — tren A", location: "ERM-SUR", service: "GAS", criticality: "ALTA" },
  { assetnum: "ODO-ERM-01", description: "Sistema de odorización", location: "ERM-SUR", service: "GAS", criticality: "ALTA" },
  { assetnum: "VAL-ITA-22", description: "Válvula de bloqueo PE 4\" — sector 4", location: "RED-GAS-ITA", service: "GAS", criticality: "MEDIA" },
];

/** Offsets en días respecto a la carga. ts/tf = fechas objetivo; as/af = inicio/fin reales */
interface RawWO {
  n: number;
  desc: string;
  long?: string;
  asset: string;
  wt: WorkType;
  p: Priority;
  st: WoStatus;
  lead: string | null;
  rep: number;
  ts: number | null;
  tf: number | null;
  as?: number | null;
  af?: number | null;
  h: number | null;
  cost: number | null;
  act?: number | null;
}

export const RAW_WORK_ORDERS: RawWO[] = [
  { n: 1, desc: "Mantenimiento preventivo anual transformador de potencia 40 MVA", long: "Incluye pruebas de aislamiento, relación de transformación, revisión de bujes y cambio de sílica gel.", asset: "TR-SEO-01", wt: "PM", p: 2, st: "INPRG", lead: "tec.cramirez", rep: -10, ts: -2, tf: 0, as: -1, h: 16, cost: 18500000 },
  { n: 2, desc: "Reconectador R-1205 no recierra tras falla transitoria", long: "Reporte del centro de control: tres eventos de apertura sin recierre en 24 h.", asset: "RECL-1205", wt: "CM", p: 1, st: "APPR", lead: "tec.cramirez", rep: -1, ts: 0, tf: 0, h: 6, cost: 4200000 },
  { n: 3, desc: "Fuga de gas SF6 en interruptor celda 12", long: "Alarma de baja presión de SF6. Se requiere kit de sellos del polo B.", asset: "INT-SEO-12", wt: "CM", p: 2, st: "WMATL", lead: "tec.pvelez", rep: -6, ts: -4, tf: 2, as: -4, h: 10, cost: 9800000 },
  { n: 4, desc: "Transformador de distribución 75 kVA quemado — usuarios sin servicio", long: "Aproximadamente 180 usuarios residenciales afectados.", asset: "TD-1205-07", wt: "EM", p: 1, st: "INPRG", lead: "tec.cramirez", rep: -0.25, ts: 0, tf: 0, as: -0.15, h: 5, cost: 12000000 },
  { n: 5, desc: "Prueba de capacidad del banco de baterías 125 Vcc", asset: "BAT-SEN-01", wt: "PM", p: 3, st: "COMP", lead: "tec.pvelez", rep: -20, ts: -8, tf: -6, as: -8, af: -7, h: 8, cost: 3500000, act: 3250000 },
  { n: 6, desc: "Análisis de armónicos: medidor reporta THD alto", asset: "MED-SEN-05", wt: "CP", p: 4, st: "WAPPR", lead: null, rep: -2, ts: 5, tf: 10, h: 4, cost: 1800000 },
  { n: 7, desc: "Análisis de gases disueltos en aceite (DGA) semestral", asset: "TR-SEO-01", wt: "CP", p: 2, st: "CLOSE", lead: "tec.cramirez", rep: -60, ts: -50, tf: -45, as: -50, af: -46, h: 4, cost: 2100000, act: 2100000 },
  { n: 8, desc: "Inspección termográfica del circuito R-1205", asset: "RECL-1205", wt: "PM", p: 3, st: "APPR", lead: "tec.pvelez", rep: -3, ts: 1, tf: 3, h: 3, cost: 1200000 },
  { n: 9, desc: "Lubricación del mecanismo de operación (duplicada de OT-2026-003)", asset: "INT-SEO-12", wt: "PM", p: 4, st: "CAN", lead: null, rep: -15, ts: -10, tf: -9, h: 2, cost: 600000 },
  { n: 10, desc: "Vibración alta en bomba centrífuga 250 HP línea 3", long: "Lectura de 9,2 mm/s en rodamiento lado acople (límite 7,1 mm/s).", asset: "BOM-PAL-03", wt: "CM", p: 1, st: "INPRG", lead: "tec.lherrera", rep: -2, ts: -1, tf: 0, as: -1, h: 12, cost: 15600000 },
  { n: 11, desc: "Retrolavado y reposición de lecho filtrante filtro N.º 2", asset: "FIL-PAL-02", wt: "PM", p: 3, st: "APPR", lead: "tec.lherrera", rep: -5, ts: 1, tf: 4, h: 20, cost: 22000000 },
  { n: 12, desc: "Válvula de compuerta DN 600 no cierra completamente", long: "Actuador eléctrico averiado; repuesto importado en trámite.", asset: "VAL-ROB-01", wt: "CM", p: 2, st: "WMATL", lead: "tec.lherrera", rep: -9, ts: -7, tf: -1, as: -7, h: 14, cost: 27500000 },
  { n: 13, desc: "Verificación metrológica del macromedidor DN 300", asset: "MAC-BEL-14", wt: "CP", p: 3, st: "COMP", lead: "tec.lherrera", rep: -14, ts: -6, tf: -4, as: -5, af: -4, h: 6, cost: 4800000, act: 5100000 },
  { n: 14, desc: "Cambio de filtros de aire y correas del soplador N.º 2", asset: "SOP-OCC-01", wt: "PM", p: 2, st: "APPR", lead: "tec.lherrera", rep: -4, ts: 0, tf: 1, h: 8, cost: 6700000 },
  { n: 15, desc: "Alineación láser y cambio de rodamientos bomba línea 3", asset: "BOM-PAL-03", wt: "PM", p: 3, st: "CLOSE", lead: "tec.lherrera", rep: -90, ts: -80, tf: -78, as: -80, af: -78, h: 18, cost: 18400000, act: 19900000 },
  { n: 16, desc: "Pérdida de señal del macromedidor: sin datos en SCADA", asset: "MAC-BEL-14", wt: "CM", p: 1, st: "WAPPR", lead: null, rep: -0.3, ts: 0, tf: 1, h: 4, cost: 2300000 },
  { n: 17, desc: "Presión de salida inestable en regulador tren A", long: "Oscilaciones de ±8 psi. Se opera temporalmente por el tren B.", asset: "REG-ERM-01", wt: "CM", p: 1, st: "INPRG", lead: "tec.jmoreno", rep: -1, ts: -1, tf: 0, as: -0.5, h: 8, cost: 11200000 },
  { n: 18, desc: "Calibración de bomba dosificadora de odorante", asset: "ODO-ERM-01", wt: "PM", p: 2, st: "APPR", lead: "tec.jmoreno", rep: -3, ts: 0, tf: 2, h: 6, cost: 3900000 },
  { n: 19, desc: "Válvula de bloqueo 4\" con paso: requiere reemplazo", asset: "VAL-ITA-22", wt: "CM", p: 2, st: "WMATL", lead: "tec.jmoreno", rep: -8, ts: -6, tf: -2, as: -6, h: 10, cost: 8600000 },
  { n: 20, desc: "Mantenimiento preventivo trimestral tren de regulación B", asset: "REG-ERM-01", wt: "PM", p: 3, st: "COMP", lead: "tec.jmoreno", rep: -12, ts: -5, tf: -3, as: -4, af: -3, h: 8, cost: 5400000, act: 5400000 },
  { n: 21, desc: "Recorrido de detección de fugas red Itagüí sector 4", asset: "VAL-ITA-22", wt: "PM", p: 4, st: "APPR", lead: "tec.jmoreno", rep: -2, ts: 3, tf: 7, h: 16, cost: 7300000 },
  { n: 22, desc: "Ruido anormal en ventiladores de refrigeración del transformador", asset: "TR-SEO-01", wt: "CM", p: 3, st: "WAPPR", lead: null, rep: -1, ts: 2, tf: 6, h: 4, cost: 3100000 },
  { n: 23, desc: "Turbiedad alta en efluente del filtro N.º 2", asset: "FIL-PAL-02", wt: "CM", p: 2, st: "INPRG", lead: "tec.lherrera", rep: -3, ts: -2, tf: 1, as: -2, h: 6, cost: 4400000 },
  { n: 24, desc: "Poda de vegetación y limpieza del poste 07", asset: "TD-1205-07", wt: "PM", p: 4, st: "CLOSE", lead: "tec.cramirez", rep: -40, ts: -35, tf: -33, as: -34, af: -33, h: 4, cost: 900000, act: 850000 },
];

interface RawLog {
  n: number;
  by: string;
  off: number;
  type: WorkLogType;
  text: string;
}

export const RAW_WORK_LOGS: RawLog[] = [
  { n: 1, by: "tec.cramirez", off: -1, type: "AVANCE", text: "Transformador desenergizado y muestras de aceite tomadas. Inician pruebas de resistencia de aislamiento." },
  { n: 3, by: "tec.pvelez", off: -4, type: "AVANCE", text: "Fuga localizada en el sello del polo B con cámara de detección de SF6. Se solicita kit de sellos al almacén." },
  { n: 3, by: "tec.pvelez", off: -3.9, type: "CAMBIO_ESTADO", text: "INPRG → WMATL: material no disponible en almacén (pedido en trámite)." },
  { n: 4, by: "tec.cramirez", off: -0.1, type: "AVANCE", text: "Cuadrilla en sitio. Se confirma transformador quemado; se gestiona unidad de reemplazo de 75 kVA." },
  { n: 5, by: "tec.pvelez", off: -7, type: "AVANCE", text: "Prueba de descarga completada: capacidad del 94 %. Dos celdas con tensión baja, se recomienda seguimiento." },
  { n: 10, by: "tec.lherrera", off: -1, type: "AVANCE", text: "Medición de vibraciones: 9,2 mm/s en rodamiento lado acople. Se programa cambio de rodamientos." },
  { n: 12, by: "tec.lherrera", off: -7, type: "CAMBIO_ESTADO", text: "INPRG → WMATL: actuador eléctrico averiado, se requiere repuesto importado." },
  { n: 13, by: "tec.lherrera", off: -4, type: "AVANCE", text: "Verificación con medidor patrón: error de 0,8 %, dentro de la tolerancia." },
  { n: 17, by: "tec.jmoreno", off: -0.5, type: "AVANCE", text: "Tren A aislado; se opera por tren B. Revisión del piloto del regulador en curso." },
  { n: 19, by: "tec.jmoreno", off: -6, type: "CAMBIO_ESTADO", text: "INPRG → WMATL: la válvula no sella, se solicita válvula PE 4\" de reemplazo." },
  { n: 20, by: "tec.jmoreno", off: -3, type: "AVANCE", text: "Mantenimiento ejecutado sin novedades. Presión de salida estable en 60 psi." },
  { n: 23, by: "tec.lherrera", off: -2, type: "AVANCE", text: "Se ajustó la dosificación de coagulante; turbiedad en descenso (2,1 NTU)." },
];

export const wonumOf = (n: number) => `OT-${SEED_YEAR}-${String(n).padStart(3, "0")}`;

function todayIn(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function shiftDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function shiftTs(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86400000).toISOString();
}

export interface SeedData {
  users: AppUser[];
  locations: Location[];
  assets: Asset[];
  workOrders: WorkOrder[];
  workLogs: WorkLog[];
  audit: AuditEntry[];
}

export function buildSeed(now = new Date(), tz = "America/Bogota"): SeedData {
  const today = todayIn(tz, now);
  const users: AppUser[] = RAW_USERS.map((u) => ({ ...u, pin_hash: hashPin(u.id, DEMO_PINS[u.id]) }));
  const userById = new Map(users.map((u) => [u.id, u]));
  const assetById = new Map(ASSETS.map((a) => [a.assetnum, a]));
  const locById = new Map(LOCATIONS.map((l) => [l.location, l]));

  const workOrders: WorkOrder[] = RAW_WORK_ORDERS.map((r) => {
    const asset = assetById.get(r.asset)!;
    const loc = locById.get(asset.location)!;
    const statusOffset = r.af ?? r.as ?? r.rep;
    return {
      wonum: wonumOf(r.n),
      description: r.desc,
      long_description: r.long ?? null,
      assetnum: asset.assetnum,
      location: asset.location,
      site: loc.site,
      service: asset.service,
      worktype: r.wt,
      wopriority: r.p,
      status: r.st,
      status_date: shiftTs(now, statusOffset),
      reported_by: "plan.arestrepo",
      report_date: shiftTs(now, r.rep),
      supervisor: "plan.arestrepo",
      lead: r.lead,
      vendor: r.lead ? userById.get(r.lead)!.company : null,
      target_start: r.ts == null ? null : shiftDate(today, r.ts),
      target_finish: r.tf == null ? null : shiftDate(today, r.tf),
      actual_start: r.as == null ? null : shiftTs(now, r.as),
      actual_finish: r.af == null ? null : shiftTs(now, r.af),
      est_hours: r.h,
      est_cost: r.cost,
      actual_cost: r.act ?? null,
      updated_at: shiftTs(now, statusOffset),
    };
  });

  const workLogs: WorkLog[] = RAW_WORK_LOGS.map((l, i) => ({
    id: i + 1,
    wonum: wonumOf(l.n),
    created_by: l.by,
    created_at: shiftTs(now, l.off),
    log_type: l.type,
    description: l.text,
    channel: "UI",
  }));

  const planner = userById.get("plan.arestrepo")!;
  const audit: AuditEntry[] = RAW_WORK_ORDERS.map((r, i) => ({
    id: i + 1,
    ts: shiftTs(now, r.rep),
    user_id: planner.id,
    user_name: planner.name,
    role: planner.role,
    action: "CREAR_OT",
    wonum: wonumOf(r.n),
    channel: "UI",
    result: "OK",
    detail: "OT registrada en la carga inicial (datos semilla).",
    ref: null,
    before_data: null,
    after_data: { status: "WAPPR", wopriority: r.p, assetnum: r.asset },
  }));

  return { users, locations: LOCATIONS, assets: ASSETS, workOrders, workLogs, audit };
}
