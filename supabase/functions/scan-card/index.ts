const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScanRequest = {
  image?: string;
  askingPrice?: number;
};

type BaseAnalysis = {
  player: string;
  year: string;
  set: string;
  variation: string;
  condition: number;
  estimatedMarketValue: number;
  gradedUpside: number;
  reasoning: string;
  cardNumber: string;
  parallel: string;
  predictedPsaGrade: string;
  psa9Value: number;
  psa10Value: number;
  gradingRecommendation: string;
  coinScore: number;
  centeringLeftRight: string;
  centeringTopBottom: string;
  cornerWear: string;
  surfaceScratches: string;
};

type ScanResult = BaseAnalysis & {
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

    const prompt = `You are a sports card analysis engine.

You MUST respond ONLY with valid raw JSON.

Do not include markdown.
Do not include explanation text outside JSON.
Do not wrap JSON in backticks.

Return ONLY this exact structure:

{
  "player": "string",
  "year": "string",
  "set": "string",
  "variation": "string",
  "condition": number,
  "estimatedMarketValue": number,
  "gradedUpside": number,
  "reasoning": "string",
  "cardNumber": "string",
  "parallel": "string",
  "predictedPsaGrade": "string",
  "psa9Value": number,
  "psa10Value": number,
  "gradingRecommendation": "string",
  "coinScore": number,
  "centeringLeftRight": "string",
  "centeringTopBottom": "string",
  "cornerWear": "string",
  "surfaceScratches": "string"
}

Context: the user paid ${askingPrice} USD for this card. Use that as a pricing reference while estimating value and upside.
Card number and parallel are critical for comp matching. If unclear, return empty string for cardNumber/parallel.
predictedPsaGrade should be like "PSA 8", "PSA 9", "PSA 10", or "Unknown".`;

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
      return jsonResponse(buildFallbackResult(askingPrice), 200);
    }

    console.log("RAW OPENAI RESPONSE:", rawText);

    const parsed = safeParseScanResult(rawText, askingPrice);
    if (!parsed) {
      console.error("Could not parse OpenAI JSON", { rawText });
      return jsonResponse(buildFallbackResult(askingPrice), 200);
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

function safeParseScanResult(rawText: string, askingPrice: number): ScanResult | null {
  const candidates = buildJsonCandidates(rawText);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return normalizeScanResult(parsed, askingPrice);
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function buildJsonCandidates(rawText: string): string[] {
  const stripped = stripCodeFences(rawText).trim();
  const extracted = extractFirstJsonObject(stripped);

  const candidates = [rawText.trim(), stripped, extracted].filter(Boolean) as string[];
  return [...new Set(candidates)];
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function normalizeScanResult(value: any, askingPrice: number): ScanResult | null {
  if (!value || typeof value !== "object") return null;

  const normalized: BaseAnalysis = {
    player: String(value.player ?? "Unknown Card").trim() || "Unknown Card",
    year: String(value.year ?? "Unknown").trim() || "Unknown",
    set: String(value.set ?? "Unknown").trim() || "Unknown",
    variation: String(value.variation ?? "Unknown").trim() || "Unknown",
    condition: clampCondition(Number(value.condition)),
    estimatedMarketValue: toNumber(value.estimatedMarketValue, 0),
    gradedUpside: toNumber(value.gradedUpside, 0),
    reasoning:
      String(value.reasoning ?? "").trim() || "AI could not confidently analyze this card image.",
    cardNumber: String(value.cardNumber ?? "").trim(),
    parallel: String(value.parallel ?? "").trim(),
    predictedPsaGrade: String(value.predictedPsaGrade ?? "Unknown").trim() || "Unknown",
    psa9Value: toNumber(value.psa9Value, 0),
    psa10Value: toNumber(value.psa10Value, 0),
    gradingRecommendation: String(value.gradingRecommendation ?? "").trim() || "Not enough surface detail to confidently recommend grading.",
    coinScore: clampScore(toNumber(value.coinScore, 50)),
    centeringLeftRight: String(value.centeringLeftRight ?? "Unknown").trim() || "Unknown",
    centeringTopBottom: String(value.centeringTopBottom ?? "Unknown").trim() || "Unknown",
    cornerWear: String(value.cornerWear ?? "Unknown").trim() || "Unknown",
    surfaceScratches: String(value.surfaceScratches ?? "Unknown").trim() || "Unknown",
  };

  const scoreFromModel = toNumber(value.snipeScore, Number.NaN);
  const snipeScore = Number.isFinite(scoreFromModel)
    ? clampScore(scoreFromModel)
    : deriveSnipeScore(normalized, askingPrice);

  const verdict = deriveVerdict(normalized.estimatedMarketValue, askingPrice);

  return {
    ...normalized,
    snipeScore,
    verdict,
  };
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampCondition(condition: number): number {
  if (!Number.isFinite(condition)) return 5;
  return Math.max(1, Math.min(10, Math.round(condition)));
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(100, Math.round(score)));
}

function deriveSnipeScore(result: BaseAnalysis, askingPrice: number): number {
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) return 50;
  const marginRatio = (result.estimatedMarketValue - askingPrice) / askingPrice;
  const upsideBonus = result.gradedUpside > result.estimatedMarketValue ? 8 : 0;
  const conditionBonus = (result.condition - 5) * 2;
  return clampScore(50 + marginRatio * 40 + upsideBonus + conditionBonus);
}

function deriveVerdict(estimatedMarketValue: number, askingPrice: number): ScanResult["verdict"] {
  if (!Number.isFinite(askingPrice) || askingPrice <= 0) return "FAIR";
  const ratio = estimatedMarketValue / askingPrice;
  if (ratio >= 1.2) return "BUY";
  if (ratio >= 0.9) return "FAIR";
  return "PASS";
}

function buildFallbackResult(askingPrice: number): ScanResult {
  const fallbackBase: BaseAnalysis = {
    player: "Unknown Card",
    year: "Unknown",
    set: "Unknown",
    variation: "Unknown",
    condition: 5,
    estimatedMarketValue: 0,
    gradedUpside: 0,
    reasoning: "AI could not confidently analyze this card image.",
    cardNumber: "",
    parallel: "",
    predictedPsaGrade: "Unknown",
    psa9Value: 0,
    psa10Value: 0,
    gradingRecommendation: "Not enough detail to recommend grading.",
    coinScore: 50,
    centeringLeftRight: "Unknown",
    centeringTopBottom: "Unknown",
    cornerWear: "Unknown",
    surfaceScratches: "Unknown",
  };

  return {
    ...fallbackBase,
    snipeScore: deriveSnipeScore(fallbackBase, askingPrice),
    verdict: deriveVerdict(fallbackBase.estimatedMarketValue, askingPrice),
  };
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
