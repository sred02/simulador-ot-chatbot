"use client";
import { ACTIVE_STATUSES, WORKTYPE_LABEL, formatDate, formatDateTime, todayISO } from "@/lib/domain";
import type { PublicUser } from "@/lib/types";
import type { WorkOrder } from "./api";
import { PriorityTag, StatusTag } from "./ui";

export default function WorkOrderTable({
  rows,
  users,
  onOpen,
  flash,
  updatedAt,
}: {
  rows: WorkOrder[];
  users: PublicUser[];
  onOpen: (wonum: string) => void;
  flash: string | null;
  updatedAt: string | null;
}) {
  const names = new Map(users.map((u) => [u.id, u.name]));
  const today = todayISO();
  return (
    <section className="mt-4 bg-white">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-base">
          Órdenes de trabajo <span className="text-sm text-c60">({rows.length})</span>
        </h2>
        <span className="flex items-center gap-1.5 text-[11px] text-c60">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green50" /> En vivo · actualizado {formatDateTime(updatedAt)}
        </span>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead className="bg-c20 text-xs font-semibold text-c100">
            <tr>
              {["WONUM", "Descripción", "Activo", "Ubicación", "Tipo", "Prioridad", "Estado", "Técnico", "Fecha objetivo"].map((h) => (
                <th key={h} className="h-10 px-4 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const overdue = ACTIVE_STATUSES.includes(w.status) && !!w.target_finish && w.target_finish < today;
              return (
                <tr
                  key={w.wonum}
                  onClick={() => onOpen(w.wonum)}
                  className={`cursor-pointer border-b border-c20 hover:bg-c10 ${flash === w.wonum ? "row-flash" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[13px] text-blue60">{w.wonum}</td>
                  <td className="max-w-[340px] px-4 py-3">
                    <span className="line-clamp-2">{w.description}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{w.assetnum}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{w.location}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">
                    {w.worktype} · {WORKTYPE_LABEL[w.worktype]}
                  </td>
                  <td className="px-4 py-3">
                    <PriorityTag p={w.wopriority} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusTag status={w.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs">{w.lead ? names.get(w.lead) ?? w.lead : <span className="text-c50">Sin asignar</span>}</td>
                  <td className={`whitespace-nowrap px-4 py-3 text-xs ${overdue ? "font-semibold text-red60" : ""}`}>
                    {formatDate(w.target_finish)}
                    {overdue && " · vencida"}
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-c60">
                  No hay órdenes que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
