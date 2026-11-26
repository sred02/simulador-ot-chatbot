// Catálogos y reglas de negocio puras (sin dependencias de servidor): se usan en UI y API.
import type { Priority, Role, Service, WoStatus, WorkType } from "./types";

export const STATUS_LABEL: Record<WoStatus, string> = {
  WAPPR: "Esperando aprobación",
  APPR: "Aprobada / asignada",
  WMATL: "Esperando material",
  INPRG: "En progreso",
  COMP: "Completada",
  CLOSE: "Cerrada",
  CAN: "Cancelada",
};

export const ALL_STATUSES: WoStatus[] = ["WAPPR", "APPR", "WMATL", "INPRG", "COMP", "CLOSE", "CAN"];

/** Estados "vivos": la OT todavía requiere trabajo */
export const ACTIVE_STATUSES: WoStatus[] = ["WAPPR", "APPR", "WMATL", "INPRG"];

/** Estados históricos: el registro queda bloqueado para preservar la integridad */
export const LOCKED_STATUSES: WoStatus[] = ["CLOSE", "CAN"];

/** Máquina de estados de la OT (simplificada de Maximo) */
export const TRANSITIONS: Record<WoStatus, WoStatus[]> = {
  WAPPR: ["APPR", "CAN"],
  APPR: ["INPRG", "WMATL", "CAN"],
  WMATL: ["INPRG", "CAN"],
  INPRG: ["WMATL", "COMP"],
  COMP: ["CLOSE", "INPRG"],
  CLOSE: [],
  CAN: [],
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "1 · Crítica",
  2: "2 · Alta",
  3: "3 · Media",
  4: "4 · Baja",
};

export const WORKTYPE_LABEL: Record<WorkType, string> = {
  CM: "Correctivo",
  PM: "Preventivo",
  EM: "Emergencia",
  CP: "Predictivo",
};

export const SERVICE_LABEL: Record<Service, string> = {
  ENERGIA: "Energía",
  AGUA: "Agua",
  GAS: "Gas",
};

export const ROLE_LABEL: Record<Role, string> = {
  CONTRATISTA: "Contratista (técnico)",
  PLANEACION: "Planeación y verificación",
  ANALISTA: "Analista de información",
};

export function isValidStatus(s: unknown): s is WoStatus {
  return typeof s === "string" && (ALL_STATUSES as string[]).includes(s);
}

export function isValidPriority(p: unknown): p is Priority {
  return p === 1 || p === 2 || p === 3 || p === 4;
}

export function isValidWorkType(w: unknown): w is WorkType {
  return w === "CM" || w === "PM" || w === "EM" || w === "CP";
}

export function formatCOP(v: number | null | undefined): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v);
}

export const DEFAULT_TZ = "America/Bogota";

export function formatDateTime(iso: string | null | undefined, tz = DEFAULT_TZ): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria de la operación */
export function todayISO(tz = DEFAULT_TZ, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA => YYYY-MM-DD
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
