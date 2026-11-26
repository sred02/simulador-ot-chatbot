import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getRepository } from "./data/repository";
import type { PublicUser } from "./types";

export const SESSION_COOKIE = "ot_session";
const SESSION_HOURS = 12;

let warned = false;
export function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (!warned) {
    console.warn("[seguridad] SESSION_SECRET no configurada: se usa una clave de desarrollo. Configúrela en producción.");
    warned = true;
  }
  return "dev-only-insecure-secret-change-me-please";
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", getSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", getSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function newNonce(bytes = 8): string {
  return randomBytes(bytes).toString("hex").toUpperCase();
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function createSessionToken(uid: string): { token: string; maxAge: number } {
  const maxAge = SESSION_HOURS * 3600;
  return { token: sign({ uid, exp: Date.now() + maxAge * 1000 } satisfies SessionPayload), maxAge };
}

export function toPublicUser<T extends { pin_hash?: string }>(u: T): Omit<T, "pin_hash"> {
  const { pin_hash: _omit, ...rest } = u;
  return rest;
}

/** Usuario autenticado según la cookie firmada. El rol SIEMPRE se lee de la BD, nunca del cliente. */
export async function getSessionUser(): Promise<PublicUser | null> {
  const jar = await cookies();
  const payload = verify<SessionPayload>(jar.get(SESSION_COOKIE)?.value);
  if (!payload || payload.exp < Date.now()) return null;
  const repo = await getRepository();
  const user = await repo.getUser(payload.uid);
  return user ? toPublicUser(user) : null;
}
