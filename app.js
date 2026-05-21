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

const SUPABASE_PROJECT_URL = (window.SUPABASE_PROJECT_URL || "").replace(/\/$/, "");
const SUPABASE_FUNCTION_URL = window.SUPABASE_FUNCTION_URL || (SUPABASE_PROJECT_URL ? `${SUPABASE_PROJECT_URL}/functions/v1/scan-card` : "");
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "";

async function analyzeCardWithOpenAI(base64Image, askingPrice) {
  if (!SUPABASE_FUNCTION_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase config. Set window.SUPABASE_PROJECT_URL (or window.SUPABASE_FUNCTION_URL) and window.SUPABASE_ANON_KEY.");
  }

  const response = await fetch(SUPABASE_FUNCTION_URL, {
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
  // MVP placeholder: wire this to eBay Browse API sold-listing endpoint via backend.
  const base = aiCard.estimatedMarketValue || 120;
  return {
    averageComp: base,
    highComp: Math.round(base * 1.18),
    lowComp: Math.round(base * 0.82),
  };
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
  psaUpsideValue.textContent = `$${Math.max(0, (aiCard.gradedUpside || comps.highComp) - askingPrice).toFixed(2)}`;

  reasoning.textContent = aiCard.reasoning || "Comp spread and card attributes suggest a neutral buy zone.";
}
