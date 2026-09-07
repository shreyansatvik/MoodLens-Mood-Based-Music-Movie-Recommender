/* ══════════════════════════════════════════════════════
   MoodLens — popup.js
   Handles: webcam, continuous auto-detection, API calls,
            dynamic UI rendering with live working links.
   ════════════════════════════════════════════════════ */

// ── Backend URL ───────────────────────────────────────────────────────────────
// Replace HF_BACKEND with your actual Hugging Face Space URL once deployed.
// The extension auto-detects: HF Space first → falls back to localhost:5000.
const HF_BACKEND    = "https://YOUR_HF_USERNAME-YOUR_SPACE_NAME.hf.space";
const LOCAL_BACKEND = "http://localhost:5000";

let _resolvedBackend = null; // cached after first successful probe

async function resolveBackend() {
  if (_resolvedBackend) return _resolvedBackend;
  // Try HF first (skip if still a placeholder)
  const isPlaceholder = HF_BACKEND.includes("YOUR_HF_USERNAME");
  if (!isPlaceholder) {
    try {
      const res = await fetch(`${HF_BACKEND}/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) { _resolvedBackend = HF_BACKEND; return HF_BACKEND; }
    } catch { /* fall through */ }
  }
  // Fall back to localhost
  _resolvedBackend = LOCAL_BACKEND;
  return LOCAL_BACKEND;
}

// DOM refs
const video            = document.getElementById("video");
const canvas           = document.getElementById("canvas");
const btnStart         = document.getElementById("btnStart");
const btnStop          = document.getElementById("btnStop");
const btnDetectNow     = document.getElementById("btnDetectNow");
const camPlaceholder   = document.getElementById("camPlaceholder");
const emotionOverlay   = document.getElementById("emotionOverlay");
const overlayEmoji     = document.getElementById("overlayEmoji");
const overlayLabel     = document.getElementById("overlayLabel");
const scanRing         = document.getElementById("scanRing");
const moodBanner       = document.getElementById("moodBanner");
const moodEmoji        = document.getElementById("moodEmoji");
const moodName         = document.getElementById("moodName");
const confidenceTag    = document.getElementById("confidenceTag");
const updatedTag       = document.getElementById("updatedTag");
const tabs             = document.getElementById("tabs");
const resultsArea      = document.getElementById("resultsArea");
const emptyState       = document.getElementById("emptyState");
const movieList        = document.getElementById("movieList");
const musicList        = document.getElementById("musicList");
const autoDetectToggle = document.getElementById("autoDetectToggle");
const intervalSelect   = document.getElementById("intervalSelect");
const intervalLabel    = document.getElementById("intervalLabel");
const statusDot        = document.getElementById("statusDot").querySelector(".dot");
const statusLabel      = document.getElementById("statusLabel");
const footerUpdate     = document.getElementById("footerUpdate");
const btnRefreshMovies = document.getElementById("btnRefreshMovies");
const btnRefreshMusic  = document.getElementById("btnRefreshMusic");

// State
let stream            = null;
let autoDetectTimer   = null;
let currentMood       = null;
let isDetecting       = false;
let autoDetectEnabled = true;
let detectInterval    = 15; // seconds

// ── Mood colour map ────────────────────────────────────────────────────────────
const MOOD_COLORS = {
  Happy:       "#FFD700",
  Sad:         "#4A90D9",
  Energetic:   "#FF4500",
  Suspenseful: "#9B59B6",
  Reflective:  "#546E7A",
  Romantic:    "#FF6B8A",
  Relaxed:     "#2ECC71",
};

// ══════════════════════════════════════════════════════
//  Backend health check
// ══════════════════════════════════════════════════════
async function checkBackend() {
  try {
    const backend = await resolveBackend();
    const res = await fetch(`${backend}/health`, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      statusDot.className     = "dot online";
      statusLabel.textContent = backend.includes("localhost") ? "Local backend live" : "HF backend live";
      return true;
    }
  } catch {
    _resolvedBackend = null; // reset so next call re-probes
  }
  statusDot.className     = "dot offline";
  statusLabel.textContent = "Backend offline";
  return false;
}

// ══════════════════════════════════════════════════════
//  Camera
// ══════════════════════════════════════════════════════
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    video.srcObject = stream;
    video.classList.add("active");
    camPlaceholder.style.display = "none";

    btnStart.style.display     = "none";
    btnStop.style.display      = "flex";
    btnDetectNow.style.display = "flex";

    // Load stored recommendations instantly if available
    await loadStoredRec();

    // Start auto-detect loop if enabled
    scheduleAutoDetect();
  } catch (err) {
    showNudge("Camera access denied. Please allow camera for this extension.");
  }
}

function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  video.srcObject = null;
  video.classList.remove("active");
  camPlaceholder.style.display = "flex";
  emotionOverlay.style.display = "none";
  scanRing.style.display       = "none";

  btnStart.style.display     = "flex";
  btnStop.style.display      = "none";
  btnDetectNow.style.display = "none";

  clearTimeout(autoDetectTimer);
}

// ══════════════════════════════════════════════════════
//  Capture + Detect
// ══════════════════════════════════════════════════════
function captureFrame() {
  const ctx = canvas.getContext("2d");
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  // Mirror to match display
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function detectAndRecommend() {
  if (!stream || isDetecting) return;
  isDetecting = true;

  // Visual: show scanning ring
  scanRing.style.display = "block";
  setDetectBtnSpinner(true);

  const alive = await checkBackend();
  if (!alive) { resetDetectState(); return; }

  try {
    const frame = captureFrame();

    // Save frame for background service worker
    chrome.storage.local.set({ lastFrame: frame });

    // ── Emotion detection ────────────────────────────
    const backend = await resolveBackend();
    const emRes = await fetch(`${backend}/detect-emotion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: frame }),
    });
    const emData = await emRes.json();
    if (!emData.emotion) throw new Error("No emotion returned");

    showEmotionOverlay(emData);
    updateMoodBanner(emData);

    const mood = emData.mood;
    currentMood = mood;

    // ── Recommendations ──────────────────────────────
    showSkeletons();

    const recRes = await fetch(`${backend}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood }),
    });
    const recData = await recRes.json();

    // Persist to storage so BG worker picks it up
    chrome.storage.local.set({
      latestEmotion: emData,
      latestRec:     recData,
      lastUpdated:   Date.now(),
    });

    renderMovies(recData.movies || []);
    renderMusic(recData.music  || []);
    showResultsArea();

    footerUpdate.textContent = "Updated " + timeAgo(Date.now());

  } catch (err) {
    console.error("[MoodLens] Detection error:", err);
    showNudge("Detection failed. Is the backend running?");
  } finally {
    resetDetectState();
  }
}

function resetDetectState() {
  isDetecting            = false;
  scanRing.style.display = "none";
  setDetectBtnSpinner(false);
  scheduleAutoDetect(); // reschedule next auto run
}

// ══════════════════════════════════════════════════════
//  Auto-detect loop
// ══════════════════════════════════════════════════════
function scheduleAutoDetect() {
  clearTimeout(autoDetectTimer);
  if (!autoDetectEnabled || !stream) return;
  autoDetectTimer = setTimeout(detectAndRecommend, detectInterval * 1000);
}

// ══════════════════════════════════════════════════════
//  Load stored recommendations on popup open
// ══════════════════════════════════════════════════════
async function loadStoredRec() {
  const data = await chrome.storage.local.get(["latestEmotion", "latestRec", "lastUpdated"]);
  if (data.latestEmotion && data.latestRec) {
    showEmotionOverlay(data.latestEmotion);
    updateMoodBanner(data.latestEmotion, data.lastUpdated);
    renderMovies(data.latestRec.movies || []);
    renderMusic(data.latestRec.music   || []);
    showResultsArea();
    currentMood = data.latestEmotion.mood;
    footerUpdate.textContent = "Updated " + timeAgo(data.lastUpdated);
  }
}

// ══════════════════════════════════════════════════════
//  UI helpers
// ══════════════════════════════════════════════════════
function showEmotionOverlay(em) {
  overlayEmoji.textContent  = em.emoji  || "🙂";
  overlayLabel.textContent  = em.emotion || "Unknown";
  emotionOverlay.style.display = "flex";
}

function updateMoodBanner(em, ts) {
  const mood   = em.mood    || "Unknown";
  const colour = MOOD_COLORS[mood] || "#7c6af7";

  moodEmoji.textContent       = em.emoji || "🙂";
  moodName.textContent        = mood;
  confidenceTag.textContent   = `${em.confidence || 0}%`;
  updatedTag.textContent      = ts ? timeAgo(ts) : "just now";
  moodBanner.style.display    = "flex";
  moodBanner.style.borderColor = colour;
  moodBanner.style.boxShadow  = `0 0 20px ${colour}30`;

  // Propagate mood colour to CSS var
  document.documentElement.style.setProperty("--mood-color", colour);
  scanRing.style.borderTopColor = colour;
}

function showResultsArea() {
  emptyState.style.display    = "none";
  tabs.style.display          = "flex";
  resultsArea.style.display   = "block";
}

function showSkeletons() {
  movieList.innerHTML = Array(5).fill(0).map((_, i) =>
    `<div class="movie-card" style="animation-delay:${i*60}ms">
       <div class="movie-rank skeleton" style="width:24px;height:24px;border-radius:4px;"></div>
       <div class="movie-info">
         <div class="skeleton" style="height:13px;width:70%;margin-bottom:5px;"></div>
         <div class="skeleton" style="height:10px;width:40%;"></div>
       </div>
     </div>`
  ).join("");

  musicList.innerHTML = Array(3).fill(0).map((_, i) =>
    `<div class="music-card" style="animation-delay:${i*80}ms">
       <div class="music-thumb skeleton"></div>
       <div class="music-info">
         <div class="skeleton" style="height:12px;width:80%;margin-bottom:5px;"></div>
         <div class="skeleton" style="height:10px;width:50%;"></div>
       </div>
     </div>`
  ).join("");
}

function renderMovies(movies) {
  if (!movies.length) {
    movieList.innerHTML = `<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px">No movies found for this mood.</p>`;
    return;
  }
  movieList.innerHTML = movies.map((m, i) => `
    <div class="movie-card" style="animation-delay:${i*60}ms">
      <div class="movie-rank">${i + 1}</div>
      <div class="movie-info">
        <div class="movie-title" title="${esc(m.title)}">${esc(m.title)}</div>
        <div class="movie-meta">
          ${m.year} &nbsp;•&nbsp;
          <span class="star">★</span>
          <span class="movie-rating">${m.rating}</span>
        </div>
      </div>
      <a class="watch-btn" href="${esc(m.imdb_url)}" target="_blank" rel="noopener">
        IMDb ↗
      </a>
    </div>
  `).join("");
}

function renderMusic(tracks) {
  if (!tracks.length) {
    musicList.innerHTML = `<p style="color:var(--text-dim);font-size:13px;text-align:center;padding:20px">No music found — check your YouTube API quota.</p>`;
    return;
  }
  musicList.innerHTML = tracks.map((t, i) => `
    <a class="music-card" href="${esc(t.link)}" target="_blank" rel="noopener" style="animation-delay:${i*80}ms">
      <img class="music-thumb" src="${esc(t.thumbnail)}" alt="" onerror="this.style.display='none'" />
      <div class="music-info">
        <div class="music-title"  title="${esc(t.title)}">${esc(t.title)}</div>
        <div class="music-channel">${esc(t.channel)}</div>
      </div>
      <span class="yt-badge">▶ YT</span>
    </a>
  `).join("");
}

function setDetectBtnSpinner(on) {
  btnDetectNow.innerHTML = on
    ? `<div class="spinner"></div> Detecting…`
    : `<span class="btn-icon">🔍</span> Detect Now`;
  btnDetectNow.disabled = on;
}

function showNudge(msg) {
  // Remove any existing nudge
  document.querySelectorAll(".nudge").forEach(n => n.remove());
  const el = document.createElement("div");
  el.className    = "nudge";
  el.textContent  = msg;
  document.body.insertBefore(el, document.querySelector(".footer"));
  setTimeout(() => el.remove(), 5000);
}

function esc(str) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5)  return "just now";
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff/60)}m ago`;
}

// ══════════════════════════════════════════════════════
//  Tab switching
// ══════════════════════════════════════════════════════
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel" + capitalise(tab.dataset.tab)).classList.add("active");
  });
});
function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ══════════════════════════════════════════════════════
//  Refresh buttons (re-fetch same mood)
// ══════════════════════════════════════════════════════
btnRefreshMovies.addEventListener("click", async () => {
  if (!currentMood) return;
  btnRefreshMovies.style.transform = "rotate(360deg)";
  setTimeout(() => btnRefreshMovies.style.transform = "", 400);
  showSkeletons();
  try {
    const res = await fetch(`${await resolveBackend()}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood: currentMood }),
    });
    const d = await res.json();
    renderMovies(d.movies || []);
    renderMusic(d.music   || []);
  } catch { showNudge("Refresh failed — backend may be offline."); }
});

btnRefreshMusic.addEventListener("click", () => btnRefreshMovies.click());

// ══════════════════════════════════════════════════════
//  Auto-detect controls
// ══════════════════════════════════════════════════════
autoDetectToggle.addEventListener("change", () => {
  autoDetectEnabled = autoDetectToggle.checked;
  if (autoDetectEnabled) scheduleAutoDetect();
  else clearTimeout(autoDetectTimer);
});

intervalSelect.addEventListener("change", () => {
  detectInterval = parseInt(intervalSelect.value, 10);
  intervalLabel.textContent = intervalSelect.value + "s";
  clearTimeout(autoDetectTimer);
  scheduleAutoDetect();
});

// ══════════════════════════════════════════════════════
//  Button listeners
// ══════════════════════════════════════════════════════
btnStart.addEventListener("click",      startCamera);
btnStop.addEventListener("click",       stopCamera);
btnDetectNow.addEventListener("click",  detectAndRecommend);

// ══════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════
(async () => {
  await checkBackend();
  // Try to load any cached results from previous session
  await loadStoredRec();

  // Update footer timestamp every 30 s
  setInterval(() => {
    chrome.storage.local.get("lastUpdated").then(d => {
      if (d.lastUpdated) footerUpdate.textContent = "Updated " + timeAgo(d.lastUpdated);
    });
  }, 30_000);
})();
