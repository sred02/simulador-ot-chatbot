import { withUser } from "@/lib/http";
import { listAuditScoped, serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => {
    try {
      return Response.json({ rows: await listAuditScoped({ user, channel: "UI" }) });
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
