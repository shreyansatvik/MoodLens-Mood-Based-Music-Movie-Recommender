import numpy as np
import base64
import io
import os
from PIL import Image
import tensorflow as tf

# ── Try the full model (.h5 = ~88 MB, full VGG16 pipeline) first.
# emotion_model.keras is only the Dense head — it does NOT accept raw images.
_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dataset")

MODEL_PATH_H5    = os.path.join(_MODEL_DIR, "emotion_model.h5")
MODEL_PATH_KERAS = os.path.join(_MODEL_DIR, "emotion_model.keras")

print("[EmotionDetector] Loading emotion model...")
if os.path.exists(MODEL_PATH_H5):
    model = tf.keras.models.load_model(MODEL_PATH_H5, compile=False)
    print(f"[EmotionDetector] Loaded full model from emotion_model.h5")
else:
    model = tf.keras.models.load_model(MODEL_PATH_KERAS, compile=False)
    print(f"[EmotionDetector] Loaded model from emotion_model.keras")

# ── Inspect model input to handle any architecture automatically ──────────────
raw_input_shape = model.input_shape  # e.g. (None,224,224,3) or (None,48,48,1)
print(f"[EmotionDetector] Model input shape: {raw_input_shape}")

# Derive expected (H, W, C) from the model
if isinstance(raw_input_shape, list):
    # Some models have multiple inputs — use the first
    raw_input_shape = raw_input_shape[0]

_dims = [d for d in raw_input_shape if d is not None]
if len(_dims) == 3:                   # (H, W, C)
    TARGET_H, TARGET_W, TARGET_C = _dims
elif len(_dims) == 1:
    # Flat feature vector — this means a head-only model was loaded.
    # Fall back to VGG16 feature extraction + head
    raise RuntimeError(
        f"emotion_model.keras is a feature-head only model (expects flat input "
        f"of size {_dims[0]}). Use emotion_model.h5 instead."
    )
else:
    TARGET_H, TARGET_W, TARGET_C = 48, 48, 1   # FER2013 default fallback

print(f"[EmotionDetector] Preprocessing images to {TARGET_H}×{TARGET_W}, channels={TARGET_C}")

# ── Emotion class labels ── must match alphabetical order of train subfolder names:
# angry(0) disgusted(1) fearful(2) happy(3) neutral(4) sad(5) surprised(6)
EMOTION_CLASSES = ["Angry", "Disgusted", "Fearful", "Happy", "Neutral", "Sad", "Surprised"]

EMOTION_TO_MOOD = {
    "Happy":     "Happy",
    "Surprised": "Happy",
    "Sad":       "Sad",
    "Disgusted": "Sad",
    "Angry":     "Energetic",
    "Fearful":   "Suspenseful",
    "Neutral":   "Reflective",
}

EMOTION_EMOJI = {
    "Happy":     "😄",
    "Surprised": "😲",
    "Sad":       "😢",
    "Disgusted": "🤢",
    "Angry":     "😠",
    "Fearful":   "😨",
    "Neutral":   "😐",
}


def _preprocess(base64_image: str) -> np.ndarray:
    """Decode base64 image and resize/normalise to exactly what the model needs."""
    if "," in base64_image:
        base64_image = base64_image.split(",", 1)[1]

    img_bytes = base64.b64decode(base64_image)
    img = Image.open(io.BytesIO(img_bytes))

    # Convert to greyscale or RGB depending on model channel count
    if TARGET_C == 1:
        img = img.convert("L")   # greyscale
    else:
        img = img.convert("RGB")

    img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0

    if TARGET_C == 1:
        arr = np.expand_dims(arr, axis=-1)      # (H,W) → (H,W,1)

    return np.expand_dims(arr, axis=0)           # → (1,H,W,C)


def predict_emotion(base64_image: str) -> dict:
    """
    Returns dict with emotion, mood, emoji, confidence.
    Raises on bad input; caller should catch and return HTTP 500.
    """
    img_array   = _preprocess(base64_image)
    predictions = model.predict(img_array, verbose=0)[0]

    idx        = int(np.argmax(predictions))
    # Guard against out-of-range index (model might have different num classes)
    if idx >= len(EMOTION_CLASSES):
        idx = len(EMOTION_CLASSES) - 1
    emotion    = EMOTION_CLASSES[idx]
    confidence = float(predictions[idx])
    mood       = EMOTION_TO_MOOD.get(emotion, "Reflective")
    emoji      = EMOTION_EMOJI.get(emotion, "🙂")

    print(f"[EmotionDetector] Predicted: {emotion} ({confidence*100:.1f}%) → Mood: {mood}")

    return {
        "emotion":    emotion,
        "mood":       mood,
        "emoji":      emoji,
        "confidence": round(confidence * 100, 1),
    }
