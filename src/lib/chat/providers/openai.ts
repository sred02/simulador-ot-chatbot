import "server-only";
import type { EngineConfig } from "../config";
import type { ToolDef } from "../tools";
import type { ChatMessage } from "../types";

type Exec = (name: string, args: Record<string, unknown>) => Promise<unknown>;

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}
interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/**
 * Bucle de Function Calling compatible con OpenAI Chat Completions.
 * Gemini expone el mismo formato en su endpoint compatible con OpenAI.
 */
export async function runOpenAICompatible(cfg: EngineConfig, system: string, history: ChatMessage[], tools: ToolDef[], exec: Exec): Promise<string> {
  const url =
    cfg.provider === "gemini"
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : `${process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`;
  const messages: OAIMessage[] = [{ role: "system", content: system }, ...history.map((m) => ({ role: m.role, content: m.content }))];
  for (let i = 0; i < 6; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })),
        tool_choice: "auto",
      }),
    });
    if (res.status === 503 && i === 0) {
      await new Promise((r) => setTimeout(r, 2000)); // espera 2 s y reintenta una vez
      continue;
    }
    if (!res.ok) throw new Error(`${cfg.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices: { message: OAIMessage }[] };
    const msg = data.choices[0].message;
    if (!msg.tool_calls?.length) return (msg.content ?? "").trim();
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        /* argumentos mal formados: se envían vacíos y la herramienta valida */
      }
      const out = await exec(tc.function.name, args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out) });
    }
  }
  return "No pude completar la consulta en un número razonable de pasos. Intente reformular la pregunta.";
}
