import pandas as pd
import mysql.connector
from mysql.connector import Error

# -------------------------------------------------------
# Database Configuration
# -------------------------------------------------------
DB_CONFIG = {
    "host": "localhost",
    "user": "root",
    "password": "",
    "database": "movie_analytics",
    "port": 3306
}


def get_connection():
    """Return a live MySQL connection (used by Flask API layer)."""
    return mysql.connector.connect(**DB_CONFIG)


# Simple in-process cache so CSVs are only read once per run
_cache = {}


def _load_data():
    """
    Load movies and ratings from cleaned CSVs and return a merged DataFrame.
    CSVs are used directly for speed — avoids repeated DB round-trips.
    The live movies table schema does not have release_year, so it is read
    from clean_movies.csv which has the full column set.
    """
    if _cache:
        return _cache["movies"], _cache["ratings"], _cache["merged"]

    movies_df = pd.read_csv("dataset/clean_movies.csv")
    ratings_df = pd.read_csv("dataset/clean_ratings.csv")

    # Ensure correct types
    movies_df["movie_id"] = movies_df["movie_id"].astype(int)
    ratings_df["movie_id"] = ratings_df["movie_id"].astype(int)
    ratings_df["user_id"] = ratings_df["user_id"].astype(int)
    ratings_df["rating"] = ratings_df["rating"].astype(float)
    ratings_df["timestamp"] = ratings_df["timestamp"].astype(int)

    merged_df = ratings_df.merge(movies_df, on="movie_id", how="left")

    _cache["movies"] = movies_df
    _cache["ratings"] = ratings_df
    _cache["merged"] = merged_df

    return movies_df, ratings_df, merged_df


def _apply_filters(movies_df, ratings_df, merged_df, genre=None, year_min=None, year_max=None, rating_value=None):
    """Return filtered copies of movies, ratings, and merged based on optional filters."""
    m = movies_df.copy()
    r = ratings_df.copy()
    mg = merged_df.copy()

    if genre:
        m = m[m["genres"].str.contains(genre, case=False, na=False)]
        mg = mg[mg["genres"].str.contains(genre, case=False, na=False)]
        r = r[r["movie_id"].isin(m["movie_id"])]

    if year_min is not None:
        try:
            ymin = int(year_min)
            m = m.dropna(subset=["release_year"])
            m = m[m["release_year"] >= ymin]
            mg = mg[mg["movie_id"].isin(m["movie_id"])]
            r = r[r["movie_id"].isin(m["movie_id"])]
        except (ValueError, TypeError):
            pass

    if year_max is not None:
        try:
            ymax = int(year_max)
            m = m.dropna(subset=["release_year"])
            m = m[m["release_year"] <= ymax]
            mg = mg[mg["movie_id"].isin(m["movie_id"])]
            r = r[r["movie_id"].isin(m["movie_id"])]
        except (ValueError, TypeError):
            pass

    if rating_value is not None:
        try:
            rv = float(rating_value)
            r = r[r["rating"] == rv]
            mg = mg[mg["movie_id"].isin(r["movie_id"])]
            m = m[m["movie_id"].isin(r["movie_id"])]
        except (ValueError, TypeError):
            pass

    return m, r, mg


def get_unique_genres():
    """Return sorted list of unique genres for filter dropdown."""
    movies_df, _, _ = _load_data()
    genre_series = movies_df["genres"].dropna().str.split("|").explode().str.strip()
    return sorted(genre_series.unique().tolist())


def get_year_bounds():
    """Return min and max release year for filter sliders."""
    movies_df, _, _ = _load_data()
    years = movies_df["release_year"].dropna().astype(int)
    return {"min": int(years.min()), "max": int(years.max())}


# -------------------------------------------------------
# Analytics Functions (all support optional genre, year_min, year_max, min_rating where applicable)
# -------------------------------------------------------

def get_top_rated_movies(limit=10, genre=None, year_min=None, year_max=None, min_rating=10, rating_value=None):
    """
    Return top movies by highest average rating.
    Only includes movies with at least min_rating ratings to avoid bias.
    Includes release_year for tooltips.
    """
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    result = (
        merged.groupby(["movie_id", "title"])["rating"]
        .agg(avg_rating="mean", count="count")
        .reset_index()
    )
    result = result[result["count"] >= min_rating]
    result = result.sort_values("avg_rating", ascending=False).head(limit)
    movies_lookup = movies_df.set_index("movie_id")[["release_year", "genres"]]
    result = result.join(movies_lookup, on="movie_id")
    return {
        "labels": result["title"].tolist(),
        "values": result["avg_rating"].round(2).tolist(),
        "counts": result["count"].tolist(),
        "movie_ids": result["movie_id"].astype(int).tolist(),
        "release_years": [int(y) if pd.notna(y) else None for y in result["release_year"].tolist()],
        "genres": [str(g) if pd.notna(g) else "" for g in result["genres"].tolist()],
    }


def get_most_rated_movies(limit=10, genre=None, year_min=None, year_max=None, rating_value=None):
    """Return movies with the highest number of ratings. Includes avg_rating and release_year for tooltips."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    result = (
        merged.groupby(["movie_id", "title"])["rating"]
        .agg(rating_count="count", avg_rating="mean")
        .reset_index()
        .sort_values("rating_count", ascending=False)
        .head(limit)
    )
    movies_lookup = movies_df.set_index("movie_id")[["release_year", "genres"]]
    result = result.join(movies_lookup, on="movie_id")
    return {
        "labels": result["title"].tolist(),
        "values": result["rating_count"].tolist(),
        "movie_ids": result["movie_id"].astype(int).tolist(),
        "avg_ratings": result["avg_rating"].round(2).tolist(),
        "release_years": [int(y) if pd.notna(y) else None for y in result["release_year"].tolist()],
        "genres": [str(g) if pd.notna(g) else "" for g in result["genres"].tolist()],
    }


def get_genre_popularity(genre=None, year_min=None, year_max=None, rating_value=None):
    """
    Count how many movies belong to each genre.
    Genres column is pipe-separated (e.g., 'Action|Comedy|Drama').
    """
    movies_df, ratings_df, merged = _load_data()
    movies_df, _, _ = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    genre_series = movies_df["genres"].dropna().str.split("|").explode()
    genre_counts = genre_series.value_counts()
    return {
        "labels": genre_counts.index.tolist(),
        "values": genre_counts.values.tolist()
    }


def get_rating_distribution(genre=None, year_min=None, year_max=None, rating_value=None):
    """Return the count of ratings for each rating value (1 to 5, including 0.5 steps)."""
    movies_df, ratings_df, merged = _load_data()
    _, ratings_df, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    dist = ratings_df["rating"].value_counts().sort_index()
    return {
        "labels": [str(r) for r in dist.index.tolist()],
        "values": dist.values.tolist()
    }


def get_ratings_over_time(genre=None, year_min=None, year_max=None, rating_value=None):
    """Convert timestamp to datetime and group ratings count by year."""
    movies_df, ratings_df, merged = _load_data()
    _, ratings_df, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    ratings_df = ratings_df.copy()
    ratings_df["year"] = pd.to_datetime(ratings_df["timestamp"], unit="s").dt.year
    result = ratings_df.groupby("year").size().reset_index(name="rating_count")
    return {
        "labels": result["year"].tolist(),
        "values": result["rating_count"].tolist()
    }


def get_avg_rating_per_year(genre=None, year_min=None, year_max=None, rating_value=None):
    """Average rating per year (for User Behavior section)."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    merged = merged.copy()
    merged["year"] = pd.to_datetime(merged["timestamp"], unit="s").dt.year
    result = merged.groupby("year")["rating"].mean().reset_index(name="avg_rating")
    result = result.sort_values("year")
    return {
        "labels": result["year"].astype(int).tolist(),
        "values": result["avg_rating"].round(2).tolist()
    }


def get_top_users(limit=10, genre=None, year_min=None, year_max=None, rating_value=None):
    """Find users who rated the most movies. Includes avg_rating_given for tooltips."""
    movies_df, ratings_df, merged = _load_data()
    _, ratings_df, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    agg = (
        ratings_df.groupby("user_id")["rating"]
        .agg(rating_count="count", avg_rating="mean")
        .reset_index()
    )
    result = agg.sort_values("rating_count", ascending=False).head(limit)
    return {
        "labels": [f"User {uid}" for uid in result["user_id"].tolist()],
        "values": result["rating_count"].tolist(),
        "user_ids": result["user_id"].tolist(),
        "avg_ratings": result["avg_rating"].round(2).tolist(),
    }


def get_average_rating_by_genre(genre=None, year_min=None, year_max=None, rating_value=None):
    """Compute average rating for each genre."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    genre_ratings = merged.copy()
    genre_ratings["genre"] = genre_ratings["genres"].str.split("|")
    genre_ratings = genre_ratings.explode("genre")
    result = (
        genre_ratings.groupby("genre")["rating"]
        .mean()
        .reset_index(name="avg_rating")
        .sort_values("avg_rating", ascending=False)
    )
    return {
        "labels": result["genre"].tolist(),
        "values": result["avg_rating"].round(2).tolist()
    }


def get_movies_per_year(genre=None, year_min=None, year_max=None, rating_value=None):
    """Count number of movies released per year."""
    movies_df, ratings_df, merged = _load_data()
    movies_df, _, _ = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    result = (
        movies_df.dropna(subset=["release_year"])
        .groupby("release_year")
        .size()
        .reset_index(name="movie_count")
        .sort_values("release_year")
    )
    return {
        "labels": result["release_year"].astype(int).tolist(),
        "values": result["movie_count"].tolist(),
        "peak_year": int(result.loc[result["movie_count"].idxmax(), "release_year"]) if len(result) else None,
    }


def search_movies(title="", year=None, genre=""):
    """
    Search movies by title keyword, release year, and/or genre.
    Returns a list of matching movies with avg rating and rating count.
    """
    _, _, merged = _load_data()

    # Aggregate stats per movie
    stats = (
        merged.groupby(["movie_id", "title", "genres", "release_year"])["rating"]
        .agg(avg_rating="mean", rating_count="count")
        .reset_index()
    )

    result = stats.copy()

    if title:
        result = result[result["title"].str.contains(title, case=False, na=False)]

    if year:
        try:
            result = result[result["release_year"] == int(year)]
        except (ValueError, TypeError):
            pass

    if genre:
        result = result[result["genres"].str.contains(genre, case=False, na=False)]

    result = result.sort_values("avg_rating", ascending=False)

    return {
        "movies": [
            {
                "title": row["title"],
                "genres": row["genres"],
                "release_year": int(row["release_year"]) if pd.notna(row["release_year"]) else None,
                "avg_rating": round(row["avg_rating"], 2),
                "rating_count": int(row["rating_count"]),
            }
            for _, row in result.iterrows()
        ]
    }


def get_dashboard_stats(genre=None, year_min=None, year_max=None, rating_value=None):
    """
    Return dashboard KPI metrics. When filters are provided, metrics reflect filtered data.
    """
    movies_df, ratings_df, merged = _load_data()
    movies_df, ratings_df, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    return {
        "total_movies":  int(len(movies_df)),
        "total_ratings": int(len(ratings_df)),
        "avg_rating":    round(float(ratings_df["rating"].mean()), 2) if len(ratings_df) else 0,
        "total_users":   int(ratings_df["user_id"].nunique()),
    }


def get_movie_insight(title):
    """
    Return insight for a single best-matching movie by title keyword.
    Returns avg rating, total ratings, genres, and release year.
    """
    _, ratings_df, merged = _load_data()

    # Find best match (case-insensitive, pick highest rating-count)
    mask    = merged["title"].str.contains(title, case=False, na=False)
    matched = merged[mask]

    if matched.empty:
        return None

    # Pick the movie with the most ratings as "best match"
    best_id = matched.groupby("movie_id")["rating"].count().idxmax()
    movie   = matched[matched["movie_id"] == best_id]

    row = movie.iloc[0]
    return {
        "movie_id":      int(best_id),
        "title":         str(row["title"]),
        "avg_rating":    round(float(movie["rating"].mean()), 2),
        "total_ratings": int(len(movie)),
        "genres":        str(row["genres"]),
        "release_year":  int(row["release_year"]) if pd.notna(row["release_year"]) else None,
    }


# -------------------------------------------------------
# Key Insights & KPI Trends
# -------------------------------------------------------

def get_key_insights(genre=None, year_min=None, year_max=None, rating_value=None):
    """Return 3-5 key insights: peak year, highest rated genre, most popular genre, most active user."""
    movies_df, ratings_df, merged = _load_data()
    m, r, mg = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)

    insights = []

    # Peak movie release year
    if not m.empty and "release_year" in m.columns:
        by_year = m.dropna(subset=["release_year"]).groupby("release_year").size()
        if not by_year.empty:
            peak_year = int(by_year.idxmax())
            insights.append({"id": "peak_year", "label": "Peak movie release year", "value": str(peak_year), "icon": "🎬"})

    # Highest average rating genre (min 50 ratings per genre)
    genre_ratings = mg.copy()
    genre_ratings["genre"] = genre_ratings["genres"].str.split("|")
    genre_ratings = genre_ratings.explode("genre")
    agg = genre_ratings.groupby("genre")["rating"].agg(mean="mean", count="count").reset_index()
    agg = agg[agg["count"] >= 50]
    if not agg.empty:
        best = agg.loc[agg["mean"].idxmax()]
        insights.append({"id": "top_genre_rating", "label": "Highest rated genre", "value": f"{best['genre']} ({best['mean']:.2f} avg)", "icon": "⭐"})

    # Most popular genre by movie count
    genre_counts = m["genres"].dropna().str.split("|").explode().value_counts()
    if not genre_counts.empty:
        top_genre = genre_counts.index[0]
        insights.append({"id": "popular_genre", "label": "Most popular genre", "value": top_genre, "icon": "🎭"})

    # Most active user
    if not r.empty:
        user_counts = r.groupby("user_id").size()
        top_user_id = int(user_counts.idxmax())
        top_count = int(user_counts.max())
        insights.append({"id": "active_user", "label": "Most active user", "value": f"User {top_user_id} ({top_count:,} ratings)", "icon": "👤"})

    return insights


def get_kpi_trends(genre=None, year_min=None, year_max=None, rating_value=None):
    """Return trend indicators for KPIs. Uses full-dataset as baseline when filters applied."""
    movies_df, ratings_df, merged = _load_data()
    full_stats = {
        "total_movies": len(movies_df),
        "total_ratings": len(ratings_df),
        "avg_rating": round(float(ratings_df["rating"].mean()), 2),
        "total_users": ratings_df["user_id"].nunique(),
    }
    m, r, _ = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    filtered_movies = len(m)
    filtered_ratings = len(r)
    filtered_avg = round(float(r["rating"].mean()), 2) if len(r) else 0
    filtered_users = r["user_id"].nunique() if len(r) else 0

    def pct_change(current, base):
        if base == 0:
            return None
        return round(((current - base) / base) * 100, 1)

    has_filter = genre or year_min or year_max or rating_value
    if not has_filter:
        return [
            {"key": "total_movies", "trend": "—", "positive": None},
            {"key": "total_ratings", "trend": "—", "positive": None},
            {"key": "avg_rating", "trend": "—", "positive": None},
            {"key": "total_users", "trend": "—", "positive": None},
        ]

    pct_movies = pct_change(filtered_movies, full_stats["total_movies"])
    pct_ratings = pct_change(filtered_ratings, full_stats["total_ratings"])
    diff_avg = round(filtered_avg - full_stats["avg_rating"], 2)
    pct_users = pct_change(filtered_users, full_stats["total_users"])

    return [
        {"key": "total_movies", "trend": f"{pct_movies:+.1f}% vs full dataset" if pct_movies is not None else "—", "positive": pct_movies is not None and pct_movies >= 0},
        {"key": "total_ratings", "trend": f"{pct_ratings:+.1f}% vs full dataset" if pct_ratings is not None else "—", "positive": pct_ratings is not None and pct_ratings >= 0},
        {"key": "avg_rating", "trend": f"{diff_avg:+.2f} vs full dataset" if filtered_ratings else "—", "positive": diff_avg >= 0},
        {"key": "total_users", "trend": f"{pct_users:+.1f}% vs full dataset" if pct_users is not None else "—", "positive": pct_users is not None and pct_users >= 0},
    ]


def get_movie_detail_by_id(movie_id):
    """Full detail for one movie by id. Returns None if not found."""
    _, _, merged = _load_data()
    m = merged[merged["movie_id"] == int(movie_id)]
    if m.empty:
        return None
    row = m.iloc[0]
    return {
        "movie_id": int(movie_id),
        "title": str(row["title"]),
        "release_year": int(row["release_year"]) if pd.notna(row["release_year"]) else None,
        "avg_rating": round(float(m["rating"].mean()), 2),
        "total_ratings": int(len(m)),
        "genres": str(row["genres"]),
    }


def get_movie_rating_distribution(movie_id):
    """Rating distribution for a single movie (count per rating value)."""
    _, ratings_df, _ = _load_data()
    r = ratings_df[ratings_df["movie_id"] == int(movie_id)]["rating"]
    dist = r.value_counts().sort_index()
    return {"labels": [str(x) for x in dist.index.tolist()], "values": dist.values.tolist()}


def get_movie_ratings_timeline(movie_id):
    """Ratings over time for a single movie (count or avg per year)."""
    _, ratings_df, merged = _load_data()
    mg = merged[merged["movie_id"] == int(movie_id)].copy()
    if mg.empty:
        return {"labels": [], "values": []}
    mg["year"] = pd.to_datetime(mg["timestamp"], unit="s").dt.year
    by_year = mg.groupby("year").agg(rating_count=("rating", "count"), avg_rating=("rating", "mean")).reset_index()
    by_year["year"] = by_year["year"].astype(int)
    return {
        "labels": by_year["year"].tolist(),
        "values": by_year["rating_count"].tolist(),
        "avg_ratings": by_year["avg_rating"].round(2).tolist(),
    }


def get_user_activity_distribution(genre=None, year_min=None, year_max=None, rating_value=None):
    """User counts in buckets: 1-10, 10-50, 50-100, 100+ ratings."""
    movies_df, ratings_df, merged = _load_data()
    _, r, _ = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    counts = r.groupby("user_id").size()
    buckets = [
        ("1–10", ((counts >= 1) & (counts <= 10)).sum()),
        ("10–50", ((counts > 10) & (counts <= 50)).sum()),
        ("50–100", ((counts > 50) & (counts <= 100)).sum()),
        ("100+", (counts > 100).sum()),
    ]
    return {"labels": [b[0] for b in buckets], "values": [int(b[1]) for b in buckets]}


def get_movie_age_vs_rating(genre=None, year_min=None, year_max=None, rating_value=None, limit=200):
    """Scatter: release_year vs avg_rating per movie. Returns points with title, year, avg_rating, genres."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    merged = merged.dropna(subset=["release_year"])
    agg = merged.groupby(["movie_id", "title", "release_year", "genres"])["rating"].mean().reset_index()
    agg["release_year"] = agg["release_year"].astype(int)
    agg = agg.sort_values("rating", ascending=False).head(limit)
    return {
        "points": [
            {
                "x": int(row["release_year"]),
                "y": round(row["rating"], 2),
                "title": str(row["title"]),
                "year": int(row["release_year"]),
                "avg_rating": round(row["rating"], 2),
                "genres": str(row["genres"]),
            }
            for _, row in agg.iterrows()
        ],
    }


def get_genre_rating_heatmap(genre=None, year_min=None, year_max=None, rating_value=None):
    """Rows = genres, Columns = rating levels 1-5. Values = count of ratings."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    merged = merged.copy()
    merged["genre"] = merged["genres"].str.split("|")
    merged = merged.explode("genre")
    merged["rating_int"] = merged["rating"].round().clip(1, 5).astype(int)
    cross = merged.groupby(["genre", "rating_int"]).size().unstack(fill_value=0)
    for c in [1, 2, 3, 4, 5]:
        if c not in cross.columns:
            cross[c] = 0
    cross = cross[[1, 2, 3, 4, 5]]
    return {
        "genres": cross.index.tolist(),
        "columns": [1, 2, 3, 4, 5],
        "data": cross.values.tolist(),
    }


def get_genre_engagement(genre=None, year_min=None, year_max=None, rating_value=None):
    """Total ratings per genre, sorted descending. Includes avg_rating per genre for tooltips."""
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    merged = merged.copy()
    merged["genre"] = merged["genres"].str.split("|")
    merged = merged.explode("genre")
    agg = merged.groupby("genre")["rating"].agg(total_ratings="count", avg_rating="mean").reset_index()
    agg = agg.sort_values("total_ratings", ascending=False)
    return {
        "labels": agg["genre"].tolist(),
        "values": agg["total_ratings"].astype(int).tolist(),
        "avg_ratings": agg["avg_rating"].round(2).tolist(),
    }


def get_movie_popularity_rating_bubble(genre=None, year_min=None, year_max=None, rating_value=None, limit=80):
    """
    Movies for bubble chart: X = total ratings, Y = average rating, size = popularity (rating count).
    Returns points with title, year, total_ratings, avg_rating for tooltips.
    """
    movies_df, ratings_df, merged = _load_data()
    _, _, merged = _apply_filters(movies_df, ratings_df, merged, genre, year_min, year_max, rating_value)
    agg = (
        merged.groupby(["movie_id", "title"])["rating"]
        .agg(total_ratings="count", avg_rating="mean")
        .reset_index()
    )
    agg = agg[agg["total_ratings"] >= 5]
    agg = agg.sort_values("total_ratings", ascending=False).head(limit)
    movies_lookup = movies_df.set_index("movie_id")[["release_year", "genres"]]
    agg = agg.join(movies_lookup, on="movie_id")
    return {
        "points": [
            {
                "movie_id": int(row["movie_id"]),
                "x": int(row["total_ratings"]),
                "y": round(row["avg_rating"], 2),
                "r": min(25, 8 + row["total_ratings"] / 50),
                "title": str(row["title"]),
                "year": int(row["release_year"]) if pd.notna(row["release_year"]) else None,
                "total_ratings": int(row["total_ratings"]),
                "avg_rating": round(row["avg_rating"], 2),
                "genres": str(row["genres"]) if pd.notna(row["genres"]) else "",
            }
            for _, row in agg.iterrows()
        ],
        "avg_rating": round(float(agg["avg_rating"].mean()), 2),
        "avg_count": int(round(agg["total_ratings"].mean())),
    }


def get_dataset_info():
    """Static dataset metadata for info modal."""
    movies_df, ratings_df, _ = _load_data()
    return {
        "name": "MovieLens 100K",
        "movies": int(len(movies_df)),
        "ratings": int(len(ratings_df)),
        "users": int(ratings_df["user_id"].nunique()),
        "description": "The MovieLens 100K dataset contains 100,000 ratings from 943 users on 1,682 movies. Collected by GroupLens Research, it is widely used for recommendation and analytics research.",
    }


# -------------------------------------------------------
# Main test block
# -------------------------------------------------------
if __name__ == "__main__":
    import json

    print("\n=== Top Rated Movies ===")
    print(json.dumps(get_top_rated_movies(limit=5), indent=2))

    print("\n=== Most Rated Movies ===")
    print(json.dumps(get_most_rated_movies(limit=5), indent=2))

    print("\n=== Genre Popularity ===")
    print(json.dumps(get_genre_popularity(), indent=2))

    print("\n=== Rating Distribution ===")
    print(json.dumps(get_rating_distribution(), indent=2))

    print("\n=== Ratings Over Time ===")
    print(json.dumps(get_ratings_over_time(), indent=2))

    print("\n=== Top Users ===")
    print(json.dumps(get_top_users(limit=5), indent=2))

    print("\n=== Average Rating by Genre ===")
    print(json.dumps(get_average_rating_by_genre(), indent=2))

    print("\n=== Movies Per Year ===")
    print(json.dumps(get_movies_per_year(), indent=2))
