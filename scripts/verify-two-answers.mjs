const base = process.env.POC_BASE_URL ?? "http://127.0.0.1:3456";
const trainerKey = process.env.TRAINER_KEY ?? "";

function headers(extra = {}) {
  return {
    "content-type": "application/json",
    ...(trainerKey ? { "x-trainer-key": trainerKey } : {}),
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} -> ${response.status} ${JSON.stringify(body)}`);
  }
  return { status: response.status, body };
}

async function identify(sub, email, name) {
  const { body } = await request("/api/identity", {
    method: "POST",
    body: JSON.stringify({ credential: `dev:${sub}:${email}:${name}` }),
  });
  return body;
}

async function answer(token, interactionId, value) {
  const response = await fetch(`${base}/api/answers`, {
    method: "POST",
    headers: headers({ authorization: `Bearer ${token}` }),
    body: JSON.stringify({ interactionId, value }),
  });
  const body = await response.json();
  return { status: response.status, body };
}

await request("/api/reset", { method: "POST" });

const launched = await request("/api/interactions", {
  method: "POST",
  body: JSON.stringify({ meetingCode: "dev-meeting", meetingId: "space-dev" }),
});

const interactionId = launched.body.interaction.id;
const accountA = await identify("google-sub-a", "a@academie.test", "Compte A");
const accountB = await identify("google-sub-b", "b@ernest.test", "Compte B");

const yes = await answer(accountA.sessionToken, interactionId, "OUI");
const no = await answer(accountB.sessionToken, interactionId, "NON");
const duplicate = await answer(accountA.sessionToken, interactionId, "OUI");
const conflict = await answer(accountB.sessionToken, interactionId, "OUI");

if (yes.status !== 200 || yes.body.answer.value !== "OUI") {
  throw new Error("La réponse OUI de A n'a pas été enregistrée");
}
if (no.status !== 200 || no.body.answer.value !== "NON") {
  throw new Error("La réponse NON de B n'a pas été enregistrée");
}
if (!duplicate.body.alreadyAnswered) {
  throw new Error("Le second envoi de A aurait dû être idempotent");
}
if (conflict.status !== 409) {
  throw new Error("Le changement de réponse de B aurait dû être refusé");
}

const listed = await request(`/api/answers?interactionId=${interactionId}`);
const rows = listed.body.answers;
if (rows.length !== 2) {
  throw new Error(`Deux réponses attendues, reçu ${rows.length}`);
}

const bySub = Object.fromEntries(rows.map((row) => [row.participant.googleSub, row]));
if (bySub["google-sub-a"].value !== "OUI" || bySub["google-sub-a"].participant.email !== "a@academie.test") {
  throw new Error("A n'est pas rattaché à OUI");
}
if (bySub["google-sub-b"].value !== "NON" || bySub["google-sub-b"].participant.email !== "b@ernest.test") {
  throw new Error("B n'est pas rattaché à NON");
}
if (bySub["google-sub-a"].participant.id === bySub["google-sub-b"].participant.id) {
  throw new Error("Les deux réponses partagent le même participant");
}

const stage = await fetch(`${base}/mainstage?preview=1&meetingCode=dev-meeting`);
const panel = await fetch(`${base}/sidepanel?preview=1`);
if (!stage.ok || !panel.ok) {
  throw new Error("Les pages Meet ne répondent pas");
}
const stageHtml = await stage.text();
const panelHtml = await panel.text();
if (!stageHtml.includes("La question va apparaître ici.") && !stageHtml.includes("Ce SMS est-il frauduleux")) {
  throw new Error("La scène ne contient pas le texte d'attente");
}
if (!panelHtml.includes("Lancer la question") && !panelHtml.includes("Question live")) {
  throw new Error("Le panneau ne contient pas le contrôle formateur");
}

console.log("POC vérifié : 2 identités, OUI et NON, sans doublon.");
console.log(JSON.stringify(rows, null, 2));
