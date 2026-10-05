import { jsonError } from "@/lib/http";
import { HttpError } from "@/lib/http";
import { finishTrainerOAuth } from "@/lib/meet-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const error = url.searchParams.get("error");
    if (error) throw new HttpError(401, `Autorisation Google interrompue : ${error}`);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) throw new HttpError(400, "Retour OAuth incomplet");

    await finishTrainerOAuth({ code, state });
    return new Response(
      `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Meet autorisé</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 32px;">
    <p>Autorisation Meet enregistrée. Fermez cette fenêtre et retournez dans Google Meet.</p>
  </body>
</html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  } catch (error) {
    return jsonError(error);
  }
}
