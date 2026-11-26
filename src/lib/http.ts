import "server-only";
import { getSessionUser } from "./session";
import { isValidPriority, isValidStatus } from "./domain";
import type { PublicUser, WorkOrderFilters } from "./types";

export function unauthorized() {
  return Response.json({ error: "Sesión no válida o expirada. Seleccione un perfil e ingrese su PIN.", code: "NO_AUTENTICADO" }, { status: 401 });
}

/** Ejecuta el handler solo si hay sesión válida */
export async function withUser(handler: (user: PublicUser) => Promise<Response>): Promise<Response> {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  return handler(user);
}

export function filtersFromSearch(sp: URLSearchParams): WorkOrderFilters {
  const status = sp.get("status") ?? "";
  const priority = Number(sp.get("priority") ?? 0);
  return {
    q: sp.get("q") ?? undefined,
    wonum: sp.get("wonum") ?? undefined,
    assetnum: sp.get("assetnum") ?? undefined,
    location: sp.get("location") ?? undefined,
    status: status === "ABIERTAS" || status === "ASIGNADAS" || isValidStatus(status) ? status : "",
    priority: isValidPriority(priority) ? priority : 0,
    lead: sp.get("lead") ?? undefined,
    dueToday: sp.get("dueToday") === "1",
  };
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
