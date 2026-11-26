"use client";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, PlayCircle, Siren } from "lucide-react";
import type { Kpis } from "./api";
import type { UiFilters } from "./FilterBar";

export default function KpiTiles({ kpis, onPick }: { kpis: Kpis | null; onPick: (f: Partial<UiFilters>) => void }) {
  const k = kpis;
  const tiles = [
    { label: "Total de OT", value: k?.total, sub: k ? `${k.waitingApproval} esperando aprobación (WAPPR)` : "", icon: ClipboardList, color: "text-c100", f: {} },
    { label: "Abiertas / asignadas", value: k?.openAssigned, sub: "APPR · WMATL", icon: Clock, color: "text-blue70", f: { status: "ASIGNADAS" } },
    { label: "En progreso", value: k?.inProgress, sub: "INPRG", icon: PlayCircle, color: "text-[#007d79]", f: { status: "INPRG" } },
    { label: "Críticas", value: k?.critical, sub: "Prioridad 1 activas", icon: Siren, color: "text-red60", f: { priority: "1", status: "ABIERTAS" } },
    { label: "Completadas", value: k?.completed, sub: k ? `COMP · ${k.closed} cerradas` : "", icon: CheckCircle2, color: "text-green50", f: { status: "COMP" } },
    { label: "Vencen hoy / vencidas", value: k?.overdue, sub: "Activas con fecha objetivo ≤ hoy", icon: AlertTriangle, color: "text-[#b28600]", f: { dueToday: true } },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-px bg-c20 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <button key={t.label} onClick={() => onPick(t.f as Partial<UiFilters>)} className="group bg-white p-4 text-left hover:bg-c10">
          <div className="flex items-center justify-between text-xs text-c70">
            {t.label}
            <t.icon size={18} className={t.color} />
          </div>
          <div className={`mt-2 text-3xl font-light ${t.color}`}>{t.value ?? "—"}</div>
          <div className="mt-1 text-[11px] text-c60">{t.sub}</div>
        </button>
      ))}
    </div>
  );
}
