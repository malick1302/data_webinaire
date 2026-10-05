# Phase 0 — POC Google Meet

Ce document fixe ce que la documentation Google permet, comment le POC est construit, et le protocole du test à deux comptes. Les cases de la grille finale se remplissent pendant le test réel dans Meet : le code ne peut pas les deviner.

Sources lues le 5 octobre 2026. Pages principales datées du 3 septembre 2026, guide des participants du 14 septembre 2026.

## Question du POC

Un formateur lance une question. Deux comptes Google, dans le même Meet, répondent OUI et NON. Le backend conserve deux réponses, rattachées à deux `google_sub` différents.

## Ce que Google permet

- Embarquer une application HTTPS dans Meet, en iframe : panneau latéral (`sidePanelUrl`) et scène principale (`mainStageUrl`).
- Ouvrir la scène pour la personne qui appelle `startActivity()`.
- Prévenir les autres participants. S'ils ont l'add-on, ils peuvent rejoindre. Sinon, Meet les oriente vers l'installation.
- Lire `meetingCode` (`aaa-bbbb-ccc`) et `meetingId`. Rien d'autre sur la personne.
- Connaître la raison d'ouverture : `OPEN_ADDON`, `START_ACTIVITY`, `JOIN_ACTIVITY`.
- Passer un état initial de moins de 4 096 caractères (`additionalData`). Les URL font moins de 512 caractères, même origine que `addOnOrigins`.
- Obtenir un jeton d'identité Google dans l'iframe via One Tap, si une session Google est active. Le jeton vérifié contient `sub`, et souvent `email`, `email_verified`, `name`.
- Lister, avec l'API Meet v2, les participants d'une conférence accessible au compte autorisé, y compris une conférence encore ouverte (`end_time IS NULL`). Trois formes : `signedinUser` (`users/{id}` + nom), `anonymousUser` (nom affiché), `phoneUser` (numéro partiellement masqué).

## Ce que Google ne permet pas

- Faire apparaître la question à tout le monde sans action. Le clic **Rejoindre** est documenté. L'installation préalable aussi, sauf installation imposée par l'administrateur du domaine.
- Lire l'e-mail ou le `sub` dans le SDK Meet. L'e-mail n'est pas non plus un champ de l'API participants.
- Synchroniser l'état avec Co-Doing : le programme d'accès anticipé est fermé aux nouveaux projets. Les messages entre cadres restent sur le même participant.
- Faire répondre un appel téléphonique : pas d'iframe.
- Installer un add-on privé hors du domaine Workspace, ni le faire utiliser par un participant anonyme sans compte Google.
- Exécuter ce SDK web dans l'application mobile Meet.
- Publier pour des comptes extérieurs sans revue Marketplace. La publication privée, sans revue, reste dans l'organisation.
- Utiliser le bouton Installer de la console pour un second compte : il n'installe l'add-on que pour le compte connecté.

Le `sub` du jeton vérifié est donc la clé d'identité du POC. L'e-mail reste nullable. Une réponse sans jeton est refusée : un identifiant de navigateur ne prouve pas deux comptes Google.

## Parcours

1. L'administrateur autorise les add-ons tiers et installe celui-ci pour le domaine, ou chaque testeur l'installe.
2. Le formateur ouvre Outils de réunion, puis l'add-on. Meet charge `/sidepanel`.
3. Il lance la question. Le serveur la passe en `LIVE`. `startActivity()` ouvre `/mainstage` pour lui et notifie les autres.
4. Chaque participant qui rejoint charge sa propre iframe. One Tap échange un jeton. Le serveur le vérifie et crée le participant.
5. Le participant clique OUI ou NON. Le serveur rattache la réponse à `participant_id`. Un second choix différent est refusé. Le même choix est accepté sans doublon.
6. Le panneau formateur affiche les deux lignes : valeur, nom, e-mail, `sub`.

Hors Meet, `?preview=1` exerce le même backend. Ce n'est pas le test de validation.

## Permissions

Le participant ne consent qu'au jeton d'identité (compte Google déjà ouvert). Aucun scope Meet sur son installation.

Le formateur, dans une fenêtre séparée, peut autoriser :

`https://www.googleapis.com/auth/meetings.space.readonly`

Ce scope sert à classer les présents (`signed_in`, `anonymous`, `phone`). Il n'est pas sur le chemin du clic. L'essai People API (`?people=1`) demande en plus un scope d'annuaire ou de contacts ; sans lui, l'appel revient en erreur et l'e-mail reste vide. C'est une observation, pas un échec du rattachement.

`POC_ALLOW_DEV_IDENTITY=true` accepte des identités `dev:` . À laisser éteint sur l'origine HTTPS ouverte dans Meet.

## Fichiers

| Chemin | Rôle |
| --- | --- |
| `app/sidepanel/page.tsx` | Panneau formateur, lancement, résultats |
| `app/mainstage/page.tsx` | Question, OUI, NON, confirmation |
| `app/api/identity/route.ts` | Vérifie le jeton et ouvre la session |
| `app/api/interactions/route.ts` | Lance ou ferme la question |
| `app/api/answers/route.ts` | Enregistre et liste les réponses |
| `app/api/meet/participants/route.ts` | Expérience API Meet |
| `lib/store.ts` | Fichier `data/store.json`, un processus Node |

Le fichier JSON suffit à deux navigateurs sur un seul `next start`. Il ne tient pas une montée en charge, ni plusieurs instances serverless.

## Protocole à deux comptes

1. Deux comptes du même domaine Workspace. Un compte Gmail extérieur ne voit pas un add-on privé.
2. Projet Cloud, API Google Workspace add-ons et Marketplace SDK activés. Déploiement HTTP dont le manifeste pointe vers l'origine HTTPS. Logo PNG 256×256.
3. `addOnOrigins` contient exactement cette origine. `sidePanelUrl` vaut `https://ORIGINE/sidepanel`.
4. Renseigner `.env` : numéro de projet, client OAuth web, secret, `GOOGLE_REDIRECT_URI`, `TRAINER_KEY`. Laisser `POC_ALLOW_DEV_IDENTITY` absent.
5. Origines JavaScript autorisées : l'origine HTTPS. URI de redirection : `/api/meet/oauth/callback`.
6. Publier l'add-on en privé sur le domaine, ou faire installer le déploiement par chaque compte.
7. Créer un Meet. Compte formateur : ouvrir l'add-on, lancer la question.
8. Compte A répond OUI. Compte B clique Rejoindre, puis NON.
9. Le panneau doit montrer deux `sub` différents et la bonne valeur.
10. Recommencer avec un invité anonyme, un appel téléphonique, et si possible un compte hors domaine. Noter le résultat ci-dessous.
11. Depuis le panneau, autoriser l'API Meet, puis lire les présents. Noter si la conférence en cours apparaît, et si People API renvoie un e-mail.

## Grille à remplir après le test Meet

| Observation | Résultat |
| --- | --- |
| Raison d'ouverture du formateur | |
| Raison d'ouverture du participant | |
| Clic Rejoindre nécessaire | |
| One Tap affiché, silencieux, ou bloqué dans l'iframe | |
| `sub` présent | |
| `email` présent dans le jeton | |
| Deux réponses, deux `sub` | |
| Compte hors domaine | |
| Participant anonyme | |
| Participant téléphonique | |
| Application mobile Meet | |
| Conférence lisible pendant le live | |
| E-mail renvoyé par People API | |

Airtable, Xano, NPS, dashboard et gamification restent hors de cette phase.
