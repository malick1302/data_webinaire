import { HttpError, jsonError } from "@/lib/http";
import { lookupMeetParticipants } from "@/lib/meet-rest";
import { assertTrainer } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertTrainer(request);
    const url = new URL(request.url);
    const meetingCode = url.searchParams.get("meetingCode");
    if (!meetingCode) throw new HttpError(400, "meetingCode manquant");

    const lookup = await lookupMeetParticipants({
      meetingCode,
      lookupEmails: url.searchParams.get("people") === "1",
    });
    return Response.json(lookup);
  } catch (error) {
    return jsonError(error);
  }
}
