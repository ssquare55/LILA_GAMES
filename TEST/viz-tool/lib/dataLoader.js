// Data loading utilities — fetch from static JSON in /public/data/
let matchIndexCache = null;
const matchEventsCache = {};

export async function loadMatchIndex() {
  if (matchIndexCache) return matchIndexCache;
  const res = await fetch('/data/matches_index.json');
  matchIndexCache = await res.json();
  return matchIndexCache;
}

export async function loadMatchEvents(matchId) {
  if (matchEventsCache[matchId]) return matchEventsCache[matchId];
  const res = await fetch(`/data/events/${matchId}.json`);
  if (!res.ok) throw new Error(`Failed to load match ${matchId}`);
  const data = await res.json();
  matchEventsCache[matchId] = data;
  return data;
}

export async function loadHeatmap(mapId) {
  const res = await fetch(`/data/heatmap_${mapId}.json`);
  if (!res.ok) throw new Error(`Failed to load heatmap for ${mapId}`);
  return res.json();
}

/** Group match index by map + day for the sidebar filters */
export function groupMatchIndex(index) {
  const byMap = {};
  for (const [matchId, info] of Object.entries(index)) {
    const { map, day } = info;
    if (!byMap[map]) byMap[map] = {};
    if (!byMap[map][day]) byMap[map][day] = [];
    byMap[map][day].push({ matchId, ...info });
  }
  return byMap;
}
