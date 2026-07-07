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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Content-Type": "text/plain", ...corsHeaders },
    });
  }

  let image: string;
  let languageType: string | undefined;
  try {
    const body = await req.json();
    image = body.image;
    if (!image) throw new Error("Missing image");
    languageType = body.language_type;
  } catch {
    return jsonResponse(JSON.stringify({ error: "Invalid request body" }), 400);
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return jsonResponse(JSON.stringify({ error: "Server configuration error" }), 500);
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
    return jsonResponse(errText, upstream.status);
  }

  if (!upstream.ok) {
    return jsonResponse(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      502
    );
  }

  const data = (await upstream.json()) as OcrResult;
  return jsonResponse(JSON.stringify(data), 200);
});
