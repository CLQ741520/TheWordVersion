import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface OcrWord {
  words: string;
  probability?: { average: number; variance: number; min: number };
}

interface OcrResult {
  log_id: number;
  direction?: number;
  words_result_num: number;
  words_result: OcrWord[];
  paragraphs_result?: Array<{ words_result_idx: number[] }>;
  paragraphs_result_num?: number;
  error_code: number;
  error_msg: string;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let image: string;
  let languageType: string | undefined;
  try {
    const body = await req.json();
    image = body.image;
    if (!image) throw new Error("Missing image");
    languageType = body.language_type;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const params: Record<string, string> = { image };
  if (languageType) params.language_type = languageType;

  const upstream = await fetch(
    "https://app-cui721lyjt35-api-eLMlJ2jB44g9-gateway.appmiaoda.com/rest/2.0/ocr/v1/accurate_basic",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: new URLSearchParams(params).toString(),
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = (await upstream.json()) as OcrResult;
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
