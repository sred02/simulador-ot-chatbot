import { cookies } from "next/headers";
import { getRepository } from "@/lib/data/repository";
import { hashPin } from "@/lib/data/seed";
import { readJson } from "@/lib/http";
import { ROLE_PERMISSIONS, ROLE_STATUS_TARGETS } from "@/lib/rbac";
import { audit, isReadOnlyMode } from "@/lib/services/workorders";
import { SESSION_COOKIE, createSessionToken, getSessionUser, toPublicUser } from "@/lib/session";
import { getEngineConfig } from "@/lib/chat/config";

export const dynamic = "force-dynamic";

/** Sesión actual + configuración visible para la UI */
export async function GET() {
  const user = await getSessionUser();
  const repo = await getRepository();
  const engine = getEngineConfig();
  return Response.json({
    user,
    permissions: user ? ROLE_PERMISSIONS[user.role] : [],
    statusTargets: user ? ROLE_STATUS_TARGETS[user.role] : [],
    readOnly: isReadOnlyMode(),
    storage: repo.kind,
    engine: { provider: engine.provider, label: engine.label },
  });
}

/** Inicio de sesión rápido con PIN (perfiles de prueba) */
export async function POST(req: Request) {
  const body = await readJson<{ userId?: string; pin?: string }>(req);
  if (!body?.userId || !body.pin) return Response.json({ error: "Seleccione un perfil e ingrese el PIN." }, { status: 400 });
  const repo = await getRepository();
  const user = await repo.getUser(body.userId);
  if (!user || user.pin_hash !== hashPin(user.id, String(body.pin))) {
    await new Promise((r) => setTimeout(r, 400)); // freno básico a la fuerza bruta
    return Response.json({ error: "PIN incorrecto." }, { status: 401 });
  }
  const { token, maxAge } = createSessionToken(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
  const pub = toPublicUser(user);
  await audit({ user: pub, channel: "UI" }, "INICIO_SESION", "OK", `Inicio de sesión con perfil ${user.role}`);
  return Response.json({ user: pub });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (user) await audit({ user, channel: "UI" }, "CIERRE_SESION", "OK", "Cierre de sesión");
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
