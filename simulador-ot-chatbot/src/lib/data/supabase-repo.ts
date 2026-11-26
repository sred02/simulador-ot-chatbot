import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppUser, Asset, AuditEntry, Location, WorkLog, WorkOrder } from "../types";
import type { Repository } from "./repository";
import type { SeedData } from "./seed";

/** Persistencia en Supabase (PostgreSQL). Usa la service_role key SOLO en el servidor. */
export class SupabaseRepository implements Repository {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private ok<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
    if (res.error) throw new Error(`Supabase (${ctx}): ${res.error.message}`);
    return res.data as T;
  }

  /** PostgREST devuelve numeric como string en algunos casos: normalizamos */
  private normWO(r: Record<string, unknown>): WorkOrder {
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    return {
      ...(r as unknown as WorkOrder),
      wopriority: Number(r.wopriority) as WorkOrder["wopriority"],
      est_hours: num(r.est_hours),
      est_cost: num(r.est_cost),
      actual_cost: num(r.actual_cost),
    };
  }

  async listUsers() {
    return this.ok<AppUser[]>(await this.sb.from("app_user").select("*").order("id"), "listUsers");
  }
  async getUser(id: string) {
    return this.ok<AppUser | null>(await this.sb.from("app_user").select("*").eq("id", id).maybeSingle(), "getUser");
  }
  async listLocations() {
    return this.ok<Location[]>(await this.sb.from("locations").select("*").order("location"), "listLocations");
  }
  async listAssets() {
    return this.ok<Asset[]>(await this.sb.from("asset").select("*").order("assetnum"), "listAssets");
  }
  async listWorkOrders() {
    const rows = this.ok<Record<string, unknown>[]>(await this.sb.from("workorder").select("*").order("wonum"), "listWorkOrders");
    return rows.map((r) => this.normWO(r));
  }
  async getWorkOrder(wonum: string) {
    const r = this.ok<Record<string, unknown> | null>(await this.sb.from("workorder").select("*").eq("wonum", wonum).maybeSingle(), "getWorkOrder");
    return r ? this.normWO(r) : null;
  }
  async insertWorkOrder(wo: WorkOrder) {
    const r = this.ok<Record<string, unknown>>(await this.sb.from("workorder").insert(wo).select("*").single(), "insertWorkOrder");
    return this.normWO(r);
  }
  async updateWorkOrder(wonum: string, patch: Partial<WorkOrder>) {
    const r = this.ok<Record<string, unknown>>(
      await this.sb.from("workorder").update(patch).eq("wonum", wonum).select("*").single(),
      "updateWorkOrder",
    );
    return this.normWO(r);
  }
  async nextWonum(year: number) {
    const prefix = `OT-${year}-`;
    const rows = this.ok<{ wonum: string }[]>(
      await this.sb.from("workorder").select("wonum").like("wonum", `${prefix}%`).order("wonum", { ascending: false }).limit(1),
      "nextWonum",
    );
    const last = rows[0] ? Number(rows[0].wonum.slice(prefix.length)) || 0 : 0;
    return `${prefix}${String(last + 1).padStart(3, "0")}`;
  }
  async listWorkLogs(wonum: string) {
    return this.ok<WorkLog[]>(
      await this.sb.from("worklog").select("*").eq("wonum", wonum).order("created_at", { ascending: false }),
      "listWorkLogs",
    );
  }
  async insertWorkLog(log: Omit<WorkLog, "id">) {
    return this.ok<WorkLog>(await this.sb.from("worklog").insert(log).select("*").single(), "insertWorkLog");
  }
  async listAudit(filter: { wonum?: string; userId?: string; ref?: string; limit?: number }) {
    let q = this.sb.from("audit_log").select("*").order("ts", { ascending: false }).order("id", { ascending: false });
    if (filter.wonum) q = q.eq("wonum", filter.wonum);
    if (filter.userId) q = q.eq("user_id", filter.userId);
    if (filter.ref) q = q.eq("ref", filter.ref);
    return this.ok<AuditEntry[]>(await q.limit(filter.limit ?? 200), "listAudit");
  }
  async insertAudit(entry: Omit<AuditEntry, "id">) {
    return this.ok<AuditEntry>(await this.sb.from("audit_log").insert(entry).select("*").single(), "insertAudit");
  }
  async reset(seed: SeedData) {
    this.ok(await this.sb.rpc("reset_simulador"), "reset");
    this.ok(await this.sb.from("app_user").insert(seed.users), "seed users");
    this.ok(await this.sb.from("locations").insert(seed.locations), "seed locations");
    this.ok(await this.sb.from("asset").insert(seed.assets), "seed assets");
    this.ok(await this.sb.from("workorder").insert(seed.workOrders), "seed workorders");
    this.ok(await this.sb.from("worklog").insert(seed.workLogs.map(({ id: _id, ...l }) => l)), "seed worklog");
    this.ok(await this.sb.from("audit_log").insert(seed.audit.map(({ id: _id, ...a }) => a)), "seed audit");
  }
}
