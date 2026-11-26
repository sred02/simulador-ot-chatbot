import "server-only";
// Acciones pendientes de confirmación. Se firman con HMAC y viajan al cliente:
// el servidor no necesita guardar estado y el usuario no puede alterar el
// contenido (si cambia un solo carácter, la firma deja de ser válida).
import { STATUS_LABEL } from "../domain";
import type { CreateValidation } from "../services/workorders";
import { newNonce, sign, verify } from "../session";
import type { PublicUser, WoStatus } from "../types";
import type { PendingCard } from "./types";

const TTL_MS = 10 * 60 * 1000; // 10 minutos para confirmar

export type PendingAction =
  | { kind: "PROGRESO"; wonum: string; description: string; newStatus: WoStatus | null; currentStatus: WoStatus }
  | { kind: "CREAR"; input: NonNullable<CreateValidation["normalized"]> };

interface PendingPayload {
  uid: string;
  nonce: string;
  exp: number;
  action: PendingAction;
}

export function createPendingCard(user: PublicUser, action: PendingAction, extraRows: [string, string][] = []): PendingCard {
  const nonce = newNonce(6);
  const exp = Date.now() + TTL_MS;
  const token = sign({ uid: user.id, nonce, exp, action } satisfies PendingPayload);
  let title: string;
  let rows: [string, string][];
  if (action.kind === "PROGRESO") {
    title = action.newStatus ? `Cambio de estado · ${action.wonum}` : `Registro de avance · ${action.wonum}`;
    rows = [
      ["Orden", action.wonum],
      ["Estado actual", `${action.currentStatus} · ${STATUS_LABEL[action.currentStatus]}`],
      ["Nuevo estado", action.newStatus ? `${action.newStatus} · ${STATUS_LABEL[action.newStatus]}` : "Sin cambio"],
      ["Trabajo realizado", action.description],
    ];
  } else {
    const i = action.input;
    title = "Creación de orden de trabajo";
    rows = [
      ["Activo", i.assetnum],
      ["Ubicación", i.location],
      ["Descripción", i.description],
      ["Prioridad", String(i.wopriority)],
      ["Tipo de trabajo", i.worktype],
      ["Técnico", i.lead ?? "Sin asignar (quedará en WAPPR)"],
    ];
    if (i.target_finish) rows.push(["Fecha objetivo", i.target_finish]);
  }
  return { token, nonce, kind: action.kind, title, rows: [...rows, ...extraRows], expiresAt: new Date(exp).toISOString() };
}

export type VerifyResult = { ok: true; payload: PendingPayload } | { ok: false; reason: string };

export function verifyPending(token: string, user: PublicUser): VerifyResult {
  const p = verify<PendingPayload>(token);
  if (!p) return { ok: false, reason: "La solicitud de confirmación no es válida o fue alterada." };
  if (p.uid !== user.id) return { ok: false, reason: "Esta confirmación pertenece a otro usuario. Cambió el perfil activo." };
  if (p.exp < Date.now()) return { ok: false, reason: "La confirmación expiró (10 minutos). Vuelva a solicitar la acción." };
  return { ok: true, payload: p };
}
