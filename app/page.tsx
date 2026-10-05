export default function HomePage() {
  return (
    <main>
      <p className="meta">Phase 0</p>
      <h1>Datawebinaires</h1>
      <p>
        Une question, deux participants, deux réponses rattachées à deux
        identités. Le détail du test est dans <code>docs/phase-0.md</code>.
      </p>
      <div className="row">
        <a className="secondary" href="/sidepanel?preview=1">
          Panneau formateur
        </a>
        <a className="secondary" href="/mainstage?preview=1&meetingCode=dev-meeting">
          Scène participant
        </a>
      </div>
    </main>
  );
}
