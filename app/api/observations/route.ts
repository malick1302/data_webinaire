import type { FrameOpenReason } from "@/lib/contracts";
import { HttpError, jsonError } from "@/lib/http";
import { addObservation, listObservations } from "@/lib/store";
import { assertTrainer } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set<FrameOpenReason>([
  "UNKNOWN",
  "OPEN_ADDON",
  "START_ACTIVITY",
  "JOIN_ACTIVITY",
  "HORS_MEET",
]);

export async function GET(request: Request) {
  try {
    assertTrainer(request);
    const observations = await listObservations();
    return Response.json({ observations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: unknown;
      meetingCode?: unknown;
      frameOpenReason?: unknown;
      detail?: unknown;
    };

    if (body.source !== "sidepanel" && body.source !== "mainstage") {
      throw new HttpError(400, "Source inconnue");
    }

    const frameOpenReason =
      typeof body.frameOpenReason === "string" &&
      REASONS.has(body.frameOpenReason as FrameOpenReason)
        ? (body.frameOpenReason as FrameOpenReason)
        : null;

    const observation = await addObservation({
      source: body.source,
      meetingCode:
        typeof body.meetingCode === "string" ? body.meetingCode : null,
      frameOpenReason,
      detail: typeof body.detail === "string" ? body.detail : "",
    });
    return Response.json({ observation });
  } catch (error) {
    return jsonError(error);
  }
}
