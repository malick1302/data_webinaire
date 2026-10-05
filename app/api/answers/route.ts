import { ANSWER_VALUES, type AnswerValue } from "@/lib/contracts";
import { HttpError, jsonError, readBearer } from "@/lib/http";
import { answersForInteraction, ownAnswer, recordAnswer } from "@/lib/store";
import { assertTrainer } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAnswerValue(value: unknown): value is AnswerValue {
  return (
    typeof value === "string" &&
    (ANSWER_VALUES as readonly string[]).includes(value)
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const interactionId = url.searchParams.get("interactionId");
    if (!interactionId) throw new HttpError(400, "interactionId manquant");

    if (url.searchParams.get("mine") === "1") {
      const token = readBearer(request);
      if (!token) throw new HttpError(401, "Session absente");
      const answer = await ownAnswer({ token, interactionId });
      return Response.json({ answer });
    }

    assertTrainer(request);
    const answers = await answersForInteraction(interactionId);
    return Response.json({ answers });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const token = readBearer(request);
    if (!token) throw new HttpError(401, "Session absente");

    const body = (await request.json()) as {
      interactionId?: unknown;
      value?: unknown;
    };
    if (typeof body.interactionId !== "string" || !isAnswerValue(body.value)) {
      throw new HttpError(400, "Réponse incomplète");
    }

    const result = await recordAnswer({
      token,
      interactionId: body.interactionId,
      value: body.value,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
