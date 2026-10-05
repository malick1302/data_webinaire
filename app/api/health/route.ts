import {
  cloudProjectNumber,
  devIdentityEnabled,
  googleClientId,
} from "@/lib/env";
import { trainerKeyRequired } from "@/lib/trainer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    trainerKeyRequired: trainerKeyRequired(),
    devIdentityEnabled: devIdentityEnabled(),
    googleClientConfigured: googleClientId().length > 0,
    googleClientId: googleClientId(),
    cloudProjectConfigured: cloudProjectNumber().length > 0,
  });
}
