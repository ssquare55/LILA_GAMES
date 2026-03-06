'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import Timeline from '@/components/Timeline';
import { loadMatchIndex, loadMatchEvents, loadHeatmap, groupMatchIndex } from '@/lib/dataLoader';

// MapCanvas uses browser APIs (canvas), load client-side only
const MapCanvas = dynamic(() => import('@/components/MapCanvas'), { ssr: false });

const ALL_EVENTS = new Set(['Kill', 'Killed', 'BotKill', 'BotKilled', 'KilledByStorm', 'Loot']);

export default function Home() {
  const [grouped, setGrouped] = useState({});
  const [selectedMap, setSelectedMap] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [matchData, setMatchData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Player toggles
  const [showHumans, setShowHumans] = useState(true);
  const [showBots, setShowBots] = useState(true);

  // Events
  const [activeEvents, setActiveEvents] = useState(new Set(ALL_EVENTS));

  // Heatmap
  const [heatmapLayer, setHeatmapLayer] = useState('none');
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.75);

  // Timeline
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentTs, setCurrentTs] = useState(0);
  const [minTs, setMinTs] = useState(0);
  const [maxTs, setMaxTs] = useState(0);

  // Load match index on mount
  useEffect(() => {
    loadMatchIndex().then(idx => setGrouped(groupMatchIndex(idx))).catch(console.error);
  }, []);

  // Load heatmap when map changes
  useEffect(() => {
    if (!selectedMap) return;
    loadHeatmap(selectedMap).then(setHeatmapData).catch(console.error);
  }, [selectedMap]);

  // Load match events when a match is selected
  useEffect(() => {
    if (!selectedMatch) { setMatchData(null); return; }
    setLoading(true);
    setError(null);
    setPlaying(false);
    loadMatchEvents(selectedMatch)
      .then(data => {
        setMatchData(data);
        // Calculate timeline bounds from all player paths
        let mn = Infinity, mx = -Infinity;
        for (const player of Object.values(data.players)) {
          for (const p of player.path) {
            if (p[2] < mn) mn = p[2];
            if (p[2] > mx) mx = p[2];
          }
          for (const e of player.events) {
            if (e.ts < mn) mn = e.ts;
            if (e.ts > mx) mx = e.ts;
          }
        }
        if (mn !== Infinity) {
          setMinTs(mn);
          setMaxTs(mx);
          setCurrentTs(mx);  // start at end → all events visible immediately
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedMatch]);

  const handleToggleEvent = useCallback((type) => {
    setActiveEvents(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  // Stats for header
  const matchInfo = selectedMatch && grouped[selectedMap]?.[selectedDay]
    ? grouped[selectedMap][selectedDay].find(m => m.matchId === selectedMatch)
    : null;

  const humanCount = matchData
    ? Object.values(matchData.players).filter(p => p.human).length
    : 0;
  const botCount = matchData
    ? Object.values(matchData.players).filter(p => !p.human).length
    : 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header className="glass border-b border-white/5 px-6 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-sm font-bold">L</div>
            <span className="font-bold text-slate-100 text-sm">LILA BLACK</span>
            <span className="text-slate-600 text-sm">/</span>
            <span className="text-slate-400 text-sm">Map Visualization</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-500">
          {matchData && (
            <>
              <Stat label="Match" value={selectedMatch?.slice(0, 8) + '…'} />
              <Stat label="Map" value={selectedMap} />
              <Stat label="Humans" value={humanCount} color="text-indigo-400" />
              <Stat label="Bots" value={botCount} color="text-slate-400" />
            </>
          )}
          {loading && <span className="text-indigo-400 animate-pulse">Loading match…</span>}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          grouped={grouped}
          selectedMap={selectedMap}
          selectedDay={selectedDay}
          selectedMatch={selectedMatch}
          onMapChange={setSelectedMap}
          onDayChange={setSelectedDay}
          onMatchChange={setSelectedMatch}
          showHumans={showHumans}
          showBots={showBots}
          onToggleHumans={() => setShowHumans(v => !v)}
          onToggleBots={() => setShowBots(v => !v)}
          activeEvents={activeEvents}
          onToggleEvent={handleToggleEvent}
          heatmapLayer={heatmapLayer}
          onHeatmapChange={setHeatmapLayer}
          heatmapOpacity={heatmapOpacity}
          onHeatmapOpacityChange={setHeatmapOpacity}
          matchInfo={matchInfo}
        />

        {/* Canvas + timeline */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <MapCanvas
              mapId={selectedMap}
              matchData={matchData}
              currentTimeMs={matchData ? currentTs : null}
              showHumans={showHumans}
              showBots={showBots}
              heatmapData={heatmapData}
              heatmapLayer={heatmapLayer}
              heatmapOpacity={heatmapOpacity}
              activeEvents={activeEvents}
            />
          </div>

          <Timeline
            minTs={minTs}
            maxTs={maxTs}
            currentTs={currentTs}
            onSeek={setCurrentTs}
            playing={playing}
            onPlayPause={() => {
              if (currentTs >= maxTs) setCurrentTs(minTs);
              setPlaying(v => !v);
            }}
            speed={speed}
            onSpeedChange={setSpeed}
            hasMatch={!!matchData}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-600">{label}:</span>
      <span className={color || 'text-slate-300'}>{value}</span>
    </div>
  );
}
