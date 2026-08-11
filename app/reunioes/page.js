"use client";

import { useEffect, useState } from "react";

const STATUS_LABEL = {
  gravada: "Gravada (não transcrita)",
  transcrevendo: "Transcrevendo...",
  transcrita: "Transcrita",
};

export default function ReunioesPage() {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(null); // meetingId em transcrição
  const [open, setOpen] = useState(null); // meetingId com ata aberta
  const [testingGroq, setTestingGroq] = useState(false);
  const [testGroqResult, setTestGroqResult] = useState(null);

  async function load() {
    try {
      const res = await fetch("/api/meetings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar");
      setMeetings(data.meetings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function transcrever(meetingId) {
    setRunning(meetingId);
    setError(null);
    try {
      const res = await fetch("/api/transcribe/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao transcrever");
      await load();
      setOpen(meetingId);
    } catch (err) {
      setError(`Erro na transcrição: ${err.message}`);
      console.error("Erro ao transcrever:", err);
    } finally {
      setRunning(null);
    }
  }

  async function testarGroq() {
    setTestingGroq(true);
    setTestGroqResult(null);
    try {
      const res = await fetch("/api/test-groq", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setTestGroqResult({
          success: false,
          error: data.error || `Erro ${res.status}`,
        });
      } else {
        setTestGroqResult({
          success: true,
          message: data.message,
        });
      }
    } catch (err) {
      setTestGroqResult({
        success: false,
        error: err.message,
      });
    } finally {
      setTestingGroq(false);
    }
  }

  return (
    <main
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 820,
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <h1>Reuniões</h1>
      <div
        style={{
          border: "2px solid #f97316",
          borderRadius: 8,
          padding: "1rem",
          marginBottom: "1.5rem",
          background: "#fef3c7",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
          🧪 Teste da API Groq
        </div>
        <p style={{ margin: "0 0 0.75rem 0", fontSize: 14, color: "#666" }}>
          Clique para verificar se sua chave GROQ_API_KEY está configurada e conectando corretamente.
        </p>
        <button
          onClick={testarGroq}
          disabled={testingGroq}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: 6,
            border: "none",
            background: testingGroq ? "#999" : "#f97316",
            color: "#fff",
            cursor: testingGroq ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {testingGroq ? "Testando..." : "Testar Groq"}
        </button>
        {testGroqResult && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: 4,
              background: testGroqResult.success ? "#dcfce7" : "#fee2e2",
              color: testGroqResult.success ? "#166534" : "#991b1b",
              fontSize: 13,
            }}
          >
            {testGroqResult.success ? "✓ " : "✗ "}
            {testGroqResult.message || testGroqResult.error}
          </div>
        )}
      </div>
      <p style={{ color: "#666" }}>
        Grave pela extensão. Aqui você dispara a transcrição e lê a ata.
      </p>

      {error && (
        <p style={{ color: "#b00020" }}>Erro: {error}</p>
      )}

      {loading ? (
        <p>Carregando...</p>
      ) : meetings.length === 0 ? (
        <p>Nenhuma reunião ainda. Grave uma pela extensão.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {meetings.map((m) => (
            <li
              key={m.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(m.created_at).toLocaleString("pt-BR")}
                  </div>
                  <div style={{ fontSize: 13, color: "#666" }}>
                    {STATUS_LABEL[m.status] || m.status} ·{" "}
                    {m.chunk_count ?? "?"} bloco(s)
                  </div>
                  <div style={{ fontSize: 11, color: "#999" }}>{m.id}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => transcrever(m.id)}
                    disabled={running === m.id}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: 6,
                      border: "none",
                      background: running === m.id ? "#999" : "#2563eb",
                      color: "#fff",
                      cursor: running === m.id ? "default" : "pointer",
                    }}
                  >
                    {running === m.id
                      ? "Transcrevendo..."
                      : m.status === "transcrita"
                      ? "Transcrever de novo"
                      : "Transcrever"}
                  </button>
                  {m.summary && (
                    <button
                      onClick={() => setOpen(open === m.id ? null : m.id)}
                      style={{
                        padding: "0.5rem 1rem",
                        borderRadius: 6,
                        border: "1px solid #2563eb",
                        background: "#fff",
                        color: "#2563eb",
                        cursor: "pointer",
                      }}
                    >
                      {open === m.id ? "Ocultar ata" : "Ver ata"}
                    </button>
                  )}
                </div>
              </div>

              {open === m.id && m.summary && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "#f7f7f8",
                    padding: "1rem",
                    borderRadius: 6,
                    marginTop: "1rem",
                    fontFamily: "inherit",
                    fontSize: 14,
                  }}
                >
                  {m.summary}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
