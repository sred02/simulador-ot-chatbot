"use client";
import { Bot, CheckCircle2, Loader2, MessageSquare, Minus, Send, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatResponse, ConfirmResponse, MockState, PendingCard } from "@/lib/chat/types";
import { ROLE_LABEL, formatDateTime } from "@/lib/domain";
import { api, type SessionInfo } from "./api";
import { Markdown } from "./ui";

interface Msg {
  id: number;
  role: "user" | "assistant";
  content: string;
  cards?: (PendingCard & { state?: "pending" | "done" | "cancelled" | "busy" })[];
  meta?: ChatResponse["meta"];
  local?: boolean; // mensajes de la UI que no se envían al modelo
}

const SUGGESTIONS: Record<string, string[]> = {
  CONTRATISTA: ["¿Qué órdenes tengo pendientes hoy?", "¿Cuál es el estado de la OT-2026-004?", "Quiero reportar avance en la OT-2026-002", "Cerrar definitivamente la OT-2026-001"],
  PLANEACION: ["Crear una nueva orden de trabajo", "Órdenes esperando aprobación", "Cerrar la OT-2026-005", "Eliminar la OT-2026-009"],
  ANALISTA: ["Resumen de indicadores", "Órdenes vencidas", "Órdenes del activo TR-SEO-01", "Cambiar el estado de la OT-2026-010 a COMP"],
};

let seq = 1;

export default function ChatWidget({
  session,
  onMutated,
  onOpenWo,
}: {
  session: SessionInfo;
  onMutated: (wonum?: string, msg?: string) => void;
  onOpenWo: (wonum: string) => void;
}) {
  const user = session.user!;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mockState, setMockState] = useState<MockState | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: seq++,
      role: "assistant",
      local: true,
      content: `Hola, **${user.name.split(" ")[0]}**. Soy el asistente de órdenes de trabajo.\nPerfil activo: **${ROLE_LABEL[user.role]}**. Consulto y actualizo las OT según sus permisos; toda modificación requiere su confirmación y queda auditada.`,
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Las llaves evitan devolver la Promise que scrollIntoView retorna en navegadores recientes
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, open]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    const userMsg: Msg = { id: seq++, role: "user", content: t };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setInput("");
    setBusy(true);
    try {
      const r = await api.send<ChatResponse>("/api/chat", "POST", {
        messages: history.filter((m) => !m.local).map((m) => ({ role: m.role, content: m.content })),
        mockState,
      });
      setMockState(r.mockState);
      setMsgs((m) => [...m, { id: seq++, role: "assistant", content: r.reply, cards: r.cards.map((c) => ({ ...c, state: "pending" })), meta: r.meta }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: seq++, role: "assistant", local: true, content: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function decide(msgId: number, card: PendingCard, decision: "confirm" | "cancel") {
    const patch = (state: "busy" | "done" | "cancelled" | "pending") =>
      setMsgs((m) => m.map((x) => (x.id === msgId ? { ...x, cards: x.cards?.map((c) => (c.nonce === card.nonce ? { ...c, state } : c)) } : x)));
    patch("busy");
    try {
      const r = await api.send<ConfirmResponse>("/api/chat/confirm", "POST", { token: card.token, decision });
      patch(decision === "confirm" && r.mutated ? "done" : decision === "cancel" ? "cancelled" : "pending");
      if (decision === "confirm" && !r.mutated) patch("cancelled");
      setMsgs((m) => [...m, { id: seq++, role: "assistant", content: r.reply }]);
      if (r.mutated) onMutated(r.wonum, r.reply.replace(/\*\*/g, "").split(". ")[0]);
    } catch (e) {
      patch("pending");
      setMsgs((m) => [...m, { id: seq++, role: "assistant", local: true, content: `⚠️ ${(e as Error).message}` }]);
    }
  }

  /** Convierte los WONUM del texto en enlaces que abren el detalle */
  function withLinks(node: React.ReactNode) {
    return (
      <div
        onClick={(e) => {
          const el = e.target as HTMLElement;
          const m = el.textContent?.match(/^OT-\d{4}-\d{3}$/);
          if (el.tagName === "STRONG" && m) onOpenWo(m[0]);
        }}
        className="[&_strong]:cursor-default [&_strong]:font-semibold"
      >
        {node}
      </div>
    );
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-14 items-center gap-2 bg-blue60 px-5 text-sm text-white shadow-lg hover:bg-[#0353e9]"
      >
        <MessageSquare size={20} /> Asistente OT
      </button>
    );

  return (
    <div className="fixed bottom-0 right-0 z-40 flex h-[min(680px,100vh)] w-full flex-col border border-c30 bg-white shadow-2xl sm:bottom-6 sm:right-6 sm:w-[420px]">
      <div className="flex items-center justify-between bg-c100 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Bot size={20} />
          <div className="leading-tight">
            <p className="text-sm font-medium">Asistente de Órdenes de Trabajo</p>
            <p className="text-[11px] text-c40">{session.engine.label}</p>
          </div>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Minimizar" className="p-1 hover:bg-c80">
          <Minus size={18} />
        </button>
      </div>

      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto bg-c10 p-3 text-sm">
        {msgs.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[92%] px-3 py-2 ${m.role === "user" ? "bg-blue60 text-white" : "border border-c20 bg-white"}`}>
              {m.role === "user" ? m.content : withLinks(<Markdown text={m.content} />)}

              {m.cards?.map((c) => (
                <div key={c.nonce} className="mt-3 border border-blue60 bg-blue10">
                  <div className="flex items-center gap-2 border-b border-blue20 px-3 py-2 text-xs font-semibold text-blue70">
                    <ShieldAlert size={14} /> Confirmación requerida · {c.title}
                  </div>
                  <dl className="space-y-1 px-3 py-2 text-xs">
                    {c.rows.map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[110px_1fr] gap-2">
                        <dt className="text-c60">{k}</dt>
                        <dd className="text-c100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {c.state === "pending" || c.state === "busy" ? (
                    <div className="grid grid-cols-2">
                      <button disabled={c.state === "busy"} onClick={() => decide(m.id, c, "cancel")} className="h-9 bg-c80 text-xs text-white hover:bg-c70">
                        Cancelar
                      </button>
                      <button disabled={c.state === "busy"} onClick={() => decide(m.id, c, "confirm")} className="h-9 bg-blue60 text-xs text-white hover:bg-[#0353e9]">
                        {c.state === "busy" ? "Aplicando…" : "Confirmar"}
                      </button>
                    </div>
                  ) : (
                    <p className={`flex items-center gap-1 px-3 py-2 text-xs ${c.state === "done" ? "text-green50" : "text-c60"}`}>
                      {c.state === "done" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      {c.state === "done" ? "Confirmada y aplicada" : "Descartada"}
                    </p>
                  )}
                  <p className="px-3 pb-2 text-[10px] text-c60">Expira {formatDateTime(c.expiresAt)} · ref {c.nonce}</p>
                </div>
              ))}

              {m.meta && (
                <p className="mt-2 border-t border-c20 pt-1.5 text-[10px] text-c60">
                  Fuente: {m.meta.fuente} · Consultado {formatDateTime(m.meta.consultadoEn)} · Ref {m.meta.ref}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-c60">
            <Loader2 size={14} className="animate-spin" /> Consultando…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!mockState?.flow && (
        <div className="scroll-thin flex gap-1.5 overflow-x-auto border-t border-c20 bg-white px-3 py-2">
          {SUGGESTIONS[user.role].map((s) => (
            <button key={s} onClick={() => send(s)} disabled={busy} className="shrink-0 rounded-full border border-c30 px-3 py-1 text-[11px] hover:border-blue60 hover:text-blue60">
              {s}
            </button>
          ))}
        </div>
      )}
      {mockState?.flow && (
        <div className="flex items-center justify-between border-t border-c20 bg-[#fcf4d6] px-3 py-1.5 text-[11px]">
          <span>Proceso guiado en curso: {mockState.flow === "CREAR" ? "creación de OT" : "reporte de avance"}</span>
          <button onClick={() => send("cancelar")} className="text-blue70 underline">
            cancelar
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex border-t border-c30"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escriba su consulta…"
          maxLength={1000}
          className="h-12 flex-1 bg-white px-3 text-sm outline-none"
          aria-label="Mensaje"
        />
        <button type="submit" disabled={busy || !input.trim()} className="flex w-12 items-center justify-center bg-blue60 text-white disabled:bg-c30" aria-label="Enviar">
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
