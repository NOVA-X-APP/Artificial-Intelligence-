/**
 * AI TUTOR MODULE — Learning Assistant for Bean Empire
 * Uses free APIs and GitHub-supported services for educational content
 * 
 * Features:
 * - Context-aware game hints
 * - Strategy recommendations
 * - Learning paths based on progress
 * - Integration with Anthropic Claude API or local inference
 */

// ═══════════════════════════════════════════════════════════════
// TUTOR CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const TUTOR_CONFIG = {
  apiProvider: 'local', // 'anthropic' or 'local' (demo mode)
  apiKey: null, // Set via UI or environment
  model: 'claude-3-haiku', // Lighter model for faster responses
  systemPrompt: `You are an AI Tutor helping players learn Bean Empire strategy. 
    Be concise, encouraging, and provide actionable advice.
    Focus on: progression tips, building strategy, upgrade paths, and game mechanics.
    Keep responses under 150 words. Use emojis to match the game tone.`,
  tutorMaxHistory: 10, // Store last N tutor interactions
};

// ═══════════════════════════════════════════════════════════════
// TUTOR STATE & MEMORY
// ═══════════════════════════════════════════════════════════════

let TUTOR_STATE = {
  enabled: false,
  conversationHistory: [],
  lastQueryTime: 0,
  queryCount: 0,
  loading: false,
  apiKeySet: false,
};

// ═══════════════════════════════════════════════════════════════
// TUTOR UI ELEMENTS
// ═══════════════════════════════════════════════════════════════

function initTutorUI() {
  // Create tutor panel if it doesn't exist
  if (!document.getElementById("tutorPanel")) {
    const tutorHTML = `
      <div id="tutorPanel" style="
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 320px;
        max-height: 500px;
        background: linear-gradient(135deg, #0c0a1e, #16122a);
        border: 1px solid rgba(140, 100, 220, 0.5);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        display: none;
        flex-direction: column;
        z-index: 5000;
        font-family: 'Crimson Pro', serif;
      ">
        <div id="tutorHeader" style="
          padding: 12px 16px;
          border-bottom: 1px solid rgba(140, 100, 220, 0.3);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-shrink: 0;
        ">
          <h3 style="margin: 0; color: #b090f0; font-size: 0.95rem;">🤖 AI Tutor</h3>
          <button id="closeTutorBtn" style="
            background: none;
            border: none;
            color: #8070b0;
            cursor: pointer;
            font-size: 1.2rem;
            padding: 0;
          ">×</button>
        </div>
        
        <div id="tutorMessages" style="
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        "></div>
        
        <div id="tutorInput" style="
          padding: 12px;
          border-top: 1px solid rgba(140, 100, 220, 0.3);
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        ">
          <input type="text" id="tutorQuery" placeholder="Ask for help…" style="
            flex: 1;
            background: rgba(20, 15, 40, 0.9);
            border: 1px solid rgba(140, 100, 220, 0.3);
            border-radius: 6px;
            padding: 6px 10px;
            color: #dde0e8;
            font-family: 'Crimson Pro', serif;
            font-size: 0.8rem;
            outline: none;
          ">
          <button id="tutorSendBtn" style="
            background: #b090f0;
            border: none;
            border-radius: 6px;
            padding: 6px 10px;
            color: #0c0a1e;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.75rem;
            flex-shrink: 0;
          ">Send</button>
        </div>
      </div>

      <div id="tutorToggle" style="
        position: fixed;
        bottom: 30px;
        right: 20px;
        width: 50px;
        height: 50px;
        background: linear-gradient(135deg, #8070b0, #b090f0);
        border: 2px solid #b090f0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 4999;
        font-size: 1.5rem;
        box-shadow: 0 4px 16px rgba(140, 100, 220, 0.4);
        transition: all 0.2s;
      ">🤖</div>
    `;
    document.body.insertAdjacentHTML("beforeend", tutorHTML);
    setupTutorEventListeners();
  }
}

function setupTutorEventListeners() {
  const toggle = document.getElementById("tutorToggle");
  const panel = document.getElementById("tutorPanel");
  const closeBtn = document.getElementById("closeTutorBtn");
  const sendBtn = document.getElementById("tutorSendBtn");
  const queryInput = document.getElementById("tutorQuery");

  toggle.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
    TUTOR_STATE.enabled = panel.style.display === "flex";
    if (TUTOR_STATE.enabled) queryInput.focus();
  });

  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    TUTOR_STATE.enabled = false;
  });

  sendBtn.addEventListener("click", () => {
    const query = queryInput.value.trim();
    if (query) {
      getTutorResponse(query);
      queryInput.value = "";
    }
  });

  queryInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const query = queryInput.value.trim();
      if (query) {
        getTutorResponse(query);
        queryInput.value = "";
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// TUTOR INTELLIGENCE LAYER
// ═══════════════════════════════════════════════════════════════

/**
 * Get context-aware tutor response
 * Falls back to local rules if API unavailable
 */
async function getTutorResponse(query) {
  const messagesDiv = document.getElementById("tutorMessages");
  const sendBtn = document.getElementById("tutorSendBtn");

  // Add user message
  addTutorMessage(query, "user");
  TUTOR_STATE.loading = true;
  sendBtn.disabled = true;
  sendBtn.textContent = "…";

  try {
    let response;

    // Try API-based response first
    if (TUTOR_CONFIG.apiProvider === "anthropic" && TUTOR_CONFIG.apiKey) {
      response = await getTutorResponseFromAPI(query);
    } else {
      // Fall back to local context-based system
      response = getTutorResponseLocal(query);
    }

    addTutorMessage(response, "tutor");
    TUTOR_STATE.conversationHistory.push({ query, response });

    // Keep history size manageable
    if (TUTOR_STATE.conversationHistory.length > TUTOR_CONFIG.tutorMaxHistory) {
      TUTOR_STATE.conversationHistory.shift();
    }

    // Auto-scroll to latest message
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (error) {
    addTutorMessage(
      `⚠️ Error: ${error.message}. Try checking your API key or using offline mode.`,
      "tutor"
    );
  } finally {
    TUTOR_STATE.loading = false;
    sendBtn.disabled = false;
    sendBtn.textContent = "Send";
  }
}

/**
 * Get response from Claude API (Anthropic)
 * Requires valid API key
 */
async function getTutorResponseFromAPI(query) {
  const contextStr = buildGameContext();
  const messages = [
    {
      role: "user",
      content: `Game State: ${contextStr}\n\nPlayer Question: ${query}`,
    },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": TUTOR_CONFIG.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TUTOR_CONFIG.model,
      max_tokens: 256,
      system: TUTOR_CONFIG.systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Local context-aware tutor system
 * No API needed - uses game state analysis
 */
function getTutorResponseLocal(query) {
  const q = query.toLowerCase();
  const gameCtx = {
    gas: G.gas,
    gps: calcGPS(),
    totalClicks: G.totalClicks,
    totalBuildings: totalBuildings(),
    prestige: G.prestige,
    zoneIdx: G.zoneIdx,
    zoneMax: THE_END_IDX,
    upgradeBought: UPGRADES.filter((u) => u.bought).length,
    upgradeTotal: UPGRADES.length,
  };

  // Pattern matching for common questions
  if (
    q.includes("help") ||
    q.includes("guide") ||
    q.includes("how do i") ||
    q.includes("what should")
  ) {
    return getTutorStrategyAdvice(gameCtx);
  }

  if (q.includes("upgrade") || q.includes("upg")) {
    return getTutorUpgradeAdvice(gameCtx);
  }

  if (q.includes("building") || q.includes("farm") || q.includes("factory")) {
    return getTutorBuildingAdvice(gameCtx);
  }

  if (q.includes("zone") || q.includes("progress") || q.includes("advance")) {
    return getTutorZoneAdvice(gameCtx);
  }

  if (
    q.includes("prestige") ||
    q.includes("reset") ||
    q.includes("quantum leap")
  ) {
    return getTutorPrestigeAdvice(gameCtx);
  }

  if (q.includes("combo") || q.includes("crit") || q.includes("click")) {
    return getTutorClickAdvice(gameCtx);
  }

  // Default response
  return getTutorGeneralHelp(gameCtx);
}

// ═══════════════════════════════════════════════════════════════
// CONTEXT-AWARE ADVICE GENERATORS
// ═══════════════════════════════════════════════════════════════

function getTutorStrategyAdvice(ctx) {
  const tips = [];

  if (ctx.totalClicks < 100) {
    tips.push("🌱 Start by clicking the bean! Each click gives gas.");
    tips.push("💨 Once you have gas, buy buildings to automate production.");
    tips.push("⚡ Upgrades boost your power significantly!");
  } else if (ctx.totalBuildings < 10) {
    tips.push("🏭 Focus on buying diverse buildings for steady growth.");
    tips.push("💎 Unlock the Double Tap upgrade for extra clicks!");
    tips.push("📈 Your gas/sec is critical - monitor it in the left panel.");
  } else if (ctx.zoneIdx < 20) {
    tips.push("🌍 Progress through zones by reaching gas thresholds.");
    tips.push("✨ Buy global multiplier upgrades for exponential growth!");
    tips.push("🖱️ Auto-clickers are essential for hands-free play.");
  } else if (ctx.zoneIdx < ctx.zoneMax) {
    tips.push("🚀 You're in the late game! Focus on expensive buildings.");
    tips.push("🧪 Lab upgrades unlock powerful building boosts.");
    tips.push("💠 Prestige resets progress but grants permanent bonuses!");
  } else {
    tips.push("🏁 You've reached The End! A cutscene awaits.");
    tips.push("💠 Reality Fracture zones unlock after the ending.");
    tips.push("🌀 Prestige now for powerful post-story bonuses!");
  }

  return tips[Math.floor(Math.random() * tips.length)];
}

function getTutorUpgradeAdvice(ctx) {
  if (ctx.upgradeBought === 0) {
    return "💨 Buy the 'Stronger Farts' upgrade first! It costs 100 gas and boosts your clicks.";
  }

  const unaffordable = UPGRADES.filter(
    (u) => !u.bought && G.gas < u.cost
  ).length;
  const canBuy = UPGRADES.filter((u) => !u.bought && G.gas >= u.cost).length;

  if (canBuy > 0) {
    return `✨ You can afford ${canBuy} upgrade(s) right now! Check the Upgrades tab.`;
  }

  if (unaffordable > 0) {
    return `🎯 Keep farming gas! You have ${unaffordable} upgrades to unlock. Global multipliers give huge boosts!`;
  }

  return "🏆 You've bought all upgrades! Focus on buildings and progression now.";
}

function getTutorBuildingAdvice(ctx) {
  const unowned = BUILDINGS.filter((b) => b.count === 0).length;
  const lowestOwned = BUILDINGS.filter((b) => b.count > 0).sort(
    (a, b) => a.count - b.count
  )[0];

  if (ctx.totalBuildings === 0) {
    return "🌱 Buy your first building! Bean Cursor (👆) is cheapest and a great start.";
  }

  if (unowned > 0) {
    return `🏭 You haven't unlocked all buildings yet! You need ${fmt(buildingCost(BUILDINGS.find((b) => b.count === 0)))} more gas for the next one.`;
  }

  return `🚀 Diversify! Your '${lowestOwned.name}' count is low. Boost it to increase production.`;
}

function getTutorZoneAdvice(ctx) {
  const currentZone = ALL_ZONES[ctx.zoneIdx] || "Unknown";
  const nextThreshold = zoneThresh(ctx.zoneIdx + 1);
  const gasNeeded = nextThreshold - ctx.gas;

  if (gasNeeded > 0) {
    const timeEst = (gasNeeded / (calcGPS() + 1)).toFixed(1);
    return `🌍 Current Zone: ${currentZone}\n⏱️ ~${timeEst}s to next zone at ${fmt(nextThreshold)} gas!`;
  }

  return `🎉 Advance to the next zone! You've met the gas threshold!`;
}

function getTutorPrestigeAdvice(ctx) {
  if (ctx.zoneIdx < THE_END_IDX) {
    return `🌀 Prestige unlocks at "The End…" (Zone 49). You're at Zone ${ctx.zoneIdx}!`;
  }

  if (ctx.prestige === 0) {
    return `🌀 Quantum Leap unlocked! Prestige resets your gas but grants +20% production per level. Strategy: farm prestige points for exponential growth!`;
  }

  return `💫 Each Prestige nets you +20% production. Keep prestiging for exponential scaling!`;
}

function getTutorClickAdvice(ctx) {
  const critChance = Math.round(G.critChance * 100);
  const dblChance = Math.round(G.dblChance * 100);

  let advice = `🎯 Your click power: ${G.clickPow}\n`;
  advice += `🎯 Crit chance: ${critChance}%\n`;
  advice += `💎 Double chance: ${dblChance}%`;

  if (critChance < 20) {
    advice += `\n⚡ Upgrade crit chance for massive damage spikes!`;
  }

  if (dblChance === 0) {
    advice += `\n💎 Double Tap is cheap and effective!`;
  }

  return advice;
}

function getTutorGeneralHelp(ctx) {
  const generalHelps = [
    "💡 Try asking about: upgrades, buildings, zones, prestige, or strategy!",
    "🌱 New? Start by clicking the bean and buying your first building!",
    "📈 Check your Stats (left panel) to track progress!",
    "🏆 Milestones and Achievements show your progress toward goals!",
    "💾 Your progress saves automatically. Reload to continue!",
  ];

  return generalHelps[Math.floor(Math.random() * generalHelps.length)];
}

// ═══════════════════════════════════════════════════════════════
// TUTOR UI HELPERS
// ═══════════════════════════════════════════════════════════════

function addTutorMessage(text, sender) {
  const messagesDiv = document.getElementById("tutorMessages");
  if (!messagesDiv) return;

  const msgEl = document.createElement("div");
  msgEl.style.cssText = `
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 0.75rem;
    line-height: 1.4;
    max-width: 100%;
    word-wrap: break-word;
  `;

  if (sender === "user") {
    msgEl.style.cssText += `
      background: rgba(140, 100, 220, 0.2);
      color: #b090f0;
      margin-left: auto;
      max-width: 85%;
      border-left: 2px solid #8070b0;
    `;
    msgEl.textContent = text;
  } else {
    msgEl.style.cssText += `
      background: rgba(78, 196, 110, 0.08);
      color: #dde0e8;
      margin-right: auto;
      max-width: 95%;
      border-left: 2px solid #4ec46e;
    `;
    msgEl.textContent = text;
  }

  messagesDiv.appendChild(msgEl);
}

function buildGameContext() {
  return `Gas: ${fmt(G.gas)}, GPS: ${fmt(calcGPS())}, Clicks: ${G.totalClicks}, Buildings: ${totalBuildings()}, Prestige: ${G.prestige}, Zone: ${G.zoneIdx}/${ALL_ZONES.length}`;
}

// ═══════════════════════════════════════════════════════════════
// API KEY MANAGEMENT (for Anthropic integration)
// ═══════════════════════════════════════════════════════════════

function setTutorAPIKey(key) {
  if (key && key.startsWith("sk-")) {
    TUTOR_CONFIG.apiKey = key;
    TUTOR_STATE.apiKeySet = true;
    localStorage.setItem("tutorAPIKey", key);
    toast("✅ Tutor API key set!", "good");
  } else {
    toast("❌ Invalid API key format. Must start with sk-", "bad");
  }
}

function loadTutorAPIKeyFromStorage() {
  const stored = localStorage.getItem("tutorAPIKey");
  if (stored) {
    TUTOR_CONFIG.apiKey = stored;
    TUTOR_STATE.apiKeySet = true;
  }
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

function initTutor() {
  loadTutorAPIKeyFromStorage();
  initTutorUI();
  toast("💡 AI Tutor ready! Click the 🤖 button in the bottom-right.", "ach");
}

// Call after page loads
window.addEventListener("load", () => {
  setTimeout(initTutor, 1000);
});
