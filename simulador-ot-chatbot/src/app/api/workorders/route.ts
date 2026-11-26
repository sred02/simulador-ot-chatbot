import { filtersFromSearch, readJson, withUser } from "@/lib/http";
import { createWorkOrder, listWorkOrders, serviceErrorResponse, type CreateInput } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withUser(async (user) => {
    try {
      const filters = filtersFromSearch(new URL(req.url).searchParams);
      const rows = await listWorkOrders({ user, channel: "UI" }, filters);
      return Response.json({ rows, generatedAt: new Date().toISOString() });
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}

export async function POST(req: Request) {
  return withUser(async (user) => {
    try {
      const body = (await readJson<CreateInput>(req)) ?? {};
      const wo = await createWorkOrder({ user, channel: "UI" }, body);
      return Response.json({ wo }, { status: 201 });
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
