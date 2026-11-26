"use client";
import { X } from "lucide-react";
import { useState } from "react";
import { PRIORITY_LABEL, WORKTYPE_LABEL } from "@/lib/domain";
import type { WorkOrder } from "@/lib/types";
import { api, type Meta } from "./api";
import { Button, inputCls, labelCls } from "./ui";

export default function CreateWorkOrderDialog({ meta, onClose, onCreated }: { meta: Meta; onClose: () => void; onCreated: (wonum: string) => void }) {
  const [f, setF] = useState({
    assetnum: "",
    description: "",
    long_description: "",
    wopriority: "",
    worktype: "CM",
    lead: "",
    target_finish: "",
    est_hours: "",
    est_cost: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const asset = meta.assets.find((a) => a.assetnum === f.assetnum);
  const loc = asset && meta.locations.find((l) => l.location === asset.location);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await api.send<{ wo: WorkOrder }>("/api/workorders", "POST", {
        assetnum: f.assetnum,
        location: asset?.location,
        description: f.description,
        long_description: f.long_description || null,
        wopriority: f.wopriority ? Number(f.wopriority) : null,
        worktype: f.worktype,
        lead: f.lead || null,
        target_finish: f.target_finish || null,
        est_hours: f.est_hours ? Number(f.est_hours) : null,
        est_cost: f.est_cost ? Number(f.est_cost) : null,
      });
      onCreated(r.wo.wonum);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-c100/60 p-4 pt-12" onClick={onClose}>
      <form onSubmit={submit} className="w-full max-w-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-c20 px-5 py-3">
          <div>
            <p className="text-xs text-c60">Planeación y verificación</p>
            <h2 className="text-lg">Nueva orden de trabajo</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <label className={labelCls}>Activo (ASSETNUM) *</label>
            <select required value={f.assetnum} onChange={(e) => set("assetnum", e.target.value)} className={inputCls}>
              <option value="">Seleccione…</option>
              {meta.assets.map((a) => (
                <option key={a.assetnum} value={a.assetnum}>
                  {a.assetnum} — {a.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Ubicación (LOCATION) *</label>
            <input readOnly value={asset ? `${asset.location} — ${loc?.description ?? ""}` : "Se toma del activo"} className={`${inputCls} bg-c10 text-c70`} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Descripción de la falla * (10–200 caracteres)</label>
            <input required minLength={10} maxLength={200} value={f.description} onChange={(e) => set("description", e.target.value)} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>Descripción detallada</label>
            <textarea rows={2} value={f.long_description} onChange={(e) => set("long_description", e.target.value)} className={`${inputCls} h-auto py-2`} />
          </div>
          <div>
            <label className={labelCls}>Prioridad *</label>
            <select required value={f.wopriority} onChange={(e) => set("wopriority", e.target.value)} className={inputCls}>
              <option value="">Seleccione…</option>
              {([1, 2, 3, 4] as const).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Tipo de trabajo</label>
            <select value={f.worktype} onChange={(e) => set("worktype", e.target.value)} className={inputCls}>
              {Object.entries(WORKTYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {k} · {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Técnico (opcional; sin técnico queda en WAPPR)</label>
            <select value={f.lead} onChange={(e) => set("lead", e.target.value)} className={inputCls}>
              <option value="">Sin asignar</option>
              {meta.users
                .filter((u) => u.role === "CONTRATISTA")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.company}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fecha objetivo de fin</label>
            <input type="date" value={f.target_finish} onChange={(e) => set("target_finish", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Horas estimadas</label>
            <input type="number" min={0} step="0.5" value={f.est_hours} onChange={(e) => set("est_hours", e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Presupuesto (COP)</label>
            <input type="number" min={0} step="1000" value={f.est_cost} onChange={(e) => set("est_cost", e.target.value)} className={inputCls} />
          </div>
        </div>
        {err && <p className="mx-5 mb-3 border-l-4 border-red60 bg-[#fff1f1] p-2 text-xs">{err}</p>}
        <div className="grid grid-cols-2">
          <Button type="button" kind="secondary" onClick={onClose} className="h-14 justify-start">
            Cancelar
          </Button>
          <Button type="submit" disabled={busy} className="h-14 justify-start">
            {busy ? "Creando…" : "Crear orden"}
          </Button>
        </div>
      </form>
    </div>
  );
}
