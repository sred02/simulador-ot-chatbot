import "server-only";
import type { AppUser, Asset, AuditEntry, Location, WorkLog, WorkOrder } from "../types";
import type { SeedData } from "./seed";

/**
 * Contrato de persistencia. La lógica de negocio (RBAC, transiciones, auditoría)
 * vive en lib/services y NO depende de cuál implementación se use.
 */
export interface Repository {
  readonly kind: "memory" | "supabase";
  listUsers(): Promise<AppUser[]>;
  getUser(id: string): Promise<AppUser | null>;
  listLocations(): Promise<Location[]>;
  listAssets(): Promise<Asset[]>;
  listWorkOrders(): Promise<WorkOrder[]>;
  getWorkOrder(wonum: string): Promise<WorkOrder | null>;
  insertWorkOrder(wo: WorkOrder): Promise<WorkOrder>;
  updateWorkOrder(wonum: string, patch: Partial<WorkOrder>): Promise<WorkOrder>;
  nextWonum(year: number): Promise<string>;
  listWorkLogs(wonum: string): Promise<WorkLog[]>;
  insertWorkLog(log: Omit<WorkLog, "id">): Promise<WorkLog>;
  listAudit(filter: { wonum?: string; userId?: string; ref?: string; limit?: number }): Promise<AuditEntry[]>;
  insertAudit(entry: Omit<AuditEntry, "id">): Promise<AuditEntry>;
  reset(seed: SeedData): Promise<void>;
}

let instance: Repository | null = null;

export async function getRepository(): Promise<Repository> {
  if (instance) return instance;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { SupabaseRepository } = await import("./supabase-repo");
    instance = new SupabaseRepository(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    const { getMemoryRepository } = await import("./memory-repo");
    instance = getMemoryRepository();
  }
  return instance;
}
