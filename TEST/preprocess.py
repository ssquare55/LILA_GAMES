#!/usr/bin/env python3
"""
Preprocess LILA BLACK parquet data into JSON for the visualization frontend.
Outputs to viz-tool/public/data/ and viz-tool/public/maps/
"""

import os
import json
import shutil
import re
import numpy as np
import pyarrow.parquet as pq
import pandas as pd
from collections import defaultdict

# ─── Configuration ───────────────────────────────────────────────────────────

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
DAYS = ["February_10", "February_11", "February_12", "February_13", "February_14"]
OUTPUT_DIR = os.path.join(DATA_DIR, "viz-tool", "public", "data")
MAPS_OUTPUT_DIR = os.path.join(DATA_DIR, "viz-tool", "public", "maps")
MINIMAP_DIR = os.path.join(DATA_DIR, "player_data", "minimaps")

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift":     {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown":      {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

MINIMAP_SIZE = 1024
HEATMAP_GRID = 64  # 64x64 grid for heatmaps

UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE
)

def is_human(user_id: str) -> bool:
    return bool(UUID_PATTERN.match(user_id))

def world_to_pixel(x, z, map_id: str) -> tuple:
    cfg = MAP_CONFIG[map_id]
    u = (float(x) - cfg["origin_x"]) / cfg["scale"]
    v = (float(z) - cfg["origin_z"]) / cfg["scale"]
    px = u * MINIMAP_SIZE
    py = (1 - v) * MINIMAP_SIZE
    return round(float(px), 1), round(float(py), 1)


# ─── Load all data ──────────────────────────────────────────────────────────

def load_all_data() -> pd.DataFrame:
    frames = []
    for day in DAYS:
        day_dir = os.path.join(DATA_DIR, "player_data", day)
        if not os.path.isdir(day_dir):
            continue
        files = [f for f in os.listdir(day_dir) if not f.startswith('.')]
        print(f"  Loading {day}: {len(files)} files...")
        for fname in files:
            filepath = os.path.join(day_dir, fname)
            try:
                table = pq.read_table(filepath)
                df = table.to_pandas()
                df['_day'] = day
                frames.append(df)
            except Exception as e:
                print(f"    SKIP {fname}: {e}")
    
    combined = pd.concat(frames, ignore_index=True)
    
    # Decode event bytes
    combined['event'] = combined['event'].apply(
        lambda x: x.decode('utf-8') if isinstance(x, bytes) else str(x)
    )
    
    # Strip .nakama-0 suffix from match_id for cleaner keys
    combined['match_id_clean'] = combined['match_id'].str.replace('.nakama-0', '', regex=False)
    
    # Classify human vs bot
    combined['is_human'] = combined['user_id'].apply(is_human)
    
    # Convert timestamps: ts is already datetime64[ms], so .astype('int64') gives ms since epoch
    combined['ts_ms'] = combined['ts'].astype('int64')  # ms since epoch
    
    print(f"\n  Total rows: {len(combined):,}")
    print(f"  Unique matches: {combined['match_id_clean'].nunique()}")
    print(f"  Unique players: {combined['user_id'].nunique()}")
    print(f"  Event types: {sorted(combined['event'].unique())}")
    
    return combined


# ─── Build match index ───────────────────────────────────────────────────────

def build_match_index(df: pd.DataFrame) -> dict:
    index = {}
    grouped = df.groupby('match_id_clean')
    
    for match_id, group in grouped:
        map_id = group['map_id'].iloc[0]
        day = group['_day'].iloc[0]
        humans = group[group['is_human']]['user_id'].nunique()
        bots = group[~group['is_human']]['user_id'].nunique()
        events = group[~group['event'].isin(['Position', 'BotPosition'])]
        kills = len(events[events['event'].isin(['Kill', 'BotKill'])])
        deaths = len(events[events['event'].isin(['Killed', 'BotKilled', 'KilledByStorm'])])
        duration_ms = int(group['ts_ms'].max() - group['ts_ms'].min())
        
        index[match_id] = {
            "map": map_id,
            "day": day,
            "humans": humans,
            "bots": bots,
            "kills": kills,
            "deaths": deaths,
            "duration_ms": duration_ms,
        }
    
    return index


# ─── Build per-match event data ─────────────────────────────────────────────

def build_match_events(df: pd.DataFrame) -> dict:
    all_matches = {}
    grouped = df.groupby('match_id_clean')
    
    for match_id, group in grouped:
        map_id = group['map_id'].iloc[0]
        
        # Normalize timestamps to match-relative ms (0 = match start)
        match_start = int(group['ts_ms'].min())
        
        players = {}
        
        for user_id, player_group in group.groupby('user_id'):
            player_group = player_group.sort_values('ts_ms')
            human = is_human(user_id)
            
            path = []
            events_list = []
            
            for _, row in player_group.iterrows():
                px, py = world_to_pixel(row['x'], row['z'], map_id)
                ts = int(row['ts_ms']) - match_start   # relative to match start
                evt = row['event']
                
                if evt in ('Position', 'BotPosition'):
                    path.append([px, py, ts])
                else:
                    events_list.append({
                        "type": evt,
                        "x": px,
                        "y": py,
                        "ts": ts,
                    })
            
            # Downsample path if too many points (keep every Nth)
            if len(path) > 200:
                step = max(1, len(path) // 200)
                path = path[::step]
                # Always keep last point
                last = player_group.iloc[-1]
                lpx, lpy = world_to_pixel(last['x'], last['z'], map_id)
                path.append([lpx, lpy, int(last['ts_ms']) - match_start])
            
            short_id = user_id[:8] if human else user_id
            players[short_id] = {
                "human": human,
                "path": path,
                "events": events_list,
            }
        
        all_matches[match_id] = {
            "map": map_id,
            "players": players,
        }
    
    return all_matches


# ─── Build heatmaps ─────────────────────────────────────────────────────────

def build_heatmaps(df: pd.DataFrame) -> dict:
    heatmaps = {}
    
    for map_id in MAP_CONFIG:
        map_data = df[df['map_id'] == map_id]
        
        # Traffic heatmap (all position events)
        positions = map_data[map_data['event'].isin(['Position', 'BotPosition'])]
        traffic_grid = np.zeros((HEATMAP_GRID, HEATMAP_GRID))
        
        for _, row in positions.iterrows():
            px, py = world_to_pixel(row['x'], row['z'], map_id)
            gx = min(int(px / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            gy = min(int(py / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            if 0 <= gx < HEATMAP_GRID and 0 <= gy < HEATMAP_GRID:
                traffic_grid[gy][gx] += 1
        
        # Kill heatmap
        kills = map_data[map_data['event'].isin(['Kill', 'BotKill'])]
        kill_grid = np.zeros((HEATMAP_GRID, HEATMAP_GRID))
        for _, row in kills.iterrows():
            px, py = world_to_pixel(row['x'], row['z'], map_id)
            gx = min(int(px / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            gy = min(int(py / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            if 0 <= gx < HEATMAP_GRID and 0 <= gy < HEATMAP_GRID:
                kill_grid[gy][gx] += 1
        
        # Death heatmap
        deaths = map_data[map_data['event'].isin(['Killed', 'BotKilled', 'KilledByStorm'])]
        death_grid = np.zeros((HEATMAP_GRID, HEATMAP_GRID))
        for _, row in deaths.iterrows():
            px, py = world_to_pixel(row['x'], row['z'], map_id)
            gx = min(int(px / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            gy = min(int(py / MINIMAP_SIZE * HEATMAP_GRID), HEATMAP_GRID - 1)
            if 0 <= gx < HEATMAP_GRID and 0 <= gy < HEATMAP_GRID:
                death_grid[gy][gx] += 1
        
        # Normalize to 0-1 range
        def normalize(grid):
            mx = grid.max()
            if mx > 0:
                return (grid / mx).round(3).tolist()
            return grid.tolist()
        
        heatmaps[map_id] = {
            "traffic": normalize(traffic_grid),
            "kills": normalize(kill_grid),
            "deaths": normalize(death_grid),
            "grid_size": HEATMAP_GRID,
        }
    
    return heatmaps


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("LILA BLACK Data Preprocessor")
    print("=" * 60)
    
    # Create output dirs
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(os.path.join(OUTPUT_DIR, "events"), exist_ok=True)
    os.makedirs(MAPS_OUTPUT_DIR, exist_ok=True)
    
    # Copy minimaps
    print("\n📍 Copying minimap images...")
    for fname in os.listdir(MINIMAP_DIR):
        if fname.startswith('.'):
            continue
        src = os.path.join(MINIMAP_DIR, fname)
        dst = os.path.join(MAPS_OUTPUT_DIR, fname)
        shutil.copy2(src, dst)
        print(f"  ✓ {fname}")
    
    # Load data
    print("\n📊 Loading parquet data...")
    df = load_all_data()
    
    # Build match index
    print("\n📋 Building match index...")
    match_index = build_match_index(df)
    index_path = os.path.join(OUTPUT_DIR, "matches_index.json")
    with open(index_path, 'w') as f:
        json.dump(match_index, f, separators=(',', ':'))
    print(f"  ✓ {len(match_index)} matches → matches_index.json")
    
    # Build per-match event files
    print("\n🎮 Building per-match event data...")
    match_events = build_match_events(df)
    for match_id, data in match_events.items():
        event_path = os.path.join(OUTPUT_DIR, "events", f"{match_id}.json")
        with open(event_path, 'w') as f:
            json.dump(data, f, separators=(',', ':'))
    print(f"  ✓ {len(match_events)} match files written")
    
    # Build heatmaps
    print("\n🔥 Building heatmaps...")
    heatmaps = build_heatmaps(df)
    for map_id, hmap in heatmaps.items():
        hmap_path = os.path.join(OUTPUT_DIR, f"heatmap_{map_id}.json")
        with open(hmap_path, 'w') as f:
            json.dump(hmap, f, separators=(',', ':'))
        print(f"  ✓ {map_id} heatmap")
    
    print("\n" + "=" * 60)
    print("✅ Preprocessing complete!")
    print(f"   Output: {OUTPUT_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
