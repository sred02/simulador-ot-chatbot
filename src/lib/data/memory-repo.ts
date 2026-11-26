import "server-only";
import type { AppUser, Asset, AuditEntry, Location, WorkLog, WorkOrder } from "../types";
import type { Repository } from "./repository";
import { buildSeed, type SeedData } from "./seed";

/**
 * Persistencia en memoria del servidor. Útil para desarrollo local y demos
 * sin base de datos. En Vercel cada instancia serverless tiene su propia
 * memoria: para una demo compartida y persistente use Supabase.
 */
class MemoryRepository implements Repository {
  readonly kind = "memory" as const;
  private db!: SeedData;
  private logSeq = 0;
  private auditSeq = 0;

  constructor() {
    this.load(buildSeed(new Date(), process.env.APP_TIMEZONE || "America/Bogota"));
  }

  private load(seed: SeedData) {
    this.db = structuredClone(seed);
    this.logSeq = Math.max(0, ...this.db.workLogs.map((l) => l.id));
    this.auditSeq = Math.max(0, ...this.db.audit.map((a) => a.id));
  }

  async listUsers(): Promise<AppUser[]> {
    return structuredClone(this.db.users);
  }
  async getUser(id: string) {
    return structuredClone(this.db.users.find((u) => u.id === id) ?? null);
  }
  async listLocations(): Promise<Location[]> {
    return structuredClone(this.db.locations);
  }
  async listAssets(): Promise<Asset[]> {
    return structuredClone(this.db.assets);
  }
  async listWorkOrders() {
    return structuredClone(this.db.workOrders);
  }
  async getWorkOrder(wonum: string) {
    return structuredClone(this.db.workOrders.find((w) => w.wonum === wonum) ?? null);
  }
  async insertWorkOrder(wo: WorkOrder) {
    if (this.db.workOrders.some((w) => w.wonum === wo.wonum)) throw new Error(`La OT ${wo.wonum} ya existe`);
    this.db.workOrders.push(structuredClone(wo));
    return structuredClone(wo);
  }
  async updateWorkOrder(wonum: string, patch: Partial<WorkOrder>) {
    const wo = this.db.workOrders.find((w) => w.wonum === wonum);
    if (!wo) throw new Error(`La OT ${wonum} no existe`);
    Object.assign(wo, patch);
    return structuredClone(wo);
  }
  async nextWonum(year: number) {
    const prefix = `OT-${year}-`;
    const max = this.db.workOrders
      .filter((w) => w.wonum.startsWith(prefix))
      .reduce((m, w) => Math.max(m, Number(w.wonum.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }
  async listWorkLogs(wonum: string) {
    return structuredClone(
      this.db.workLogs.filter((l) => l.wonum === wonum).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    );
  }
  async insertWorkLog(log: Omit<WorkLog, "id">) {
    const row: WorkLog = { ...log, id: ++this.logSeq };
    this.db.workLogs.push(row);
    return structuredClone(row);
  }
  async listAudit(filter: { wonum?: string; userId?: string; ref?: string; limit?: number }) {
    return structuredClone(
      this.db.audit
        .filter((a) => (filter.wonum ? a.wonum === filter.wonum : true))
        .filter((a) => (filter.userId ? a.user_id === filter.userId : true))
        .filter((a) => (filter.ref ? a.ref === filter.ref : true))
        .sort((a, b) => b.ts.localeCompare(a.ts) || b.id - a.id)
        .slice(0, filter.limit ?? 200),
    );
  }
  async insertAudit(entry: Omit<AuditEntry, "id">) {
    const row: AuditEntry = { ...entry, id: ++this.auditSeq };
    this.db.audit.push(row);
    return structuredClone(row);
  }
  async reset(seed: SeedData) {
    this.load(seed);
  }
}

// Singleton que sobrevive a la recarga en caliente de Next.js en desarrollo
const g = globalThis as unknown as { __otMemoryRepo?: MemoryRepository };
export function getMemoryRepository(): Repository {
  if (!g.__otMemoryRepo) g.__otMemoryRepo = new MemoryRepository();
  return g.__otMemoryRepo;
}
