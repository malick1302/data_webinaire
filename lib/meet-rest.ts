import { OAuth2Client } from "google-auth-library";
import { randomBytes } from "crypto";
import { googleClientId } from "@/lib/env";
import { HttpError } from "@/lib/http";
import {
  assertMeetingCode,
  classifyParticipant,
  type MeetLookup,
  type MeetParticipantRaw,
} from "@/lib/meet-participants";
import {
  consumeOAuthState,
  readTrainerOAuth,
  saveOAuthState,
  saveTrainerOAuth,
  type TrainerOAuthRecord,
} from "@/lib/store";

const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";

function oauthClient(): OAuth2Client {
  const clientId = googleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new HttpError(
      500,
      "OAuth formateur incomplet : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI",
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export async function beginTrainerOAuth(): Promise<string> {
  const client = oauthClient();
  const state = randomBytes(24).toString("hex");
  await saveOAuthState(state);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [MEET_SCOPE],
    state,
  });
}

export async function finishTrainerOAuth(input: {
  code: string;
  state: string;
}): Promise<void> {
  const valid = await consumeOAuthState(input.state);
  if (!valid) throw new HttpError(400, "État OAuth invalide");

  const client = oauthClient();
  const { tokens } = await client.getToken(input.code);
  if (!tokens.access_token) {
    throw new HttpError(401, "Google n'a pas renvoyé de jeton d'accès");
  }

  await saveTrainerOAuth({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiryDate: tokens.expiry_date ?? null,
    scope: tokens.scope ?? MEET_SCOPE,
    updatedAt: new Date().toISOString(),
  });
}

async function accessToken(): Promise<string> {
  const stored = await readTrainerOAuth();
  if (!stored) {
    throw new HttpError(401, "Le formateur n'a pas autorisé l'API Meet");
  }

  const client = oauthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken ?? undefined,
    expiry_date: stored.expiryDate ?? undefined,
  });

  const token = await client.getAccessToken();
  if (!token.token) {
    throw new HttpError(401, "Jeton Meet expiré");
  }

  const credentials = client.credentials;
  if (
    credentials.access_token &&
    credentials.access_token !== stored.accessToken
  ) {
    const refreshed: TrainerOAuthRecord = {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token ?? stored.refreshToken,
      expiryDate: credentials.expiry_date ?? null,
      scope: credentials.scope ?? stored.scope,
      updatedAt: new Date().toISOString(),
    };
    await saveTrainerOAuth(refreshed);
  }

  return token.token;
}

type ConferenceList = {
  conferenceRecords?: { name?: string; startTime?: string; endTime?: string }[];
};

type ParticipantList = {
  participants?: MeetParticipantRaw[];
};

export async function lookupMeetParticipants(input: {
  meetingCode: string;
  lookupEmails: boolean;
}): Promise<MeetLookup> {
  let meetingCode: string;
  try {
    meetingCode = assertMeetingCode(input.meetingCode);
  } catch (error) {
    throw new HttpError(
      400,
      error instanceof Error ? error.message : "Code Meet invalide",
    );
  }
  const token = await accessToken();
  const filters = [
    `space.meeting_code = "${meetingCode}" AND end_time IS NULL`,
    `space.meeting_code = "${meetingCode}"`,
  ];

  const queries: MeetLookup["queries"] = [];
  let conferenceName: string | null = null;

  for (const filter of filters) {
    const url = new URL("https://meet.googleapis.com/v2/conferenceRecords");
    url.searchParams.set("filter", filter);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => ({}))) as ConferenceList & {
      error?: { message?: string };
    };
    const records = body.conferenceRecords ?? [];
    queries.push({
      filter,
      httpStatus: response.status,
      count: records.length,
    });

    if (!response.ok) {
      throw new HttpError(
        response.status,
        body.error?.message ?? "Lecture des conférences Meet refusée",
      );
    }

    if (records[0]?.name) {
      conferenceName = records[0].name;
      break;
    }
  }

  if (!conferenceName) {
    return {
      meetingCode,
      queries,
      conferenceName: null,
      participants: [],
      emailLookups: [],
    };
  }

  const participantsUrl = new URL(
    `https://meet.googleapis.com/v2/${conferenceName}/participants`,
  );
  participantsUrl.searchParams.set("pageSize", "250");
  const participantsResponse = await fetch(participantsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const participantsBody = (await participantsResponse
    .json()
    .catch(() => ({}))) as ParticipantList & { error?: { message?: string } };

  if (!participantsResponse.ok) {
    throw new HttpError(
      participantsResponse.status,
      participantsBody.error?.message ?? "Lecture des participants refusée",
    );
  }

  const participants = (participantsBody.participants ?? []).map(
    classifyParticipant,
  );
  const emailLookups: MeetLookup["emailLookups"] = [];

  if (input.lookupEmails) {
    for (const participant of participants) {
      if (!participant.googleUser) continue;
      const personId = participant.googleUser.split("/").at(-1);
      if (!personId) continue;
      const peopleUrl = new URL(
        `https://people.googleapis.com/v1/people/${personId}`,
      );
      peopleUrl.searchParams.set("personFields", "emailAddresses");
      for (const source of [
        "READ_SOURCE_TYPE_PROFILE",
        "READ_SOURCE_TYPE_CONTACT",
        "READ_SOURCE_TYPE_OTHER_CONTACT",
      ]) {
        peopleUrl.searchParams.append("sources", source);
      }
      const peopleResponse = await fetch(peopleUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const peopleBody = (await peopleResponse.json().catch(() => ({}))) as {
        emailAddresses?: { value?: string }[];
      };
      emailLookups.push({
        googleUser: participant.googleUser,
        httpStatus: peopleResponse.status,
        email: peopleBody.emailAddresses?.[0]?.value ?? null,
      });
    }
  }

  return {
    meetingCode,
    queries,
    conferenceName,
    participants,
    emailLookups,
  };
}
