from flask import Flask, jsonify, render_template, request
from analytics.analytics_engine import (
    get_top_rated_movies,
    get_most_rated_movies,
    get_genre_popularity,
    get_rating_distribution,
    get_ratings_over_time,
    get_avg_rating_per_year,
    get_top_users,
    get_average_rating_by_genre,
    get_movies_per_year,
    search_movies,
    get_dashboard_stats,
    get_movie_insight,
    get_unique_genres,
    get_year_bounds,
    get_key_insights,
    get_kpi_trends,
    get_movie_detail_by_id,
    get_movie_rating_distribution,
    get_movie_ratings_timeline,
    get_user_activity_distribution,
    get_movie_age_vs_rating,
    get_genre_rating_heatmap,
    get_genre_engagement,
    get_dataset_info,
    get_movie_popularity_rating_bubble,
)

app = Flask(__name__)


@app.before_request
def log_request_info():
    app.logger.debug("Request Headers: %s", request.headers)
    app.logger.debug("Request Body: %s", request.get_data())
    print(f"DEBUG: {request.method} {request.path} {request.args}")



def _filter_params():
    """Extract global filter params from request."""
    return {
        "genre": request.args.get("genre", "").strip() or None,
        "year_min": request.args.get("year_min", "").strip() or None,
        "year_max": request.args.get("year_max", "").strip() or None,
        "min_rating": request.args.get("min_rating", "").strip() or None,
        "rating_value": request.args.get("rating_value", "").strip() or None,
    }


@app.route("/")
def dashboard():
    return render_template("dashboard.html")


@app.route("/api/filters/genres")
def api_genres():
    return jsonify(get_unique_genres())


@app.route("/api/filters/year-bounds")
def api_year_bounds():
    return jsonify(get_year_bounds())


@app.route("/api/top-rated")
def top_rated():
    p = _filter_params()
    min_rating = 10
    if p["min_rating"]:
        try:
            min_rating = max(1, int(p["min_rating"]))
        except ValueError:
            pass
    return jsonify(
        get_top_rated_movies(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            min_rating=min_rating,
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/most-rated")
def most_rated():
    p = _filter_params()
    return jsonify(
        get_most_rated_movies(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/genre-popularity")
def genre_popularity():
    p = _filter_params()
    return jsonify(
        get_genre_popularity(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/rating-distribution")
def rating_distribution():
    p = _filter_params()
    return jsonify(
        get_rating_distribution(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/ratings-over-time")
def ratings_over_time():
    p = _filter_params()
    return jsonify(
        get_ratings_over_time(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/avg-rating-per-year")
def avg_rating_per_year():
    p = _filter_params()
    return jsonify(
        get_avg_rating_per_year(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/top-users")
def top_users():
    p = _filter_params()
    return jsonify(
        get_top_users(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/avg-rating-genre")
def avg_rating_genre():
    p = _filter_params()
    return jsonify(
        get_average_rating_by_genre(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/movies-per-year")
def movies_per_year():
    p = _filter_params()
    return jsonify(
        get_movies_per_year(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/search-movies")
def search_movies_route():
    title = request.args.get("title", "").strip()
    year  = request.args.get("year", "").strip()
    genre = request.args.get("genre", "").strip()
    return jsonify(search_movies(title=title, year=year or None, genre=genre))


@app.route("/api/dashboard-stats")
def dashboard_stats():
    try:
        p = _filter_params()
        return jsonify(
            get_dashboard_stats(
                genre=p["genre"],
                year_min=p["year_min"],
                year_max=p["year_max"],
                rating_value=p["rating_value"],
            )
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/key-insights")
def key_insights():
    p = _filter_params()
    return jsonify(get_key_insights(genre=p["genre"], year_min=p["year_min"], year_max=p["year_max"], rating_value=p["rating_value"]))


@app.route("/api/kpi-trends")
def kpi_trends():
    p = _filter_params()
    return jsonify(get_kpi_trends(genre=p["genre"], year_min=p["year_min"], year_max=p["year_max"], rating_value=p["rating_value"]))


@app.route("/api/movie-detail/<int:movie_id>")
def movie_detail(movie_id):
    result = get_movie_detail_by_id(movie_id)
    if result is None:
        return jsonify({"error": "Movie not found"}), 404
    return jsonify(result)


@app.route("/api/movie-rating-distribution/<int:movie_id>")
def movie_rating_distribution(movie_id):
    return jsonify(get_movie_rating_distribution(movie_id))


@app.route("/api/movie-ratings-timeline/<int:movie_id>")
def movie_ratings_timeline(movie_id):
    return jsonify(get_movie_ratings_timeline(movie_id))


@app.route("/api/user-activity-distribution")
def user_activity_distribution():
    p = _filter_params()
    return jsonify(
        get_user_activity_distribution(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/movie-age-rating")
def movie_age_rating():
    p = _filter_params()
    return jsonify(
        get_movie_age_vs_rating(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/genre-rating-heatmap")
def genre_rating_heatmap():
    p = _filter_params()
    return jsonify(
        get_genre_rating_heatmap(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/genre-engagement")
def genre_engagement():
    p = _filter_params()
    return jsonify(
        get_genre_engagement(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/movie-popularity-rating-bubble")
def movie_popularity_rating_bubble():
    p = _filter_params()
    return jsonify(
        get_movie_popularity_rating_bubble(
            genre=p["genre"],
            year_min=p["year_min"],
            year_max=p["year_max"],
            rating_value=p["rating_value"],
        )
    )


@app.route("/api/dataset-info")
def dataset_info():
    return jsonify(get_dataset_info())


@app.route("/api/movie-insight")
def movie_insight():
    title = request.args.get("title", "").strip()
    if not title:
        return jsonify({"error": "title parameter required"}), 400
    result = get_movie_insight(title)
    if result is None:
        return jsonify({"error": "No movie found"}), 404
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
