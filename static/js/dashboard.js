// ─────────────────────────────────────────────────────────────────────────────
// Movie Rating Analytics Dashboard — Professional analytics theme
// Colors: primary #FF4B4B, secondary #F9C74F, highlight #4CC9F0
// ─────────────────────────────────────────────────────────────────────────────

const COLORS = {
    primary: "#FF4B4B",
    secondary: "#F9C74F",
    highlight: "#4CC9F0",
    textPrimary: "#FFFFFF",
    textSecondary: "#A0A3BD",
    bg: "#1E1E2F",
    cardBg: "#25273A",
};

const RATING_COLORS = {
    1: "#FF4B4B",
    2: "#FF8C42",
    3: "#F9C74F",
    4: "#90BE6D",
    5: "#43AA8B",
};

Chart.defaults.color = COLORS.textSecondary;
Chart.defaults.borderColor = "rgba(255,255,255,0.08)";
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.animation = {
    duration: 700,
};
Chart.defaults.transition = {
    duration: 400,
};

const PALETTE = [
    COLORS.primary,
    COLORS.secondary,
    COLORS.highlight,
    "#90BE6D",
    "#43AA8B",
    "#577590",
    "#9d4edd",
    "#f72585",
];

// ── Filter state & query string ─────────────────────────────────────────────
function getFilterParams() {
    const genre = document.getElementById("genreFilter")?.value || "";
    const yearMin = document.getElementById("yearMin")?.value || "";
    const yearMax = document.getElementById("yearMax")?.value || "";
    const minRating = document.getElementById("minRatingSlider")?.value || "10";
    const ratingValue = document.getElementById("ratingValueFilter")?.value || "";
    return { genre, yearMin, yearMax, minRating, ratingValue };
}

function buildQueryString() {
    const p = getFilterParams();
    const q = new URLSearchParams();
    if (p.genre) q.append("genre", p.genre);
    if (p.yearMin) q.append("year_min", p.yearMin);
    if (p.yearMax) q.append("year_max", p.yearMax);
    if (p.minRating) q.append("min_rating", p.minRating);
    if (p.ratingValue) q.append("rating_value", p.ratingValue);
    return q.toString();
}

function setCrossFilterGenre(genre) {
    const el = document.getElementById("genreFilter");
    if (el) { el.value = genre || ""; refreshAllCharts(); }
}
function setCrossFilterYearRange(min, max) {
    const yMin = document.getElementById("yearMin");
    const yMax = document.getElementById("yearMax");
    if (yMin) yMin.value = min || "";
    if (yMax) yMax.value = max || "";
    refreshAllCharts();
}
function setCrossFilterRating(value) {
    const el = document.getElementById("ratingValueFilter");
    const badge = document.getElementById("ratingFilterBadge");
    const label = document.getElementById("ratingFilterLabel");
    if (el) el.value = value || "";
    if (badge && label) {
        if (value != null && value !== "") {
            label.textContent = value + "★";
            badge.style.display = "inline-flex";
        } else {
            badge.style.display = "none";
        }
    }
    refreshAllCharts();
}
function clearCrossFilterRating() {
    setCrossFilterRating("");
}

function resetAllFilters() {
    const genreFilter = document.getElementById("genreFilter");
    const yearMin = document.getElementById("yearMin");
    const yearMax = document.getElementById("yearMax");
    const minRatingSlider = document.getElementById("minRatingSlider");
    const minRatingValue = document.getElementById("minRatingValue");
    if (genreFilter) genreFilter.value = "";
    if (yearMin) yearMin.value = "";
    if (yearMax) yearMax.value = "";
    if (minRatingSlider) {
        minRatingSlider.value = "10";
        if (minRatingValue) minRatingValue.textContent = "10";
    }
    clearCrossFilterRating();
    activeCrossFilterGenre = null;
    refreshAllCharts();
}

function apiUrl(path, extraQs) {
    const q = buildQueryString();
    const base = path + (q ? "?" + q : "");
    return extraQs ? base + (base.includes("?") ? "&" : "?") + extraQs : base;
}

// ── Fetch helper ───────────────────────────────────────────────────────────
async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error("API " + res.status);
    return res.json();
}

// ── Gradient by rating (low red → high green) ────────────────────────────────
function ratingGradient(ctx, minVal, maxVal) {
    const g = ctx.createLinearGradient(0, 0, 400, 0);
    g.addColorStop(0, "#FF4B4B");
    g.addColorStop(0.5, "#F9C74F");
    g.addColorStop(1, "#43AA8B");
    return g;
}

function getColorByRating(rating) {
    if (rating <= 2) return RATING_COLORS[1];
    if (rating <= 3) return RATING_COLORS[3];
    if (rating <= 4) return RATING_COLORS[4];
    return RATING_COLORS[5];
}

// ── Chart instances (for refresh) ──────────────────────────────────────────
let chartInstances = {};

/**
 * Destroy a chart by id and ensure the canvas can be reused.
 * If Chart.js destroy() throws (e.g. animation bug), replace the canvas with
 * a clean clone so "Canvas is already in use" never occurs.
 */
function destroyChart(id) {
    if (chartInstances[id]) {
        try {
            chartInstances[id].destroy();
        } catch (e) {
            console.warn("Chart.js destroy error for " + id + ":", e);
        }
        chartInstances[id] = null;
    }

    const canvas = document.getElementById(id);
    if (!canvas || canvas.tagName !== "CANVAS") return;

    if (typeof Chart.getChart === "function") {
        const chart = Chart.getChart(canvas);
        if (chart) {
            try {
                chart.destroy();
            } catch (e) {
                console.warn("Chart.getChart destroy error for " + id + ":", e);
            }
        }
    }

    // Always replace canvas to ensure it's "fresh" and prevent "Canvas is already in use"
    const parent = canvas.parentNode;
    if (parent) {
        const clone = canvas.cloneNode(false);
        clone.id = canvas.id;
        parent.replaceChild(clone, canvas);
    }
}

function showLoading(show) {
    const el = document.getElementById("loadingOverlay");
    if (el) {
        el.classList.toggle("show", !!show);
        el.setAttribute("aria-hidden", !show);
    }
}

// ── KPI Cards & Trends ───────────────────────────────────────────────────────
async function loadKpis() {
    try {
        const [data, trends] = await Promise.all([
            fetchJson(apiUrl("/api/dashboard-stats")),
            fetchJson(apiUrl("/api/kpi-trends")),
        ]);
        document.getElementById("totalMovies").textContent = data.total_movies.toLocaleString();
        document.getElementById("totalRatings").textContent = data.total_ratings.toLocaleString();
        document.getElementById("avgRating").textContent = data.avg_rating.toFixed(2);
        document.getElementById("totalUsers").textContent = data.total_users.toLocaleString();
        const keys = ["total_movies", "total_ratings", "avg_rating", "total_users"];
        const trendEls = document.querySelectorAll(".kpi-trend-text");
        trendEls.forEach((el, i) => {
            const t = trends[i];
            if (t && t.trend) {
                el.textContent = t.trend;
                el.className = "kpi-trend-text" + (t.positive === true ? " up" : t.positive === false ? " down" : "");
            } else {
                el.textContent = "—";
                el.className = "kpi-trend-text";
            }
        });
    } catch (e) {
        console.error("KPI error:", e);
    }
}

async function loadKeyInsights() {
    const grid = document.getElementById("keyInsightsGrid");
    if (!grid) return;
    try {
        const insights = await fetchJson(apiUrl("/api/key-insights"));
        grid.innerHTML = insights.map((item) =>
            `<div class="key-insight-item">
                <span class="insight-icon">${item.icon || "•"}</span>
                <div>
                    <div class="insight-label">${item.label}</div>
                    <div class="insight-value">${item.value}</div>
                </div>
            </div>`
        ).join("");
    } catch (e) {
        grid.innerHTML = '<div class="key-insight-item"><span class="insight-value">Unable to load insights</span></div>';
        console.error("Key insights error:", e);
    }
}

// ── Load filter options ─────────────────────────────────────────────────────
async function loadFilterOptions() {
    try {
        const [genres, bounds] = await Promise.all([
            fetchJson("/api/filters/genres"),
            fetchJson("/api/filters/year-bounds"),
        ]);
        const genreSelect = document.getElementById("genreFilter");
        genreSelect.innerHTML = '<option value="">All Genres</option>';
        genres.forEach((g) => {
            const o = document.createElement("option");
            o.value = g;
            o.textContent = g;
            genreSelect.appendChild(o);
        });
        document.getElementById("yearMin").placeholder = bounds.min;
        document.getElementById("yearMax").placeholder = bounds.max;
        document.getElementById("yearMin").min = bounds.min;
        document.getElementById("yearMax").max = bounds.max;
    } catch (e) {
        console.error("Filter options error:", e);
    }
}

// ── Movie detail panel ──────────────────────────────────────────────────────
async function openMovieDetail(movieId) {
    const panel = document.getElementById("movieDetailPanel");
    const backdrop = document.getElementById("movieDetailBackdrop");
    if (!panel || !backdrop) return;
    try {
        const detail = await fetchJson("/api/movie-detail/" + movieId);
        document.getElementById("movieDetailTitle").textContent = detail.title;
        document.getElementById("movieDetailMeta").innerHTML =
            "<strong>Release Year:</strong> " + (detail.release_year ?? "—") + "<br>" +
            "<strong>Average Rating:</strong> " + detail.avg_rating + "<br>" +
            "<strong>Total Ratings:</strong> " + (detail.total_ratings || 0).toLocaleString() + "<br>" +
            "<strong>Genres:</strong> " + (detail.genres || "").split("|").join(", ");
        panel.classList.add("show");
        backdrop.classList.add("show");
        panel.setAttribute("aria-hidden", "false");
        backdrop.setAttribute("aria-hidden", "false");

        const [distData, timelineData] = await Promise.all([
            fetchJson("/api/movie-rating-distribution/" + movieId),
            fetchJson("/api/movie-ratings-timeline/" + movieId),
        ]);
        // Defer chart draw until panel is laid out so canvases have correct dimensions
        requestAnimationFrame(() => {
            requestAnimationFrame(() => renderMovieDetailCharts(distData, timelineData));
        });
    } catch (e) {
        console.error("Movie detail error:", e);
    }
}

function renderMovieDetailCharts(distData, timelineData) {
    destroyChart("movieDetailDistChart");
    destroyChart("movieDetailTimelineChart");
    const distDataSafe = distData && Array.isArray(distData.labels) && Array.isArray(distData.values) ? distData : { labels: [], values: [] };
    const timelineDataSafe = timelineData && Array.isArray(timelineData.labels) && Array.isArray(timelineData.values) ? timelineData : { labels: [], values: [] };
    const distCtx = document.getElementById("movieDetailDistChart")?.getContext("2d");
    const timeCtx = document.getElementById("movieDetailTimelineChart")?.getContext("2d");
    if (distCtx && distDataSafe.labels.length) {
        const starColors = distDataSafe.labels.map((l) => RATING_COLORS[Math.round(parseFloat(l))] || COLORS.primary);
        chartInstances.movieDetailDistChart = new Chart(distCtx, {
            type: "bar",
            data: {
                labels: distDataSafe.labels.map((l) => "★ " + l),
                datasets: [{ label: "Count", data: distDataSafe.values, backgroundColor: starColors.map((c) => c + "cc"), borderColor: starColors, borderRadius: 4 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
    }
    if (timeCtx && timelineDataSafe.labels.length) {
        chartInstances.movieDetailTimelineChart = new Chart(timeCtx, {
            type: "line",
            data: {
                labels: timelineDataSafe.labels,
                datasets: [{ label: "Ratings", data: timelineDataSafe.values, borderColor: COLORS.highlight, backgroundColor: COLORS.highlight + "22", fill: true, tension: 0.3 }],
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
        });
    }
}

function closeMoviePanel() {
    document.getElementById("movieDetailPanel")?.classList.remove("show");
    document.getElementById("movieDetailBackdrop")?.classList.remove("show");
    document.getElementById("movieDetailPanel")?.setAttribute("aria-hidden", "true");
    document.getElementById("movieDetailBackdrop")?.setAttribute("aria-hidden", "true");
}

// ── Top Rated (horizontal bar, tooltip: title, year, avg, count) ─────────────
async function renderTopRated() {
    destroyChart("topRatedChart");
    const data = await fetchJson(apiUrl("/api/top-rated"));
    const counts = data.counts || data.values.map(() => "");
    const movieIds = data.movie_ids || [];
    const releaseYears = data.release_years || [];

    const canvas = document.getElementById("topRatedChart");
    const ctx = canvas.getContext("2d");
    chartInstances.topRatedChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Avg Rating",
                data: data.values,
                backgroundColor: COLORS.primary + "cc",
                borderColor: COLORS.primary,
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length && movieIds[elements[0].index]) openMovieDetail(movieIds[elements[0].index]);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const i = item.dataIndex;
                            const title = data.labels[i] || "";
                            const year = releaseYears[i] != null ? releaseYears[i] : "—";
                            const genres = (data.genres && data.genres[i]) ? data.genres[i].split("|").join(", ") : "—";
                            return [
                                "Movie: " + title,
                                "Year: " + year,
                                "Average Rating: " + data.values[i],
                                "Total Ratings: " + (counts[i] != null ? counts[i].toLocaleString() : "—"),
                                "Genres: " + genres,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: { min: 3.2, max: 5, grid: { color: "rgba(255,255,255,0.06)" } },
                y: { grid: { display: false } },
            },
        },
        plugins: [{
            id: "barLabels",
            afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                chart.ctx.font = "12px DM Sans";
                chart.ctx.fillStyle = COLORS.textPrimary;
                meta.data.forEach((bar, i) => {
                    chart.ctx.fillText(data.values[i].toFixed(1), bar.x + 8, bar.y + 4);
                });
            },
        }],
    });
    const insightTop = document.getElementById("insightTopRated");
    if (insightTop && data.labels.length) {
        insightTop.textContent = "Highest rated: " + data.labels[0] + " (" + data.values[0] + ").";
    }
}

// ── Most Rated (lollipop-style: thin bar + circle at end, click → detail) ─────
async function renderMostRated() {
    destroyChart("mostRatedChart");
    const data = await fetchJson(apiUrl("/api/most-rated"));
    const movieIds = data.movie_ids || [];
    const avgRatings = data.avg_ratings || [];
    const genresList = data.genres || [];

    const ctx = document.getElementById("mostRatedChart").getContext("2d");
    chartInstances.mostRatedChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Rating Count",
                data: data.values,
                backgroundColor: COLORS.secondary + "aa",
                borderColor: COLORS.secondary,
                borderWidth: 1,
                borderRadius: 2,
                barPercentage: 0.18,
                categoryPercentage: 0.85,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length && movieIds[elements[0].index]) openMovieDetail(movieIds[elements[0].index]);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const i = item.dataIndex;
                            const genres = (genresList[i] || "").split("|").filter(Boolean).join(", ") || "—";
                            return [
                                "Movie: " + (data.labels[i] || ""),
                                "Year: " + (data.release_years && data.release_years[i] != null ? data.release_years[i] : "—"),
                                "Average Rating: " + (avgRatings[i] != null ? avgRatings[i] : "—"),
                                "Total Ratings: " + data.values[i].toLocaleString(),
                                "Genres: " + genres,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.06)" } },
                y: { grid: { display: false } },
            },
        },
        plugins: [{
            id: "lollipopCircles",
            afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                meta.data.forEach((bar, i) => {
                    chart.ctx.save();
                    chart.ctx.fillStyle = COLORS.secondary;
                    chart.ctx.strokeStyle = COLORS.secondary;
                    chart.ctx.lineWidth = 1.5;
                    chart.ctx.beginPath();
                    chart.ctx.arc(bar.x, bar.y, 6, 0, Math.PI * 2);
                    chart.ctx.fill();
                    chart.ctx.stroke();
                    chart.ctx.restore();
                });
            },
        }],
    });
    const insightMost = document.getElementById("insightMostRated");
    if (insightMost && data.labels.length) {
        insightMost.textContent = data.labels[0] + " received the highest number of ratings (" + (data.values[0] || 0).toLocaleString() + ").";
    }
}

// ── Movies per year (area chart, peak annotation) ────────────────────────────
async function renderMoviesPerYear() {
    destroyChart("moviesYearChart");
    const data = await fetchJson(apiUrl("/api/movies-per-year"));
    const peakYear = data.peak_year;
    const annEl = document.getElementById("moviesYearAnnotation");
    const insightEl = document.getElementById("insightMoviesYear");
    if (peakYear != null) {
        const idx = data.labels.indexOf(peakYear);
        const count = idx >= 0 ? data.values[idx] : 0;
        annEl.textContent = "Peak release year detected: " + peakYear;
        annEl.style.display = "block";
        if (insightEl) {
            insightEl.textContent = "Peak movie production occurred in " + peakYear + " with " + count + " releases.";
            insightEl.style.display = "block";
        }
    } else {
        annEl.style.display = "none";
        if (insightEl) insightEl.textContent = "";
    }

    const canvas = document.getElementById("moviesYearChart");
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, COLORS.highlight + "55");
    gradient.addColorStop(1, COLORS.highlight + "05");

    chartInstances.moviesYearChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Movies Released",
                data: data.values,
                borderColor: COLORS.highlight,
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: COLORS.highlight,
                tension: 0.3,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: "index" },
            onClick: (evt, elements) => {
                if (elements.length && data.labels[elements[0].index] != null) {
                    const y = data.labels[elements[0].index];
                    setCrossFilterYearRange(y, y);
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => "Year: " + item.label + ", Movies: " + item.raw,
                    },
                },
            },
            scales: {
                y: { grid: { color: "rgba(255,255,255,0.06)" } },
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 14, maxRotation: 45 },
                },
            },
        },
    });
}

// ── Genre Treemap (click → cross-filter by genre) ────────────────────────────
let activeCrossFilterGenre = null;

async function renderGenreTreemap() {
    activeCrossFilterGenre = getFilterParams().genre || null;
    const data = await fetchJson(apiUrl("/api/genre-popularity"));
    const total = data.values.reduce((a, b) => a + b, 0);
    const container = document.getElementById("genreTreemap");
    container.innerHTML = "";

    data.labels.forEach((label, i) => {
        const value = data.values[i];
        const pct = total ? ((value / total) * 100).toFixed(1) : 0;
        const block = document.createElement("div");
        block.className = "treemap-block" + (activeCrossFilterGenre === label ? " cross-filter-active" : "");
        block.style.backgroundColor = PALETTE[i % PALETTE.length] + "dd";
        block.style.flex = value + " 1 0%";
        block.title = label + ": " + value + " movies (" + pct + "%). Click to filter.";
        block.innerHTML = "<span>" + label + "</span><span style='font-size:11px;opacity:.9'>" + value + " (" + pct + "%)</span>";
        block.addEventListener("click", () => {
            if (activeCrossFilterGenre === label) {
                activeCrossFilterGenre = null;
                setCrossFilterGenre("");
            } else {
                activeCrossFilterGenre = label;
                setCrossFilterGenre(label);
            }
        });
        block.addEventListener("mouseenter", () => { block.style.zIndex = "1"; });
        block.addEventListener("mouseleave", () => { block.style.zIndex = ""; });
        container.appendChild(block);
    });
}

// ── Average rating by genre (horizontal bar, gradient, value at end) ──────────
async function renderAvgGenre() {
    destroyChart("avgGenreChart");
    const data = await fetchJson(apiUrl("/api/avg-rating-genre"));
    const ctx = document.getElementById("avgGenreChart").getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 400, 0);
    gradient.addColorStop(0, "#FF4B4B");
    gradient.addColorStop(0.5, "#F9C74F");
    gradient.addColorStop(1, "#43AA8B");

    const bgColors = data.values.map((v) => getColorByRating(v));

    chartInstances.avgGenreChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Avg Rating",
                data: data.values,
                backgroundColor: bgColors.map((c) => c + "cc"),
                borderColor: bgColors,
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => "Avg rating: " + item.raw,
                    },
                },
            },
            scales: {
                x: {
                    min: 3,
                    max: 5,
                    grid: { color: "rgba(255,255,255,0.06)" },
                },
                y: { grid: { display: false } },
            },
        },
        plugins: [{
            id: "barEndLabels",
            afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                chart.ctx.font = "12px DM Sans";
                chart.ctx.fillStyle = COLORS.textPrimary;
                meta.data.forEach((bar, i) => {
                    const value = data.values[i];
                    const x = bar.x + 8;
                    const y = bar.y;
                    chart.ctx.fillText(value.toFixed(2), x, y + 4);
                });
            },
        }],
    });
    const insightAvg = document.getElementById("insightAvgGenre");
    if (insightAvg && data.labels.length) {
        insightAvg.textContent = data.labels[0] + " has the highest average rating among all genres (" + data.values[0] + ").";
    }
}

// ── Rating distribution (vertical bar, star colors, percentage labels) ──────
async function renderRatingDist() {
    destroyChart("ratingDistChart");
    const data = await fetchJson(apiUrl("/api/rating-distribution"));
    const total = data.values.reduce((a, b) => a + b, 0);
    const percentages = data.values.map((v) => (total ? ((v / total) * 100).toFixed(1) : 0));

    const starColors = data.labels.map((l) => {
        const r = parseFloat(l);
        if (r <= 1.5) return RATING_COLORS[1];
        if (r <= 2.5) return RATING_COLORS[2];
        if (r <= 3.5) return RATING_COLORS[3];
        if (r <= 4.5) return RATING_COLORS[4];
        return RATING_COLORS[5];
    });

    const ctx = document.getElementById("ratingDistChart").getContext("2d");
    chartInstances.ratingDistChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels.map((l) => "★ " + l),
            datasets: [{
                label: "Count",
                data: data.values,
                backgroundColor: starColors.map((c) => c + "cc"),
                borderColor: starColors,
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length) {
                    const ratingStr = data.labels[elements[0].index];
                    if (ratingStr) setCrossFilterRating(parseFloat(ratingStr));
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const i = item.dataIndex;
                            return [
                                "Count: " + data.values[i].toLocaleString(),
                                "Percentage: " + percentages[i] + "%",
                                "Click to filter by this rating",
                            ];
                        },
                    },
                },
            },
            scales: {
                y: { grid: { color: "rgba(255,255,255,0.06)" } },
                x: { grid: { display: false } },
            },
        },
        plugins: [{
            id: "percentLabels",
            afterDatasetsDraw(chart) {
                const meta = chart.getDatasetMeta(0);
                chart.ctx.font = "11px DM Sans";
                chart.ctx.fillStyle = COLORS.textPrimary;
                meta.data.forEach((bar, i) => {
                    const pct = percentages[i] + "%";
                    const x = bar.x;
                    const y = bar.y - 6;
                    chart.ctx.textAlign = "center";
                    chart.ctx.fillText(pct, x, y);
                });
            },
        }],
    });
}

// ── User activity distribution (buckets: 1–10, 10–50, 50–100, 100+) ────────
async function renderUserActivity() {
    destroyChart("userActivityChart");
    const data = await fetchJson(apiUrl("/api/user-activity-distribution"));
    const ctx = document.getElementById("userActivityChart")?.getContext("2d");
    if (!ctx) return;
    chartInstances.userActivityChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Users",
                data: data.values,
                backgroundColor: [COLORS.primary + "cc", COLORS.secondary + "cc", COLORS.highlight + "cc", "#43AA8Bcc"],
                borderColor: [COLORS.primary, COLORS.secondary, COLORS.highlight, "#43AA8B"],
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: { label: (item) => item.raw + " users" },
                },
            },
            scales: {
                y: { grid: { color: "rgba(255,255,255,0.06)" } },
                x: { grid: { display: false } },
            },
        },
    });
}

// ── Movie age vs rating (scatter) ───────────────────────────────────────────
async function renderMovieAgeRating() {
    destroyChart("movieAgeRatingChart");
    const res = await fetchJson(apiUrl("/api/movie-age-rating"));
    const points = res.points || [];
    const ctx = document.getElementById("movieAgeRatingChart")?.getContext("2d");
    if (!ctx || !points.length) return;
    chartInstances.movieAgeRatingChart = new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [{
                label: "Movies",
                data: points.map((p) => ({ x: p.x, y: p.y })),
                backgroundColor: COLORS.highlight + "99",
                borderColor: COLORS.highlight,
                borderWidth: 1,
                pointRadius: 5,
                pointHoverRadius: 8,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = points[ctx.dataIndex];
                            if (!p) return [];
                            return [
                                "Movie: " + p.title,
                                "Year: " + p.year,
                                "Avg Rating: " + p.avg_rating,
                                "Genres: " + (p.genres || "").split("|").join(", "),
                            ];
                        },
                    },
                },
            },
            scales: {
                x: { title: { display: true, text: "Release Year" }, grid: { color: "rgba(255,255,255,0.06)" } },
                y: { title: { display: true, text: "Average Rating" }, min: 2.5, max: 5, grid: { color: "rgba(255,255,255,0.06)" } },
            },
        },
    });
}

// ── Genre rating heatmap (tooltip: genre, rating level, count) ───────────────
async function renderGenreHeatmap() {
    const data = await fetchJson(apiUrl("/api/genre-rating-heatmap"));
    const container = document.getElementById("genreHeatmap");
    if (!container) return;
    const maxVal = Math.max(...(data.data || []).flat(), 1);
    const cols = data.columns || [1, 2, 3, 4, 5];
    let html = '<table class="heatmap-table"><thead><tr><th>Genre</th>';
    cols.forEach((c) => { html += "<th>" + c + "★</th>"; });
    html += "</tr></thead><tbody>";
    (data.genres || []).forEach((genre, i) => {
        html += "<tr><th>" + genre + "</th>";
        (data.data[i] || []).forEach((val, j) => {
            const intensity = maxVal ? val / maxVal : 0;
            const bg = "rgba(255, 75, 75, " + (0.2 + 0.7 * intensity) + ")";
            const level = cols[j] != null ? cols[j] : j + 1;
            html += '<td class="heatmap-cell" style="background:' + bg + '" title="Genre: ' + genre + ", Rating: " + level + "★, Count: " + (val || 0) + '">' + (val || "0") + "</td>";
        });
        html += "</tr>";
    });
    html += "</tbody></table>";
    container.innerHTML = html;
}

// ── Genre engagement (total ratings per genre, tooltip: genre, total, avg) ───
async function renderGenreEngagement() {
    destroyChart("genreEngagementChart");
    const data = await fetchJson(apiUrl("/api/genre-engagement"));
    const ctx = document.getElementById("genreEngagementChart")?.getContext("2d");
    const avgRatings = data.avg_ratings || [];
    if (!ctx) return;
    chartInstances.genreEngagementChart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Total Ratings",
                data: data.values,
                backgroundColor: COLORS.secondary + "cc",
                borderColor: COLORS.secondary,
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (item) => {
                            const i = item.dataIndex;
                            const avg = avgRatings[i] != null ? avgRatings[i] : "—";
                            return [
                                "Genre: " + (data.labels[i] || ""),
                                "Total ratings: " + item.raw.toLocaleString(),
                                "Average rating: " + avg,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: { grid: { color: "rgba(255,255,255,0.06)" } },
                y: { grid: { display: false } },
            },
        },
    });
}

// ── Movie Popularity vs Rating (bubble chart + quadrant analysis + drill-down) ─
async function renderBubbleChart() {
    destroyChart("bubbleChart");
    const res = await fetchJson(apiUrl("/api/movie-popularity-rating-bubble"));
    const points = res.points || [];
    const avgY = res.avg_rating != null ? res.avg_rating : points.length ? points.reduce((s, p) => s + p.y, 0) / points.length : 3.5;
    const avgX = res.avg_count != null ? res.avg_count : points.length ? Math.round(points.reduce((s, p) => s + p.x, 0) / points.length) : 100;
    const ctx = document.getElementById("bubbleChart")?.getContext("2d");
    if (!ctx || !points.length) return;
    const maxR = Math.max(...points.map((p) => p.x), 1);
    chartInstances.bubbleChart = new Chart(ctx, {
        type: "bubble",
        data: {
            datasets: [{
                label: "Movies",
                data: points.map((p) => ({
                    x: p.x,
                    y: p.y,
                    r: Math.min(22, 6 + (p.x / maxR) * 14),
                })),
                backgroundColor: COLORS.highlight + "99",
                borderColor: COLORS.highlight,
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            onClick: (evt, elements) => {
                if (elements.length && points[elements[0].index]?.movie_id) {
                    openMovieDetail(points[elements[0].index].movie_id);
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const p = points[ctx.dataIndex];
                            if (!p) return [];
                            const genres = (p.genres || "").split("|").filter(Boolean).join(", ") || "—";
                            return [
                                "Movie: " + p.title,
                                "Year: " + (p.year != null ? p.year : "—"),
                                "Average Rating: " + p.avg_rating,
                                "Total Ratings: " + p.total_ratings.toLocaleString(),
                                "Genres: " + genres,
                            ];
                        },
                    },
                },
            },
            scales: {
                x: {
                    title: { display: true, text: "Total Ratings" },
                    grid: { color: "rgba(255,255,255,0.06)" },
                    min: 0,
                },
                y: {
                    title: { display: true, text: "Average Rating" },
                    min: 2.5,
                    max: 5,
                    grid: { color: "rgba(255,255,255,0.06)" },
                },
            },
        },
        plugins: [{
            id: "bubbleQuadrants",
            afterDatasetsDraw(chart) {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea || !scales.x || !scales.y) return;
                const xScale = scales.x;
                const yScale = scales.y;
                const xVal = avgX;
                const yVal = avgY;
                const xPixel = xScale.getPixelForValue(xVal);
                const yPixel = yScale.getPixelForValue(yVal);
                const left = chartArea.left;
                const right = chartArea.right;
                const top = chartArea.top;
                const bottom = chartArea.bottom;
                ctx.save();
                ctx.strokeStyle = "rgba(255,255,255,0.25)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(xPixel, top);
                ctx.lineTo(xPixel, bottom);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(left, yPixel);
                ctx.lineTo(right, yPixel);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.font = "10px DM Sans";
                ctx.fillStyle = "rgba(255,255,255,0.4)";
                ctx.textAlign = "center";
                const pad = 6;
                ctx.fillText("Blockbusters", (xPixel + right) / 2, (top + yPixel) / 2 - pad);
                ctx.fillText("Hidden Gems", (left + xPixel) / 2, (top + yPixel) / 2 - pad);
                ctx.fillText("Overhyped", (xPixel + right) / 2, (yPixel + bottom) / 2 + pad);
                ctx.fillText("Unnoticed", (left + xPixel) / 2, (yPixel + bottom) / 2 + pad);
                ctx.restore();
            },
        }],
    });
}

// ── Refresh all charts (on filter change) ────────────────────────────────────
async function refreshAllCharts() {
    showLoading(true);
    try {
        await Promise.all([
            loadKpis(),
            loadKeyInsights(),
            renderTopRated(),
            renderMostRated(),
            renderMoviesPerYear(),
            renderMovieAgeRating(),
            renderGenreTreemap(),
            renderAvgGenre(),
            renderGenreEngagement(),
            renderRatingDist(),
            renderUserActivity(),
            renderGenreHeatmap(),
            renderBubbleChart(),
        ]);
    } catch (e) {
        console.error("Refresh error:", e);
    } finally {
        showLoading(false);
    }
}

// ── Movie search autocomplete ─────────────────────────────────────────────────
let autocompleteTimeout = null;

async function fetchAutocomplete(query) {
    if (!query || query.length < 2) return [];
    const base = apiUrl("/api/search-movies");
    const url = base + (base.includes("?") ? "&" : "?") + "title=" + encodeURIComponent(query);
    const data = await fetchJson(url);
    return (data.movies || []).slice(0, 8);
}

function showAutocomplete(items) {
    const dd = document.getElementById("autocompleteDropdown");
    dd.innerHTML = "";
    if (!items || items.length === 0) {
        dd.classList.remove("show");
        return;
    }
    items.forEach((m) => {
        const div = document.createElement("div");
        div.className = "autocomplete-item";
        div.textContent = m.title + (m.release_year ? " (" + m.release_year + ")" : "");
        div.addEventListener("click", () => {
            document.getElementById("movieSearchInput").value = m.title;
            dd.classList.remove("show");
            fetchInsight(m.title);
        });
        dd.appendChild(div);
    });
    dd.classList.add("show");
}

function onSearchInput() {
    const input = document.getElementById("movieSearchInput");
    const q = input.value.trim();
    clearTimeout(autocompleteTimeout);
    if (!q) {
        document.getElementById("autocompleteDropdown").classList.remove("show");
        return;
    }
    autocompleteTimeout = setTimeout(async () => {
        const items = await fetchAutocomplete(q);
        showAutocomplete(items);
    }, 250);
}

// ── Movie quick insight ──────────────────────────────────────────────────────
async function fetchInsight(title) {
    const t = (title || document.getElementById("movieSearchInput").value.trim()).trim();
    if (!t) return;

    const card = document.getElementById("insightCard");
    const notFound = document.getElementById("insightNotFound");
    card.style.display = "none";
    notFound.style.display = "none";

    try {
        const d = await fetchJson("/api/movie-insight?title=" + encodeURIComponent(t));
        document.getElementById("insightTitle").textContent = d.title;
        document.getElementById("insightAvg").textContent = d.avg_rating + " ★";
        document.getElementById("insightCount").textContent = d.total_ratings.toLocaleString();
        document.getElementById("insightGenres").textContent = (d.genres || "").split("|").join(" · ");
        document.getElementById("insightYear").textContent = d.release_year != null ? d.release_year : "—";
        card.style.display = "block";
    } catch (e) {
        notFound.style.display = "block";
        console.error("Insight error:", e);
    }
}

// ── Search (table) — optional; if you have search results panel you can wire here
function runSearch() {
    const title = document.getElementById("movieSearchInput").value.trim();
    if (title) fetchInsight(title);
}

// ── Close autocomplete on outside click ──────────────────────────────────────
document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".search-input-wrap");
    const dd = document.getElementById("autocompleteDropdown");
    if (wrap && dd && !wrap.contains(e.target)) {
        dd.classList.remove("show");
    }
});

// ── Sidebar active state ──────────────────────────────────────────────────────
function updateSidebarActive() {
    const ids = ["overview", "movie-performance", "industry-trends", "genre-insights", "user-behavior", "advanced-insights"];
    const dataSectionMap = {
        overview: "overview",
        "movie-performance": "movie-performance",
        "industry-trends": "industry-trends",
        "genre-insights": "genre-insights",
        "user-behavior": "user-behavior",
        "advanced-insights": "advanced-insights",
    };
    const links = document.querySelectorAll(".sidebar-nav .nav-link");
    let current = "overview";
    const top = window.scrollY + 120;
    for (let i = ids.length - 1; i >= 0; i--) {
        const el = document.getElementById(ids[i]);
        if (el && el.offsetTop <= top) {
            current = dataSectionMap[ids[i]] || "overview";
            break;
        }
    }
    links.forEach((link) => {
        const section = link.getAttribute("data-section");
        link.classList.toggle("active", section === current);
    });
}

// ── Dataset info modal ───────────────────────────────────────────────────────
async function openDatasetModal() {
    const modal = document.getElementById("datasetModal");
    const body = document.getElementById("datasetModalBody");
    if (!modal || !body) return;
    try {
        const info = await fetchJson("/api/dataset-info");
        body.innerHTML =
            "<p><strong>Dataset:</strong> " + info.name + "</p>" +
            "<p><strong>Movies:</strong> " + info.movies.toLocaleString() + "</p>" +
            "<p><strong>Ratings:</strong> " + info.ratings.toLocaleString() + "</p>" +
            "<p><strong>Users:</strong> " + info.users.toLocaleString() + "</p>" +
            "<p>" + (info.description || "") + "</p>";
    } catch (e) {
        body.innerHTML = "<p>Unable to load dataset info.</p>";
    }
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
}

function closeDatasetModal() {
    const modal = document.getElementById("datasetModal");
    if (modal) {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
    }
}

// ── Export ──────────────────────────────────────────────────────────────────
function exportCSV() {
    const rows = [
        ["Metric", "Value"],
        ["Total Movies", document.getElementById("totalMovies")?.textContent || ""],
        ["Total Ratings", document.getElementById("totalRatings")?.textContent || ""],
        ["Average Rating", document.getElementById("avgRating")?.textContent || ""],
        ["Total Users", document.getElementById("totalUsers")?.textContent || ""],
    ];
    const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
    a.download = "dashboard-metrics-" + new Date().toISOString().slice(0, 10) + ".csv";
    a.click();
}

function exportPNG() {
    const main = document.querySelector(".main-content");
    if (!main) return;
    const opts = { scale: 2 };
    import("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js")
        .then(({ default: html2canvas }) => html2canvas(main, opts))
        .then((canvas) => {
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/png");
            a.download = "dashboard-" + new Date().toISOString().slice(0, 10) + ".png";
            a.click();
        })
        .catch(() => alert("Export failed. Ensure html2canvas is available."));
}

function exportChartPNG(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = (chartId || "chart") + "-" + new Date().toISOString().slice(0, 10) + ".png";
    a.click();
}

function exportChartCSV(chartId, dataEndpoint) {
    const endpoints = {
        "topRatedChart": "/api/top-rated",
        "mostRatedChart": "/api/most-rated",
        "moviesYearChart": "/api/movies-per-year",
        "movies-per-year": "/api/movies-per-year",
        "avgGenreChart": "/api/avg-rating-genre",
        "bubbleChart": "/api/movie-popularity-rating-bubble",
    };
    const path = dataEndpoint ? "/api/" + dataEndpoint : (endpoints[chartId] || "/api/top-rated");
    const url = apiUrl(path);
    fetch(url)
        .then((r) => r.json())
        .then((data) => {
            let csv = "";
            if (data.labels && data.values) {
                csv = "Label,Value\n" + data.labels.map((l, i) => '"' + String(l).replace(/"/g, '""') + '",' + (data.values[i] ?? "")).join("\n");
            } else if (data.points && data.points.length) {
                csv = "Title,Year,Average Rating,Total Ratings\n" + data.points.map((p) => '"' + String(p.title || "").replace(/"/g, '""') + '",' + (p.year ?? "") + "," + (p.avg_rating ?? "") + "," + (p.total_ratings ?? "")).join("\n");
            } else {
                csv = "No data";
            }
            const a = document.createElement("a");
            a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
            a.download = (chartId || "chart") + "-" + new Date().toISOString().slice(0, 10) + ".csv";
            a.click();
        })
        .catch(() => alert("Could not export CSV."));
}

function exportReport() {
    const title = "Movie Rating Analytics Dashboard – Report";
    const updated = document.getElementById("headerLastUpdated")?.textContent || "";
    const body = document.querySelector(".main-content")?.innerHTML || "";
    const html = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + title + "</title><link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css' rel='stylesheet'></head><body style='padding:24px;'><h1>" + title + "</h1><p>" + updated + "</p><div class='report-body'>" + body + "</div></body></html>";
    const a = document.createElement("a");
    a.href = "data:text/html;charset=utf-8," + encodeURIComponent(html);
    a.download = "dashboard-report-" + new Date().toISOString().slice(0, 10) + ".html";
    a.click();
}

// ── Theme toggle ────────────────────────────────────────────────────────────
function initTheme() {
    const stored = localStorage.getItem("dashboard-theme");
    if (stored === "light") document.body.classList.add("light-theme");
    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.addEventListener("click", () => {
            document.body.classList.toggle("light-theme");
            const isLight = document.body.classList.contains("light-theme");
            localStorage.setItem("dashboard-theme", isLight ? "light" : "dark");
            btn.querySelector("i").className = isLight ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
        });
        btn.querySelector("i").className = document.body.classList.contains("light-theme") ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
    }
}

// ── Init filters & event listeners ───────────────────────────────────────────
function initFilters() {
    const genreFilter = document.getElementById("genreFilter");
    const yearMin = document.getElementById("yearMin");
    const yearMax = document.getElementById("yearMax");
    const minRatingSlider = document.getElementById("minRatingSlider");
    const minRatingValue = document.getElementById("minRatingValue");

    if (minRatingSlider && minRatingValue) {
        minRatingSlider.addEventListener("input", () => {
            minRatingValue.textContent = minRatingSlider.value;
            refreshAllCharts();
        });
    }

    [genreFilter, yearMin, yearMax].forEach((el) => {
        if (el) {
            el.addEventListener("change", refreshAllCharts);
            el.addEventListener("input", () => {
                if (el === yearMin || el === yearMax) refreshAllCharts();
            });
        }
    });

    document.getElementById("searchBtn")?.addEventListener("click", runSearch);
    document.getElementById("movieSearchInput")?.addEventListener("input", onSearchInput);
    document.getElementById("movieSearchInput")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runSearch();
    });

    document.getElementById("datasetInfoBtn")?.addEventListener("click", openDatasetModal);
    document.getElementById("closeDatasetModal")?.addEventListener("click", closeDatasetModal);
    document.getElementById("datasetModal")?.addEventListener("click", (e) => { if (e.target.id === "datasetModal") closeDatasetModal(); });

    document.getElementById("exportBtn")?.addEventListener("click", () => document.querySelector(".export-dropdown")?.classList.toggle("open"));
    document.querySelectorAll(".export-menu [data-export]").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelector(".export-dropdown")?.classList.remove("open");
            if (btn.dataset.export === "csv") exportCSV();
            else if (btn.dataset.export === "png") exportPNG();
            else if (btn.dataset.export === "report") exportReport();
        });
    });

    document.getElementById("closeMoviePanel")?.addEventListener("click", closeMoviePanel);
    document.getElementById("movieDetailBackdrop")?.addEventListener("click", closeMoviePanel);

    document.getElementById("clearRatingFilter")?.addEventListener("click", clearCrossFilterRating);
    document.getElementById("resetFiltersBtn")?.addEventListener("click", resetAllFilters);

    document.querySelectorAll(".chart-export-wrap").forEach((wrap) => {
        const btn = wrap.querySelector(".btn-chart-export");
        const menu = wrap.querySelector(".chart-export-menu");
        const chartId = wrap.getAttribute("data-chart");
        if (!btn || !menu || !chartId) return;
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".chart-export-wrap.open").forEach((w) => { if (w !== wrap) w.classList.remove("open"); });
            wrap.classList.toggle("open");
        });
        menu.querySelectorAll("button").forEach((b) => {
            b.addEventListener("click", (e) => {
                e.stopPropagation();
                wrap.classList.remove("open");
                const type = b.getAttribute("data-type");
                if (type === "png") exportChartPNG(chartId);
                if (type === "csv") exportChartCSV(chartId, wrap.getAttribute("data-csv"));
            });
        });
    });
    document.addEventListener("click", () => document.querySelectorAll(".chart-export-wrap.open").forEach((w) => w.classList.remove("open")));

    initTheme();
    window.addEventListener("scroll", updateSidebarActive);
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function loadDashboard() {
    const headerUpdated = document.getElementById("headerLastUpdated");
    if (headerUpdated) {
        headerUpdated.textContent = "Last updated: " + new Date().toLocaleString();
    }

    await loadFilterOptions();
    initFilters();
    await refreshAllCharts();
    const rv = document.getElementById("ratingValueFilter")?.value;
    const badge = document.getElementById("ratingFilterBadge");
    if (badge && (!rv || rv === "")) badge.style.display = "none";
    updateSidebarActive();

    console.log("Dashboard loaded.");
}

window.addEventListener("load", loadDashboard);
document.addEventListener("click", (e) => {
    if (!e.target.closest(".export-dropdown")) document.querySelector(".export-dropdown")?.classList.remove("open");
});
