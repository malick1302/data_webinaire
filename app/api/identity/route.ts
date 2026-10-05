import { verifyCredential } from "@/lib/google-identity";
import { jsonError, readBearer } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { acceptIdentity, participantFromToken } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const token = readBearer(request);
    if (!token) throw new HttpError(401, "Session absente");
    const participant = await participantFromToken(token);
    if (!participant) throw new HttpError(401, "Session participant expirée");
    return Response.json({ participant });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { credential?: unknown };
    if (typeof body.credential !== "string" || body.credential.length < 3) {
      throw new HttpError(400, "Jeton d'identité manquant");
    }

    const identity = await verifyCredential(body.credential);
    const result = await acceptIdentity(identity);
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
