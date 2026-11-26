"use client";
import type { Permission } from "@/lib/rbac";
import type { Asset, AuditEntry, Kpis, Location, PublicUser, WoStatus, WorkLog, WorkOrder } from "@/lib/types";

export interface SessionInfo {
  user: PublicUser | null;
  permissions: Permission[];
  statusTargets: WoStatus[];
  readOnly: boolean;
  storage: "memory" | "supabase";
  engine: { provider: string; label: string };
}

export interface Meta {
  users: PublicUser[];
  assets: Asset[];
  locations: Location[];
  demoPins: Record<string, string>;
}

export interface Detail {
  wo: WorkOrder;
  worklogs: WorkLog[];
  audit: AuditEntry[];
  allowedNext: WoStatus[];
  canLog: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function handle<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) window.dispatchEvent(new Event("ot:unauthorized"));
  if (!r.ok) throw new ApiError((j as { error?: string }).error ?? `Error ${r.status}`, r.status);
  return j as T;
}

export const api = {
  get: <T,>(url: string) => fetch(url, { cache: "no-store" }).then((r) => handle<T>(r)),
  send: <T,>(url: string, method: "POST" | "DELETE" | "PATCH", body?: unknown) =>
    fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) => handle<T>(r)),
};

export type { Kpis, WorkOrder, AuditEntry };
