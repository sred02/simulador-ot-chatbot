import "server-only";
import { getRepository } from "../data/repository";
import type { Ctx } from "../services/workorders";
import { newNonce } from "../session";
import type { PublicUser } from "../types";
import { getEngineConfig } from "./config";
import { runMock } from "./mock-engine";
import { buildSystemPrompt } from "./prompt";
import { runAnthropic } from "./providers/anthropic";
import { runOpenAICompatible } from "./providers/openai";
import { TOOL_DEFS, executeTool } from "./tools";
import type { ChatMessage, ChatResponse, MockState, PendingCard } from "./types";

/** Limpia el historial: empieza por el usuario, alterna roles y limita tamaño */
function sanitize(history: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of history.slice(-20)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content = String(m.content ?? "").slice(0, 4000);
    if (!content.trim()) continue;
    if (!out.length && m.role !== "user") continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role: m.role, content });
  }
  return out;
}

export async function runChat(user: PublicUser, history: ChatMessage[], mockState: MockState | null): Promise<ChatResponse> {
  const ref = newNonce(3); // referencia corta de trazabilidad de esta interacción
  const ctx: Ctx = { user, channel: "CHATBOT", ref };
  const cards: PendingCard[] = [];
  const exec = (name: string, args: Record<string, unknown>) => executeTool(ctx, name, args, cards);
  const cfg = getEngineConfig();
  const repo = await getRepository();
  const meta = (engine: string) => ({
    engine,
    fuente: repo.kind === "supabase" ? "Réplica OT · Supabase PostgreSQL" : "Réplica OT · memoria del simulador",
    consultadoEn: new Date().toISOString(),
    ref,
  });
  const msgs = sanitize(history);
  const last = msgs.filter((m) => m.role === "user").at(-1)?.content ?? "";

  if (cfg.provider !== "mock") {
    try {
      const system = buildSystemPrompt(user);
      const reply =
        cfg.provider === "anthropic"
          ? await runAnthropic(cfg, system, msgs, TOOL_DEFS, exec)
          : await runOpenAICompatible(cfg, system, msgs, TOOL_DEFS, exec);
      return { reply: reply || "No tengo una respuesta para eso.", cards, mockState: null, meta: meta(cfg.label) };
    } catch (e) {
      console.error("[chat] proveedor de IA falló, se usa modo demo:", (e as Error).message);
      const r = await runMock(ctx, last, mockState, exec);
      return {
        reply: `_No fue posible contactar el proveedor de IA; respondo en modo demo._\n\n${r.reply}`,
        cards,
        mockState: r.state,
        meta: meta("Modo Demo inteligente (respaldo)"),
      };
    }
  }

  const r = await runMock(ctx, last, mockState, exec);
  return { reply: r.reply, cards, mockState: r.state, meta: meta(cfg.label) };
}
