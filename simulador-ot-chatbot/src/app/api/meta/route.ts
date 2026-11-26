import { getRepository } from "@/lib/data/repository";
import { DEMO_PINS } from "@/lib/data/seed";
import { toPublicUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Catálogos: perfiles de prueba, activos y ubicaciones.
 * Los PIN de demostración se muestran para facilitar la evaluación;
 * ocúltelos con OCULTAR_PINS_DEMO=true.
 */
export async function GET() {
  const repo = await getRepository();
  const [users, assets, locations] = await Promise.all([repo.listUsers(), repo.listAssets(), repo.listLocations()]);
  return Response.json({
    users: users.map(toPublicUser),
    assets,
    locations,
    demoPins: process.env.OCULTAR_PINS_DEMO === "true" ? {} : DEMO_PINS,
  });
}
