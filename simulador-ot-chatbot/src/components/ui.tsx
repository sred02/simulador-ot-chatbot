"use client";
import { Fragment, type ReactNode } from "react";
import { PRIORITY_LABEL, STATUS_LABEL } from "@/lib/domain";
import type { AuditResult, Priority, WoStatus } from "@/lib/types";

const STATUS_STYLE: Record<WoStatus, string> = {
  WAPPR: "bg-[#e8daff] text-[#491d8b]",
  APPR: "bg-[#d0e2ff] text-[#0043ce]",
  WMATL: "bg-[#fcf4d6] text-[#8e6a00]",
  INPRG: "bg-[#9ef0f0] text-[#004144]",
  COMP: "bg-[#a7f0ba] text-[#0e6027]",
  CLOSE: "bg-c20 text-c80",
  CAN: "bg-[#ffd7d9] text-[#a2191f]",
};

export function StatusTag({ status, long = false }: { status: WoStatus; long?: boolean }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px] font-medium ${STATUS_STYLE[status]}`}
    >
      {status}
      {long && <span className="ml-1 font-sans font-normal">· {STATUS_LABEL[status]}</span>}
    </span>
  );
}

const PRIO_COLOR: Record<Priority, string> = { 1: "bg-red60", 2: "bg-orange40", 3: "bg-yellow30", 4: "bg-c40" };

export function PriorityTag({ p }: { p: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" title={PRIORITY_LABEL[p]}>
      <span className={`h-2.5 w-2.5 ${PRIO_COLOR[p]}`} />
      {PRIORITY_LABEL[p]}
    </span>
  );
}

export function ResultTag({ r }: { r: AuditResult }) {
  const s = r === "OK" ? "bg-[#a7f0ba] text-[#0e6027]" : r === "DENEGADO" ? "bg-[#ffd7d9] text-[#a2191f]" : "bg-[#fcf4d6] text-[#8e6a00]";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${s}`}>{r}</span>;
}

type BtnKind = "primary" | "secondary" | "ghost" | "danger";
export function Button({
  kind = "primary",
  className = "",
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind }) {
  const k: Record<BtnKind, string> = {
    primary: "bg-blue60 text-white hover:bg-[#0353e9] disabled:bg-c30",
    secondary: "bg-c80 text-white hover:bg-c70 disabled:bg-c30",
    ghost: "bg-transparent text-blue60 hover:bg-c20 disabled:text-c40",
    danger: "bg-red60 text-white hover:bg-[#b81921] disabled:bg-c30",
  };
  return (
    <button
      {...p}
      className={`inline-flex h-10 items-center justify-center gap-2 px-4 text-sm transition-colors disabled:cursor-not-allowed ${k[kind]} ${className}`}
    />
  );
}

export const inputCls =
  "h-10 w-full border-0 border-b border-c50 bg-white px-3 text-sm outline-none focus:outline-2 focus:outline-blue60 focus:-outline-offset-2";
export const labelCls = "mb-1 block text-xs text-c70";

/** Renderizador mínimo de Markdown seguro (negritas, cursivas, listas) sin HTML crudo */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_\s][^_]*_)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith("_") && part.endsWith("_"))
      return (
        <em key={i} className="text-c60">
          {part.slice(1, -1)}
        </em>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length)
      blocks.push(
        <ul key={`ul${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-5">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>,
      );
    list = [];
  };
  text.split("\n").forEach((line, i) => {
    if (/^\s*[-•]\s+/.test(line)) list.push(line.replace(/^\s*[-•]\s+/, ""));
    else {
      flush();
      blocks.push(line.trim() ? <p key={`p${i}`}>{inline(line)}</p> : <div key={`s${i}`} className="h-2" />);
    }
  });
  flush();
  return <div className="space-y-0.5 leading-relaxed">{blocks}</div>;
}
