import os
import random
import pandas as pd
from googleapiclient.discovery import build

# ── Paths ──────────────────────────────────────────────────────────────────────
CSV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "..", "dataset", "preprodata.csv")

# ── YouTube API ────────────────────────────────────────────────────────────────
YOUTUBE_API_KEY = "AIzaSyAHz-WEKgIjtKgBPxzIw4p7zFUaNkzPvg8"
youtube = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

# ── Load CSV once at startup ───────────────────────────────────────────────────
print("[Recommender] Loading movie dataset...")
_df = pd.read_csv(CSV_PATH, on_bad_lines="skip", low_memory=False)
# Convert to numeric FIRST, then filter — otherwise string comparison silently fails
_df["averageRating"] = pd.to_numeric(_df["averageRating"], errors="coerce")
_df = _df[_df["averageRating"].notna() & (_df["averageRating"] >= 6.0)]
_df = _df.dropna(subset=["averageRating", "primaryTitle", "mood_tag"])
print(f"[Recommender] Dataset ready — {len(_df)} rated movies loaded.")

# ── Mood → YouTube query ────────────────────────────────────────────────────────
MOOD_QUERIES = {
    "Happy":       "happy feel good songs playlist 2024",
    "Sad":         "sad emotional songs that make you cry",
    "Romantic":    "romantic love songs best hits",
    "Energetic":   "pump up workout songs high energy",
    "Suspenseful": "suspense thriller background music intense",
    "Relaxed":     "relaxing chill lofi music playlist",
    "Reflective":  "thoughtful acoustic songs introspective",
}

# IMDb poster placeholder (we use a colour coded fallback in the UI)
MOOD_COLOUR = {
    "Happy":       "#FFD700",
    "Sad":         "#4A90D9",
    "Romantic":    "#FF6B8A",
    "Energetic":   "#FF4500",
    "Suspenseful": "#6A0DAD",
    "Relaxed":     "#2ECC71",
    "Reflective":  "#546E7A",
}


def recommend_movies(mood: str, n: int = 5) -> list[dict]:
    """Return top-n movies whose mood_tag contains the given mood."""
    mask = _df["mood_tag"].str.contains(mood, case=False, na=False)
    subset = _df[mask].sort_values("averageRating", ascending=False)

    # Shuffle the top pool slightly so repeat detections feel fresh
    top = subset.head(50)
    sample = top.sample(min(n, len(top))) if len(top) > n else top.head(n)

    results = []
    for _, row in sample.iterrows():
        title = str(row["primaryTitle"])
        year  = str(row.get("startYear", "N/A"))
        rating = float(row["averageRating"])
        tconst = str(row.get("tconst", ""))
        imdb_url = f"https://www.imdb.com/title/{tconst}/" if tconst.startswith("tt") else "#"
        results.append({
            "title":  title,
            "year":   year,
            "rating": round(rating, 1),
            "imdb_url": imdb_url,
            "mood":   mood,
            "colour": MOOD_COLOUR.get(mood, "#888"),
        })
    return results


def get_music(mood: str, max_results: int = 3) -> list[dict]:
    """Fetch real YouTube music video links for the given mood."""
    query = MOOD_QUERIES.get(mood, f"{mood} music playlist")
    try:
        yt_request = youtube.search().list(
            q=query,
            part="snippet",
            type="video",
            maxResults=max_results,
            videoCategoryId="10",   # Music category
        )
        response = yt_request.execute()
        tracks = []
        for item in response.get("items", []):
            vid_id    = item["id"]["videoId"]
            title     = item["snippet"]["title"]
            channel   = item["snippet"]["channelTitle"]
            thumbnail = item["snippet"]["thumbnails"]["medium"]["url"]
            link      = f"https://www.youtube.com/watch?v={vid_id}"
            tracks.append({
                "title":     title,
                "channel":   channel,
                "thumbnail": thumbnail,
                "link":      link,
                "video_id":  vid_id,
            })
        return tracks
    except Exception as e:
        print(f"[Recommender] YouTube API error: {e}")
        return []
