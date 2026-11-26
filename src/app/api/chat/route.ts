import { runChat } from "@/lib/chat/engine";
import type { ChatMessage, MockState } from "@/lib/chat/types";
import { readJson, withUser } from "@/lib/http";
import { serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return withUser(async (user) => {
    try {
      const body = await readJson<{ messages?: ChatMessage[]; mockState?: MockState | null }>(req);
      if (!body?.messages?.length) return Response.json({ error: "Mensaje vacío" }, { status: 400 });
      return Response.json(await runChat(user, body.messages, body.mockState ?? null));
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
