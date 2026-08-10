import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Recebe UM bloco de ~8min de áudio, transcreve na hora e salva o
// resultado em meeting_chunks. Não gera resumo aqui — isso só acontece
// no /finalize, depois que todos os blocos chegaram.
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

    // Guarda o áudio original como backup (opcional, mas útil pra reprocessar)
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(filePath, buffer, { contentType: "audio/webm" });
    if (uploadError) throw uploadError;

    // Transcreve esse bloco isoladamente. Chamamos o Whisper direto com o
    // fetch nativo (undici) em vez do SDK da OpenAI: o transporte node-fetch
    // do SDK v4 estava resetando a conexão (ECONNRESET) no upload do áudio
    // em serverless. O undici lida com isso de forma bem mais estável.
    // Mesma semântica de antes: model whisper-1, language pt.
    const whisperForm = new FormData();
    whisperForm.append(
      "file",
      new Blob([buffer], { type: "audio/webm" }),
      `chunk-${chunkIndex}.webm`
    );
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "pt");

    const whisperRes = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: whisperForm,
      }
    );

    if (!whisperRes.ok) {
      const detail = await whisperRes.text();
      throw new Error(`Whisper retornou ${whisperRes.status}: ${detail}`);
    }

    const transcription = await whisperRes.json();

    // Salva o texto do bloco, ordenado por chunkIndex
    const { error: dbError } = await supabase.from("meeting_chunks").insert({
      meeting_id: meetingId,
      chunk_index: chunkIndex,
      file_path: filePath,
      transcript: transcription.text,
    });
    if (dbError) throw dbError;

    return NextResponse.json({ ok: true, chunkIndex });
  } catch (err) {
    console.error("Erro no /api/transcribe/chunk:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
