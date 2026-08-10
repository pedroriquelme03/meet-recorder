import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Recebe UM bloco de vídeo (tela + áudio) e apenas ARMAZENA: sobe o arquivo
// pro Storage e registra o bloco em meeting_chunks (sem transcript ainda).
// A transcrição NÃO acontece aqui — só quando o usuário clicar em
// "Transcrever" na página, que dispara /api/transcribe/run.
export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const formData = await req.formData();
    const file = formData.get("file");
    const meetingId = formData.get("meetingId");
    const chunkIndex = Number(formData.get("chunkIndex"));

    if (!file || !meetingId || Number.isNaN(chunkIndex)) {
      return NextResponse.json({ error: "Parâmetros faltando" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = `reunioes/${meetingId}/chunk-${chunkIndex}.webm`;

    // Sobe o vídeo do bloco pro Storage (upsert pra permitir regravar o mesmo path)
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(filePath, buffer, { contentType: "video/webm", upsert: true });
    if (uploadError) throw uploadError;

    // Registra o bloco (transcript fica null até rodar a transcrição)
    const { error: dbError } = await supabase.from("meeting_chunks").insert({
      meeting_id: meetingId,
      chunk_index: chunkIndex,
      file_path: filePath,
      transcript: null,
    });
    if (dbError) throw dbError;

    return NextResponse.json({ ok: true, chunkIndex });
  } catch (err) {
    console.error("Erro no /api/transcribe/chunk:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
