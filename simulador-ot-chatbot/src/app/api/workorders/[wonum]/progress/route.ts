import { readJson, withUser } from "@/lib/http";
import { reportProgress, serviceErrorResponse, type ProgressInput } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

/** Registrar avance en bitácora y, opcionalmente, cambiar el estado */
export async function POST(req: Request, { params }: { params: Promise<{ wonum: string }> }) {
  const { wonum } = await params;
  return withUser(async (user) => {
    try {
      const body = (await readJson<ProgressInput>(req)) ?? { description: "" };
      const result = await reportProgress({ user, channel: "UI" }, decodeURIComponent(wonum), body);
      return Response.json(result);
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
