import "server-only";
import type { EngineConfig } from "../config";
import type { ToolDef } from "../tools";
import type { ChatMessage } from "../types";

type Exec = (name: string, args: Record<string, unknown>) => Promise<unknown>;

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/** Bucle de Tool Use con la API Messages de Anthropic */
export async function runAnthropic(cfg: EngineConfig, system: string, history: ChatMessage[], tools: ToolDef[], exec: Exec): Promise<string> {
  const messages: { role: "user" | "assistant"; content: string | Block[] | Record<string, unknown>[] }[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  for (let i = 0; i < 6; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1024,
        system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content: Block[]; stop_reason: string };
    if (data.stop_reason !== "tool_use") {
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    }
    messages.push({ role: "assistant", content: data.content });
    const results: Record<string, unknown>[] = [];
    for (const b of data.content.filter((x) => x.type === "tool_use")) {
      const out = await exec(b.name!, b.input ?? {});
      results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
    }
    messages.push({ role: "user", content: results });
  }
  return "No pude completar la consulta en un número razonable de pasos. Intente reformular la pregunta.";
}
