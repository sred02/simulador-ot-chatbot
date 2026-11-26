import { withUser } from "@/lib/http";
import { getWorkOrderDetail, requestDelete, serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ wonum: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { wonum } = await params;
  return withUser(async (user) => {
    try {
      return Response.json(await getWorkOrderDetail({ user, channel: "UI" }, decodeURIComponent(wonum)));
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}

/** Existe solo para demostrar la gobernanza: siempre se deniega y queda auditado */
export async function DELETE(_req: Request, { params }: Params) {
  const { wonum } = await params;
  return withUser(async (user) => {
    try {
      return await requestDelete({ user, channel: "UI" }, decodeURIComponent(wonum));
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
