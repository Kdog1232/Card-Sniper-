const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CompRequest = {
  player?: string;
  year?: string;
  set?: string;
  variation?: string;
};

type EbayListing = {
  title: string;
  price: number;
  image: string;
  url: string;
};

type EbayCompResponse = {
  averageComp: number;
  medianComp: number;
  lowestComp: number;
  highestComp: number;
  recentSales: number[];
  listings: EbayListing[];
  compCount: number;
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
];

console.log("Using eBay PRODUCTION environment");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as CompRequest;
    const query = [body.player, body.year, body.set, body.variation].map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");

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
    searchUrl.searchParams.set("keywords", query);
    searchUrl.searchParams.set("paginationInput.entriesPerPage", "50");
    searchUrl.searchParams.set("itemFilter(0).name", "SoldItemsOnly");
    searchUrl.searchParams.set("itemFilter(0).value", "true");
    searchUrl.searchParams.set("sortOrder", "EndTimeSoonest");

    console.log("Using SOLD listings endpoint");
    console.log("Search query:", query);

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
    const scannedCardLooksGraded = looksGraded(query);

    const soldListings = (Array.isArray(items) ? items : [])
      .map((item: any) => {
        const title = String(item?.title?.[0] ?? "").trim();
        const price = Number(item?.sellingStatus?.[0]?.currentPrice?.[0]?.__value__);
        const image = String(item?.galleryURL?.[0] ?? "");
        const url = String(item?.viewItemURL?.[0] ?? "");
        const sold = String(item?.sellingStatus?.[0]?.sellingState?.[0] ?? "") === "EndedWithSales";

        return { title, price, image, url, sold };
      })
      .filter((item: any) => item.sold)
      .filter((item: any) => item.title && Number.isFinite(item.price) && item.price > 0 && item.url)
      .filter((item: any) => !hasBlockedKeyword(item.title) && !hasSpamKeyword(item.title));
    console.log("Sold comps found:", soldListings.length);

    const filteredByCondition = soldListings
      .filter((item: any) => scannedCardLooksGraded || !looksGraded(item.title));
    console.log("Filtered comps removed:", soldListings.length - filteredByCondition.length);

    const scoredListings = filteredByCondition
      .map((item: EbayListing, index: number) => ({
        ...item,
        score: compRelevanceScore(item.title, query, scannedCardLooksGraded, index),
      }))
      .sort((a, b) => b.score - a.score);

    const sortedListings = scoredListings.map(({ score: _score, sold: _sold, ...listing }) => listing);
    const rawPrices = sortedListings.map((item: EbayListing) => item.price);
    const prices = excludeOutlierPrices(rawPrices);

    const recentSales = prices.slice(0, 10);
    const averageComp = average(prices);
    const medianComp = median(prices);
    const lowestComp = prices.length ? Math.min(...prices) : 0;
    const highestComp = prices.length ? Math.max(...prices) : 0;
    console.log("Final median price used:", medianComp);

    const response: EbayCompResponse = {
      averageComp,
      medianComp,
      lowestComp,
      highestComp,
      recentSales,
      listings: sortedListings.slice(0, 8),
      compCount: prices.length,
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

function compRelevanceScore(title: string, query: string, scannedCardLooksGraded: boolean, index: number): number {
  const lowerTitle = title.toLowerCase();
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const tokenMatches = queryTokens.filter((token) => lowerTitle.includes(token)).length;

  let score = tokenMatches * 10;

  const listingLooksGraded = looksGraded(title);
  if (scannedCardLooksGraded === listingLooksGraded) score += 25;
  else score -= 50;

  if (!scannedCardLooksGraded && (lowerTitle.includes("raw") || lowerTitle.includes("ungraded"))) score += 15;
  if (scannedCardLooksGraded && lowerTitle.includes("graded")) score += 15;

  score += Math.max(0, 12 - index);
  return score;
}

function excludeOutlierPrices(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowFence = q1 - 1.5 * iqr;
  const highFence = q3 + 1.5 * iqr;

  const filtered = values.filter((value) => value >= lowFence && value <= highFence);
  return filtered.length ? filtered : values;
}

function quantile(sortedValues: number[], q: number): number {
  if (!sortedValues.length) return 0;
  const pos = (sortedValues.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedValues[base + 1] !== undefined) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
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
