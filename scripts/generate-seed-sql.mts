// Genera supabase/seed.sql a partir de src/lib/data/seed.ts (única fuente de verdad).
// Uso:  npm run seed:sql
// Las fechas se escriben relativas a now()/current_date para que la demo
// siempre tenga órdenes para hoy, vencidas y futuras.
import { writeFileSync } from "node:fs";
import {
  ASSETS,
  DEMO_PINS,
  LOCATIONS,
  RAW_WORK_LOGS,
  RAW_WORK_ORDERS,
  hashPin,
  wonumOf,
} from "../src/lib/data/seed.ts";

const RAW_USERS = [
  ["tec.cramirez", "Carlos Ramírez", "CONTRATISTA", "Servieléctricos del Valle S.A.S.", "cramirez@servielectricos.example"],
  ["tec.pvelez", "Paula Vélez", "CONTRATISTA", "Servieléctricos del Valle S.A.S.", "pvelez@servielectricos.example"],
  ["tec.lherrera", "Luisa Herrera", "CONTRATISTA", "Hidroservicios Antioquia S.A.S.", "lherrera@hidroservicios.example"],
  ["tec.jmoreno", "Julián Moreno", "CONTRATISTA", "Gasred Montajes S.A.S.", "jmoreno@gasred.example"],
  ["plan.arestrepo", "Ana María Restrepo", "PLANEACION", "Planeación y Verificación de Mantenimiento", "arestrepo@empresa.example"],
  ["anal.jgomez", "Jorge Gómez", "ANALISTA", "Gestión de Información", "jgomez@empresa.example"],
] as const;

const q = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ts = (days: number | null | undefined) =>
  days === null || days === undefined ? "null" : `now() + interval '${Math.round(days * 24 * 60)} minutes'`;
const dt = (days: number | null | undefined) =>
  days === null || days === undefined ? "null" : `(current_date + ${Math.round(days)})`;

const companyOf = new Map(RAW_USERS.map((u) => [u[0], u[3]]));
const assetOf = new Map(ASSETS.map((a) => [a.assetnum, a]));
const locOf = new Map(LOCATIONS.map((l) => [l.location, l]));

const out: string[] = [];
out.push("-- Generado por scripts/generate-seed-sql.mts — no editar a mano.");
out.push("-- Ejecutar DESPUÉS de supabase/schema.sql");
out.push("begin;");
out.push("select reset_simulador();");
out.push("");
out.push("insert into app_user (id, name, role, company, email, pin_hash) values");
out.push(
  RAW_USERS.map((u) => `  (${q(u[0])}, ${q(u[1])}, ${q(u[2])}, ${q(u[3])}, ${q(u[4])}, ${q(hashPin(u[0], DEMO_PINS[u[0]]))})`).join(",\n") + ";",
);
out.push("");
out.push("insert into locations (location, description, site, service) values");
out.push(LOCATIONS.map((l) => `  (${q(l.location)}, ${q(l.description)}, ${q(l.site)}, ${q(l.service)})`).join(",\n") + ";");
out.push("");
out.push("insert into asset (assetnum, description, location, service, criticality) values");
out.push(ASSETS.map((a) => `  (${q(a.assetnum)}, ${q(a.description)}, ${q(a.location)}, ${q(a.service)}, ${q(a.criticality)})`).join(",\n") + ";");
out.push("");
out.push(
  "insert into workorder (wonum, description, long_description, assetnum, location, site, service, worktype, wopriority, status, status_date, reported_by, report_date, supervisor, lead, vendor, target_start, target_finish, actual_start, actual_finish, est_hours, est_cost, actual_cost, updated_at) values",
);
out.push(
  RAW_WORK_ORDERS.map((r) => {
    const a = assetOf.get(r.asset)!;
    const l = locOf.get(a.location)!;
    const so = r.af ?? r.as ?? r.rep;
    return `  (${q(wonumOf(r.n))}, ${q(r.desc)}, ${q(r.long ?? null)}, ${q(a.assetnum)}, ${q(a.location)}, ${q(l.site)}, ${q(a.service)}, ${q(r.wt)}, ${r.p}, ${q(r.st)}, ${ts(so)}, 'plan.arestrepo', ${ts(r.rep)}, 'plan.arestrepo', ${q(r.lead)}, ${q(r.lead ? companyOf.get(r.lead) : null)}, ${dt(r.ts)}, ${dt(r.tf)}, ${ts(r.as)}, ${ts(r.af)}, ${q(r.h)}, ${q(r.cost)}, ${q(r.act ?? null)}, ${ts(so)})`;
  }).join(",\n") + ";",
);
out.push("");
out.push("insert into worklog (wonum, created_by, created_at, log_type, description, channel) values");
out.push(
  RAW_WORK_LOGS.map((w) => `  (${q(wonumOf(w.n))}, ${q(w.by)}, ${ts(w.off)}, ${q(w.type)}, ${q(w.text)}, 'UI')`).join(",\n") + ";",
);
out.push("");
out.push("insert into audit_log (ts, user_id, user_name, role, action, wonum, channel, result, detail, after_data) values");
out.push(
  RAW_WORK_ORDERS.map(
    (r) =>
      `  (${ts(r.rep)}, 'plan.arestrepo', 'Ana María Restrepo', 'PLANEACION', 'CREAR_OT', ${q(wonumOf(r.n))}, 'UI', 'OK', 'OT registrada en la carga inicial (datos semilla).', '${JSON.stringify({ status: "WAPPR", wopriority: r.p, assetnum: r.asset })}'::jsonb)`,
  ).join(",\n") + ";",
);
out.push("");
out.push("commit;");

writeFileSync(new URL("../supabase/seed.sql", import.meta.url), out.join("\n") + "\n", "utf8");
console.log("supabase/seed.sql generado");
