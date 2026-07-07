import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface WordResult {
  word: string;
  phonetic: string;
  translation: string;
}

interface TranslateResult {
  from: string;
  to: string;
  trans_result: Array<{ src: string; dst: string }>;
}

interface DictionaryEntry {
  word: string;
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
}

const TRANSLATION_API =
  "https://app-cui721lyjt35-api-e94GZ5j0PWpa-gateway.appmiaoda.com/rpc/2.0/mt/texttrans/v1";

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

function normalizeWord(input: string): string {
  return input
    .replace(/[^a-zA-Z'-]/g, "")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function withConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function translateWords(
  words: string[],
  apiKey: string
): Promise<Record<string, string>> {
  const q = words.join("\n");
  const upstream = await fetch(TRANSLATION_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "X-Gateway-Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ q, from: "en", to: "zh" }),
  });

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    throw new Error(errText);
  }

  if (!upstream.ok) {
    throw new Error(`Translation upstream error: ${upstream.status}`);
  }

  const json = (await upstream.json()) as {
    error_code?: number;
    error_msg?: string;
    result?: TranslateResult;
  };

  if (json.error_code) {
    throw new Error(`Translation API error ${json.error_code}: ${json.error_msg}`);
  }

  const map: Record<string, string> = {};
  const transResult = json.result?.trans_result ?? [];
  for (let i = 0; i < words.length && i < transResult.length; i++) {
    map[words[i]] = transResult[i].dst;
  }
  return map;
}

async function fetchPhonetic(word: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { method: "GET" }
    );
    if (!res.ok) return "";
    const entries = (await res.json()) as DictionaryEntry[];
    const entry = entries.find((e) => e.word.toLowerCase() === word.toLowerCase());
    if (!entry) return "";
    if (entry.phonetic) return entry.phonetic;
    for (const p of entry.phonetics ?? []) {
      if (p.text) return p.text;
    }
    return "";
  } catch {
    return "";
  }
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

  let rawWords: unknown;
  try {
    const body = await req.json();
    rawWords = body.words;
    if (!Array.isArray(rawWords) || rawWords.length === 0) {
      throw new Error("Missing or invalid words");
    }
  } catch {
    return jsonResponse(JSON.stringify({ error: "Invalid request body" }), 400);
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return jsonResponse(JSON.stringify({ error: "Server configuration error" }), 500);
  }

  const words = (rawWords as string[])
    .map((w) => normalizeWord(String(w)))
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return jsonResponse(JSON.stringify({ result: [] }), 200);
  }

  try {
    const translationMap = await translateWords(words, apiKey);
    const phonetics = await withConcurrencyLimit(words, 5, fetchPhonetic);

    const result: WordResult[] = words.map((word, i) => ({
      word,
      phonetic: phonetics[i] ?? "",
      translation: translationMap[word] ?? "",
    }));

    return jsonResponse(JSON.stringify({ result }), 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse(JSON.stringify({ error: message }), 502);
  }
});
