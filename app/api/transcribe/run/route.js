import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// Transcrição sob demanda de uma reunião já gravada. Percorre os blocos
// (vídeos no Storage), transcreve cada um no Whisper, junta o texto e gera
// a ata com a NVIDIA. Disparado pelo botão "Transcrever" da página /reunioes.
export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const nvidia = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });

    const { meetingId } = await req.json();
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId faltando" }, { status: 400 });
    }

    const { data: chunks, error: fetchError } = await supabase
      .from("meeting_chunks")
      .select("id, chunk_index, file_path, transcript")
      .eq("meeting_id", meetingId)
      .order("chunk_index", { ascending: true });

    if (fetchError) throw fetchError;
    if (!chunks || chunks.length === 0) {
      return NextResponse.json(
        { error: "Nenhum bloco encontrado pra essa reunião" },
        { status: 404 }
      );
    }

    await supabase
      .from("meetings")
      .update({ status: "transcrevendo" })
      .eq("id", meetingId);

    // Transcreve bloco a bloco. Reaproveita transcript já feito (idempotente).
    for (const chunk of chunks) {
      if (chunk.transcript) continue;

      const { data: fileData, error: dlError } = await supabase.storage
        .from("recordings")
        .download(chunk.file_path);
      if (dlError) throw dlError;

      const buffer = Buffer.from(await fileData.arrayBuffer());

      const form = new FormData();
      form.append(
        "file",
        new Blob([buffer], { type: "video/webm" }),
        `chunk-${chunk.chunk_index}.webm`
      );
      form.append("model", "whisper-large-v3");
      form.append("language", "pt");

      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: form,
        }
      );
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Groq Whisper retornou ${res.status}: ${detail}`);
      }
      const transcription = await res.json();

      await supabase
        .from("meeting_chunks")
        .update({ transcript: transcription.text })
        .eq("id", chunk.id);

      chunk.transcript = transcription.text;
    }

    const transcript = chunks.map((c) => c.transcript).join("\n\n");

    // Gera a ata estruturada com um LLM da NVIDIA
    const summaryResponse = await nvidia.chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Aqui está a transcrição completa de uma reunião (concatenada a partir de blocos, pode ter pequenas quebras entre eles). Gere uma ata estruturada em português com: 1) Resumo geral (3-4 linhas), 2) Principais pontos discutidos (bullets), 3) Decisões tomadas, 4) Próximos passos/ações com responsáveis (se mencionados).\n\nTranscrição:\n${transcript}`,
        },
      ],
    });

    const summary = summaryResponse.choices[0]?.message?.content ?? "";

    const { data: meeting, error: dbError } = await supabase
      .from("meetings")
      .update({
        transcript,
        summary,
        chunk_count: chunks.length,
        status: "transcrita",
      })
      .eq("id", meetingId)
      .select()
      .single();
    if (dbError) throw dbError;

    return NextResponse.json({ transcript, summary, meeting });
  } catch (err) {
    console.error("Erro no /api/transcribe/run:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
