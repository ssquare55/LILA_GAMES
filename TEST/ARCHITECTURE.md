# Architecture Document — LILA BLACK Player Journey Visualization Tool

## Overview

This tool allows Level Designers to visually explore how players interact with game maps in LILA BLACK. 
Transforming raw gameplay telemetry into an interactive map visualization, designers can analyze player movement, combat zones, deaths, and loot activity. 
The goal is to provide a clear and intuitive way to identify gameplay patterns such as high-traffic routes, contested areas, and underutilized parts of the map.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Data pipeline** | Python 3 + PyArrow + Pandas + NumPy | Industry-standard for parquet; fast batch processing |
| **Frontend** | Next.js | Native Vercel deployment + trusted, mature framework |
| **Styling** | Tailwind CSS | Rapid dark UI development |
| **Rendering** | HTML Canvas API | Handles thousands of position points at 60fps; SVG would be too slow |
| **Hosting** | Vercel (or local `npm run dev`) | Zero-config static deploy, instant shareable URL |

---

## Trade-offs Made and Why

During development, several design decisions were made to balance performance, usability, and development speed.

### Dark Mode UI
Level Designers often spend long hours analyzing maps, so the interface was built in dark mode to reduce eye strain and improve visual clarity for heatmaps and event markers.

### Visualization vs Performance
Player movement data can contain thousands of points per match. Rendering every point would reduce browser performance, especially during timeline playback. Paths are downsampled to a maximum of 200 points per player, preserving overall movement patterns while ensuring smooth rendering.

### Static Data Pipeline
Instead of building a backend API, parquet files are preprocessed into static JSON. This allows the app to:
- Load data faster (no server round-trip)
- Be deployed as a fully static application
- Avoid backend hosting costs

The trade-off is that the preprocessing script must be re-run if new gameplay data is added.

### Canvas over SVG
The HTML Canvas API is used instead of SVG because canvas enables smooth rendering and timeline playback at ~60fps with thousands of data points.

### Lazy Match Loading
Match data is fetched only when a user selects a specific match. This keeps the initial application load lightweight and improves perceived performance.

### Offline Preprocessing
All heavy computation (coordinate transformation, path downsampling, heatmap generation) is handled offline so that the browser only performs lightweight rendering operations.

| Decision | Trade-off |
|----------|-----------|
| Pre-process to static JSON | ✅ No backend, faster loading, saves cost · ❌ Requires re-running on data changes |
| Path downsampling (max 200 pts) | ✅ Smooth rendering · ❌ Very fine movement detail may be lost |
| 64×64 heatmap grid | ✅ Fast rendering, easy interpretation · ❌ Slightly lower spatial resolution |
| Canvas over SVG | ✅ Handles thousands of points at ~60fps · ❌ Less native interactivity than SVG |
| Per-match lazy loading | ✅ Small initial bundle · ❌ Small delay (~0.5s) when loading a match |
| Ref-based timeline seek | ✅ Smooth playback without React re-renders · ❌ Slightly less idiomatic React |

---

## Future Scope

Further improvements will depend on feedback from Level Designers. Below are the most impactful additions that could be made:

1. **Storm Zone Visualization** — animate the shrinking storm boundary during playback to help designers analyze whether deaths are caused by poor navigation, unfair terrain, or storm pressure.
2. **Multi-Match Aggregate Heatmaps** — aggregate multiple matches across a date range to identify consistent hotspots, choke points, and underutilized areas.
3. **Player Tracking Across Matches** — search by player UUID to trace individual behavior across multiple sessions and compare experienced vs. new player routes.
4. **Interactive Tooltips** — hover over paths or event markers to surface player ID, kill count, cause of death, and match timestamp without cluttering the interface.
5. **Data Analysis Layer** — surface lightweight analytics (top kill zones, low-traffic regions, frequent routes) so designers can quickly spot map balance issues without manually interpreting the raw visualization.








---
## Technical Flow
## Directory Structure

```
TEST/
├── preprocess.py                  ← Offline data pipeline (run once)
├── *.parquet                      ← Raw telemetry (1,243 files)
├── ARCHITECTURE.md                ← This file
└── viz-tool/
    ├── app/
    │   ├── page.js                ← Root: all state, data loading, layout
    │   └── layout.js              ← Next.js shell
    ├── components/
    │   ├── MapCanvas.js           ← Canvas rendering engine
    │   ├── Sidebar.js             ← All filter and control UI
    │   └── Timeline.js            ← Scrubber, play/pause, speed controls
    ├── lib/
    │   ├── dataLoader.js          ← Fetch helpers with in-memory caching
    │   └── mapConfig.js           ← Map scales, origins, event colors/labels
    └── public/
        ├── maps/                  ← Minimap PNG/JPG images (1024×1024)
        └── data/                  ← Pre-processed static JSON (no backend)
            ├── matches_index.json         (796 matches, ~80KB)
            ├── events/{match_id}.json     (one per match, ~3–15KB)
            └── heatmap_{map_id}.json      (3 files, 64×64 grid, 0–1 normalized)
```

---

#

### Event Markers

| Type | Color | Represents |
|------|-------|-----------|
| `Kill` | 🔴 Red | PvP player kill |
| `Killed` | 🟠 Orange | PvP player death |
| `BotKill` | 🟡 Amber | Player eliminated a bot |
| `BotKilled` | 🟠 Light orange | Player killed by a bot |
| `KilledByStorm` | 🟣 Purple | Player died to storm/zone |
| `Loot` | 🟢 Green | Item pickup |

# Data Pipeline — `preprocess.py`

Run offline whenever raw parquet data changes.

Reads parquet files → merges into one DataFrame → outputs static JSON to `public/data/`:

- **Decode & classify** — event bytes → string, user_id UUID → human / numeric → bot
- **Coordinate transform** — world (x, z) → minimap pixel (0–1024), Y-axis flipped
- **Timestamp normalise** — absolute epoch ms → match-relative ms (0 = match start)
- **Separate & downsample** — Position rows → path arrays (max 200 pts/player); all other events → `{type, x, y, ts}` arrays; 64×64 heatmap grids built and normalised 0–1

Outputs: `matches_index.json`, `events/{match_id}.json`, `heatmap_{map_id}.json`

---

## Frontend Data Flow

On startup, `matches_index.json` is fetched and grouped by map + day to populate the sidebar filters. Selecting a map fetches its heatmap JSON. Selecting a match fetches `events/{match_id}.json`, calculates the timeline range, and sets the scrubber to the end so all events are visible immediately.

The canvas `draw()` function layers four things in order:
1. **Minimap image** — PNG/JPG drawn to canvas background
2. **Heatmap overlay** — pre-rendered off-screen canvas composited at the chosen opacity
3. **Player paths & markers** — binary search finds visible path points (≤ currentTs), draws glow + main stroke + position dot, then renders event markers via an early-break sorted loop
4. **Empty state card** — shown when no match is loaded

---

## Timeline Playback

| Mechanism | Detail |
|-----------|--------|
| **Scrubber** | HTML range input, step=1ms, min=minTs, max=maxTs |
| **Seek speed** | `currentTimeMsRef` — ref bypasses React re-render pipeline on every tick |
| **RAF loop** | `requestAnimationFrame` advances ts by `dt × speed × STRETCH_FACTOR` |
| **Stretch factor** | `0.1` — 1× speed = 0.1ms data per real ms (~8s for an 800ms match) |
| **Speed buttons** | 0.25×, 0.5×, 1×, 2×, 4× |
| **Auto-rewind** | Pressing Play when scrubber is at end rewinds to minTs |

---

## Rendering Details — `MapCanvas.js`

### Coordinate System
- Minimap images are 1024×1024px (logical)
- Canvas fills the browser viewport via `fitToCanvas()`
- Pan/zoom state in `viewRef` (`scale`, `offsetX`, `offsetY`) — not React state
- Zoom: scroll wheel (0.25×–10× range), reset: double-click

### Heatmap Rendering
- Pre-rendered once to an off-screen canvas, cached per layer
- Each non-zero grid cell → radial gradient circle (radius = 1.5 cells)
- Value amplified with `t = raw^0.4` so low-density cells stay visible
- Three layers: **Traffic** (blue), **Kill Zones** (red), **Death Zones** (orange)
- Intensity controlled by a sidebar opacity slider (0–100%, default 75%)