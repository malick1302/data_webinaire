import { createHash, randomBytes, randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import {
  ANSWER_VALUES,
  POC_PROMPT,
  type AnswerPublic,
  type AnswerValue,
  type FrameOpenReason,
  type InteractionPublic,
  type ObservationPublic,
  type ParticipantPublic,
} from "@/lib/contracts";
import { HttpError } from "@/lib/http";
import type { VerifiedIdentity } from "@/lib/google-identity";

type SessionRecord = {
  id: string;
  meetingCode: string;
  meetingId: string | null;
  createdAt: string;
};

type InteractionRecord = InteractionPublic & {
  sessionId: string;
  createdAt: string;
};

type ParticipantRecord = ParticipantPublic & {
  createdAt: string;
};

type AnswerRecord = {
  id: string;
  interactionId: string;
  participantId: string;
  value: AnswerValue;
  createdAt: string;
};

type TokenRecord = {
  tokenHash: string;
  participantId: string;
  createdAt: string;
};

export type TrainerOAuthRecord = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate: number | null;
  scope: string;
  updatedAt: string;
};

type ObservationRecord = ObservationPublic;

type StoreData = {
  sessions: SessionRecord[];
  interactions: InteractionRecord[];
  participants: ParticipantRecord[];
  answers: AnswerRecord[];
  tokens: TokenRecord[];
  observations: ObservationRecord[];
  trainerOAuth: TrainerOAuthRecord | null;
  oauthStates: { state: string; createdAt: string }[];
};

const FILE = path.join(process.cwd(), "data", "store.json");

let queue: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function emptyStore(): StoreData {
  return {
    sessions: [],
    interactions: [],
    participants: [],
    answers: [],
    tokens: [],
    observations: [],
    trainerOAuth: null,
    oauthStates: [],
  };
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await readFile(FILE, "utf8");
    return { ...emptyStore(), ...JSON.parse(raw) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, FILE);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function meetingCodeOf(input: string): string {
  const code = input.trim().toLowerCase();
  if (!/^[a-zA-Z0-9-]{3,64}$/.test(code)) {
    throw new HttpError(400, "Code de réunion invalide");
  }
  return code;
}

function toPublicParticipant(participant: ParticipantRecord): ParticipantPublic {
  return {
    id: participant.id,
    googleSub: participant.googleSub,
    email: participant.email,
    emailVerified: participant.emailVerified,
    displayName: participant.displayName,
    identitySource: participant.identitySource,
  };
}

export function acceptIdentity(identity: VerifiedIdentity): Promise<{
  sessionToken: string;
  participant: ParticipantPublic;
}> {
  return locked(async () => {
    const data = await readStore();
    const now = new Date().toISOString();
    let participant = data.participants.find(
      (item) => item.googleSub === identity.googleSub,
    );

    if (!participant) {
      participant = {
        id: randomUUID(),
        googleSub: identity.googleSub,
        email: identity.email,
        emailVerified: identity.emailVerified,
        displayName: identity.displayName,
        identitySource: identity.identitySource,
        createdAt: now,
      };
      data.participants.push(participant);
    } else {
      participant.email = identity.email ?? participant.email;
      participant.emailVerified =
        identity.emailVerified ?? participant.emailVerified;
      participant.displayName = identity.displayName ?? participant.displayName;
      participant.identitySource = identity.identitySource;
    }

    data.tokens = data.tokens.filter(
      (token) => token.participantId !== participant.id,
    );
    const sessionToken = randomBytes(32).toString("hex");
    data.tokens.push({
      tokenHash: hashToken(sessionToken),
      participantId: participant.id,
      createdAt: now,
    });

    await writeStore(data);
    return { sessionToken, participant: toPublicParticipant(participant) };
  });
}

export function participantFromToken(
  token: string,
): Promise<ParticipantPublic | null> {
  return locked(async () => {
    const data = await readStore();
    const row = data.tokens.find((item) => item.tokenHash === hashToken(token));
    if (!row) return null;
    const participant = data.participants.find(
      (item) => item.id === row.participantId,
    );
    return participant ? toPublicParticipant(participant) : null;
  });
}

export function launchInteraction(input: {
  meetingCode: string;
  meetingId: string | null;
}): Promise<{ meetingCode: string; interaction: InteractionPublic }> {
  return locked(async () => {
    const data = await readStore();
    const meetingCode = meetingCodeOf(input.meetingCode);
    const now = new Date().toISOString();
    let session = data.sessions.find((item) => item.meetingCode === meetingCode);

    if (!session) {
      session = {
        id: randomUUID(),
        meetingCode,
        meetingId: input.meetingId,
        createdAt: now,
      };
      data.sessions.push(session);
    } else if (input.meetingId && session.meetingId !== input.meetingId) {
      session.meetingId = input.meetingId;
    }

    let interaction = data.interactions.find(
      (item) => item.sessionId === session.id && item.status === "LIVE",
    );

    if (!interaction) {
      interaction = {
        id: randomUUID(),
        sessionId: session.id,
        prompt: POC_PROMPT,
        status: "LIVE",
        options: [...ANSWER_VALUES],
        createdAt: now,
      };
      data.interactions.push(interaction);
    }

    await writeStore(data);
    return {
      meetingCode,
      interaction: {
        id: interaction.id,
        prompt: interaction.prompt,
        status: interaction.status,
        options: interaction.options,
      },
    };
  });
}

export function closeInteraction(
  interactionId: string,
): Promise<InteractionPublic> {
  return locked(async () => {
    const data = await readStore();
    const interaction = data.interactions.find((item) => item.id === interactionId);
    if (!interaction) throw new HttpError(404, "Interaction introuvable");
    interaction.status = "CLOSED";
    await writeStore(data);
    return {
      id: interaction.id,
      prompt: interaction.prompt,
      status: interaction.status,
      options: interaction.options,
    };
  });
}

export function interactionForMeeting(
  meetingCode: string,
): Promise<InteractionPublic | null> {
  return locked(async () => {
    const data = await readStore();
    const code = meetingCodeOf(meetingCode);
    const session = data.sessions.find((item) => item.meetingCode === code);
    if (!session) return null;
    const related = data.interactions.filter(
      (item) => item.sessionId === session.id,
    );
    const live = related.find((item) => item.status === "LIVE");
    const interaction = live ?? related.at(-1);
    if (!interaction) return null;
    return {
      id: interaction.id,
      prompt: interaction.prompt,
      status: interaction.status,
      options: interaction.options,
    };
  });
}

export function recordAnswer(input: {
  token: string;
  interactionId: string;
  value: AnswerValue;
}): Promise<{ answer: AnswerPublic; alreadyAnswered: boolean }> {
  return locked(async () => {
    const data = await readStore();
    const tokenRow = data.tokens.find(
      (item) => item.tokenHash === hashToken(input.token),
    );
    if (!tokenRow) throw new HttpError(401, "Session participant expirée");

    const participant = data.participants.find(
      (item) => item.id === tokenRow.participantId,
    );
    if (!participant) throw new HttpError(401, "Participant introuvable");

    const interaction = data.interactions.find(
      (item) => item.id === input.interactionId,
    );
    if (!interaction) throw new HttpError(404, "Interaction introuvable");

    const existing = data.answers.find(
      (item) =>
        item.interactionId === interaction.id &&
        item.participantId === participant.id,
    );

    if (existing) {
      if (existing.value !== input.value) {
        throw new HttpError(
          409,
          `Réponse déjà enregistrée : ${existing.value}`,
        );
      }
      return {
        alreadyAnswered: true,
        answer: toPublicAnswer(existing, participant),
      };
    }

    if (interaction.status !== "LIVE") {
      throw new HttpError(409, "Les réponses sont fermées");
    }

    const answer: AnswerRecord = {
      id: randomUUID(),
      interactionId: interaction.id,
      participantId: participant.id,
      value: input.value,
      createdAt: new Date().toISOString(),
    };
    data.answers.push(answer);
    await writeStore(data);
    return {
      alreadyAnswered: false,
      answer: toPublicAnswer(answer, participant),
    };
  });
}

function toPublicAnswer(
  answer: AnswerRecord,
  participant: ParticipantRecord,
): AnswerPublic {
  return {
    id: answer.id,
    value: answer.value,
    createdAt: answer.createdAt,
    participant: toPublicParticipant(participant),
  };
}

export function answersForInteraction(
  interactionId: string,
): Promise<AnswerPublic[]> {
  return locked(async () => {
    const data = await readStore();
    return data.answers
      .filter((item) => item.interactionId === interactionId)
      .map((answer) => {
        const participant = data.participants.find(
          (item) => item.id === answer.participantId,
        );
        if (!participant) {
          throw new HttpError(500, "Réponse sans participant");
        }
        return toPublicAnswer(answer, participant);
      });
  });
}

export function ownAnswer(input: {
  token: string;
  interactionId: string;
}): Promise<AnswerPublic | null> {
  return locked(async () => {
    const data = await readStore();
    const tokenRow = data.tokens.find(
      (item) => item.tokenHash === hashToken(input.token),
    );
    if (!tokenRow) throw new HttpError(401, "Session participant expirée");
    const participant = data.participants.find(
      (item) => item.id === tokenRow.participantId,
    );
    if (!participant) throw new HttpError(401, "Participant introuvable");
    const answer = data.answers.find(
      (item) =>
        item.interactionId === input.interactionId &&
        item.participantId === participant.id,
    );
    return answer ? toPublicAnswer(answer, participant) : null;
  });
}

export function addObservation(input: {
  source: ObservationPublic["source"];
  meetingCode: string | null;
  frameOpenReason: FrameOpenReason | null;
  detail: string;
}): Promise<ObservationPublic> {
  return locked(async () => {
    const data = await readStore();
    const observation: ObservationRecord = {
      id: randomUUID(),
      at: new Date().toISOString(),
      source: input.source,
      meetingCode: input.meetingCode,
      frameOpenReason: input.frameOpenReason,
      detail: input.detail.slice(0, 500),
    };
    data.observations.push(observation);
    data.observations = data.observations.slice(-200);
    await writeStore(data);
    return observation;
  });
}

export function listObservations(): Promise<ObservationPublic[]> {
  return locked(async () => {
    const data = await readStore();
    return data.observations.slice(-50).reverse();
  });
}

export function saveOAuthState(state: string): Promise<void> {
  return locked(async () => {
    const data = await readStore();
    const cutoff = Date.now() - 15 * 60 * 1000;
    data.oauthStates = data.oauthStates.filter(
      (item) => Date.parse(item.createdAt) > cutoff,
    );
    data.oauthStates.push({ state, createdAt: new Date().toISOString() });
    await writeStore(data);
  });
}

export function consumeOAuthState(state: string): Promise<boolean> {
  return locked(async () => {
    const data = await readStore();
    const index = data.oauthStates.findIndex((item) => item.state === state);
    if (index === -1) return false;
    data.oauthStates.splice(index, 1);
    await writeStore(data);
    return true;
  });
}

export function saveTrainerOAuth(record: TrainerOAuthRecord): Promise<void> {
  return locked(async () => {
    const data = await readStore();
    data.trainerOAuth = record;
    await writeStore(data);
  });
}

export function readTrainerOAuth(): Promise<TrainerOAuthRecord | null> {
  return locked(async () => {
    const data = await readStore();
    return data.trainerOAuth;
  });
}

export function resetPocData(): Promise<void> {
  return locked(async () => {
    const data = await readStore();
    const next = emptyStore();
    next.trainerOAuth = data.trainerOAuth;
    await writeStore(next);
  });
}
