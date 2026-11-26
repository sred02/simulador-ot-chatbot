// Modelo de dominio inspirado en IBM Maximo (objetos WORKORDER, ASSET, LOCATIONS, WORKLOG).
// Los nombres de campo conservan la nomenclatura de Maximo para facilitar una futura integración.

export type Role = "CONTRATISTA" | "PLANEACION" | "ANALISTA";

/** Estados del ciclo de vida de una OT en Maximo */
export type WoStatus = "WAPPR" | "APPR" | "WMATL" | "INPRG" | "COMP" | "CLOSE" | "CAN";

export type Priority = 1 | 2 | 3 | 4;

/** CM correctivo · PM preventivo · EM emergencia · CP predictivo/condición */
export type WorkType = "CM" | "PM" | "EM" | "CP";

export type Service = "ENERGIA" | "AGUA" | "GAS";

export type Channel = "UI" | "CHATBOT" | "SISTEMA";

export interface AppUser {
  id: string; // ej. tec.cramirez
  name: string;
  role: Role;
  company: string; // empresa contratista o área interna
  email: string;
  pin_hash: string; // sha256(id:pin) — nunca se envía al cliente
}

export type PublicUser = Omit<AppUser, "pin_hash">;

export interface Location {
  location: string; // LOCATION
  description: string;
  site: string; // SITEID
  service: Service;
}

export interface Asset {
  assetnum: string; // ASSETNUM
  description: string;
  location: string;
  service: Service;
  criticality: "ALTA" | "MEDIA" | "BAJA";
}

export interface WorkOrder {
  wonum: string; // WONUM  ej. OT-2026-001
  description: string; // DESCRIPTION
  long_description: string | null;
  assetnum: string; // ASSETNUM
  location: string; // LOCATION
  site: string; // SITEID
  service: Service;
  worktype: WorkType; // WORKTYPE
  wopriority: Priority; // WOPRIORITY
  status: WoStatus; // STATUS
  status_date: string; // STATUSDATE (ISO)
  reported_by: string; // REPORTEDBY (user id)
  report_date: string; // REPORTDATE (ISO)
  supervisor: string | null; // SUPERVISOR (user id)
  lead: string | null; // LEAD / técnico asignado (user id)
  vendor: string | null; // VENDOR / empresa contratista
  target_start: string | null; // TARGSTARTDATE (YYYY-MM-DD)
  target_finish: string | null; // TARGCOMPDATE (YYYY-MM-DD)
  actual_start: string | null; // ACTSTART (ISO)
  actual_finish: string | null; // ACTFINISH (ISO)
  est_hours: number | null; // ESTDUR
  est_cost: number | null; // ESTTOTALCOST (COP)
  actual_cost: number | null; // ACTTOTALCOST (COP)
  updated_at: string;
}

export type WorkLogType = "CREACION" | "AVANCE" | "CAMBIO_ESTADO" | "NOTA";

export interface WorkLog {
  id: number;
  wonum: string;
  created_by: string;
  created_at: string;
  log_type: WorkLogType;
  description: string;
  channel: Channel;
}

export type AuditAction =
  | "CONSULTA"
  | "CREAR_OT"
  | "CAMBIO_ESTADO"
  | "REGISTRO_AVANCE"
  | "ELIMINAR"
  | "EXPORTAR"
  | "RESET_DATOS"
  | "INICIO_SESION"
  | "CIERRE_SESION";

export type AuditResult = "OK" | "DENEGADO" | "ERROR";

export interface AuditEntry {
  id: number;
  ts: string;
  user_id: string;
  user_name: string;
  role: Role | "SISTEMA";
  action: AuditAction;
  wonum: string | null;
  channel: Channel;
  result: AuditResult;
  detail: string;
  ref: string | null; // referencia de la consulta/acción del chatbot (trazabilidad)
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

export interface WorkOrderFilters {
  q?: string; // texto libre
  wonum?: string;
  assetnum?: string;
  location?: string;
  status?: WoStatus | "ABIERTAS" | "ASIGNADAS" | "";
  priority?: Priority | 0;
  lead?: string; // user id o "me"
  dueToday?: boolean; // vence hoy o vencida
}

export interface Kpis {
  total: number;
  waitingApproval: number; // WAPPR
  openAssigned: number; // APPR + WMATL
  inProgress: number; // INPRG
  critical: number; // prioridad 1 activas
  completed: number; // COMP
  closed: number; // CLOSE
  overdue: number; // activas que vencen hoy o ya vencieron
}
