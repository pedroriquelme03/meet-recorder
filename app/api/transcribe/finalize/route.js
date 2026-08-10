import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

export async function POST(req) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    // NVIDIA expõe LLMs num endpoint compatível com a API da OpenAI,
    // então usamos o próprio SDK da OpenAI apontando pra base da NVIDIA.
    const nvidia = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
    });

    const { meetingId } = await req.json();
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId faltando" }, { status: 400 });
    }

    // Busca todos os blocos já transcritos, em ordem
    const { data: chunks, error: fetchError } = await supabase
      .from("meeting_chunks")
      .select("chunk_index, transcript")
      .eq("meeting_id", meetingId)
      .order("chunk_index", { ascending: true });

    if (fetchError) throw fetchError;
    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ error: "Nenhum bloco encontrado pra essa reunião" }, { status: 404 });
    }

    const transcript = chunks.map((c) => c.transcript).join("\n\n");

    // Gera a ata estruturada com um LLM da NVIDIA a partir da transcrição completa
    const summaryResponse = await nvidia.chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: `Aqui está a transcrição completa de uma reunião (concatenada a partir de blocos de ~8min, pode ter pequenas quebras entre eles). Gere uma ata estruturada em português com: 1) Resumo geral (3-4 linhas), 2) Principais pontos discutidos (bullets), 3) Decisões tomadas, 4) Próximos passos/ações com responsáveis (se mencionados).\n\nTranscrição:\n${transcript}`,
        },
      ],
    });

    const summary = summaryResponse.choices[0]?.message?.content ?? "";

    // Salva o registro final da reunião
    const { data: meeting, error: dbError } = await supabase
      .from("meetings")
      .insert({
        id: meetingId,
        transcript,
        summary,
        chunk_count: chunks.length,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return NextResponse.json({ transcript, summary, meeting });
  } catch (err) {
    console.error("Erro no /api/transcribe/finalize:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
