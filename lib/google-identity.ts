import { OAuth2Client } from "google-auth-library";
import { devIdentityEnabled, googleClientId } from "@/lib/env";
import { HttpError } from "@/lib/http";
import type { IdentitySource } from "@/lib/contracts";

export type VerifiedIdentity = {
  googleSub: string;
  email: string | null;
  emailVerified: boolean | null;
  displayName: string | null;
  identitySource: IdentitySource;
};

export async function verifyCredential(
  credential: string,
): Promise<VerifiedIdentity> {
  if (credential.startsWith("dev:")) {
    return verifyDevCredential(credential);
  }
  return verifyGoogleIdToken(credential);
}

function verifyDevCredential(credential: string): VerifiedIdentity {
  if (!devIdentityEnabled()) {
    throw new HttpError(403, "Identité de test désactivée");
  }

  const [, googleSub, email, ...nameParts] = credential.split(":");
  if (!googleSub) {
    throw new HttpError(400, "Identité de test incomplète");
  }

  return {
    googleSub,
    email: email || null,
    emailVerified: email ? true : null,
    displayName: nameParts.join(":") || null,
    identitySource: "dev",
  };
}

async function verifyGoogleIdToken(
  idToken: string,
): Promise<VerifiedIdentity> {
  const audience = googleClientId();
  if (!audience) {
    throw new HttpError(500, "GOOGLE_CLIENT_ID manquant");
  }

  const client = new OAuth2Client(audience);
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, "Jeton Google refusé");
  }

  if (!payload?.sub) {
    throw new HttpError(401, "Jeton Google sans identifiant");
  }

  return {
    googleSub: payload.sub,
    email: payload.email ?? null,
    emailVerified: payload.email_verified ?? null,
    displayName: payload.name ?? null,
    identitySource: "google_id_token",
  };
}
