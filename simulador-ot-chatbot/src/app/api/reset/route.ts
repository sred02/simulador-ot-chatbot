import { withUser } from "@/lib/http";
import { resetData, serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

export async function POST() {
  return withUser(async (user) => {
    try {
      await resetData({ user, channel: "UI" });
      return Response.json({ ok: true });
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
