// Tipos compartidos entre el widget de chat (cliente) y el motor (servidor).
import type { WoStatus } from "../types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Tarjeta de confirmación: ninguna escritura ocurre sin que el usuario la confirme */
export interface PendingCard {
  token: string; // payload firmado (HMAC) con la acción exacta a ejecutar
  nonce: string;
  kind: "PROGRESO" | "CREAR";
  title: string;
  rows: [string, string][];
  expiresAt: string;
}

export interface MockState {
  flow: "AVANCE" | "CREAR" | null;
  step: string | null;
  data: Record<string, string | number | null>;
}

export interface ChatResponse {
  reply: string;
  cards: PendingCard[];
  mockState: MockState | null;
  meta: {
    engine: string;
    fuente: string;
    consultadoEn: string;
    ref: string;
  };
}

export interface ConfirmResponse {
  reply: string;
  mutated: boolean;
  wonum?: string;
  status?: WoStatus;
}
