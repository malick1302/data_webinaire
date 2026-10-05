import { HttpError, jsonError } from "@/lib/http";
import {
  closeInteraction,
  interactionForMeeting,
  launchInteraction,
} from "@/lib/store";
import { assertTrainer } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const meetingCode = new URL(request.url).searchParams.get("meetingCode");
    if (!meetingCode) throw new HttpError(400, "meetingCode manquant");
    const interaction = await interactionForMeeting(meetingCode);
    return Response.json({ interaction });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertTrainer(request);
    const body = (await request.json()) as {
      action?: unknown;
      meetingCode?: unknown;
      meetingId?: unknown;
      interactionId?: unknown;
    };

    if (body.action === "close") {
      if (typeof body.interactionId !== "string") {
        throw new HttpError(400, "interactionId manquant");
      }
      const interaction = await closeInteraction(body.interactionId);
      return Response.json({ interaction });
    }

    if (typeof body.meetingCode !== "string") {
      throw new HttpError(400, "meetingCode manquant");
    }

    const meetingId =
      typeof body.meetingId === "string" && body.meetingId.length > 0
        ? body.meetingId.slice(0, 128)
        : null;

    const launched = await launchInteraction({
      meetingCode: body.meetingCode,
      meetingId,
    });
    return Response.json(launched);
  } catch (error) {
    return jsonError(error);
  }
}
