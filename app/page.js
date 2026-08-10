export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>Meeting Recorder Backend — API online</h1>
      <p>O deploy está funcionando. As rotas de transcrição estão disponíveis em:</p>
      <ul>
        <li>
          <code>POST /api/transcribe/chunk</code>
        </li>
        <li>
          <code>POST /api/transcribe/finalize</code>
        </li>
      </ul>
    </main>
  );
}
