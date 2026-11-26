"use client";
import { Search, X } from "lucide-react";
import { ALL_STATUSES, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/domain";
import type { PublicUser } from "@/lib/types";
import type { Meta } from "./api";

export interface UiFilters {
  wonum: string;
  q: string;
  assetnum: string;
  location: string;
  status: string;
  priority: string;
  lead: string;
  dueToday: boolean;
}

export const EMPTY_FILTERS: UiFilters = { wonum: "", q: "", assetnum: "", location: "", status: "", priority: "", lead: "", dueToday: false };

export function toQuery(f: UiFilters): string {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (k === "dueToday") {
      if (v) p.set(k, "1");
    } else if (v) p.set(k, String(v));
  });
  return p.toString();
}

const sel = "h-10 w-full border-0 border-b border-c50 bg-white px-2 text-sm";

export default function FilterBar({ filters, onChange, meta, techs }: { filters: UiFilters; onChange: (f: UiFilters) => void; meta: Meta; techs: PublicUser[] }) {
  const set = (patch: Partial<UiFilters>) => onChange({ ...filters, ...patch });
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);
  return (
    <div className="mt-4 grid grid-cols-2 gap-px bg-c20 md:grid-cols-4 xl:grid-cols-8">
      <label className="relative col-span-2 bg-c10 md:col-span-2">
        <Search size={16} className="absolute left-3 top-3 text-c60" />
        <input
          value={filters.wonum || filters.q}
          onChange={(e) => {
            const v = e.target.value;
            /^ot[-\s]?\d/i.test(v) ? set({ wonum: v, q: "" }) : set({ q: v, wonum: "" });
          }}
          placeholder="Buscar WONUM (OT-2026-001) o descripción"
          className="h-10 w-full border-0 border-b border-c50 bg-white pl-9 pr-2 text-sm"
          aria-label="Buscar"
        />
      </label>
      <select aria-label="Activo" className={sel} value={filters.assetnum} onChange={(e) => set({ assetnum: e.target.value })}>
        <option value="">Activo (ASSETNUM)</option>
        {meta.assets.map((a) => (
          <option key={a.assetnum} value={a.assetnum}>
            {a.assetnum}
          </option>
        ))}
      </select>
      <select aria-label="Ubicación" className={sel} value={filters.location} onChange={(e) => set({ location: e.target.value })}>
        <option value="">Ubicación (LOCATION)</option>
        {meta.locations.map((l) => (
          <option key={l.location} value={l.location}>
            {l.location}
          </option>
        ))}
      </select>
      <select aria-label="Estado" className={sel} value={filters.status} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Estado</option>
        <option value="ABIERTAS">Abiertas (todas activas)</option>
        <option value="ASIGNADAS">Asignadas (APPR + WMATL)</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s} · {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select aria-label="Prioridad" className={sel} value={filters.priority} onChange={(e) => set({ priority: e.target.value })}>
        <option value="">Prioridad</option>
        {([1, 2, 3, 4] as const).map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      <select aria-label="Técnico" className={sel} value={filters.lead} onChange={(e) => set({ lead: e.target.value })}>
        <option value="">Técnico asignado</option>
        {techs.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="flex items-center justify-between gap-2 bg-white px-3">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={filters.dueToday} onChange={(e) => set({ dueToday: e.target.checked })} />
          Vence hoy / vencidas
        </label>
        {active && (
          <button onClick={() => onChange(EMPTY_FILTERS)} className="text-blue60" title="Limpiar filtros" aria-label="Limpiar filtros">
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
