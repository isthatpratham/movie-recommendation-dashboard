# Movie Rating Analytics Dashboard

A web-based analytics platform for exploring the **MovieLens 100K** dataset. It provides interactive visualizations, cross-filtering, and drill-downs so you can analyze movie ratings, genre trends, and user behavior in one place.

## Features

### Core analytics
* **KPI overview** — Total movies, total ratings, average rating, total users (with optional trend text).
* **Key insights** — Auto-generated highlights (peak production year, top genre, most-rated movie, user activity).
* **Movie quick insight** — Search by title to see a single movie’s rating summary and metadata.

### Interactive dashboard
* **Cross-filtering** — Click a genre (treemap), a rating level (1–5 bar), or a year (movies-per-year chart) to filter all other charts. Reset with one button.
* **Movie detail panel** — Click a movie in Top Rated, Most Rated, or the bubble chart to open a side panel with title, year, average rating, total ratings, genres, and a mini rating distribution (and ratings over time) for that movie.
* **Bubble chart quadrants** — Movie Popularity vs Rating chart includes reference lines (average rating, average count) and labels: **Blockbusters**, **Hidden Gems**, **Overhyped**, **Unnoticed**.
* **Smart insight callouts** — Short auto-generated insights under major charts (e.g. peak year, highest-rated movie, top genre); they update when filters change.
* **Richer tooltips** — Consistent tooltips across charts (Movie, Year, Average Rating, Total Ratings, Genres where applicable).
* **Dataset info panel** — Info icon next to the title opens a popup with dataset name, total movies, total ratings, total users.
* **Per-chart export** — Each chart card offers **Download PNG** and **Download CSV** (where data is available).
* **Responsive layout** — Desktop: two charts per row; tablet: asymmetric grid; mobile: single column. Charts resize with the viewport.
* **Theme toggle** — Dark (default) and light theme with persistence.

### Visualizations
* **Top Rated Movies** — Horizontal bar by average rating; click bar for movie detail.
* **Most Rated Movies** — Lollipop chart by total ratings; click for movie detail.
* **Movies Released Per Year** — Area chart; click a point to filter by year.
* **Movie Age vs Rating** — Scatter: release year vs average rating.
* **Genre Popularity** — Treemap (genre blocks); click a genre to filter.
* **Average Rating by Genre** — Horizontal bar, low-to-high color gradient.
* **Ratings per Genre (Engagement)** — Total ratings per genre.
* **Rating Distribution** — Bar chart 1★–5★; click a bar to filter by rating.
* **User Rating Activity** — Histogram of users by activity bucket (1–10, 10–50, 50–100, 100+ ratings).
* **Genre vs Rating Heatmap** — Rows: genres; columns: 1–5★; color = count.
* **Movie Popularity vs Rating** — Bubble chart (X = total ratings, Y = avg rating) with quadrant labels; click bubble for movie detail.

## Project structure

```text
movie/
├── analytics/
│   ├── analytics_engine.py   # Aggregations and stats (uses CSV data)
│   └── data_cleaning.py      # Clean/normalize raw MovieLens data
├── dataset/
│   ├── clean_movies.csv      # Processed movie metadata
│   └── clean_ratings.csv     # Processed ratings
├── static/
│   ├── css/style.css         # Dashboard and chart styling
│   └── js/dashboard.js       # Chart.js logic, filters, export, panels
├── templates/
│   └── dashboard.html        # Main dashboard markup
├── schema/                   # Optional MySQL schema (if using DB)
├── database/                 # Optional DB loaders
└── app.py                    # Flask app and API routes
```

## Installation & setup

1. **Clone the repository**
   ```bash
   git clone <repo-link>
   cd movie
   ```

2. **Install dependencies**
   ```bash
   pip install flask pandas
   ```
   Optional (if you use MySQL or schema): `mysql-connector-python`

3. **Prepare data**  
   The dashboard reads from the CSV files in `dataset/`. If you don’t have them yet:
   ```bash
   python analytics/data_cleaning.py
   ```
   This produces (or expects) `dataset/clean_movies.csv` and `dataset/clean_ratings.csv` in the format used by the analytics engine.

4. **Run the app**
   ```bash
   python app.py
   ```

5. **Open the dashboard**  
   In your browser go to: `http://127.0.0.1:5000`

The analytics engine loads data from the CSV files in memory; no database is required for the dashboard to run. If you use the optional MySQL setup (e.g. `schema/movie_analytics.sql`, `database/load_clean_data.py`), configure `DB_CONFIG` in `analytics/analytics_engine.py` as needed.

## Dataset

**MovieLens 100K** (GroupLens Research): 100,000 ratings from 943 users on 1,682 movies.

Source: [GroupLens MovieLens 100K](https://grouplens.org/datasets/movielens/100k/)

## Tech stack

* **Backend:** Flask, Pandas  
* **Frontend:** HTML/CSS/JS, Bootstrap 5, Chart.js 4  
* **Data:** CSV (default); optional MySQL

## Possible future improvements

* Recommendation models (collaborative or content-based).
* Movie poster/artwork via external APIs (e.g. TMDB).
* Real-time or streaming analytics (e.g. WebSockets).
* More export formats (PDF report, full-dashboard CSV).

## Author

**Ammiyo Paul**  
MCA student · Data analytics enthusiast
