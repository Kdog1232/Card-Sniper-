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
const shareResultBtn = document.getElementById("shareResultBtn");
const shareStatus = document.getElementById("shareStatus");

const verdictBadge = document.getElementById("verdictBadge");
const snipeScore = document.getElementById("snipeScore");
const cardTitle = document.getElementById("cardTitle");
const cardMeta = document.getElementById("cardMeta");
const estimatedValue = document.getElementById("estimatedValue");
const estimatedValueLabel = document.getElementById("estimatedValueLabel");
const verdictReason = document.getElementById("verdictReason");
const marketWarning = document.getElementById("marketWarning");
const askingValue = document.getElementById("askingValue");
const upsideValue = document.getElementById("upsideValue");
const psaUpsideValue = document.getElementById("psaUpsideValue");
const predictedPsaGrade = document.getElementById("predictedPsaGrade");
const gemScore = document.getElementById("gemScore");
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
const gradingRecommendationValue = document.getElementById("gradingRecommendationValue");
const visualCondition = document.getElementById("visualCondition");
const compListings = document.getElementById("compListings");
const totalCollectionValue = document.getElementById("totalCollectionValue");
const totalPsaUpside = document.getElementById("totalPsaUpside");
const totalProfitLoss = document.getElementById("totalProfitLoss");
const biggestFlip = document.getElementById("biggestFlip");
const recentlyScanned = document.getElementById("recentlyScanned");
const marketMovers = document.getElementById("marketMovers");

let imageDataUrl = "";
let currentShareScan = null;
const HISTORY_KEY = "card_sniper_scan_history_v1";
const COMP_CACHE_KEY = "card_sniper_comp_cache_v3";
const SHARE_BRAND_URL = "cardsniper.app";
const PREMIUM_INSERTS = [
  "Downtown",
  "Kaboom",
  "Color Blast",
  "Manga",
  "Genesis",
  "Gold Prizm",
  "Silver Prizm",
  "Gold Geometric",
  "Geometric",
  "Zebra",
  "Stained Glass",
  "Blank Slate",
];
const RARE_CARD_KEYWORDS = ["gold", "geometric", "numbered", "parallel", "refractor", "short print", "ssp", "case hit", "rookie", "auto", "autograph"];

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

shareResultBtn?.addEventListener("click", async () => {
  if (!currentShareScan) {
    alert("Scan a card before sharing a result.");
    return;
  }

  shareResultBtn.disabled = true;
  shareStatus.textContent = "Creating share image...";

  try {
    const imageBlob = await createShareImage(currentShareScan);
    const filename = `${slugify(currentShareScan.cardTitle || "card-sniper-result")}.png`;
    const file = new File([imageBlob], filename, { type: "image/png" });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: "Card Sniper Result",
        text: `${currentShareScan.verdict} ${currentShareScan.cardTitle} • ${formatShareSummaryText(currentShareScan)} • ${SHARE_BRAND_URL}`,
        files: [file],
      });
      shareStatus.textContent = "Share image ready.";
    } else {
      downloadBlob(imageBlob, filename);
      shareStatus.textContent = "Share image downloaded. Post it to your favorite group or social channel.";
    }
  } catch (err) {
    console.error(err);
    shareStatus.textContent = `Share image failed: ${err.message}`;
  } finally {
    shareResultBtn.disabled = false;
  }
});

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
    const deepRecommendation = deepData.gradingRecommendation || "No recommendation returned.";
    gradingRecommendation.textContent = `Grading Details: ${deepRecommendation}`;
    gradingRecommendationValue.textContent = deepRecommendation;
    gemScore.textContent = String(Number(deepData.gemScore || deepData.coinScore || 50));
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
    const verdict = scoreDeal(askingPrice, comps.averageComp, comps);
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

  const premiumInsert = detectPremiumInsert(aiCard);
  const fallbackBase = Number(aiCard.estimatedMarketValue || 0);
  const fallbackRange = buildAiEstimateRange(fallbackBase);
  const fallback = {
    averageComp: fallbackBase,
    medianComp: fallbackBase,
    lowestComp: fallbackRange.low,
    highestComp: fallbackRange.high,
    valueRange: fallbackRange,
    recentSales: [],
    listings: [],
    compCount: 0,
    confidence: deriveCompConfidence(0),
    confidenceScore: 0,
    displayConfidenceScore: 0,
    compQuality: "weak",
    premiumInsert,
    noVerifiedComps: true,
    aiEstimateFallback: true,
    lowConfidenceRange: true,
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
        parallel: aiCard.parallel,
        insertName: premiumInsert || aiCard.insertName || "",
        compType,
      }),
    });

    if (!response.ok) throw new Error(`ebay-comps failed: ${response.status}`);

    const data = await response.json();
    const compCount = Number(data.compCount || 0);
    const recentSales = Array.isArray(data.recentSales) ? data.recentSales.map(Number).filter(Number.isFinite) : [];
    const noVerifiedComps = compCount === 0;
    const aiRange = buildAiEstimateRange(fallbackBase);
    const apiRange = data.valueRange || buildLowConfidenceRange(Number(data.medianComp || data.averageComp || 0), recentSales, data.premiumInsert || premiumInsert, Number(askingInput.value || 0));
    const safeRange = noVerifiedComps ? aiRange : apiRange;
    const safeBase = noVerifiedComps ? fallbackBase : Number(data.averageComp || 0);
    const safeMedian = noVerifiedComps ? fallbackBase : Number(data.medianComp || data.averageComp || 0);
    const payload = {
      averageComp: safeBase,
      medianComp: safeMedian,
      lowestComp: noVerifiedComps ? safeRange.low : Number(data.lowestComp || 0),
      highestComp: noVerifiedComps ? safeRange.high : Number(data.highestComp || 0),
      recentSales,
      listings: Array.isArray(data.listings) ? data.listings : [],
      compCount,
      confidence: deriveCompConfidence(compCount),
      confidenceScore: Number(data.confidenceScore || 0),
      displayConfidenceScore: noVerifiedComps ? 0 : undefined,
      compQuality: String(data.compQuality || "weak"),
      trend: String(data.trend || "unknown"),
      liquidity: String(data.liquidity || "weak"),
      auctionCount: Number(data.auctionCount || 0),
      buyItNowCount: Number(data.buyItNowCount || 0),
      gradedCount: Number(data.gradedCount || 0),
      rawCount: Number(data.rawCount || 0),
      premiumInsert: data.premiumInsert || premiumInsert,
      noVerifiedComps,
      aiEstimateFallback: noVerifiedComps,
      valueRange: safeRange,
      lowConfidenceRange: Boolean(data.lowConfidenceRange || compCount < 3 || noVerifiedComps),
      usedFallback: noVerifiedComps,
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

function scoreDeal(asking, marketValue, comps = {}) {
  const value = Number(marketValue || 0);
  const ratio = value > 0 ? asking / value : Infinity;
  let label = "FAIR";
  let score = value > 0 ? 62 : 35;

  if (ratio <= 0.75) {
    label = "BUY";
    score = Math.min(100, Math.round((1 - ratio) * 140 + 70));
  } else if (ratio > 1.05) {
    label = "PASS";
    score = value > 0 ? Math.max(1, Math.round(60 - (ratio - 1) * 110)) : 25;
  } else {
    score = Math.max(40, Math.round(80 - Math.abs(1 - ratio) * 120));
  }

  return { label, score, reason: deriveVerdictReason(label, asking, value, comps) };
}

function deriveVerdictReason(label, asking, marketValue, comps = {}) {
  const compCount = Number(comps.compCount || 0);
  const weakMarketData = compCount === 0 || String(comps.confidence || "").toLowerCase() === "very_low";
  if (weakMarketData) return "Weak Market Data";
  if (label === "PASS" && marketValue > 0 && asking > marketValue * 1.05) return "Over Market Value";
  if (label === "BUY" && compCount > 0) return "Below Recent Sales";
  if (label === "BUY") return "Strong Value";
  return "Near Market Value";
}

function renderResult({ aiCard, comps, verdict, askingPrice }) {
  resultPanel.classList.remove("hidden");
  if (shareStatus) shareStatus.textContent = "Creates a shareable image for social posts.";

  const displayCardName = buildCardDisplayName(aiCard, comps);
  cardTitle.textContent = displayCardName || `${aiCard.player} ${aiCard.year} ${aiCard.set}`;
  cardMeta.textContent = `${displayCardName || aiCard.player} • ${aiCard.year} • ${aiCard.set} • ${aiCard.variation} • Condition ${aiCard.condition}/10`;

  snipeScore.classList.remove("pop");
  void snipeScore.offsetWidth;
  snipeScore.classList.add("pop");

  snipeScore.textContent = verdict.score;
  verdictBadge.textContent = verdict.label;
  verdictBadge.className = "badge";
  verdictBadge.classList.add(verdict.label.toLowerCase());
  if (verdictReason) verdictReason.textContent = `Reason: ${verdict.reason || deriveVerdictReason(verdict.label, askingPrice, comps.averageComp, comps)}`;

  const displayedConfidenceScore = getDisplayedConfidenceScore(comps);
  const showRange = shouldShowRange(comps);
  const range = normalizeRange(comps);
  if (showRange) {
    estimatedValueLabel.textContent = comps.noVerifiedComps || comps.aiEstimateFallback ? "AI Estimated Range:" : "Estimated Range:";
    estimatedValue.textContent = formatDisplayRange(range);
  } else {
    estimatedValueLabel.textContent = "Estimated Value";
    estimatedValue.textContent = `$${(comps.medianComp || comps.averageComp).toFixed(2)}`;
  }
  renderMarketWarning(comps);
  currentShareScan = buildShareScan({ aiCard, comps, verdict, askingPrice, showRange, range, payTargets: null });
  askingValue.textContent = `$${askingPrice.toFixed(2)}`;
  upsideValue.textContent = `$${(comps.averageComp - askingPrice).toFixed(2)}`;
  psaUpsideValue.textContent = `$${Math.max(0, (aiCard.gradedUpside || comps.highestComp) - askingPrice).toFixed(2)}`;
  predictedPsaGrade.textContent = aiCard.predictedPsaGrade || "Unknown";
  gemProbability.textContent = `${Number(aiCard.gemProbability || aiCard.psa10Probability || 0).toFixed(0)}%`;
  gemScore.textContent = String(Number(aiCard.gemScore || aiCard.coinScore || 50));
  psa9Value.textContent = `$${Number(aiCard.psa9Value || 0).toFixed(2)}`;
  psa10Value.textContent = `$${Number(aiCard.psa10Value || 0).toFixed(2)}`;
  const payTargets = computePayTargets(comps, aiCard);
  currentShareScan.payTargets = payTargets;
  currentShareScan.goodBuyUnder = `$${payTargets.goodBuyUnder.toFixed(0)}`;
  goodBuyUnder.textContent = `$${payTargets.goodBuyUnder.toFixed(2)}`;
  strongBuyUnder.textContent = `$${payTargets.strongBuyUnder.toFixed(2)}`;
  avoidAbove.textContent = `$${payTargets.avoidAbove.toFixed(2)}`;

  const highGemPassNote = Number(aiCard.gemScore || aiCard.coinScore || 0) > 90 && String(verdict.label || "") === "PASS"
    ? " High grading potential, but pricing/data risk remains."
    : "";
  reasoning.textContent = `${aiCard.reasoning || "Comp spread and card attributes suggest a neutral buy zone."}${highGemPassNote}`;

  const salesText = comps.recentSales.length
    ? comps.recentSales.map((sale) => `$${sale.toFixed(2)}`).join(" • ")
    : "No recent sold prices returned.";
  recentSales.textContent = salesText;

  compSummary.textContent = comps.compCount
    ? `${showRange ? "Estimated Range" : "Estimated Median Sold"}: ${showRange ? `$${range.low.toFixed(2)} - $${range.high.toFixed(2)}` : `$${(comps.medianComp || comps.averageComp).toFixed(2)}`} • ${comps.compCount} sold comps${comps.premiumInsert ? ` • Premium Insert: ${comps.premiumInsert}` : ""}`
    : `No verified sold comps found. Showing AI estimate${comps.premiumInsert ? ` for ${comps.premiumInsert}` : ""}.`;
  marketMeta.textContent = comps.compCount
    ? `Confidence: ${formatConfidence(comps.confidence)} (${displayedConfidenceScore}/100) • Trend: ${String(comps.trend || "unknown").toUpperCase()} • Liquidity: ${String(comps.liquidity || "weak").toUpperCase()} • Raw/Graded: ${Number(comps.rawCount || 0)}/${Number(comps.gradedCount || 0)} • Auction/BIN: ${Number(comps.auctionCount || 0)}/${Number(comps.buyItNowCount || 0)}`
    : "Confidence: VERY LOW • Trend: UNKNOWN • Liquidity: WEAK";
  const gradeText = aiCard.gradingRecommendation || "Not enough detail to recommend grading.";
  gradingRecommendationValue.textContent = gradeText;
  gradingRecommendation.textContent = `Grading Details: ${gradeText}`;
  visualCondition.textContent = `Visual: L/R ${aiCard.centeringLeftRight || "Unknown"} • T/B ${aiCard.centeringTopBottom || "Unknown"} • Corners: ${aiCard.cornerWear || "Unknown"} • Surface: ${aiCard.surfaceScratches || "Unknown"}`;
  transparencyMeta.textContent = comps.compCount
    ? `Data Transparency: Confidence ${formatConfidence(comps.confidence)} based on ${Number(comps.compCount || 0)} sold comps.`
    : "Data Transparency: VERY LOW confidence because no verified sold comps were found; AI estimate fallback is based on card attributes.";
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

function formatShareSummaryText(scan) {
  return scan.noVerifiedComps
    ? `NO VERIFIED SOLD COMPS • AI Estimate: ${scan.aiEstimateText}`
    : `${scan.estimatedLabel} ${scan.estimatedText}`;
}

function buildShareScan({ aiCard, comps, verdict, askingPrice, showRange, range, payTargets }) {
  const noVerifiedComps = Number(comps.compCount || 0) === 0;
  const estimateText = showRange
    ? formatShareRange(range)
    : `$${Number(comps.medianComp || comps.averageComp || 0).toFixed(0)}`;
  const gemScoreValue = Number(aiCard.gemScore || aiCard.coinScore || 50);

  return {
    score: Number(verdict.score || 0),
    verdict: String(verdict.label || "FAIR"),
    verdictReason: verdict.reason || deriveVerdictReason(verdict.label, askingPrice, comps.averageComp, comps),
    cardTitle: buildCardDisplayName(aiCard, comps),
    estimatedLabel: noVerifiedComps ? "NO VERIFIED SOLD COMPS" : showRange ? "Estimated Range:" : "Estimated Value:",
    estimatedText: noVerifiedComps ? "NO VERIFIED SOLD COMPS" : estimateText,
    aiEstimateLabel: noVerifiedComps ? "AI Estimate:" : "",
    aiEstimateText: noVerifiedComps ? estimateText : "",
    gemScore: gemScoreValue,
    gemRiskNote: gemScoreValue > 90 && String(verdict.label || "") === "PASS" ? "High grading potential, but pricing/data risk remains." : "",
    confidence: formatConfidence(comps.confidence),
    noVerifiedComps,
    compCount: Number(comps.compCount || 0),
    goodBuyUnder: payTargets ? `$${payTargets.goodBuyUnder.toFixed(0)}` : "$0",
    askingPrice: `$${Number(askingPrice || 0).toFixed(0)}`,
    buyQuestion: `Would you buy this card at $${Number(askingPrice || 0).toFixed(0)}?`,
  };
}

async function createShareImage(scan) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
  gradient.addColorStop(0, "#1b1f35");
  gradient.addColorStop(0.55, "#0a0c12");
  gradient.addColorStop(1, "#111525");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(79, 70, 229, 0.22)";
  ctx.beginPath();
  ctx.arc(880, 140, 320, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(236, 72, 153, 0.16)";
  ctx.beginPath();
  ctx.arc(150, 920, 360, 0, Math.PI * 2);
  ctx.fill();

  roundRect(ctx, 70, 70, 940, 940, 42);
  ctx.fillStyle = "rgba(17, 21, 37, 0.88)";
  ctx.fill();
  ctx.strokeStyle = "rgba(151, 245, 187, 0.28)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#9ea7c6";
  drawCanvasText(ctx, "🎯 Card Sniper", 110, 140, 34, 760, 1.15, 800);
  ctx.textAlign = "right";
  drawCanvasText(ctx, SHARE_BRAND_URL, 970, 140, 30, 360, 1, 800);
  ctx.textAlign = "left";

  drawConfidenceBadge(ctx, scan.confidence, scan.compCount, 710, 178, 270, 118);

  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, `🔥 Snipe Score ${scan.score}`, 110, 240, 76, 860, 1.05, 900);

  const verdictColor = scan.verdict === "BUY" ? "#22c55e" : scan.verdict === "PASS" ? "#ef4444" : "#eab308";
  ctx.fillStyle = verdictColor;
  drawCanvasText(ctx, scan.verdict, 110, 320, 70, 860, 1, 900);

  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, `Reason: ${scan.verdictReason}`, 110, 385, 32, 800, 1.05, 800);

  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, scan.cardTitle || "Card Scan Result", 110, 480, 48, 860, 1.12, 850);

  if (scan.noVerifiedComps) {
    ctx.fillStyle = "#fecaca";
    drawCanvasText(ctx, "NO VERIFIED SOLD COMPS", 110, 590, 38, 860, 1.05, 900);
    ctx.fillStyle = "#9ea7c6";
    drawCanvasText(ctx, scan.aiEstimateLabel, 110, 650, 34, 860, 1.05, 800);
    ctx.fillStyle = "#97f5bb";
    drawCanvasText(ctx, scan.aiEstimateText, 110, 705, 58, 860, 1.05, 900);
  } else {
    ctx.fillStyle = "#9ea7c6";
    drawCanvasText(ctx, scan.estimatedLabel, 110, 625, 38, 860, 1.1, 800);
    ctx.fillStyle = "#97f5bb";
    drawCanvasText(ctx, scan.estimatedText, 110, 690, 58, 860, 1.05, 900);
  }

  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, `Gem Score ${scan.gemScore}`, 110, 790, 42, 600, 1.1, 850);
  if (scan.gemRiskNote) {
    ctx.fillStyle = "#fde68a";
    drawCanvasText(ctx, scan.gemRiskNote, 110, 828, 22, 620, 1.08, 700);
  }

  ctx.fillStyle = "#9ea7c6";
  drawCanvasText(ctx, "Good Buy Under:", 110, 875, 32, 560, 1.05, 800);
  ctx.fillStyle = "#97f5bb";
  drawCanvasText(ctx, scan.goodBuyUnder, 110, 930, 48, 560, 1, 900);

  drawQrCode(ctx, SHARE_BRAND_URL, 820, 790, 150);
  ctx.textAlign = "center";
  ctx.fillStyle = "#9ea7c6";
  drawCanvasText(ctx, "Scan to try", 895, 965, 22, 180, 1, 700);

  ctx.textAlign = "left";
  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, scan.buyQuestion, 110, 990, 32, 660, 1, 850);

  ctx.textAlign = "right";
  ctx.fillStyle = "#64708f";
  drawCanvasText(ctx, "AI-assisted estimate • comps vary", 970, 1018, 20, 760, 1, 600);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create share image.")), "image/png");
  });
}

function drawConfidenceBadge(ctx, confidence, compCount, x, y, width, height) {
  const count = Number(compCount || 0);
  const confidenceLabel = `${confidence || "LOW"} CONFIDENCE`;
  const compLabel = `${count} SOLD ${count === 1 ? "COMP" : "COMPS"}`;
  const badgeColor = confidence === "HIGH" ? "rgba(34, 197, 94, 0.18)" : confidence === "MEDIUM" ? "rgba(234, 179, 8, 0.18)" : "rgba(239, 68, 68, 0.18)";
  const textColor = confidence === "HIGH" ? "#97f5bb" : confidence === "MEDIUM" ? "#fde68a" : "#fecaca";

  roundRect(ctx, x, y, width, height, 20);
  ctx.fillStyle = badgeColor;
  ctx.fill();
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.fillStyle = textColor;
  drawCanvasText(ctx, confidenceLabel, x + width / 2, y + 42, 18, width - 30, 1, 900);
  ctx.fillStyle = "#f0f3ff";
  drawCanvasText(ctx, compLabel, x + width / 2, y + 82, 25, width - 30, 1, 800);
  ctx.textAlign = "left";
}

function drawQrCode(ctx, text, x, y, size) {
  const matrix = buildQrMatrix(text);
  const quietZone = 4;
  const moduleCount = matrix.length + quietZone * 2;
  const moduleSize = Math.floor(size / moduleCount);
  const qrSize = moduleSize * moduleCount;
  const offset = (size - qrSize) / 2;

  ctx.fillStyle = "#f8fafc";
  roundRect(ctx, x - 10, y - 10, size + 20, size + 20, 18);
  ctx.fill();

  ctx.fillStyle = "#020617";
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix.length; col += 1) {
      if (matrix[row][col]) {
        ctx.fillRect(
          x + offset + (col + quietZone) * moduleSize,
          y + offset + (row + quietZone) * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }
}

function buildQrMatrix(text) {
  const size = 21;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => Array(size).fill(false));

  const setFunction = (row, col, dark) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    modules[row][col] = Boolean(dark);
    reserved[row][col] = true;
  };

  const drawFinder = (row, col) => {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const rr = row + r;
        const cc = col + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6)) || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setFunction(rr, cc, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  setFunction(size - 8, 8, true);
  reserveFormatModules(reserved);

  const data = buildQrCodewords(text);
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col >= 1; col -= 2) {
    if (col === 6) col -= 1;
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i;
      for (let c = 0; c < 2; c += 1) {
        const currentCol = col - c;
        if (reserved[row][currentCol]) continue;
        const byte = data[Math.floor(bitIndex / 8)] || 0;
        const bit = ((byte >>> (7 - (bitIndex % 8))) & 1) === 1;
        const masked = bit !== ((row + currentCol) % 2 === 0);
        modules[row][currentCol] = masked;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }

  drawFormatBits(modules, reserved);
  return modules;
}

function reserveFormatModules(reserved) {
  const size = reserved.length;
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      reserved[8][i] = true;
      reserved[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
}

function drawFormatBits(modules, reserved) {
  const size = modules.length;
  const format = 0x77c4; // Error correction L, mask 0.
  const bit = (i) => ((format >>> i) & 1) === 1;
  const set = (row, col, value) => {
    modules[row][col] = value;
    reserved[row][col] = true;
  };

  for (let i = 0; i <= 5; i += 1) set(8, i, bit(i));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(i));
  set(size - 8, 8, true);
}

function buildQrCodewords(text) {
  const bytes = [...String(text)].map((char) => char.charCodeAt(0));
  const bits = [0, 1, 0, 0]; // Byte mode.
  for (let i = 7; i >= 0; i -= 1) bits.push((bytes.length >>> i) & 1);
  bytes.forEach((value) => {
    for (let i = 7; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  });
  for (let i = 0; i < 4 && bits.length < 152; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);

  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    data.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; data.length < 19; pad += 1) data.push(pad % 2 === 0 ? 0xec : 0x11);
  return [...data, ...reedSolomonRemainder(data, 7)];
}

function reedSolomonRemainder(data, degree) {
  const exp = Array(512).fill(0);
  const log = Array(256).fill(0);
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < exp.length; i += 1) exp[i] = exp[i - 255];

  const multiply = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  let generator = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = Array(generator.length + 1).fill(0);
    generator.forEach((coef, index) => {
      next[index] ^= coef;
      next[index + 1] ^= multiply(coef, exp[i]);
    });
    generator = next;
  }

  const result = [...data, ...Array(degree).fill(0)];
  for (let i = 0; i < data.length; i += 1) {
    const factor = result[i];
    if (!factor) continue;
    generator.forEach((coef, index) => {
      result[i + index] ^= multiply(coef, factor);
    });
  }
  return result.slice(data.length);
}
function drawCanvasText(ctx, text, x, y, size, maxWidth, lineHeight = 1.1, weight = 700) {
  ctx.font = `${weight} ${size}px Inter, Arial, sans-serif`;
  const words = String(text).split(/\s+/);
  let line = "";
  let offsetY = 0;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line, x, y + offsetY);
      line = word;
      offsetY += size * lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line) ctx.fillText(line, x, y + offsetY);
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "card-sniper-result";
}


function buildCardDisplayName(aiCard, comps = {}) {
  const player = String(aiCard?.player || "").trim();
  const premiumName = String(aiCard?.premiumInsert || comps?.premiumInsert || "").trim();
  const variationName = stripSerialNumber(String(aiCard?.insertName || aiCard?.parallel || aiCard?.variation || "").trim());
  const descriptor = premiumName && premiumName !== "Rare / Numbered" ? premiumName : variationName;
  const cardNumber = formatCardNumberLabel(aiCard?.cardNumber);
  const serialNumber = formatSerialNumberLabel(aiCard?.serialNumber || extractSerialNumber(aiCard));
  return [player, descriptor, cardNumber, serialNumber].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function stripSerialNumber(value) {
  return String(value || "").replace(/(?:^|\s)\/?\d+\s*\/\s*\d+\b/g, "").replace(/\s+/g, " ").trim();
}

function formatCardNumberLabel(cardNumber) {
  const clean = stripSerialNumber(String(cardNumber || "").trim());
  if (!clean || clean.startsWith("/")) return "";
  return clean.startsWith("#") ? clean : `#${clean}`;
}

function extractSerialNumber(card) {
  const source = [card?.serialNumber, card?.cardNumber, card?.parallel, card?.variation, card?.insertName]
    .filter(Boolean)
    .join(" ");
  return source.match(/(?:^|\s)(\/?\d+\s*\/\s*\d+)\b/)?.[1] || "";
}

function formatSerialNumberLabel(serialNumber) {
  const clean = String(serialNumber || "").trim().replace(/\s+/g, "");
  if (!clean) return "";
  return clean.startsWith("/") ? clean : `/${clean.split("/").pop()}`;
}

function detectPremiumInsert(card) {
  const haystack = [card?.insertName, card?.parallel, card?.variation, card?.set, card?.cardNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const premiumInsert = PREMIUM_INSERTS.find((name) => haystack.includes(name.toLowerCase()));
  if (premiumInsert) return premiumInsert;
  if (isRareOrNumberedCard(card)) return "Rare / Numbered";
  return "";
}

function isRareOrNumberedCard(card) {
  const haystack = [card?.insertName, card?.parallel, card?.variation, card?.set, card?.cardNumber]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(?:^|\D)\d+\s*\/\s*\d+(?:\D|$)/.test(haystack) || RARE_CARD_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function shouldShowRange(comps) {
  return Number(comps.compCount || 0) < 3 || Boolean(comps.lowConfidenceRange);
}

function normalizeRange(comps) {
  const low = Number(comps.valueRange?.low || comps.lowestComp || comps.medianComp || comps.averageComp || 0);
  const high = Number(comps.valueRange?.high || comps.highestComp || comps.medianComp || comps.averageComp || 0);
  return { low: Math.max(0, Math.min(low, high)), high: Math.max(low, high) };
}

function buildAiEstimateRange(baseValue) {
  const base = Number(baseValue || 0);
  if (!Number.isFinite(base) || base <= 0) return { low: 0, high: 0 };
  return { low: base * 0.8, high: base * 1.2 };
}

function formatDisplayRange(range) {
  if (!Number(range?.low || 0) && !Number(range?.high || 0)) return "No verified sold comps found.";
  return `$${Number(range.low || 0).toFixed(2)} - $${Number(range.high || 0).toFixed(2)}`;
}

function formatShareRange(range) {
  if (!Number(range?.low || 0) && !Number(range?.high || 0)) return "No verified sold comps";
  return `$${Number(range.low || 0).toFixed(0)}-$${Number(range.high || 0).toFixed(0)}`;
}

function deriveCompConfidence(compCount) {
  const count = Number(compCount || 0);
  if (count === 0) return "very_low";
  if (count <= 2) return "low";
  if (count <= 5) return "medium";
  return "high";
}

function formatConfidence(confidence) {
  return String(confidence || "low").replace(/_/g, " ").toUpperCase();
}

function buildLowConfidenceRange(baseValue, sales = [], premiumInsert = "", askingPrice = 0) {
  const cleanSales = sales.map(Number).filter((value) => Number.isFinite(value) && value > 0);
  if (cleanSales.length) {
    const low = Math.min(...cleanSales);
    const high = Math.max(...cleanSales);
    const paddedLow = low * 0.9;
    const paddedHigh = Math.max(high * 1.1, low * 1.25);
    return { low: paddedLow, high: paddedHigh };
  }

  const base = Number(baseValue || 0);
  if (!base) return { low: 0, high: 0 };

  const floor = premiumInsert ? Math.max(base * 0.85, Number(askingPrice || 0) * 0.75) : base * 0.82;
  const ceiling = premiumInsert ? Math.max(base * 1.6, floor * 1.5) : base * 1.18;
  return { low: floor, high: ceiling };
}

function getDisplayedConfidenceScore(comps) {
  if (!Number(comps.compCount || 0)) return 0;
  const confidence = String(comps.confidence || "low").toLowerCase();
  if (confidence === "high") return 85;
  if (confidence === "medium") return 60;
  return 25;
}

function renderMarketWarning(comps) {
  const weak = Number(comps.compCount || 0) < 3 || String(comps.confidence || "low").toLowerCase() === "low" || String(comps.compQuality || "weak").toLowerCase() === "weak";
  if (!marketWarning) return;
  marketWarning.classList.toggle("hidden", !weak);
  if (weak) {
    if (Number(comps.compCount || 0) === 0) {
      marketWarning.innerHTML = `⚠️ No verified sold comps found.<br /><span>Showing AI estimate based on:</span><br /><span>• player demand</span><br /><span>• rarity</span><br /><span>• serial numbering</span><br /><span>• parallel type</span><br /><span>• grade</span>`;
      return;
    }
    marketWarning.innerHTML = `🔴 Market Data Weak<br /><span>Only ${Number(comps.compCount || 0)} sold comps found.</span><br /><span>Price estimate may be unreliable.</span>`;
  }
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
    marketValue: Number(scan.comps.medianComp || scan.comps.averageComp || scan.comps.valueRange?.low || 0),
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
  const best = [...history].filter((x) => Number(x.potentialProfit || 0) > 0).sort((a, b) => (b.potentialProfit || 0) - (a.potentialProfit || 0))[0];
  const recent = history.slice(0, 5).map((x) => x.label).join(" • ");
  const rising = history.filter((x) => x.trend === "up").length;
  const falling = history.filter((x) => x.trend === "down").length;

  totalCollectionValue.textContent = `$${totalValue.toFixed(2)}`;
  totalPsaUpside.textContent = `$${psaUp.toFixed(2)}`;
  totalProfitLoss.textContent = `$${pnl.toFixed(2)}`;
  biggestFlip.textContent = best ? `${best.label} ($${Number(best.potentialProfit || 0).toFixed(2)})` : "No profitable flips identified yet.";
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
  const base = Number(comps.medianComp || comps.averageComp || comps.valueRange?.low || aiCard.estimatedMarketValue || 0);
  const confidence = String(comps.confidence || "low");
  const coin = Number(aiCard.gemScore || aiCard.coinScore || 50);
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
