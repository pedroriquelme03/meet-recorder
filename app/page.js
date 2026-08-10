export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Meeting Recorder Backend — API online</h1>
      <p>O deploy está funcionando.</p>
      <p>
        <a href="/reunioes">→ Ver reuniões e transcrever</a>
      </p>
      <ul>
        <li>
          <code>POST /api/transcribe/chunk</code> — armazena um bloco de vídeo
        </li>
        <li>
          <code>POST /api/meetings</code> — registra a reunião gravada
        </li>
        <li>
          <code>POST /api/transcribe/run</code> — transcreve e gera a ata
        </li>
      </ul>
    </main>
  );
}
