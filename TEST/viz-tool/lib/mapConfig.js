// Map configuration: scale, world-coordinate origins, minimap image filenames
export const MAP_CONFIG = {
  AmbroseValley: {
    scale: 900,
    originX: -370,
    originZ: -473,
    image: '/maps/AmbroseValley_Minimap.png',
    label: 'Ambrose Valley',
  },
  GrandRift: {
    scale: 581,
    originX: -290,
    originZ: -290,
    image: '/maps/GrandRift_Minimap.png',
    label: 'Grand Rift',
  },
  Lockdown: {
    scale: 1000,
    originX: -500,
    originZ: -500,
    image: '/maps/Lockdown_Minimap.jpg',
    label: 'Lockdown',
  },
};

export const MINIMAP_SIZE = 1024;

/** Convert world (x, z) to minimap pixel coords */
export function worldToPixel(x, z, mapId) {
  const cfg = MAP_CONFIG[mapId];
  if (!cfg) return [0, 0];
  const u = (x - cfg.originX) / cfg.scale;
  const v = (z - cfg.originZ) / cfg.scale;
  return [u * MINIMAP_SIZE, (1 - v) * MINIMAP_SIZE];
}

// Event colors used across the app
export const EVENT_COLORS = {
  Kill: '#ef4444',       // red
  Killed: '#f97316',     // orange
  BotKill: '#fbbf24',    // amber
  BotKilled: '#fb923c',  // light orange
  KilledByStorm: '#a855f7', // purple
  Loot: '#22c55e',       // green
};

export const EVENT_LABELS = {
  Kill: 'Kill (PvP)',
  Killed: 'Death (PvP)',
  BotKill: 'Bot Kill',
  BotKilled: 'Death (Bot)',
  KilledByStorm: 'Storm Death',
  Loot: 'Loot',
};
