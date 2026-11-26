import { verifyPending } from "@/lib/chat/pending";
import type { ConfirmResponse } from "@/lib/chat/types";
import { getRepository } from "@/lib/data/repository";
import { STATUS_LABEL } from "@/lib/domain";
import { readJson, withUser } from "@/lib/http";
import { ServiceError, createWorkOrder, reportProgress, serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

/**
 * Confirmación explícita de una acción propuesta por el chatbot.
 * Es el ÚNICO camino por el que el chatbot escribe en la base de datos.
 */
export async function POST(req: Request) {
  return withUser(async (user) => {
    try {
      const body = await readJson<{ token?: string; decision?: "confirm" | "cancel" }>(req);
      if (!body?.token) return Response.json({ error: "Falta el token de confirmación" }, { status: 400 });
      const v = verifyPending(body.token, user);
      if (!v.ok) return Response.json({ reply: `⚠️ ${v.reason}`, mutated: false } satisfies ConfirmResponse);
      const { action, nonce } = v.payload;

      if (body.decision !== "confirm")
        return Response.json({ reply: "Acción descartada. No se modificó ningún dato.", mutated: false } satisfies ConfirmResponse);

      // Idempotencia: el nonce queda en auditoría como referencia; no se ejecuta dos veces
      const repo = await getRepository();
      const prior = await repo.listAudit({ ref: nonce, limit: 5 });
      if (prior.some((a) => a.result === "OK"))
        return Response.json({ reply: "Esta acción ya había sido confirmada y aplicada.", mutated: false } satisfies ConfirmResponse);

      const ctx = { user, channel: "CHATBOT" as const, ref: nonce };
      try {
        if (action.kind === "PROGRESO") {
          const { wo, log } = await reportProgress(ctx, action.wonum, { description: action.description, newStatus: action.newStatus });
          return Response.json({
            reply: action.newStatus
              ? `✅ **${wo.wonum}** actualizada a **${wo.status}** (${STATUS_LABEL[wo.status]}). Avance #${log.id} registrado en la bitácora. Ref: ${nonce}`
              : `✅ Avance #${log.id} registrado en la bitácora de **${wo.wonum}**. Ref: ${nonce}`,
            mutated: true,
            wonum: wo.wonum,
            status: wo.status,
          } satisfies ConfirmResponse);
        }
        const wo = await createWorkOrder(ctx, {
          assetnum: action.input.assetnum,
          location: action.input.location,
          description: action.input.description,
          long_description: action.input.long_description,
          wopriority: action.input.wopriority,
          worktype: action.input.worktype,
          lead: action.input.lead,
          target_finish: action.input.target_finish,
          est_hours: action.input.est_hours,
          est_cost: action.input.est_cost,
        });
        return Response.json({
          reply: `✅ Se creó la orden **${wo.wonum}** en estado **${wo.status}** (${STATUS_LABEL[wo.status]}). Ref: ${nonce}`,
          mutated: true,
          wonum: wo.wonum,
          status: wo.status,
        } satisfies ConfirmResponse);
      } catch (e) {
        // Las reglas se vuelven a validar al confirmar: el estado pudo cambiar mientras tanto
        if (e instanceof ServiceError)
          return Response.json({
            reply: `⛔ No se aplicó el cambio: ${e.message}${e.code === "DENEGADO" ? "\n\n_El intento quedó registrado en auditoría._" : ""}`,
            mutated: false,
          } satisfies ConfirmResponse);
        throw e;
      }
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
