const fileInput = document.getElementById("cardImage");
const previewImage = document.getElementById("previewImage");
const uploadText = document.getElementById("uploadText");
const askingInput = document.getElementById("askingPrice");
const scanBtn = document.getElementById("scanBtn");
const resultPanel = document.getElementById("resultPanel");
const openDeepBtn = document.getElementById("openDeepBtn");
const deepPanel = document.getElementById("deepPanel");
const deepAnalyzeBtn = document.getElementById("deepAnalyzeBtn");
const frontHdImageInput = document.getElementById("frontHdImage");
const backHdImageInput = document.getElementById("backHdImage");
const angleImageInput = document.getElementById("angleImage");
const deepResult = document.getElementById("deepResult");

const verdictBadge = document.getElementById("verdictBadge");
const snipeScore = document.getElementById("snipeScore");
const cardTitle = document.getElementById("cardTitle");
const cardMeta = document.getElementById("cardMeta");
const estimatedValue = document.getElementById("estimatedValue");
const askingValue = document.getElementById("askingValue");
const upsideValue = document.getElementById("upsideValue");
const psaUpsideValue = document.getElementById("psaUpsideValue");
const predictedPsaGrade = document.getElementById("predictedPsaGrade");
const coinScore = document.getElementById("coinScore");
const gemProbability = document.getElementById("gemProbability");
const psa9Value = document.getElementById("psa9Value");
const psa10Value = document.getElementById("psa10Value");
const goodBuyUnder = document.getElementById("goodBuyUnder");
const strongBuyUnder = document.getElementById("strongBuyUnder");
const avoidAbove = document.getElementById("avoidAbove");
const reasoning = document.getElementById("reasoning");
const compSummary = document.getElementById("compSummary");
const recentSales = document.getElementById("recentSales");
const marketMeta = document.getElementById("marketMeta");
const transparencyMeta = document.getElementById("transparencyMeta");
const gradingRecommendation = document.getElementById("gradingRecommendation");
const visualCondition = document.getElementById("visualCondition");
const compListings = document.getElementById("compListings");
const totalCollectionValue = document.getElementById("totalCollectionValue");
const totalPsaUpside = document.getElementById("totalPsaUpside");
const totalProfitLoss = document.getElementById("totalProfitLoss");
const biggestFlip = document.getElementById("biggestFlip");
const recentlyScanned = document.getElementById("recentlyScanned");
const marketMovers = document.getElementById("marketMovers");

let imageDataUrl = "";
const HISTORY_KEY = "card_sniper_scan_history_v1";
const COMP_CACHE_KEY = "card_sniper_comp_cache_v1";

renderDashboard();

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

openDeepBtn?.addEventListener("click", () => deepPanel.classList.toggle("hidden"));

deepAnalyzeBtn?.addEventListener("click", async () => {
  const front = frontHdImageInput?.files?.[0];
  const back = backHdImageInput?.files?.[0];
  if (!front || !back) {
    alert("Upload front and back HD photos for deep grade analysis.");
    return;
  }

  deepAnalyzeBtn.disabled = true;
  deepAnalyzeBtn.textContent = "Analyzing...";
  try {
    const [frontBase64, backBase64, angleBase64] = await Promise.all([
      fileToDataUrl(front),
      fileToDataUrl(back),
      angleImageInput?.files?.[0] ? fileToDataUrl(angleImageInput.files[0]) : Promise.resolve("")
    ]);

    const deepData = await analyzeCardWithOpenAI(frontBase64, Number(askingInput.value || 1), {
      mode: "deep_grading",
      backImage: backBase64,
      angleImage: angleBase64 || undefined,
      compType: getCompType(),
    });

    deepResult.textContent = `Deep Analysis: Centering L/R ${deepData.centeringLeftRight || "Unknown"}, T/B ${deepData.centeringTopBottom || "Unknown"} • Corners: ${deepData.cornerWear || "Unknown"} • Edges: ${deepData.edgeWear || "Unknown"} • Surface: ${deepData.surfaceScratches || "Unknown"} • Print Lines: ${deepData.printLines || "Unknown"}`;
    gradingRecommendation.textContent = `Grading Recommendation: ${deepData.gradingRecommendation || "No recommendation returned."}`;
    visualCondition.textContent = `Visual: L/R ${deepData.centeringLeftRight || "Unknown"} • T/B ${deepData.centeringTopBottom || "Unknown"} • Corners: ${deepData.cornerWear || "Unknown"} • Surface: ${deepData.surfaceScratches || "Unknown"}`;
  } catch (err) {
    console.error(err);
    deepResult.textContent = `Deep analysis failed: ${err.message}`;
  } finally {
    deepAnalyzeBtn.disabled = false;
    deepAnalyzeBtn.textContent = "Run Deep Grade Analysis";
  }
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
    const aiCard = await analyzeCardWithOpenAI(imageDataUrl, askingPrice, { mode: "quick_scan", compType: getCompType() });
    const comps = await fetchEbayComps(aiCard, getCompType());
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

async function analyzeCardWithOpenAI(base64Image, askingPrice, extraPayload = {}) {
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
      ...extraPayload,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`scan-card failed: ${response.status} ${message}`);
  }

  const data = await response.json();
  return data;
}

async function fetchEbayComps(aiCard, compType = "raw") {
  const cacheKey = `${compType}|${aiCard.player}|${aiCard.year}|${aiCard.set}|${aiCard.variation}|${aiCard.cardNumber || ""}`.toLowerCase();
  const cached = readCompCache()[cacheKey];
  if (cached && Date.now() - cached.ts < 1000 * 60 * 60 * 6) return cached.data;

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
        cardNumber: aiCard.cardNumber,
        compType,
      }),
    });

    if (!response.ok) throw new Error(`ebay-comps failed: ${response.status}`);

    const data = await response.json();
    const payload = {
      averageComp: Number(data.averageComp || 0),
      medianComp: Number(data.medianComp || data.averageComp || 0),
      lowestComp: Number(data.lowestComp || 0),
      highestComp: Number(data.highestComp || 0),
      recentSales: Array.isArray(data.recentSales) ? data.recentSales.map(Number).filter(Number.isFinite) : [],
      listings: Array.isArray(data.listings) ? data.listings : [],
      compCount: Number(data.compCount || 0),
      confidence: String(data.confidence || "medium"),
      confidenceScore: Number(data.confidenceScore || 0),
      compQuality: String(data.compQuality || "weak"),
      trend: String(data.trend || "unknown"),
      liquidity: String(data.liquidity || "weak"),
      auctionCount: Number(data.auctionCount || 0),
      buyItNowCount: Number(data.buyItNowCount || 0),
      gradedCount: Number(data.gradedCount || 0),
      rawCount: Number(data.rawCount || 0),
      usedFallback: false,
    };
    const cache = readCompCache();
    cache[cacheKey] = { ts: Date.now(), data: payload };
    localStorage.setItem(COMP_CACHE_KEY, JSON.stringify(cache));
    return payload;
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

  estimatedValue.textContent = `$${(comps.medianComp || comps.averageComp).toFixed(2)}`;
  askingValue.textContent = `$${askingPrice.toFixed(2)}`;
  upsideValue.textContent = `$${(comps.averageComp - askingPrice).toFixed(2)}`;
  psaUpsideValue.textContent = `$${Math.max(0, (aiCard.gradedUpside || comps.highestComp) - askingPrice).toFixed(2)}`;
  predictedPsaGrade.textContent = aiCard.predictedPsaGrade || "Unknown";
  gemProbability.textContent = `${Number(aiCard.gemProbability || aiCard.psa10Probability || 0).toFixed(0)}%`;
  coinScore.textContent = String(Number(aiCard.coinScore || 50));
  psa9Value.textContent = `$${Number(aiCard.psa9Value || 0).toFixed(2)}`;
  psa10Value.textContent = `$${Number(aiCard.psa10Value || 0).toFixed(2)}`;
  const payTargets = computePayTargets(comps, aiCard);
  goodBuyUnder.textContent = `$${payTargets.goodBuyUnder.toFixed(2)}`;
  strongBuyUnder.textContent = `$${payTargets.strongBuyUnder.toFixed(2)}`;
  avoidAbove.textContent = `$${payTargets.avoidAbove.toFixed(2)}`;

  reasoning.textContent = aiCard.reasoning || "Comp spread and card attributes suggest a neutral buy zone.";

  const salesText = comps.recentSales.length
    ? comps.recentSales.map((sale) => `$${sale.toFixed(2)}`).join(" • ")
    : "No recent sold prices returned.";
  recentSales.textContent = salesText;

  compSummary.textContent = comps.compCount
    ? `Estimated Median Sold: $${(comps.medianComp || comps.averageComp).toFixed(2)} • ${comps.compCount} sold comps • Quality: ${String(comps.compQuality || "weak").toUpperCase()}`
    : "No reliable comps returned. Showing AI estimate fallback.";
  marketMeta.textContent = comps.compCount
    ? `Confidence: ${String(comps.confidence || "low").toUpperCase()} (${Number(comps.confidenceScore || 0)}/100) • Trend: ${String(comps.trend || "unknown").toUpperCase()} • Liquidity: ${String(comps.liquidity || "weak").toUpperCase()} • Raw/Graded: ${Number(comps.rawCount || 0)}/${Number(comps.gradedCount || 0)} • Auction/BIN: ${Number(comps.auctionCount || 0)}/${Number(comps.buyItNowCount || 0)}`
    : "Confidence: LOW • Trend: UNKNOWN • Liquidity: WEAK";
  gradingRecommendation.textContent = `Grading Recommendation: ${aiCard.gradingRecommendation || "Not enough detail to recommend grading."}`;
  visualCondition.textContent = `Visual: L/R ${aiCard.centeringLeftRight || "Unknown"} • T/B ${aiCard.centeringTopBottom || "Unknown"} • Corners: ${aiCard.cornerWear || "Unknown"} • Surface: ${aiCard.surfaceScratches || "Unknown"}`;
  transparencyMeta.textContent = comps.compCount
    ? `Data Transparency: Confidence ${String(comps.confidence || "low").toUpperCase()} based on ${Number(comps.compCount || 0)} sold comps.`
    : "Data Transparency: LOW confidence due to limited sold comp data.";
  saveScanHistory({ aiCard, comps, verdict, askingPrice });
  renderDashboard();

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
        <p class="comp-price">${listing.soldAt ? new Date(listing.soldAt).toLocaleDateString() : ""} ${listing.format ? `• ${String(listing.format).replace("_", " ")}` : ""}</p>
      </div>
    `;
    compListings.appendChild(item);
  });

}

function readScanHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveScanHistory(scan) {
  const history = readScanHistory();
  history.unshift({
    scannedAt: Date.now(),
    label: `${scan.aiCard.player} ${scan.aiCard.year} ${scan.aiCard.set} ${scan.aiCard.cardNumber || ""}`.trim(),
    marketValue: Number(scan.comps.medianComp || scan.comps.averageComp || 0),
    askingPrice: Number(scan.askingPrice || 0),
    potentialProfit: Number((scan.comps.averageComp || 0) - (scan.askingPrice || 0)),
    psaUpside: Number(Math.max(0, (scan.aiCard.psa10Value || scan.aiCard.gradedUpside || 0) - (scan.askingPrice || 0))),
    trend: String(scan.comps.trend || "unknown"),
  });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 75)));
}

function renderDashboard() {
  const history = readScanHistory();
  if (!history.length) return;
  const totalValue = history.reduce((s, x) => s + Number(x.marketValue || 0), 0);
  const psaUp = history.reduce((s, x) => s + Number(x.psaUpside || 0), 0);
  const pnl = history.reduce((s, x) => s + Number(x.potentialProfit || 0), 0);
  const best = [...history].sort((a, b) => (b.potentialProfit || 0) - (a.potentialProfit || 0))[0];
  const recent = history.slice(0, 5).map((x) => x.label).join(" • ");
  const rising = history.filter((x) => x.trend === "up").length;
  const falling = history.filter((x) => x.trend === "down").length;

  totalCollectionValue.textContent = `$${totalValue.toFixed(2)}`;
  totalPsaUpside.textContent = `$${psaUp.toFixed(2)}`;
  totalProfitLoss.textContent = `$${pnl.toFixed(2)}`;
  biggestFlip.textContent = best ? `${best.label} ($${Number(best.potentialProfit || 0).toFixed(2)})` : "None yet";
  recentlyScanned.textContent = `${history.length} cards • ${recent}`;
  marketMovers.textContent = `Rising: ${rising} • Falling: ${falling}`;
}

function readCompCache() {
  try {
    return JSON.parse(localStorage.getItem(COMP_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function computePayTargets(comps, aiCard) {
  const base = Number(comps.medianComp || comps.averageComp || aiCard.estimatedMarketValue || 0);
  const confidence = String(comps.confidence || "low");
  const coin = Number(aiCard.coinScore || 50);
  const qualityAdj = confidence === "high" ? 0.98 : confidence === "medium" ? 0.95 : 0.9;
  const gradeAdj = coin >= 85 ? 1.03 : coin >= 70 ? 1 : 0.94;
  const fair = base * qualityAdj * gradeAdj;
  return {
    goodBuyUnder: fair * 0.88,
    strongBuyUnder: fair * 0.75,
    avoidAbove: fair * 1.15,
  };
}

function getCompType() {
  const selected = document.querySelector('input[name="compType"]:checked');
  return selected?.value || "raw";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
