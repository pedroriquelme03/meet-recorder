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
      setError(err.message);
    } finally {
      setRunning(null);
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
