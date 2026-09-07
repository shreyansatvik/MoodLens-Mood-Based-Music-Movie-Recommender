import sys
import os

# ── Ensure the backend directory is on sys.path so sibling modules resolve ─────
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback

app = Flask(__name__)
CORS(app)  # Allow Chrome extension to call these endpoints

# ── Lazy-load heavy modules ────────────────────────────────────────────────────
_emotion_module = None
_recommender_module = None


def _get_emotion_module():
    global _emotion_module
    if _emotion_module is None:
        import emotion_detector
        _emotion_module = emotion_detector
    return _emotion_module


def _get_recommender_module():
    global _recommender_module
    if _recommender_module is None:
        import recommender
        _recommender_module = recommender
    return _recommender_module


# ── In-memory cache of latest recommendation (mood + results) ─────────────────
_cache = {"mood": None, "movies": [], "music": []}


@app.route("/health", methods=["GET"])
def health():
    """Simple health check — extension polls this to confirm backend is alive."""
    return jsonify({"status": "ok"})


@app.route("/detect-emotion", methods=["POST"])
def detect_emotion():
    """
    Expects JSON body: { "image": "<base64 JPEG/PNG data URI or raw base64>" }
    Returns: { "emotion", "mood", "emoji", "confidence" }
    """
    try:
        data = request.get_json(force=True)
        if not data or "image" not in data:
            return jsonify({"error": "Missing 'image' field"}), 400

        em = _get_emotion_module()
        result = em.predict_emotion(data["image"])
        return jsonify(result)

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Emotion detection failed"}), 500


@app.route("/recommend", methods=["POST"])
def recommend():
    """
    Expects JSON body: { "mood": "Happy" }
    Returns: { "movies": [...], "music": [...], "mood": "Happy" }
    Caches last result so /latest can serve it cheaply.
    """
    try:
        data = request.get_json(force=True)
        mood = data.get("mood", "Reflective")

        rec = _get_recommender_module()
        movies = rec.recommend_movies(mood, n=5)
        music  = rec.get_music(mood, max_results=3)

        _cache["mood"]   = mood
        _cache["movies"] = movies
        _cache["music"]  = music

        return jsonify({"mood": mood, "movies": movies, "music": music})

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Recommendation failed"}), 500


@app.route("/latest", methods=["GET"]) 
def latest():
    """
    Returns the most recently cached recommendation without re-computing.
    Used by the extension when it just wants to refresh the display.
    """
    return jsonify(_cache)


if __name__ == "__main__":
    # Pre-load heavy modules at startup so we know early if something is broken
    print("[Server] Pre-loading emotion detector...")
    try:
        _get_emotion_module()
        print("[Server] Emotion detector ready.")
    except Exception as e:
        print(f"[Server] WARNING: Failed to load emotion detector: {e}")

    print("[Server] Pre-loading recommender...")
    try:
        _get_recommender_module()
        print("[Server] Recommender ready.")
    except Exception as e:
        print(f"[Server] WARNING: Failed to load recommender: {e}")

    print("=" * 55)
    print("  MoodLens Backend  —  http://localhost:5000")
    print("=" * 55)
    app.run(host="0.0.0.0", port=5000, debug=False)
