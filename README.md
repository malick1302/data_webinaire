# Datawebinaires

Preuve d'une question OUI / NON dans Google Meet, avec deux réponses rattachées à deux comptes. Le protocole et les limites Google sont dans [docs/phase-0.md](docs/phase-0.md).

## Démarrage local

```bash
npm install
npm run dev
```

- Panneau : http://localhost:3000/sidepanel?preview=1
- Scène : http://localhost:3000/mainstage?preview=1&meetingCode=dev-meeting

Pour exercer les identités de test, exporter `POC_ALLOW_DEV_IDENTITY=true`. Ne pas activer cette variable sur l'origine utilisée dans Meet.

## Vérification du rattachement

```bash
POC_ALLOW_DEV_IDENTITY=true TRAINER_KEY=poc-test-key npm run dev -- --port 3456
TRAINER_KEY=poc-test-key npm run verify
```

Le script envoie OUI et NON pour deux `sub` distincts, refuse le changement de réponse, et contrôle les deux pages.

## Dans Meet

Renseigner `.env` à partir de `.env.example`, déployer l'application en HTTPS, puis créer le déploiement HTTP avec `meet-addon-manifest.example.json`. Le test à deux comptes se fait dans le même domaine Workspace.
