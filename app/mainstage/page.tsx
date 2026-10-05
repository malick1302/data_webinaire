"use client";

import { useEffect, useState } from "react";
import { GoogleSignIn } from "@/components/google-sign-in";
import type { AnswerValue, InteractionPublic, ParticipantPublic } from "@/lib/contracts";

const TOKEN_KEY = "poc-participant-token";

type Health = {
  devIdentityEnabled: boolean;
  googleClientId: string;
  cloudProjectConfigured: boolean;
};

export default function MainStagePage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [meetingCode, setMeetingCode] = useState<string | null>(null);
  const [frameReason, setFrameReason] = useState("chargement");
  const [interaction, setInteraction] = useState<InteractionPublic | null>(null);
  const [participant, setParticipant] = useState<ParticipantPublic | null>(null);
  const [answer, setAnswer] = useState<AnswerValue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devLabel, setDevLabel] = useState("compte-a");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPreview = params.get("preview") === "1";
    const previewCode = params.get("meetingCode");
    setPreview(isPreview);

    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: Health) => setHealth(body));

    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      void fetch("/api/identity", {
        headers: { authorization: `Bearer ${stored}` },
      })
        .then(async (response) => {
          if (!response.ok) {
            sessionStorage.removeItem(TOKEN_KEY);
            return;
          }
          const body = (await response.json()) as { participant: ParticipantPublic };
          setParticipant(body.participant);
        })
        .catch(() => setError("Connexion au serveur impossible"));
    }

    if (isPreview) {
      setMeetingCode(previewCode || "dev-meeting");
      setFrameReason("HORS_MEET");
      void report("mainstage", previewCode || "dev-meeting", "HORS_MEET", "Aperçu local");
      return;
    }

    void connectMeet();
  }, []);

  useEffect(() => {
    if (!meetingCode) return;
    let cancelled = false;

    async function poll() {
      const response = await fetch(
        `/api/interactions?meetingCode=${encodeURIComponent(meetingCode!)}`,
      );
      const body = (await response.json()) as {
        interaction?: InteractionPublic | null;
        error?: string;
      };
      if (cancelled) return;
      if (!response.ok) {
        setError(body.error ?? "Question indisponible");
        return;
      }
      setInteraction(body.interaction ?? null);
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [meetingCode]);

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!interaction || !token) return;
    let cancelled = false;

    void fetch(`/api/answers?interactionId=${interaction.id}&mine=1`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          answer: { value: AnswerValue } | null;
        };
        if (body.answer) setAnswer(body.answer.value);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [interaction]);

  async function connectMeet() {
    try {
      const project = process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER;
      if (!project) {
        setFrameReason("HORS_MEET");
        setMessage("Numéro de projet Google Cloud absent.");
        return;
      }

      const { meet } = await import("@googleworkspace/meet-addons/meet.addons");
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: project,
      });
      const client = await session.createMainStageClient();
      const info = await client.getMeetingInfo();
      const reason = await client.getFrameOpenReason();
      setMeetingCode(info.meetingCode);
      setFrameReason(reason);
      void report("mainstage", info.meetingCode, reason, `meetingId ${info.meetingId}`);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "SDK Meet indisponible";
      setFrameReason("HORS_MEET");
      setMessage(detail);
      void report("mainstage", null, "HORS_MEET", detail);
    }
  }

  async function identify(credential: string) {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const body = (await response.json()) as {
        sessionToken?: string;
        participant?: ParticipantPublic;
        error?: string;
      };
      if (!response.ok || !body.sessionToken || !body.participant) {
        throw new Error(body.error ?? "Identité refusée");
      }
      sessionStorage.setItem(TOKEN_KEY, body.sessionToken);
      setParticipant(body.participant);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Identité refusée");
    } finally {
      setBusy(false);
    }
  }

  async function submit(value: AnswerValue) {
    if (!interaction) return;
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) {
      setError("Confirmez d'abord le compte Google.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/answers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ interactionId: interaction.id, value }),
      });
      const body = (await response.json()) as {
        answer?: { value: AnswerValue };
        error?: string;
      };
      if (!response.ok || !body.answer) {
        throw new Error(body.error ?? "Réponse refusée");
      }
      setAnswer(body.answer.value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Réponse refusée");
    } finally {
      setBusy(false);
    }
  }

  const canAnswer = Boolean(participant) && interaction?.status === "LIVE" && !answer && !busy;

  return (
    <main>
      <p className="meta">Question</p>
      {frameReason === "JOIN_ACTIVITY" ? (
        <p className="meta">Activité rejointe.</p>
      ) : null}
      {message ? <p className="banner">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!interaction ? (
        <h1>La question va apparaître ici.</h1>
      ) : (
        <h1 className="question">{interaction.prompt}</h1>
      )}

      {answer ? (
        <p className="ok">Réponse enregistrée : {answer}</p>
      ) : null}

      {interaction?.status === "CLOSED" && !answer ? (
        <p className="banner">Les réponses sont fermées.</p>
      ) : null}

      {!participant ? (
        <section className="card">
          <h2>Compte Google</h2>
          <p>La réponse doit être rattachée à votre compte.</p>
          {health?.googleClientId ? (
            <GoogleSignIn
              clientId={health.googleClientId}
              onCredential={(credential) => void identify(credential)}
            />
          ) : (
            <p className="meta">Client Google non configuré.</p>
          )}
          {preview && health?.devIdentityEnabled ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const email = `${devLabel}@example.test`;
                void identify(`dev:${devLabel}:${email}:${devLabel}`);
              }}
            >
              <label htmlFor="dev-label">Identité de test</label>
              <input
                id="dev-label"
                value={devLabel}
                onChange={(event) => setDevLabel(event.target.value)}
              />
              <button className="secondary" type="submit">
                Utiliser cette identité
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {participant && interaction?.status === "LIVE" && !answer ? (
        <div className="choices">
          <button
            className="choice yes"
            type="button"
            disabled={!canAnswer}
            onClick={() => void submit("OUI")}
          >
            OUI
          </button>
          <button
            className="choice no"
            type="button"
            disabled={!canAnswer}
            onClick={() => void submit("NON")}
          >
            NON
          </button>
        </div>
      ) : null}

      {participant ? (
        <p className="meta">
          {participant.displayName || "Participant"} · {participant.email || "e-mail absent"}
        </p>
      ) : null}
    </main>
  );
}

function report(
  source: "mainstage",
  meetingCode: string | null,
  frameOpenReason: string,
  detail: string,
) {
  void fetch("/api/observations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, meetingCode, frameOpenReason, detail }),
  });
}
