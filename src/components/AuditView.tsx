"use client";
import { Bot, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/domain";
import { api, type AuditEntry } from "./api";
import { ResultTag } from "./ui";

export default function AuditView({ tick, onOpen }: { tick: number; onOpen: (wonum: string) => void }) {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [only, setOnly] = useState<"" | "DENEGADO" | "CHATBOT">("");
  useEffect(() => {
    api.get<{ rows: AuditEntry[] }>("/api/audit").then((r) => setRows(r.rows)).catch(() => {});
  }, [tick]);
  const shown = rows.filter((r) => (only === "DENEGADO" ? r.result === "DENEGADO" : only === "CHATBOT" ? r.channel === "CHATBOT" : true));

  return (
    <section className="bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <div>
          <h2 className="text-base">Historial de auditoría</h2>
          <p className="text-xs text-c60">Cada consulta del chatbot, cambio, creación e intento denegado queda registrado con usuario, fecha, canal y referencia.</p>
        </div>
        <div className="flex gap-1 text-xs">
          {(
            [
              ["", "Todo"],
              ["DENEGADO", "Solo denegados"],
              ["CHATBOT", "Solo chatbot"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setOnly(k)} className={`px-3 py-1.5 ${only === k ? "bg-c80 text-white" : "bg-c10 hover:bg-c20"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-c20 text-xs">
            <tr>
              {["Fecha y hora", "Usuario", "Rol", "Acción", "OT", "Canal", "Resultado", "Detalle", "Ref."].map((h) => (
                <th key={h} className="h-10 px-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className={`border-b border-c20 align-top ${a.result === "DENEGADO" ? "bg-[#fff1f1]" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(a.ts)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{a.user_name}</td>
                <td className="px-3 py-2 text-[11px] text-c60">{a.role}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{a.action}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {a.wonum ? (
                    <button onClick={() => onOpen(a.wonum!)} className="font-mono text-xs text-blue60 hover:underline">
                      {a.wonum}
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-1">
                    {a.channel === "CHATBOT" ? <Bot size={12} /> : <Monitor size={12} />} {a.channel}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <ResultTag r={a.result} />
                </td>
                <td className="max-w-[420px] px-3 py-2 text-xs">{a.detail}</td>
                <td className="px-3 py-2 font-mono text-[11px] text-c60">{a.ref ?? ""}</td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-sm text-c60">
                  Sin eventos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
