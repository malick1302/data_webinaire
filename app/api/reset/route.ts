import { jsonError } from "@/lib/http";
import { resetPocData } from "@/lib/store";
import { assertTrainer } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertTrainer(request);
    await resetPocData();
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
