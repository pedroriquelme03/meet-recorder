import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { success: false, error: "GROQ_API_KEY não configurada em .env.local" },
        { status: 400 }
      );
    }

    console.log("[test-groq] Testando conexão com Groq API...");

    // Tenta fazer um teste ping mínimo sem enviar arquivo
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const detail = await res.text();
        console.error(`[test-groq] API retornou ${res.status}: ${detail}`);
        return NextResponse.json(
          {
            success: false,
            status: res.status,
            error: `API retornou ${res.status}. Verifique sua GROQ_API_KEY.`,
            detail: detail.substring(0, 200),
          },
          { status: res.status }
        );
      }

      const data = await res.json();
      console.log("[test-groq] Conexão OK. Modelos disponíveis:", data.data?.length || 0);

      return NextResponse.json({
        success: true,
        message: "Conexão com Groq API OK ✓",
        modelsAvailable: data.data?.length || 0,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);

      if (fetchErr.name === "AbortError") {
        console.error("[test-groq] Timeout ao conectar com Groq");
        return NextResponse.json(
          {
            success: false,
            error: "Timeout ao conectar com Groq (10s). Verifique sua conexão de rede.",
          },
          { status: 500 }
        );
      }

      throw fetchErr;
    }
  } catch (err) {
    console.error("[test-groq] Erro:", err.message);
    return NextResponse.json(
      { success: false, error: `Erro: ${err.message}` },
      { status: 500 }
    );
  }
}
