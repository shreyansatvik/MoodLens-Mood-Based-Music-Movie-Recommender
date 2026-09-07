// background.js — MoodLens Service Worker
// Keeps the emotion detection pipeline running continuously even when popup is closed.

// Replace HF_BACKEND with your actual Hugging Face Space URL once deployed.
const HF_BACKEND    = "https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space";
const LOCAL_BACKEND = "http://localhost:5000";
const DETECT_INTERVAL_SECONDS = 15;

let _resolvedBackend = null;
async function resolveBackend() {
  if (_resolvedBackend) return _resolvedBackend;
  const isPlaceholder = HF_BACKEND.includes("YOUR_HF_USERNAME");
  if (!isPlaceholder) {
    try {
      const res = await fetch(`${HF_BACKEND}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) { _resolvedBackend = HF_BACKEND; return HF_BACKEND; }
    } catch { /* fall through */ }
  }
  _resolvedBackend = LOCAL_BACKEND;
  return LOCAL_BACKEND;
}

// ── Alarm: triggers periodic detection ────────────────────────────────────────
chrome.alarms.create("moodDetect", { periodInMinutes: DETECT_INTERVAL_SECONDS / 60 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "moodDetect") return;

  // Check if backend is alive before doing anything
  try {
    const BACKEND = await resolveBackend();
    const health = await fetch(`${BACKEND}/health`);
    if (!health.ok) return;
  } catch {
    return;
  }

  // Read the last captured frame from storage (popup writes it)
  const { lastFrame } = await chrome.storage.local.get("lastFrame");
  if (!lastFrame) return;

  try {
    const BACKEND = await resolveBackend();
    // Detect emotion from stored frame
    const emRes = await fetch(`${BACKEND}/detect-emotion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: lastFrame }),
    });
    const emData = await emRes.json();
    if (!emData.mood) return;

    // Get recommendations for the detected mood
    const recRes = await fetch(`${BACKEND}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood: emData.mood }),
    });
    const recData = await recRes.json();

    // Store latest result — popup will read this on open
    await chrome.storage.local.set({
      latestEmotion: emData,
      latestRec: recData,
      lastUpdated: Date.now(),
    });

    // Badge shows current mood emoji
    chrome.action.setBadgeText({ text: emData.emoji || "🎭" });
    chrome.action.setBadgeBackgroundColor({ color: moodColor(emData.mood) });

  } catch (e) {
    console.error("[MoodLens BG] Detection cycle failed:", e);
  }
});

function moodColor(mood) {
  const map = {
    Happy:       "#FFD700",
    Sad:         "#4A90D9",
    Energetic:   "#FF4500",
    Suspenseful: "#6A0DAD",
    Reflective:  "#546E7A",
    Romantic:    "#FF6B8A",
    Relaxed:     "#2ECC71",
  };
  return map[mood] || "#888888";
}
