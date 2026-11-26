"use client";
import { Bot, Monitor, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SERVICE_LABEL, STATUS_LABEL, WORKTYPE_LABEL, formatCOP, formatDate, formatDateTime } from "@/lib/domain";
import type { WoStatus } from "@/lib/types";
import { api, type Detail, type Meta } from "./api";
import { Button, PriorityTag, ResultTag, StatusTag, inputCls, labelCls } from "./ui";

type Tab = "det" | "log" | "aud";

export default function WorkOrderDrawer({
  wonum,
  tick,
  meta,
  onClose,
  onMutated,
}: {
  wonum: string;
  tick: number;
  meta: Meta;
  onClose: () => void;
  onMutated: (wonum: string, msg: string) => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("det");
  const [desc, setDesc] = useState("");
  const [next, setNext] = useState<WoStatus | "">("");
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    api
      .get<Detail>(`/api/workorders/${encodeURIComponent(wonum)}`)
      .then((r) => !c && (setD(r), setErr(null)))
      .catch((e) => !c && setErr((e as Error).message));
    return () => {
      c = true;
    };
  }, [wonum, tick]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = (id: string | null) => (id ? meta.users.find((u) => u.id === id)?.name ?? id : "—");
  const asset = d && meta.assets.find((a) => a.assetnum === d.wo.assetnum);
  const loc = d && meta.locations.find((l) => l.location === d.wo.location);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormErr(null);
    try {
      await api.send(`/api/workorders/${encodeURIComponent(wonum)}/progress`, "POST", { description: desc, newStatus: next || null });
      setDesc("");
      setNext("");
      onMutated(wonum, next ? `${wonum} → ${next}` : `Avance registrado en ${wonum}`);
      setTab("log");
    } catch (e) {
      setFormErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="border-b border-c20 py-2">
      <dt className="text-[11px] text-c60">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-c100/40" onClick={onClose}>
      <aside className="animate-slide-in flex h-full w-full max-w-[600px] flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-c20 px-5 py-4">
          <div>
            <p className="font-mono text-sm text-blue60">{wonum}</p>
            <h2 className="mt-0.5 text-lg leading-snug">{d?.wo.description ?? (err ? "Acceso restringido" : "Cargando…")}</h2>
            {d && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StatusTag status={d.wo.status} long />
                <PriorityTag p={d.wo.wopriority} />
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 hover:bg-c10">
            <X size={20} />
          </button>
        </div>

        {err && <p className="m-5 border-l-4 border-red60 bg-[#fff1f1] p-3 text-sm">{err}</p>}

        {d && (
          <>
            <div className="flex border-b border-c20 px-5 text-sm">
              {(
                [
                  ["det", "Detalles de la orden"],
                  ["log", `Bitácora (${d.worklogs.length})`],
                  ["aud", `Historial de auditoría (${d.audit.length})`],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-3 py-2.5 ${tab === k ? "border-blue60 font-medium" : "border-transparent text-c60 hover:text-c100"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="scroll-thin flex-1 overflow-y-auto px-5 py-3">
              {tab === "det" && (
                <>
                  <dl className="grid grid-cols-2 gap-x-6">
                    <Field label="Activo (ASSETNUM)">
                      <span className="font-mono">{d.wo.assetnum}</span>
                      <span className="block text-xs text-c60">{asset?.description}</span>
                    </Field>
                    <Field label="Ubicación (LOCATION)">
                      <span className="font-mono">{d.wo.location}</span>
                      <span className="block text-xs text-c60">{loc?.description}</span>
                    </Field>
                    <Field label="Sitio / servicio">
                      {d.wo.site} · {SERVICE_LABEL[d.wo.service]}
                    </Field>
                    <Field label="Tipo de trabajo">
                      {d.wo.worktype} · {WORKTYPE_LABEL[d.wo.worktype]}
                    </Field>
                    <Field label="Técnico asignado (LEAD)">{name(d.wo.lead)}</Field>
                    <Field label="Contratista (VENDOR)">{d.wo.vendor ?? "—"}</Field>
                    <Field label="Supervisor">{name(d.wo.supervisor)}</Field>
                    <Field label="Reportada por">
                      {name(d.wo.reported_by)} · {formatDateTime(d.wo.report_date)}
                    </Field>
                    <Field label="Inicio / fin objetivo">
                      {formatDate(d.wo.target_start)} → {formatDate(d.wo.target_finish)}
                    </Field>
                    <Field label="Inicio / fin real">
                      {formatDateTime(d.wo.actual_start)} → {formatDateTime(d.wo.actual_finish)}
                    </Field>
                    <Field label="Presupuesto (ESTTOTALCOST)">{formatCOP(d.wo.est_cost)}</Field>
                    <Field label="Costo real (ACTTOTALCOST)">{formatCOP(d.wo.actual_cost)}</Field>
                    <Field label="Horas estimadas">{d.wo.est_hours ?? "—"}</Field>
                    <Field label="Fecha de estado">{formatDateTime(d.wo.status_date)}</Field>
                  </dl>
                  {d.wo.long_description && (
                    <div className="mt-3 bg-c10 p-3 text-sm">
                      <p className="mb-1 text-[11px] text-c60">Descripción detallada</p>
                      {d.wo.long_description}
                    </div>
                  )}

                  {d.canLog ? (
                    <form onSubmit={submit} className="mt-5 border border-c20 p-4">
                      <h3 className="text-sm font-semibold">Registrar avance</h3>
                      <div className="mt-3">
                        <label className={labelCls}>Trabajo realizado (obligatorio, mín. 10 caracteres)</label>
                        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={`${inputCls} h-auto py-2`} />
                      </div>
                      <div className="mt-3">
                        <label className={labelCls}>Nuevo estado</label>
                        <select value={next} onChange={(e) => setNext(e.target.value as WoStatus | "")} className={inputCls}>
                          <option value="">Sin cambio ({d.wo.status})</option>
                          {d.allowedNext.map((s) => (
                            <option key={s} value={s}>
                              {s} · {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                        {!d.allowedNext.length && <p className="mt-1 text-[11px] text-c60">Su rol no puede cambiar el estado desde {d.wo.status}.</p>}
                      </div>
                      {formErr && <p className="mt-2 text-xs text-red60">{formErr}</p>}
                      <Button type="submit" className="mt-3" disabled={busy || desc.trim().length < 10}>
                        {busy ? "Guardando…" : "Guardar avance"}
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-5 bg-c10 p-3 text-xs text-c70">
                      {["CLOSE", "CAN"].includes(d.wo.status)
                        ? "Orden en estado histórico: el registro está bloqueado para preservar su integridad."
                        : "Su perfil tiene acceso de solo consulta para esta orden."}
                    </p>
                  )}
                </>
              )}

              {tab === "log" && (
                <ol className="relative space-y-4 border-l border-c30 pl-5">
                  {d.worklogs.map((l) => (
                    <li key={l.id}>
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-blue60" />
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-c60">
                        <span>{formatDateTime(l.created_at)}</span>·<span>{name(l.created_by)}</span>·<span className="font-mono">{l.log_type}</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-c10 px-2">
                          {l.channel === "CHATBOT" ? <Bot size={12} /> : <Monitor size={12} />} {l.channel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">{l.description}</p>
                    </li>
                  ))}
                  {!d.worklogs.length && <p className="text-sm text-c60">Sin registros en bitácora.</p>}
                </ol>
              )}

              {tab === "aud" && (
                <div className="space-y-2">
                  <p className="text-[11px] text-c60">Registro inmutable de quién consultó o modificó esta orden, por qué canal y con qué resultado.</p>
                  {d.audit.map((a) => (
                    <div key={a.id} className={`border-l-4 p-2.5 text-sm ${a.result === "DENEGADO" ? "border-red60 bg-[#fff1f1]" : "border-c30 bg-c10"}`}>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-c60">
                        <span>{formatDateTime(a.ts)}</span>·<span className="font-medium text-c90">{a.user_name}</span>·<span>{a.role}</span>
                        <span className="font-mono">{a.action}</span>
                        <span className="inline-flex items-center gap-1">
                          {a.channel === "CHATBOT" ? <Bot size={12} /> : <Monitor size={12} />}
                          {a.channel}
                        </span>
                        <ResultTag r={a.result} />
                        {a.ref && <span className="font-mono">ref {a.ref}</span>}
                      </div>
                      <p className="mt-1">{a.detail}</p>
                    </div>
                  ))}
                  {!d.audit.length && <p className="text-sm text-c60">Sin eventos visibles para su rol.</p>}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
