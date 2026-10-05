export const POC_PROMPT = "Ce SMS est-il frauduleux ?";

export const ANSWER_VALUES = ["OUI", "NON"] as const;

export type AnswerValue = (typeof ANSWER_VALUES)[number];

export type IdentitySource = "google_id_token" | "dev";

export type ParticipantPublic = {
  id: string;
  googleSub: string;
  email: string | null;
  emailVerified: boolean | null;
  displayName: string | null;
  identitySource: IdentitySource;
};

export type InteractionPublic = {
  id: string;
  prompt: string;
  status: "LIVE" | "CLOSED";
  options: AnswerValue[];
};

export type AnswerPublic = {
  id: string;
  value: AnswerValue;
  createdAt: string;
  participant: ParticipantPublic;
};

export type FrameOpenReason =
  | "UNKNOWN"
  | "OPEN_ADDON"
  | "START_ACTIVITY"
  | "JOIN_ACTIVITY"
  | "HORS_MEET";

export type ObservationPublic = {
  id: string;
  at: string;
  source: "sidepanel" | "mainstage";
  meetingCode: string | null;
  frameOpenReason: FrameOpenReason | null;
  detail: string;
};
