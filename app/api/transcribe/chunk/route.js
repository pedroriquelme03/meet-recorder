import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI, { toFile } from "openai";

// Recebe UM bloco de ~8min de áudio, transcreve na hora e salva o
// resultado em meeting_chunks. Não gera resumo aqui — isso só acontece
// no /finalize, depois que todos os blocos chegaram.
export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 3,
      timeout: 60000,
    });

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

    // Transcreve esse bloco isoladamente. Usamos toFile() (forma oficial do
    // SDK) em vez de new File([buffer]) — a construção manual costuma gerar
    // um multipart com content-length inconsistente, e a OpenAI derruba a
    // conexão no meio do upload (ECONNRESET).
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(buffer, `chunk-${chunkIndex}.webm`, { type: "audio/webm" }),
      model: "whisper-1",
      language: "pt",
    });

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
