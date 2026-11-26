// Control de Acceso Basado en Roles (RBAC).
// Archivo puro: lo usa la UI para mostrar/ocultar acciones, pero la AUTORIDAD
// final es el servidor (lib/services/workorders.ts), que vuelve a verificar todo.
import { ALL_STATUSES, LOCKED_STATUSES, STATUS_LABEL, TRANSITIONS } from "./domain";
import type { PublicUser, Role, WoStatus, WorkOrder } from "./types";

export type Permission =
  | "wo.read.all" // ver todas las OT
  | "wo.read.company" // ver solo OT de su empresa contratista
  | "wo.create" // crear OT
  | "wo.worklog" // registrar avance en bitácora
  | "wo.status" // cambiar estado (sujeto a ROLE_STATUS_TARGETS)
  | "wo.delete" // eliminar registros (NADIE lo tiene: en Maximo se cancela, no se borra)
  | "audit.read.all"
  | "audit.read.own"
  | "export"
  | "data.reset";

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CONTRATISTA: ["wo.read.company", "wo.worklog", "wo.status", "audit.read.own"],
  PLANEACION: ["wo.read.all", "wo.create", "wo.worklog", "wo.status", "audit.read.all", "export", "data.reset"],
  ANALISTA: ["wo.read.all", "audit.read.all", "export", "data.reset"],
};

/** Estados a los que cada rol puede llevar una OT */
export const ROLE_STATUS_TARGETS: Record<Role, WoStatus[]> = {
  CONTRATISTA: ["INPRG", "WMATL", "COMP"],
  PLANEACION: ALL_STATUSES,
  ANALISTA: [],
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  CONTRATISTA:
    "Consulta las OT de su empresa, registra avances y puede pasar una OT a En progreso, Esperando material o Completada. No puede aprobar, cerrar, cancelar, crear ni eliminar.",
  PLANEACION:
    "Consulta todas las OT, crea órdenes, aprueba, asigna, verifica, cierra o cancela. Ningún rol puede eliminar registros.",
  ANALISTA: "Consulta todas las OT, indicadores e historial de auditoría y exporta con código de verificación. No modifica datos.",
};

export function can(user: Pick<PublicUser, "role">, perm: Permission): boolean {
  return ROLE_PERMISSIONS[user.role].includes(perm);
}

export function canSeeWorkOrder(user: PublicUser, wo: Pick<WorkOrder, "vendor">): boolean {
  if (can(user, "wo.read.all")) return true;
  if (can(user, "wo.read.company")) return wo.vendor === user.company;
  return false;
}

export type Check = { ok: true } | { ok: false; reason: string };

export function checkStatusChange(user: PublicUser, wo: WorkOrder, target: WoStatus): Check {
  if (!can(user, "wo.status"))
    return { ok: false, reason: `El rol ${user.role} no tiene permiso para cambiar estados de OT.` };
  if (LOCKED_STATUSES.includes(wo.status))
    return { ok: false, reason: `La ${wo.wonum} está ${STATUS_LABEL[wo.status]} y su registro está bloqueado.` };
  if (!ROLE_STATUS_TARGETS[user.role].includes(target)) {
    const extra =
      target === "CLOSE"
        ? " El cierre definitivo requiere la verificación de Planeación."
        : target === "CAN"
          ? " La cancelación es una decisión de Planeación."
          : target === "APPR"
            ? " La aprobación corresponde a Planeación."
            : "";
    return { ok: false, reason: `Su rol (${user.role}) no puede llevar una OT al estado ${target} (${STATUS_LABEL[target]}).${extra}` };
  }
  if (!TRANSITIONS[wo.status].includes(target))
    return {
      ok: false,
      reason: `Transición no válida: ${wo.status} → ${target}. Desde ${STATUS_LABEL[wo.status]} solo se permite: ${
        TRANSITIONS[wo.status].map((s) => `${s} (${STATUS_LABEL[s]})`).join(", ") || "ninguna"
      }.`,
    };
  return { ok: true };
}

export function allowedNextStatuses(user: PublicUser, wo: WorkOrder): WoStatus[] {
  return TRANSITIONS[wo.status].filter((t) => checkStatusChange(user, wo, t).ok);
}
