import "server-only";

export type Provider = "anthropic" | "openai" | "gemini" | "mock";

export interface EngineConfig {
  provider: Provider;
  model: string;
  apiKey: string;
  label: string;
}

const DEFAULT_MODEL: Record<Exclude<Provider, "mock">, string> = {
  anthropic: "claude-haiku-4-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
};

/** Si no hay API key válida, el chatbot funciona en "Modo Demo inteligente" (motor de reglas) */
export function getEngineConfig(): EngineConfig {
  const raw = (process.env.LLM_PROVIDER || "mock").toLowerCase() as Provider;
  const apiKey = process.env.LLM_API_KEY || "";
  if (raw === "mock" || !["anthropic", "openai", "gemini"].includes(raw) || !apiKey) {
    return { provider: "mock", model: "reglas", apiKey: "", label: "Modo Demo inteligente" };
  }
  const model = process.env.LLM_MODEL || DEFAULT_MODEL[raw as Exclude<Provider, "mock">];
  const name = { anthropic: "Anthropic", openai: "OpenAI", gemini: "Gemini" }[raw as Exclude<Provider, "mock">];
  return { provider: raw, model, apiKey, label: `IA · ${name} (${model})` };
}
