import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import FormData from "form-data";
import { Readable } from "stream";

export async function POST(req) {
  const LOG_PREFIX = "[transcribe/run]";

  try {
    console.log(`${LOG_PREFIX} Iniciando transcrição`);

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

    console.log(`${LOG_PREFIX} meetingId: ${meetingId}`);

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

    console.log(`${LOG_PREFIX} ${chunks.length} bloco(s) encontrado(s)`);

    await supabase
      .from("meetings")
      .update({ status: "transcrevendo" })
      .eq("id", meetingId);

    // Transcreve bloco a bloco
    for (const chunk of chunks) {
      if (chunk.transcript) {
        console.log(`${LOG_PREFIX} Bloco ${chunk.chunk_index} já tem transcrição, pulando`);
        continue;
      }

      console.log(`${LOG_PREFIX} Baixando bloco ${chunk.chunk_index}...`);

      const { data: fileData, error: dlError } = await supabase.storage
        .from("recordings")
        .download(chunk.file_path);
      if (dlError) throw new Error(`Erro ao baixar bloco ${chunk.chunk_index}: ${dlError.message}`);

      const buffer = Buffer.from(await fileData.arrayBuffer());
      console.log(`${LOG_PREFIX} Bloco ${chunk.chunk_index} baixado: ${buffer.length} bytes`);

      console.log(`${LOG_PREFIX} Enviando bloco ${chunk.chunk_index} para Groq (${buffer.length} bytes)...`);

      let transcription;
      let lastError;
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // Usa form-data para construir o multipart corretamente
          const form = new FormData();
          form.append("model", "whisper-large-v3");
          form.append("language", "pt");
          form.append("file", Readable.from(buffer), `chunk-${chunk.chunk_index}.webm`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          const res = await fetch(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            {
              method: "POST",
              headers: form.getHeaders(),
              body: form,
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!res.ok) {
            const detail = await res.text();
            throw new Error(`Groq retornou ${res.status}: ${detail}`);
          }

          transcription = await res.json();
          console.log(`${LOG_PREFIX} Bloco ${chunk.chunk_index} transcrito (tentativa ${attempt}/${MAX_RETRIES}): ${transcription.text.length} caracteres`);
          break;
        } catch (err) {
          lastError = err;
          console.warn(`${LOG_PREFIX} Tentativa ${attempt}/${MAX_RETRIES} falhou para bloco ${chunk.chunk_index}: ${err.message}`);

          if (attempt < MAX_RETRIES) {
            const waitTime = Math.pow(2, attempt - 1) * 1000;
            console.log(`${LOG_PREFIX} Aguardando ${waitTime}ms antes de tentar novamente...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!transcription) {
        throw lastError;
      }

      await supabase
        .from("meeting_chunks")
        .update({ transcript: transcription.text })
        .eq("id", chunk.id);

      chunk.transcript = transcription.text;
    }

    console.log(`${LOG_PREFIX} Todos os blocos transcritos, gerando resumo...`);

    const transcript = chunks.map((c) => c.transcript).join("\n\n");
    console.log(`${LOG_PREFIX} Transcrição total: ${transcript.length} caracteres`);

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
    console.log(`${LOG_PREFIX} Resumo gerado: ${summary.length} caracteres`);

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

    console.log(`${LOG_PREFIX} Transcrição concluída com sucesso`);
    return NextResponse.json({ transcript, summary, meeting });
  } catch (err) {
    console.error(`${LOG_PREFIX} Erro:`, err);

    let errorMsg = err.message;
    if (err.name === "AbortError") {
      errorMsg = "Timeout ao enviar áudio para Groq (30s). O arquivo pode ser muito grande.";
    }

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
