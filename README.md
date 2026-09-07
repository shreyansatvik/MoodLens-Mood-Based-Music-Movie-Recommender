

# 🎭 MoodLens — Mood-Based Music & Movie Recommender

A real-time emotion detection system that uses a pre-trained deep learning model (VGG16) to recognize facial expressions via webcam, maps detected emotions to mood categories, and recommends personalized movies and music accordingly — all accessible through a Google Chrome extension.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Keywords](#keywords)
- [Architecture & System Design](#architecture--system-design)
- [Project Structure](#project-structure)
- [Implementation Details](#implementation-details)
  - [Emotion Detection Module](#1-emotion-detection-module)
  - [Recommendation Engine](#2-recommendation-engine)
  - [Flask REST API Backend](#3-flask-rest-api-backend)
  - [Chrome Extension Frontend](#4-chrome-extension-frontend)
- [Emotion-to-Mood Mapping](#emotion-to-mood-mapping)
- [Genre-to-Mood Mapping](#genre-to-mood-mapping)
- [Technical Core](#technical-core)
- [Walkthrough — Step-by-Step Execution](#walkthrough--step-by-step-execution)
- [API Reference](#api-reference)
- [Performance & Evaluation](#performance--evaluation)
- [Tech Stack & Dependencies](#tech-stack--dependencies)
- [Conclusion & Future Work](#conclusion--future-work)
- [References](#references)
- [Abbreviations](#abbreviations)

---

## Project Overview

### Abstract

MoodLens is a mood-based content recommendation system that bridges the gap between human emotion and digital entertainment. The system captures a live webcam frame via a Chrome browser extension, sends it to a local Flask backend, and uses a VGG16-based Convolutional Neural Network (CNN) trained on the FER-2013 facial expression dataset to classify the user's emotion into one of seven categories. The detected emotion is then mapped to a mood category (e.g., Happy, Sad, Energetic), which drives two parallel recommendation pipelines:

1. **Movie Recommendations** — Filtered from a preprocessed IMDb dataset of 660,000+ movies, sorted by average rating and tagged with mood labels derived from genre-to-mood mapping.
2. **Music Recommendations** — Fetched in real-time from the YouTube Data API v3, returning relevant music videos matching the detected mood.

The results are displayed in a premium glassmorphism-themed Chrome extension popup with live webcam preview, auto-detection intervals, tab-based movie/music views, and direct links to IMDb and YouTube.

### Purpose & Scope

- **Purpose**: Eliminate the decision fatigue of choosing what to watch or listen to by letting AI read facial expressions and suggest mood-appropriate content instantly.
- **Scope**: Local-first deployment with optional Hugging Face Spaces cloud backend. Designed as a mini-project demonstrating end-to-end integration of deep learning, REST APIs, and browser extension development.

---

## Keywords

`Facial Emotion Recognition` · `Transfer Learning` · `VGG16` · `Convolutional Neural Network (CNN)` · `FER-2013` · `Mood-Based Recommendation` · `Content Filtering` · `YouTube Data API` · `IMDb Dataset` · `Chrome Extension (Manifest V3)` · `Flask REST API` · `Real-Time Inference` · `TensorFlow / Keras`

---

## Architecture & System Design

```
┌──────────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION (Frontend)                   │
│  ┌──────────┐   ┌─────────────┐   ┌──────────┐   ┌──────────┐  │
│  │  Webcam   │──▶│ Capture JPEG│──▶│ POST to  │──▶│ Render   │  │
│  │  Preview  │   │ (base64)    │   │ Backend  │   │ Results  │  │
│  └──────────┘   └─────────────┘   └────┬─────┘   └──────────┘  │
│                                        │                         │
│  Auto-detect loop (10s–60s interval)   │                         │
│  Background service worker (Manifest V3)│                        │
└────────────────────────────────────────┼─────────────────────────┘
                                         │ HTTP (localhost:5000)
                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     FLASK BACKEND (Python)                       │
│                                                                  │
│  POST /detect-emotion                                            │
│  ┌─────────────┐   ┌──────────┐   ┌───────────────┐            │
│  │ Decode Base64│──▶│ Preprocess│──▶│ VGG16 Model   │            │
│  │ → PIL Image  │   │ → Resize  │   │ Inference     │            │
│  └─────────────┘   │ → Normalize│  │ → 7-class     │            │
│                     └──────────┘   │   softmax      │            │
│                                    └───────┬───────┘            │
│                                            ▼                     │
│                              ┌─────────────────────┐            │
│                              │ Emotion → Mood Map   │            │
│                              │ (Happy, Sad, ...)    │            │
│                              └─────────┬───────────┘            │
│                                        ▼                         │
│  POST /recommend                                                 │
│  ┌──────────────────┐   ┌──────────────────┐                    │
│  │ Movie Recommender │   │ Music Recommender │                   │
│  │ (IMDb CSV filter) │   │ (YouTube API)     │                   │
│  │ → Top 5 by rating │   │ → Top 3 videos    │                   │
│  └──────────────────┘   └──────────────────┘                    │
│                                                                  │
│  GET /health · GET /latest                                       │
└──────────────────────────────────────────────────────────────────┘
                    │                         │
                    ▼                         ▼
          ┌─────────────────┐     ┌─────────────────────┐
          │ dataset/         │     │ YouTube Data API v3  │
          │ emotion_model.h5 │     │ (google-api-python-  │
          │ preprodata.csv   │     │  client)             │
          └─────────────────┘     └─────────────────────┘
```

---

## Project Structure

```
MoodLens/
│
├── backend/                          # Flask REST API Backend
│   ├── app.py                        # Flask server — routes, CORS, lazy loading
│   ├── emotion_detector.py           # TensorFlow model loading & inference
│   ├── recommender.py                # Movie (IMDb CSV) & music (YouTube API) recommender
│   ├── requirements.txt              # Python dependencies
│   └── venv/                         # Python virtual environment
│
├── dataset/                          # Pre-trained Models & Preprocessed Data
│   ├── emotion_model.h5              # Full VGG16 emotion model (~88 MB)
│   ├── emotion_model.keras           # Keras-format model (fallback, ~7.5 MB)
│   └── preprodata.csv                # Preprocessed IMDb dataset (~40 MB, 660k+ movies)
│
├── extension/                        # Chrome Extension (Manifest V3)
│   ├── manifest.json                 # Extension manifest — permissions, icons, service worker
│   ├── popup.html                    # Main UI — webcam, buttons, results area
│   ├── popup.css                     # Premium glassmorphism dark theme (~356 lines)
│   ├── popup.js                      # Webcam capture, API calls, dynamic rendering (~448 lines)
│   ├── background.js                 # Service worker — periodic background detection
│   └── icons/                        # Extension icons (16, 32, 48, 128 px)
│
├── start_backend.bat                 # One-click backend startup script (Windows)
├── pyrightconfig.json                # IDE type-checking configuration
└── README.md                         # This file
```

---

## Implementation Details

### 1. Emotion Detection Module

**File**: `backend/emotion_detector.py`

#### Model Architecture
- **Base Model**: VGG16 (pre-trained on ImageNet)
- **Transfer Learning**: Base layers frozen, custom Dense head added
- **Training Dataset**: FER-2013 (Facial Expression Recognition)
  - 7 emotion classes: Angry, Disgusted, Fearful, Happy, Neutral, Sad, Surprised
  - Images augmented with rotation, shifting, zoom, and horizontal flip
- **Model File**: `emotion_model.h5` (~88 MB) — contains the full VGG16 + Dense head pipeline
- **Input Shape**: Dynamically detected from model (typically 224×224×3 for VGG16)

#### Preprocessing Pipeline
1. **Decode**: Base64 string → raw bytes → PIL Image
2. **Convert**: Greyscale (1-channel) or RGB (3-channel) based on model input shape
3. **Resize**: Bilinear interpolation to model's expected dimensions (224×224)
4. **Normalize**: Pixel values scaled to [0, 1] range (`/255.0`)
5. **Expand**: Add batch dimension → shape `(1, H, W, C)`

#### Inference
- Model outputs a 7-element softmax probability vector
- Predicted class = `argmax(predictions)`
- Returns: `{ emotion, mood, emoji, confidence }`

### 2. Recommendation Engine

**File**: `backend/recommender.py`

#### Movie Recommendations
- **Data Source**: `preprodata.csv` — preprocessed from raw IMDb TSV files
  - Contains: `tconst`, `primaryTitle`, `startYear`, `genres`, `mood_tag`, `averageRating`, `numVotes`
  - Pre-filtered at startup: only movies with `averageRating ≥ 6.0`
- **Algorithm**:
  1. Filter movies where `mood_tag` contains the detected mood (case-insensitive substring match)
  2. Sort by `averageRating` descending
  3. Take top 50, then randomly sample 5 for variety
  4. Return: `{ title, year, rating, imdb_url, mood, colour }`

#### Music Recommendations
- **Data Source**: YouTube Data API v3 (real-time)
- **Algorithm**:
  1. Map mood to a curated search query (e.g., Happy → "happy feel good songs playlist 2024")
  2. Search YouTube for `type=video`, `videoCategoryId=10` (Music)
  3. Return top 3 results: `{ title, channel, thumbnail, link, video_id }`

### 3. Flask REST API Backend

**File**: `backend/app.py`

| Endpoint | Method | Input | Output |
|----------|--------|-------|--------|
| `/health` | GET | — | `{ "status": "ok" }` |
| `/detect-emotion` | POST | `{ "image": "<base64>" }` | `{ "emotion", "mood", "emoji", "confidence" }` |
| `/recommend` | POST | `{ "mood": "Happy" }` | `{ "mood", "movies": [...], "music": [...] }` |
| `/latest` | GET | — | Last cached recommendation result |

**Design Decisions**:
- **Lazy Loading**: Heavy modules (TensorFlow, pandas) loaded on first use, not at import time
- **CORS Enabled**: Allows Chrome extension cross-origin requests
- **In-Memory Cache**: `/latest` returns last recommendation without recomputation
- **Graceful Degradation**: Server starts even if one module (e.g., TensorFlow) fails to load

### 4. Chrome Extension Frontend

**Files**: `extension/popup.html`, `popup.css`, `popup.js`, `background.js`

#### UI Design
- **Theme**: Premium glassmorphism dark UI
  - Deep navy/dark purple gradient background (`#0d0f1a`)
  - Translucent frosted-glass cards with `backdrop-filter: blur()`
  - Mood-adaptive accent colors (Happy → Gold, Sad → Blue, Energetic → Red)
- **Typography**: Inter font (Google Fonts)
- **Animations**: Card slide-in, skeleton loading shimmer, scanning ring, badge pulse

#### Key Features
- Live webcam preview (mirrored) with start/stop controls
- **Auto-detect mode**: Configurable interval (10s, 15s, 30s, 60s)
- **Manual detect**: "Detect Now" button with spinner state
- Mood banner with emoji, confidence %, and timestamp
- Tabbed results: 🎬 Movies / 🎵 Music
- Movie cards with IMDb rating + direct IMDb link
- Music cards with YouTube thumbnail + direct YouTube link
- **Background service worker**: Continues detection even when popup is closed
- **Persistent state**: Results cached in `chrome.storage.local`
- Backend auto-discovery: tries Hugging Face Space first, falls back to `localhost:5000`

---

## Emotion-to-Mood Mapping

The 7 FER-2013 emotion classes are mapped to 5 mood categories used by the recommendation engine:

| Detected Emotion | Mood Category | UI Accent Color | Emoji |
|:-----------------|:-------------|:----------------|:------|
| Happy | Happy | `#FFD700` (Gold) | 😄 |
| Surprised | Happy | `#FFD700` (Gold) | 😲 |
| Sad | Sad | `#4A90D9` (Blue) | 😢 |
| Disgusted | Sad | `#4A90D9` (Blue) | 🤢 |
| Angry | Energetic | `#FF4500` (Red) | 😠 |
| Fearful | Suspenseful | `#6A0DAD` (Purple) | 😨 |
| Neutral | Reflective | `#546E7A` (Grey) | 😐 |

---

## Genre-to-Mood Mapping

The IMDb dataset was preprocessed using the following genre-to-mood rule mapping:

| IMDb Genre | Assigned Mood | IMDb Genre | Assigned Mood |
|:-----------|:-------------|:-----------|:-------------|
| Comedy | Happy | Animation | Relaxed |
| Musical | Happy | Family | Relaxed |
| Drama | Sad | Fantasy | Relaxed |
| War | Sad | Documentary | Reflective |
| Action | Energetic | History | Reflective |
| Adventure | Energetic | Biography | Reflective |
| Sci-Fi | Energetic | Romance | Romantic |
| Western | Energetic | Horror | Suspenseful |
| Sport | Energetic | Thriller | Suspenseful |
| | | Crime | Suspenseful |
| | | Mystery | Suspenseful |

---

## Technical Core

### Key Equations

#### VGG16 Transfer Learning

The emotion model uses frozen VGG16 convolutional layers as a feature extractor with a custom classification head:

```
Input Image (224×224×3)
       ↓
VGG16 Convolutional Blocks (frozen, pre-trained on ImageNet)
       ↓
Flatten → Dense(256, ReLU) → Dropout(0.5) → Dense(7, Softmax)
       ↓
Output: P(emotion_i) for i ∈ {0..6}
```

#### Prediction & Confidence

```
predicted_class = argmax(softmax_output)
confidence = softmax_output[predicted_class] × 100
```

#### Image Preprocessing

```
normalized_pixel = raw_pixel_value / 255.0
output_shape = (1, 224, 224, 3)   # (batch, height, width, channels)
```

#### Movie Scoring

Movies are ranked by a simple rating-based approach:
```
filtered = df[df["mood_tag"].contains(mood)]
ranked   = filtered.sort_by("averageRating", descending=True)
result   = random_sample(ranked[:50], k=5)   # variability for freshness
```

### VGG16 vs. Simpler CNNs

| Aspect | Simple CNN | VGG16 (Transfer Learning) |
|--------|-----------|--------------------------|
| Training Data Needed | Large | Small (FER-2013 suffices) |
| Feature Extraction | Learned from scratch | Pre-trained on ImageNet (14M images) |
| Architecture | Custom design | Fixed 16-layer proven architecture |
| Accuracy on FER-2013 | ~55–65% | ~70–75% (with fine-tuning) |
| Model Size | ~1–5 MB | ~88 MB |

---

## Walkthrough — Step-by-Step Execution

### Prerequisites
- Python 3.10+ installed and on PATH
- Google Chrome browser
- Windows OS (for `.bat` script)

### Step 1: Start the Backend Server

**Option A — One-Click (Recommended):**
Double-click `start_backend.bat` in the project root. It will:
1. Create a Python virtual environment (first run only)
2. Install all dependencies from `requirements.txt`
3. Load the VGG16 emotion model (~10 seconds)
4. Load the IMDb movie dataset (~5 seconds)
5. Start Flask on `http://localhost:5000`

**Option B — Manual:**
```powershell
cd "path\to\MINI PROJECT\backend"
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

**Expected Output:**
```
[Server] Pre-loading emotion detector...
[EmotionDetector] Loading emotion model...
[EmotionDetector] Loaded full model from emotion_model.h5
[EmotionDetector] Model input shape: (None, 224, 224, 3)
[Server] Emotion detector ready.
[Server] Pre-loading recommender...
[Recommender] Loading movie dataset...
[Recommender] Dataset ready — XXXXX rated movies loaded.
[Server] Recommender ready.
=======================================================
  MoodLens Backend  —  http://localhost:5000
=======================================================
```

### Step 2: Install the Chrome Extension

1. Open Chrome → navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `extension/` folder
5. Pin the MoodLens extension to the toolbar

### Step 3: Use the Extension

1. Click the MoodLens icon → popup opens
2. Verify the **green dot** shows "Local backend live"
3. Click **▶ Start Camera** → allow camera permission
4. Click **🔍 Detect Now** (or wait for auto-detect)
5. The mood banner appears with your detected emotion
6. Browse **🎬 Movies** and **🎵 Music** tabs
7. Click **IMDb ↗** to view movie details or **▶ YT** to play music

### Data Flow

```
[User Face] → Webcam → Canvas (JPEG base64) → POST /detect-emotion
    → VGG16 Inference → { emotion: "Happy", mood: "Happy", confidence: 92.1 }
    → POST /recommend { mood: "Happy" }
    → { movies: [5 top-rated Happy movies], music: [3 YouTube results] }
    → Rendered in popup with mood-colored UI
```

---

## API Reference

### `GET /health`
Health check endpoint. Extension polls this to confirm backend availability.

**Response**: `200 OK`
```json
{ "status": "ok" }
```

### `POST /detect-emotion`
Detects facial emotion from a base64-encoded webcam frame.

**Request Body**:
```json
{ "image": "data:image/jpeg;base64,/9j/4AAQSkZ..." }
```

**Response**: `200 OK`
```json
{
  "emotion": "Happy",
  "mood": "Happy",
  "emoji": "😄",
  "confidence": 92.1
}
```

### `POST /recommend`
Returns movie and music recommendations for a given mood.

**Request Body**:
```json
{ "mood": "Happy" }
```

**Response**: `200 OK`
```json
{
  "mood": "Happy",
  "movies": [
    {
      "title": "The Shawshank Redemption",
      "year": "1994",
      "rating": 9.3,
      "imdb_url": "https://www.imdb.com/title/tt0111161/",
      "mood": "Happy",
      "colour": "#FFD700"
    }
  ],
  "music": [
    {
      "title": "Happy - Pharrell Williams",
      "channel": "PharrellWilliamsVEVO",
      "thumbnail": "https://i.ytimg.com/vi/...",
      "link": "https://www.youtube.com/watch?v=...",
      "video_id": "..."
    }
  ]
}
```

### `GET /latest`
Returns the last cached recommendation without recomputation.

---

## Performance & Evaluation

### Model Performance (VGG16 on FER-2013)

| Metric | Value |
|--------|-------|
| **Training Approach** | Transfer Learning (VGG16, ImageNet weights) |
| **Dataset** | FER-2013 (35,887 grayscale 48×48 images, 7 classes) |
| **Input Resolution** | Upscaled to 224×224×3 (VGG16 requirement) |
| **Optimizer** | Adam |
| **Loss Function** | Categorical Cross-Entropy |
| **Early Stopping** | `patience=5`, monitoring `val_loss` |
| **Expected Accuracy** | ~70–75% (typical for VGG16 on FER-2013) |

### System Performance

| Component | Metric | Value |
|-----------|--------|-------|
| Model loading | Startup time | ~8–12 seconds |
| CSV loading | Startup time | ~3–5 seconds |
| Emotion inference | Per-frame latency | ~200–400 ms |
| Movie filtering | Per-request | < 50 ms |
| YouTube API | Per-request | ~300–800 ms |
| Total pipeline | End-to-end (detect + recommend) | ~1–2 seconds |

---

## Tech Stack & Dependencies

### Backend

| Package | Version | Purpose |
|---------|---------|---------|
| Flask | latest | REST API server |
| Flask-CORS | latest | Cross-origin request support |
| TensorFlow | < 2.16 | Deep learning framework (VGG16 model) |
| NumPy | latest | Array operations, image preprocessing |
| Pillow (PIL) | latest | Image decoding and resizing |
| Pandas | latest | IMDb CSV dataset loading and filtering |
| google-api-python-client | latest | YouTube Data API v3 integration |

### Frontend (Chrome Extension)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Chrome Manifest V3 | 3 | Extension platform |
| HTML5 / CSS3 / ES6 | — | UI structure, styling, logic |
| Inter (Google Fonts) | latest | Typography |
| `getUserMedia` API | — | Webcam access |
| `chrome.storage` API | — | Persistent state storage |
| `chrome.alarms` API | — | Background periodic detection |

---

## Conclusion & Future Work

### Conclusion

MoodLens demonstrates a successful end-to-end integration of deep learning-based facial emotion recognition with real-time content recommendation. The system:

- Accurately classifies 7 facial emotions using VGG16 transfer learning
- Maps emotions to intuitive mood categories for content filtering
- Delivers personalized movie and music recommendations in under 2 seconds
- Provides a polished, responsive Chrome extension UI with glassmorphism design
- Supports both local and cloud (Hugging Face Spaces) deployment

### Future Work

- **Model Improvements**: Fine-tune with unfrozen VGG16 layers or switch to EfficientNet/MobileNet for faster inference
- **Multi-Face Detection**: Use face detection (MTCNN/MediaPipe) to isolate faces before emotion classification
- **Sentiment Fusion**: Combine facial expression with text sentiment (from browsing context) for more robust mood detection
- **Recommendation Enhancement**: Implement collaborative filtering or content-based filtering using user watch history
- **Platform Expansion**: Port to Firefox extension, mobile app (React Native), or standalone Electron app
- **Privacy**: Implement on-device inference using TensorFlow.js to eliminate backend dependency
- **Streaming Platform Integration**: Direct integration with Netflix, Spotify, or Apple Music APIs

---

## References

1. **FER-2013 Dataset** — I.J. Goodfellow et al., "Challenges in Representation Learning: A Report on Three Machine Learning Contests," *Neural Information Processing*, 2013.
2. **VGG16 Architecture** — K. Simonyan and A. Zisserman, "Very Deep Convolutional Networks for Large-Scale Image Recognition," *ICLR*, 2015.
3. **Transfer Learning for FER** — D. Saha, "Facial Emotion Recognition using Transfer Learning," *arXiv*, 2021.
4. **IMDb Datasets** — IMDb Non-Commercial Datasets, https://datasets.imdbws.com/
5. **YouTube Data API v3** — Google Developers, https://developers.google.com/youtube/v3
6. **Chrome Extensions Manifest V3** — Google Chrome Developers, https://developer.chrome.com/docs/extensions/mv3/
7. **Flask Web Framework** — Pallets Projects, https://flask.palletsprojects.com/
8. **TensorFlow / Keras** — M. Abadi et al., "TensorFlow: A System for Large-Scale Machine Learning," *OSDI*, 2016.

---

## Abbreviations

| Abbreviation | Full Form |
|:-------------|:----------|
| **API** | Application Programming Interface |
| **CNN** | Convolutional Neural Network |
| **CORS** | Cross-Origin Resource Sharing |
| **CSV** | Comma-Separated Values |
| **FER** | Facial Expression Recognition |
| **HF** | Hugging Face |
| **IMDb** | Internet Movie Database |
| **JPEG** | Joint Photographic Experts Group |
| **REST** | Representational State Transfer |
| **UI** | User Interface |
| **VGG** | Visual Geometry Group (Oxford) |
| **YT** | YouTube |

---

<p align="center">
  <strong>MoodLens</strong> • Built with ❤️ at RAIT<br/>
  AI-Powered Mood-Based Music & Movie Recommender
</p>
