const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CompRequest = {
  player?: string;
  year?: string;
  set?: string;
  variation?: string;
  cardNumber?: string;
  isGraded?: boolean;
  gradingCompany?: string;
  grade?: string;
};

type EbayListing = {
  title: string;
  price: number;
  image: string;
  url: string;
  soldAt?: string;
};

type EbayCompResponse = {
  averageComp: number;
  medianComp: number;
  lowestComp: number;
  highestComp: number;
  recentSales: number[];
  listings: EbayListing[];
  compCount: number;
  confidence: "low" | "medium" | "high";
  soldOnly: true;
};

const BLOCKED_KEYWORDS = ["pack", "packs", "lot", "lots", "reprint", "custom", "digital", "epack", "e-pack", "mystery pack", "fake"];
const SPAM_KEYWORDS = ["gem mint", "investment", "🔥", "hot", "rare!!", "1/1", "one of one"];
const GRADED_KEYWORDS = [
  "psa",
  "bgs",
  "sgc",
  "cgc",
  "hga",
  "beckett",
  "gem mint",
  "mint 9",
  "mint 10",
  "pristine",
  "slab",
  "graded",
  "authentic",
  "gem",
  "black label",
  "auto 10",
];
const RAW_EXCLUDE_KEYWORDS = ["psa", "bgs", "sgc", "cgc", "gem", "mint 9", "mint 10", "auto 10", "pristine", "black label"];

console.log("Using eBay PRODUCTION environment");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as CompRequest;
    const normalized = buildNormalizedSearchTerms(body);
    const query = normalized.primary;

    if (!query) {
      return jsonResponse({ error: "Missing card metadata for comp search." }, 400);
    }

    const appId = getAppId();
    const searchUrl = new URL("https://svcs.ebay.com/services/search/FindingService/v1");
    searchUrl.searchParams.set("OPERATION-NAME", "findCompletedItems");
    searchUrl.searchParams.set("SERVICE-VERSION", "1.13.0");
    searchUrl.searchParams.set("SECURITY-APPNAME", appId);
    searchUrl.searchParams.set("RESPONSE-DATA-FORMAT", "JSON");
    searchUrl.searchParams.set("REST-PAYLOAD", "");
    searchUrl.searchParams.set("keywords", normalized.searchKeywords);
    searchUrl.searchParams.set("paginationInput.entriesPerPage", "50");
    searchUrl.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
    searchUrl.searchParams.set("itemFilter(0).value", "true");
    searchUrl.searchParams.set("sortOrder", "EndTimeSoonest");

    console.log("Using SOLD listings endpoint");
    console.log("Search query:", normalized.searchKeywords);

    const ebayResp = await fetch(searchUrl.toString());
    console.log("eBay response status:", ebayResp.status);

    if (!ebayResp.ok) {
      const errText = await ebayResp.text();
      console.error("Completed items API failed", ebayResp.status, errText);
      return jsonResponse({ error: "Failed to fetch eBay comps." }, 502);
    }

    const ebayData = await ebayResp.json();
    const items = ebayData?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item ?? [];
    console.log("Sold items returned:", Array.isArray(items) ? items.length : 0);
    const detectedGrading = detectGradingProfile(body, query);

    const soldListings = (Array.isArray(items) ? items : [])
      .map((item: any) => {
        const title = String(item?.title?.[0] ?? "").trim();
        const price = Number(item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__);
        const image = String(item?.galleryURL?.[0] ?? "");
        const url = String(item?.viewItemURL?.[0] ?? "");
        const soldAt = String(item?.listingInfo?.[0]?.endTime?.[0] ?? "");
        const sold = String(item?.sellingStatus?.[0]?.sellingState?.[0] ?? "") === "EndedWithSales";

        return { title, price, image, url, soldAt, sold };
      })
      .filter((item: any) => item.sold)
      .filter((item: any) => item.title && Number.isFinite(item.price) && item.price > 0 && item.url)
      .filter((item: any) => !hasBlockedKeyword(item.title) && !hasSpamKeyword(item.title));
    console.log("Sold comps found:", soldListings.length);

    const { filtered, rawCount, gradedRemoved } = filterByConditionAndGrade(soldListings, detectedGrading);
    console.log("Raw comps kept:", rawCount);
    console.log("Graded comps removed:", gradedRemoved);

    const scoredListings = filtered
      .map((item: EbayListing, index: number) => ({
        ...item,
        score: compRelevanceScore(item, normalized, detectedGrading, index),
      }))
      .sort((a, b) => b.score - a.score);

    const sortedListings = scoredListings.map(({ score: _score, sold: _sold, ...listing }) => listing).slice(0, 50);
    const rawPrices = sortedListings.map((item: EbayListing) => item.price);
    const prices = excludeOutlierPrices(rawPrices);

    const recentSales = prices.slice(0, 10);
    const averageComp = average(prices);
    const medianComp = median(prices);
    const lowestComp = prices.length ? Math.min(...prices) : 0;
    const highestComp = prices.length ? Math.max(...prices) : 0;
    console.log("Median sold price:", medianComp);

    const response: EbayCompResponse = {
      averageComp,
      medianComp,
      lowestComp,
      highestComp,
      recentSales,
      listings: sortedListings.slice(0, 8),
      compCount: prices.length,
      confidence: prices.length < 3 ? "low" : prices.length < 8 ? "medium" : "high",
      soldOnly: true,
    };

    return jsonResponse(response, 200);
  } catch (error) {
    console.error("ebay-comps failed", error);
    if (error instanceof Error && error.message === "Missing eBay secrets from Supabase environment variables") {
      return jsonResponse({ error: error.message }, 500);
    }
    return jsonResponse({ error: "Internal server error." }, 500);
  }
});

function getAppId(): string {
  const EBAY_APP_ID = Deno.env.get("App ID");
  const EBAY_DEV_ID = Deno.env.get("Dev ID");
  const EBAY_CERT_ID = Deno.env.get("Cert ID");

  console.log("EBAY_APP_ID exists:", !!EBAY_APP_ID);
  console.log("EBAY_DEV_ID exists:", !!EBAY_DEV_ID);
  console.log("EBAY_CERT_ID exists:", !!EBAY_CERT_ID);

  if (!EBAY_APP_ID || !EBAY_DEV_ID || !EBAY_CERT_ID) {
    throw new Error("Missing eBay secrets from Supabase environment variables");
  }

  return EBAY_APP_ID;
}

function hasBlockedKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return BLOCKED_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function hasSpamKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return SPAM_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function looksGraded(text: string): boolean {
  const lower = text.toLowerCase();
  if (GRADED_KEYWORDS.some((keyword) => lower.includes(keyword))) return true;
  return /\b(psa|bgs|sgc|cgc|hga)\s?\d{1,2}(\.5)?\b/i.test(text);
}

function compRelevanceScore(
  listing: EbayListing,
  normalized: ReturnType<typeof buildNormalizedSearchTerms>,
  grading: ReturnType<typeof detectGradingProfile>,
  index: number,
): number {
  const title = listing.title;
  const lowerTitle = title.toLowerCase();
  const queryTokens = normalized.tokens;
  const tokenMatches = queryTokens.filter((token) => lowerTitle.includes(token)).length;

  let score = tokenMatches * 10;

  const listingLooksGraded = looksGraded(title);
  if (grading.isGraded === listingLooksGraded) score += 25;
  else score -= 50;

  if (!grading.isGraded && (lowerTitle.includes("raw") || lowerTitle.includes("ungraded"))) score += 15;
  if (grading.isGraded && lowerTitle.includes("graded")) score += 15;
  if (grading.cardNumber && lowerTitle.includes(`#${grading.cardNumber.toLowerCase()}`)) score += 20;
  if (grading.year && lowerTitle.includes(grading.year.toLowerCase())) score += 10;
  if (grading.player && lowerTitle.includes(grading.player.toLowerCase())) score += 15;
  if (grading.set && lowerTitle.includes(grading.set.toLowerCase())) score += 15;
  if (grading.isGraded && grading.company && lowerTitle.includes(grading.company.toLowerCase())) score += 20;
  if (grading.isGraded && grading.grade && lowerTitle.includes(grading.grade.toLowerCase())) score += 12;
  if (lowerTitle.includes(" rc ") || lowerTitle.includes(" rookie")) score += 5;
  if (listing.image) score += 8;
  if (listing.soldAt) {
    const soldTime = new Date(listing.soldAt).getTime();
    const ageDays = Number.isFinite(soldTime) ? (Date.now() - soldTime) / (1000 * 60 * 60 * 24) : 365;
    score += Math.max(0, 20 - ageDays / 4);
  }

  score += Math.max(0, 12 - index);
  return score;
}

function excludeOutlierPrices(values: number[]): number[] {
  if (values.length < 3) return values;
  const med = median(values);
  const lowFence = med * 0.4;
  const highFence = med * 2.5;
  const filtered = values.filter((value) => value >= lowFence && value <= highFence);
  return filtered.length ? filtered : values;
}

function buildNormalizedSearchTerms(body: CompRequest) {
  const player = String(body.player ?? "").trim();
  const year = String(body.year ?? "").trim();
  const set = String(body.set ?? "").trim();
  const variation = String(body.variation ?? "").trim();
  const cardNumber = extractCardNumber(variation);
  const rookieHint = /\b(rookie|rc|draft pick)\b/i.test(`${set} ${variation}`) ? "rookie rc" : "";

  const primary = [player, year, set, variation].filter(Boolean).join(" ");
  const variationWithoutNoise = variation.replace(/draft pick/gi, "").trim();
  const v1 = [player, set, rookieHint].filter(Boolean).join(" ");
  const v2 = [year, set, player, cardNumber ? `#${cardNumber}` : ""].filter(Boolean).join(" ");
  const v3 = [player, "RC", set].filter(Boolean).join(" ");
  const searchKeywords = [primary, v1, v2, v3, variationWithoutNoise].filter(Boolean).join(" OR ");
  const tokens = [player, year, set, variationWithoutNoise, cardNumber ? `#${cardNumber}` : ""]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter((token) => token.length > 1);

  return { primary, searchKeywords, tokens };
}

function detectGradingProfile(body: CompRequest, query: string) {
  const source = [query, body.gradingCompany, body.grade].filter(Boolean).join(" ");
  const companyMatch = source.match(/\b(psa|bgs|sgc|cgc|hga|beckett)\b/i);
  const gradeMatch = source.match(/\b(10|9(?:\.5)?|8(?:\.5)?|7(?:\.5)?|gem mint 10|mint 9|pristine 10|black label)\b/i);
  return {
    isGraded: typeof body.isGraded === "boolean" ? body.isGraded : looksGraded(source),
    company: companyMatch?.[1]?.toUpperCase() ?? "",
    grade: gradeMatch?.[1] ?? "",
    player: String(body.player ?? "").trim(),
    year: String(body.year ?? "").trim(),
    set: String(body.set ?? "").trim(),
    cardNumber: extractCardNumber(String(body.variation ?? "")),
  };
}

function filterByConditionAndGrade(listings: any[], grading: ReturnType<typeof detectGradingProfile>) {
  let rawCount = 0;
  let gradedRemoved = 0;
  const filtered = listings.filter((item) => {
    const title = String(item.title ?? "");
    const lower = title.toLowerCase();
    if (!grading.isGraded) {
      const blocked = RAW_EXCLUDE_KEYWORDS.some((keyword) => lower.includes(keyword));
      if (blocked || looksGraded(title)) {
        gradedRemoved += 1;
        return false;
      }
      rawCount += 1;
      return true;
    }
    if (!looksGraded(title)) return false;
    if (grading.company && !lower.includes(grading.company.toLowerCase())) return false;
    if (grading.grade && !lower.includes(grading.grade.toLowerCase())) return false;
    return true;
  });
  return { filtered, rawCount, gradedRemoved };
}

function extractCardNumber(text: string): string {
  const match = text.match(/#?\s?([a-z]?\d{1,4})\b/i);
  return match?.[1] ?? "";
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
