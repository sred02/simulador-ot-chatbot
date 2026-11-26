import { filtersFromSearch, withUser } from "@/lib/http";
import { exportCsv, serviceErrorResponse } from "@/lib/services/workorders";

export const dynamic = "force-dynamic";

/** CSV de solo lectura con código de verificación (queda registrado en auditoría) */
export async function GET(req: Request) {
  return withUser(async (user) => {
    try {
      const { csv, code } = await exportCsv({ user, channel: "UI" }, filtersFromSearch(new URL(req.url).searchParams));
      return new Response("﻿" + csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ordenes-trabajo-${code}.csv"`,
          "X-Verification-Code": code,
        },
      });
    } catch (e) {
      return serviceErrorResponse(e);
    }
  });
}
