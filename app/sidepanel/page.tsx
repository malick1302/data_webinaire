"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AnswerPublic,
  InteractionPublic,
  ObservationPublic,
} from "@/lib/contracts";
import type { MeetLookup } from "@/lib/meet-participants";

const TRAINER_KEY = "poc-trainer-key";

type Health = {
  trainerKeyRequired: boolean;
  cloudProjectConfigured: boolean;
};

type SideClient = {
  getMeetingInfo: () => Promise<{ meetingId: string; meetingCode: string }>;
  getFrameOpenReason: () => Promise<string>;
  startActivity: (state: {
    mainStageUrl?: string;
    additionalData?: string;
  }) => Promise<void>;
};

export default function SidePanelPage() {
  const clientRef = useRef<SideClient | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [meetingCode, setMeetingCode] = useState("dev-meeting");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [frameReason, setFrameReason] = useState("chargement");
  const [trainerKey, setTrainerKey] = useState("");
  const [interaction, setInteraction] = useState<InteractionPublic | null>(null);
  const [answers, setAnswers] = useState<AnswerPublic[]>([]);
  const [observations, setObservations] = useState<ObservationPublic[]>([]);
  const [lookup, setLookup] = useState<MeetLookup | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const storedKey = sessionStorage.getItem(TRAINER_KEY) ?? "";
    setTrainerKey(storedKey);
    const preview = new URLSearchParams(window.location.search).get("preview") === "1";

    void fetch("/api/health")
      .then((response) => response.json())
      .then((body: Health) => setHealth(body));

    if (preview) {
      setFrameReason("HORS_MEET");
      void report("HORS_MEET", "Aperçu local du panneau formateur");
      return;
    }

    void connectMeet();
  }, []);

  useEffect(() => {
    if (!meetingCode) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch(`/api/interactions?meetingCode=${encodeURIComponent(meetingCode)}`)
        .then((response) => response.json())
        .then((body: { interaction?: InteractionPublic | null }) => {
          if (!cancelled) setInteraction(body.interaction ?? null);
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [meetingCode]);

  useEffect(() => {
    if (!interaction) return;
    if (health?.trainerKeyRequired && !trainerKey) return;
    let cancelled = false;

    async function poll() {
      const response = await fetch(
        `/api/answers?interactionId=${interaction!.id}`,
        { headers: trainerHeaders() },
      );
      const body = (await response.json()) as {
        answers?: AnswerPublic[];
        error?: string;
      };
      if (cancelled) return;
      if (!response.ok) {
        setError(body.error ?? "Résultats indisponibles");
        return;
      }
      setAnswers(body.answers ?? []);
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [interaction, trainerKey, health]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setInterval(() => {
      void fetch("/api/observations", { headers: trainerHeaders() })
        .then(async (response) => {
          if (!response.ok || cancelled) return;
          const body = (await response.json()) as {
            observations: ObservationPublic[];
          };
          setObservations(body.observations);
        })
        .catch(() => undefined);
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [trainerKey]);

  async function connectMeet() {
    try {
      const project = process.env.NEXT_PUBLIC_CLOUD_PROJECT_NUMBER;
      if (!project) {
        setFrameReason("HORS_MEET");
        setError("NEXT_PUBLIC_CLOUD_PROJECT_NUMBER manquant.");
        return;
      }
      const { meet } = await import("@googleworkspace/meet-addons/meet.addons");
      const session = await meet.addon.createAddonSession({
        cloudProjectNumber: project,
      });
      const client = await session.createSidePanelClient();
      clientRef.current = client;
      const info = await client.getMeetingInfo();
      const reason = await client.getFrameOpenReason();
      setMeetingCode(info.meetingCode);
      setMeetingId(info.meetingId);
      setFrameReason(reason);
      void report(reason, `meetingId ${info.meetingId}`, info.meetingCode);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "SDK Meet indisponible";
      setFrameReason("HORS_MEET");
      setError(detail);
      void report("HORS_MEET", detail);
    }
  }

  async function launch() {
    setBusy(true);
    setError(null);
    try {
      sessionStorage.setItem(TRAINER_KEY, trainerKey);
      const response = await fetch("/api/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...trainerHeaders(trainerKey),
        },
        body: JSON.stringify({ meetingCode, meetingId }),
      });
      const body = (await response.json()) as {
        interaction?: InteractionPublic;
        error?: string;
      };
      if (!response.ok || !body.interaction) {
        throw new Error(body.error ?? "Lancement refusé");
      }
      setInteraction(body.interaction);

      const mainStageUrl = `${window.location.origin}/mainstage`;
      if (clientRef.current) {
        await clientRef.current.startActivity({
          mainStageUrl,
          additionalData: JSON.stringify({
            meetingCode,
            interactionId: body.interaction.id,
          }),
        });
      } else {
        setPreviewUrl(
          `${mainStageUrl}?preview=1&meetingCode=${encodeURIComponent(meetingCode)}`,
        );
      }
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Lancement refusé";
      if (detail.includes("ActivityIsOngoing") || detail.includes("ongoing")) {
        setError("L'activité Meet est déjà ouverte. La question reste active.");
      } else {
        setError(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function closeAnswers() {
    if (!interaction) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/interactions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...trainerHeaders(),
        },
        body: JSON.stringify({ action: "close", interactionId: interaction.id }),
      });
      const body = (await response.json()) as {
        interaction?: InteractionPublic;
        error?: string;
      };
      if (!response.ok || !body.interaction) {
        throw new Error(body.error ?? "Fermeture refusée");
      }
      setInteraction(body.interaction);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Fermeture refusée");
    } finally {
      setBusy(false);
    }
  }

  async function readParticipants(withPeople: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/meet/participants?meetingCode=${encodeURIComponent(meetingCode)}${withPeople ? "&people=1" : ""}`,
        { headers: trainerHeaders() },
      );
      const body = (await response.json()) as MeetLookup & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "API Meet refusée");
      setLookup(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "API Meet refusée");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow">
      <p className="meta">Formateur</p>
      <h1>Question live</h1>
      <p className="meta">Ouverture : {frameReason}</p>
      {health && !health.cloudProjectConfigured ? (
        <p className="banner">
          Le numéro de projet Cloud sert à ouvrir l&apos;add-on dans Meet. En aperçu
          local, le backend fonctionne sans lui.
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}

      <label htmlFor="meeting-code">Code de réunion</label>
      <input
        id="meeting-code"
        value={meetingCode}
        onChange={(event) => setMeetingCode(event.target.value)}
        disabled={Boolean(meetingId)}
      />

      {health?.trainerKeyRequired ? (
        <>
          <label htmlFor="trainer-key">Clé formateur</label>
          <input
            id="trainer-key"
            type="password"
            value={trainerKey}
            onChange={(event) => {
              setTrainerKey(event.target.value);
              sessionStorage.setItem(TRAINER_KEY, event.target.value);
            }}
          />
        </>
      ) : (
        <p className="banner">
          TRAINER_KEY est absente. Le lancement est ouvert : réservé au poste de test.
        </p>
      )}

      <div className="row">
        <button className="primary" type="button" disabled={busy} onClick={() => void launch()}>
          Lancer la question
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy || !interaction}
          onClick={() => void closeAnswers()}
        >
          Fermer les réponses
        </button>
      </div>

      {previewUrl ? (
        <p className="meta">
          Scène locale : <a href={previewUrl}>{previewUrl}</a>
        </p>
      ) : null}

      <section className="card">
        <h2>{interaction?.prompt ?? "Ce SMS est-il frauduleux ?"}</h2>
        <p className="meta">{interaction ? interaction.status : "Pas encore lancée"}</p>
        <p>{answers.length} réponse{answers.length > 1 ? "s" : ""}</p>
        <ul className="answers">
          {answers.map((item) => (
            <li key={item.id}>
              <strong>{item.value}</strong>
              <div>{item.participant.displayName || "Sans nom"}</div>
              <div className="meta">{item.participant.email || "e-mail absent"}</div>
              <div className="meta">sub {item.participant.googleSub}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Participants Meet</h2>
        <p className="meta">
          Expérience séparée. Elle ne sert pas à enregistrer la réponse.
        </p>
        <div className="row">
          <a className="secondary" href="/api/meet/oauth/start" target="_blank" rel="noreferrer">
            Autoriser l&apos;API Meet
          </a>
          <button className="secondary" type="button" disabled={busy} onClick={() => void readParticipants(false)}>
            Lire les présents
          </button>
          <button className="secondary" type="button" disabled={busy} onClick={() => void readParticipants(true)}>
            Tenter les e-mails
          </button>
        </div>
        {lookup ? (
          <>
            <p className="meta">{lookup.conferenceName || "Aucune conférence trouvée"}</p>
            <ul className="answers">
              {lookup.participants.map((participant) => (
                <li key={participant.resourceName ?? participant.displayName ?? participant.kind}>
                  <strong>{participant.kind}</strong>
                  <div>{participant.displayName || "Sans nom"}</div>
                  <div className="meta">{participant.googleUser || "pas d'identifiant Google"}</div>
                </li>
              ))}
            </ul>
            {lookup.emailLookups.length > 0 ? (
              <ul className="answers">
                {lookup.emailLookups.map((item) => (
                  <li key={item.googleUser}>
                    <div className="meta">People API {item.httpStatus}</div>
                    <div>{item.email || "e-mail non renvoyé"}</div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section>
        <h2>Journal d&apos;ouverture</h2>
        <ul className="answers">
          {observations.map((item) => (
            <li key={item.id}>
              <div>
                {item.source} · {item.frameOpenReason || "raison absente"}
              </div>
              <div className="meta">{item.detail}</div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function trainerHeaders(override?: string): HeadersInit {
  const key = override ?? sessionStorage.getItem(TRAINER_KEY) ?? "";
  return key ? { "x-trainer-key": key } : {};
}

function report(frameOpenReason: string, detail: string, meetingCode?: string) {
  void fetch("/api/observations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "sidepanel",
      meetingCode: meetingCode ?? null,
      frameOpenReason,
      detail,
    }),
  });
}
