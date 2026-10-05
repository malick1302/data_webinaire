export type MeetParticipantKind =
  | "signed_in"
  | "anonymous"
  | "phone"
  | "unknown";

export type MeetParticipantRaw = {
  name?: string;
  signedinUser?: { user?: string; displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
};

export type ClassifiedParticipant = {
  resourceName: string | null;
  kind: MeetParticipantKind;
  displayName: string | null;
  googleUser: string | null;
};

export type MeetLookup = {
  meetingCode: string;
  queries: { filter: string; httpStatus: number; count: number }[];
  conferenceName: string | null;
  participants: ClassifiedParticipant[];
  emailLookups: {
    googleUser: string;
    httpStatus: number;
    email: string | null;
  }[];
};

export function classifyParticipant(
  participant: MeetParticipantRaw,
): ClassifiedParticipant {
  if (participant.signedinUser) {
    return {
      resourceName: participant.name ?? null,
      kind: "signed_in",
      displayName: participant.signedinUser.displayName ?? null,
      googleUser: participant.signedinUser.user ?? null,
    };
  }

  if (participant.anonymousUser) {
    return {
      resourceName: participant.name ?? null,
      kind: "anonymous",
      displayName: participant.anonymousUser.displayName ?? null,
      googleUser: null,
    };
  }

  if (participant.phoneUser) {
    return {
      resourceName: participant.name ?? null,
      kind: "phone",
      displayName: participant.phoneUser.displayName ?? null,
      googleUser: null,
    };
  }

  return {
    resourceName: participant.name ?? null,
    kind: "unknown",
    displayName: null,
    googleUser: null,
  };
}

const MEETING_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i;

export function assertMeetingCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (!MEETING_CODE.test(code)) {
    throw new Error(
      "Code Meet attendu au format aaa-bbbb-ccc pour l'API Meet",
    );
  }
  return code;
}
