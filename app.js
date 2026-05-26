const fileInput = document.getElementById("cardImage");
const previewImage = document.getElementById("previewImage");
const uploadText = document.getElementById("uploadText");
const askingInput = document.getElementById("askingPrice");
const scanBtn = document.getElementById("scanBtn");
const resultPanel = document.getElementById("resultPanel");

const verdictBadge = document.getElementById("verdictBadge");
const snipeScore = document.getElementById("snipeScore");
const cardTitle = document.getElementById("cardTitle");
const cardMeta = document.getElementById("cardMeta");
const estimatedValue = document.getElementById("estimatedValue");
const askingValue = document.getElementById("askingValue");
const upsideValue = document.getElementById("upsideValue");
const psaUpsideValue = document.getElementById("psaUpsideValue");
const reasoning = document.getElementById("reasoning");
const compSummary = document.getElementById("compSummary");
const recentSales = document.getElementById("recentSales");
const compListings = document.getElementById("compListings");

let imageDataUrl = "";

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    imageDataUrl = reader.result;
    previewImage.src = imageDataUrl;
    previewImage.classList.remove("hidden");
    uploadText.classList.add("hidden");
  };
  reader.readAsDataURL(file);
});

scanBtn.addEventListener("click", async () => {
  const askingPrice = Number(askingInput.value);
  if (!imageDataUrl || !askingPrice || askingPrice <= 0) {
    alert("Upload an image and enter a valid asking price.");
    return;
  }

  scanBtn.disabled = true;
  scanBtn.textContent = "Scanning...";

  try {
    const aiCard = await analyzeCardWithOpenAI(imageDataUrl, askingPrice);
    const comps = await fetchEbayComps(aiCard);
    const verdict = scoreDeal(askingPrice, comps.averageComp);
    renderResult({ aiCard, comps, verdict, askingPrice });
  } catch (err) {
    console.error(err);
    alert(`Scan failed: ${err.message}`);
  } finally {
    scanBtn.disabled = false;
    scanBtn.textContent = "Scan Card";
  }
});

const SCAN_FUNCTION_URL = (window.SUPABASE_FUNCTION_URL || "").replace(/\/$/, "");
const EBAY_COMPS_FUNCTION_URL = (window.EBAY_COMPS_FUNCTION_URL || "").replace(/\/$/, "");
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

async function analyzeCardWithOpenAI(base64Image, askingPrice) {
  if (!SCAN_FUNCTION_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase config. Set window.SUPABASE_FUNCTION_URL and window.SUPABASE_ANON_KEY.");
  }

  const response = await fetch(SCAN_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      image: base64Image,
      askingPrice,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`scan-card failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  return data;
}

async function fetchEbayComps(aiCard) {
  const fallbackBase = Number(aiCard.estimatedMarketValue || 0);
  const fallback = {
    averageComp: fallbackBase,
    lowestComp: fallbackBase * 0.82,
    highestComp: fallbackBase * 1.18,
    recentSales: fallbackBase ? [fallbackBase] : [],
    listings: [],
    compCount: fallbackBase ? 1 : 0,
    confidence: "low",
    usedFallback: true,
  };

  if (!EBAY_COMPS_FUNCTION_URL || !SUPABASE_ANON_KEY) return fallback;

  try {
    const response = await fetch(EBAY_COMPS_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        player: aiCard.player,
        year: aiCard.year,
        set: aiCard.set,
        variation: aiCard.variation,
      }),
    });

    if (!response.ok) throw new Error(`ebay-comps failed: ${response.status}`);

    const data = await response.json();
    return {
      averageComp: Number(data.averageComp || 0),
      lowestComp: Number(data.lowestComp || 0),
      highestComp: Number(data.highestComp || 0),
      recentSales: Array.isArray(data.recentSales) ? data.recentSales.map(Number).filter(Number.isFinite) : [],
      listings: Array.isArray(data.listings) ? data.listings : [],
      compCount: Number(data.compCount || 0),
      confidence: String(data.confidence || "medium"),
      usedFallback: false,
    };
  } catch (error) {
    console.warn("eBay comps fallback triggered", error);
    return fallback;
  }
}

function scoreDeal(asking, marketValue) {
  const ratio = asking / marketValue;
  let label = "FAIR";
  let score = 62;

  if (ratio <= 0.75) {
    label = "BUY";
    score = Math.min(100, Math.round((1 - ratio) * 140 + 70));
  } else if (ratio > 1.05) {
    label = "PASS";
    score = Math.max(1, Math.round(60 - (ratio - 1) * 110));
  } else {
    score = Math.max(40, Math.round(80 - Math.abs(1 - ratio) * 120));
  }

  return { label, score };
}

function renderResult({ aiCard, comps, verdict, askingPrice }) {
  resultPanel.classList.remove("hidden");

  cardTitle.textContent = `${aiCard.player} ${aiCard.year} ${aiCard.set}`;
  cardMeta.textContent = `${aiCard.player} • ${aiCard.year} • ${aiCard.set} • ${aiCard.variation} • Condition ${aiCard.condition}/10`;

  snipeScore.classList.remove("pop");
  void snipeScore.offsetWidth;
  snipeScore.classList.add("pop");

  snipeScore.textContent = verdict.score;
  verdictBadge.textContent = verdict.label;
  verdictBadge.className = "badge";
  verdictBadge.classList.add(verdict.label.toLowerCase());

  estimatedValue.textContent = `$${comps.averageComp.toFixed(2)}`;
  askingValue.textContent = `$${askingPrice.toFixed(2)}`;
  upsideValue.textContent = `$${(comps.averageComp - askingPrice).toFixed(2)}`;
  psaUpsideValue.textContent = `$${Math.max(0, (aiCard.gradedUpside || comps.highestComp) - askingPrice).toFixed(2)}`;

  reasoning.textContent = aiCard.reasoning || "Comp spread and card attributes suggest a neutral buy zone.";

  const salesText = comps.recentSales.length
    ? comps.recentSales.map((sale) => `$${sale.toFixed(2)}`).join(" • ")
    : "No recent sold prices returned.";
  recentSales.textContent = salesText;

  compSummary.textContent = comps.compCount
    ? `Based on ${comps.compCount} REAL sold eBay comps`
    : "No reliable comps returned. Showing AI estimate fallback.";

  compListings.innerHTML = "";
  comps.listings.forEach((listing) => {
    const item = document.createElement("a");
    item.className = "comp-item";
    item.href = listing.url;
    item.target = "_blank";
    item.rel = "noopener noreferrer";
    item.innerHTML = `
      <img src="${listing.image || ""}" alt="${listing.title}" loading="lazy" />
      <div>
        <p class="comp-title">${listing.title}</p>
        <p class="comp-price">$${Number(listing.price).toFixed(2)}</p>
      </div>
    `;
    compListings.appendChild(item);
  });

}
