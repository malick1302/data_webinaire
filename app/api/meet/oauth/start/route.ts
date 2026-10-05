import { jsonError } from "@/lib/http";
import { beginTrainerOAuth } from "@/lib/meet-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const url = await beginTrainerOAuth();
    return Response.redirect(url);
  } catch (error) {
    return jsonError(error);
  }
}
