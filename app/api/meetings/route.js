import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supa() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Lista as reuniões (mais recentes primeiro) pra página /reunioes.
export async function GET() {
  try {
    const supabase = supa();
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, status, chunk_count, summary, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ meetings: data });
  } catch (err) {
    console.error("Erro no GET /api/meetings:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Registra a reunião quando a gravação termina (status "gravada").
// Ainda sem transcript/summary — isso vem depois, no /api/transcribe/run.
export async function POST(req) {
  try {
    const { meetingId, chunkCount, title } = await req.json();
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId faltando" }, { status: 400 });
    }

    const supabase = supa();
    const { error } = await supabase.from("meetings").upsert(
      {
        id: meetingId,
        title: title ?? null,
        chunk_count: chunkCount ?? null,
        status: "gravada",
      },
      { onConflict: "id" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erro no POST /api/meetings:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
