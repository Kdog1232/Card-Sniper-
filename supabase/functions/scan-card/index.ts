const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScanRequest = {
  image?: string;
  askingPrice?: number;
};

type ScanResult = {
  player: string;
  year: string;
  set: string;
  variation: string;
  condition: number;
  estimatedMarketValue: number;
  gradedUpside: number;
  snipeScore: number;
  verdict: "BUY" | "FAIR" | "PASS";
  reasoning: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as ScanRequest;
    const image = body.image?.trim();
    const askingPrice = Number(body.askingPrice);

    if (!image || !Number.isFinite(askingPrice) || askingPrice <= 0) {
      return jsonResponse({ error: "Invalid request body. Expected image and askingPrice." }, 400);
    }

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      console.error("Missing OPENAI_API_KEY secret.");
      return jsonResponse({ error: "Server misconfiguration." }, 500);
    }

    const prompt = `You are an expert sports card evaluator.

Analyze this sports card image and identify:

* Player name
* Card brand/set
* Year
* Card variation if visible
* Estimated raw condition (1-10)

Then estimate:

* Approximate raw market value
* Approximate graded upside if PSA 10 candidate

The user paid: ${askingPrice}

Return ONLY valid JSON with:

* player
* year
* set
* variation
* condition
* estimatedMarketValue
* gradedUpside
* snipeScore
* verdict
* reasoning`;

    const imageUrl = image.startsWith("data:image") ? image : `data:image/jpeg;base64,${image}`;

    const openAiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: prompt },
              { type: "input_image", image_url: imageUrl },
            ],
          },
        ],
      }),
    });

    if (!openAiResp.ok) {
      const errorText = await openAiResp.text();
      console.error("OpenAI API error", { status: openAiResp.status, body: errorText });
      return jsonResponse({ error: "Failed to analyze card image." }, 500);
    }

    const openAiData = await openAiResp.json();
    const rawText = extractOutputText(openAiData);

    if (!rawText) {
      console.error("OpenAI response missing output text", { openAiData });
      return jsonResponse({ error: "Invalid analysis response." }, 500);
    }

    const parsed = safeParseScanResult(rawText);
    if (!parsed) {
      console.error("Could not parse OpenAI JSON", { rawText });
      return jsonResponse({ error: "Invalid analysis format." }, 500);
    }

    return jsonResponse(parsed, 200);
  } catch (error) {
    console.error("scan-card function failed", error);
    return jsonResponse({ error: "Internal server error." }, 500);
  }
});

function extractOutputText(data: any): string {
  return (
    data?.output_text ||
    data?.output?.[0]?.content?.[0]?.text ||
    data?.output?.flatMap((entry: any) => entry?.content || [])?.find((item: any) => item?.type === "output_text")
      ?.text ||
    ""
  );
}

function safeParseScanResult(rawText: string): ScanResult | null {
  const candidates = [rawText, extractJsonObject(rawText)].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return normalizeScanResult(parsed);
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function extractJsonObject(text: string): string {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return "";
  return text.slice(first, last + 1);
}

function normalizeScanResult(value: any): ScanResult | null {
  if (!value || typeof value !== "object") return null;

  const verdictRaw = String(value.verdict ?? "").toUpperCase();
  const verdict = verdictRaw === "GOOD BUY" ? "BUY" : verdictRaw;

  if (!["BUY", "FAIR", "PASS"].includes(verdict)) return null;

  const result: ScanResult = {
    player: String(value.player ?? "").trim(),
    year: String(value.year ?? "").trim(),
    set: String(value.set ?? "").trim(),
    variation: String(value.variation ?? "").trim(),
    condition: Number(value.condition),
    estimatedMarketValue: Number(value.estimatedMarketValue),
    gradedUpside: Number(value.gradedUpside),
    snipeScore: Number(value.snipeScore),
    verdict: verdict as ScanResult["verdict"],
    reasoning: String(value.reasoning ?? "").trim(),
  };

  if (
    !result.player ||
    !result.year ||
    !result.set ||
    !result.variation ||
    !Number.isFinite(result.condition) ||
    !Number.isFinite(result.estimatedMarketValue) ||
    !Number.isFinite(result.gradedUpside) ||
    !Number.isFinite(result.snipeScore) ||
    !result.reasoning
  ) {
    return null;
  }

  result.condition = Math.max(1, Math.min(10, Math.round(result.condition)));
  result.snipeScore = Math.max(1, Math.min(100, Math.round(result.snipeScore)));

  return result;
}

function jsonResponse(payload: Record<string, unknown> | ScanResult, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
