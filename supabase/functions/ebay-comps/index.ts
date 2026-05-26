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
  lowestComp: number;
  highestComp: number;
  recentSales: number[];
  listings: EbayListing[];
  compCount: number;
};

const BLOCKED_KEYWORDS = ["pack", "packs", "lot", "lots", "reprint", "custom", "digital", "epack", "e-pack"];

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

    const token = await getAppToken();
    console.log("eBay token generated");

    const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", "30");
    console.log("Search query:", query);
    console.log("eBay request URL:", searchUrl.toString());

    const ebayResp = await fetch(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    console.log("eBay response status:", ebayResp.status);

    if (!ebayResp.ok) {
      const errText = await ebayResp.text();
      console.error("Browse API failed", ebayResp.status, errText);
      return jsonResponse({ error: "Failed to fetch eBay comps." }, 502);
    }

    const ebayData = await ebayResp.json();
    console.log("eBay raw data:", JSON.stringify(ebayData));
    const itemSummaries = Array.isArray(ebayData?.itemSummaries) ? ebayData.itemSummaries : [];
    console.log("Items found:", itemSummaries.length);
    const cleanListings = itemSummaries
      .map((item: any) => {
        const title = String(item?.title ?? "").trim();
        const price = Number(item?.price?.value);
        const image = String(item?.image?.imageUrl ?? "");
        const url = String(item?.itemWebUrl ?? "");

        return { title, price, image, url };
      })
      .filter((item: EbayListing) => item.title && Number.isFinite(item.price) && item.price > 0 && item.url)
      .filter((item: EbayListing) => !hasBlockedKeyword(item.title));

    const prices = cleanListings.map((item: EbayListing) => item.price);
    const response: EbayCompResponse = {
      averageComp: average(prices),
      lowestComp: prices.length ? Math.min(...prices) : 0,
      highestComp: prices.length ? Math.max(...prices) : 0,
      recentSales: prices.slice(0, 10),
      listings: cleanListings.slice(0, 8),
      compCount: prices.length,
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

async function getAppToken(): Promise<string> {
  const EBAY_APP_ID = Deno.env.get("App ID");
  const EBAY_DEV_ID = Deno.env.get("Dev ID");
  const EBAY_CERT_ID = Deno.env.get("Cert ID");

  console.log("EBAY_APP_ID exists:", !!EBAY_APP_ID);
  console.log("EBAY_DEV_ID exists:", !!EBAY_DEV_ID);
  console.log("EBAY_CERT_ID exists:", !!EBAY_CERT_ID);

  if (!EBAY_APP_ID || !EBAY_DEV_ID || !EBAY_CERT_ID) {
    throw new Error("Missing eBay secrets from Supabase environment variables");
  }

  const basicToken = btoa(`${EBAY_APP_ID}:${EBAY_CERT_ID}`);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  const tokenResp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    console.error("OAuth token request failed", tokenResp.status, errText);
    throw new Error("Failed to generate eBay app token");
  }

  const tokenData = await tokenResp.json();
  const token = String(tokenData?.access_token ?? "");
  if (!token) {
    throw new Error("Missing access_token in OAuth response");
  }

  return token;
}

function hasBlockedKeyword(title: string): boolean {
  const lower = title.toLowerCase();
  return BLOCKED_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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
