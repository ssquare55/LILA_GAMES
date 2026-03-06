'use client';

import { useState } from 'react';
import { MAP_CONFIG, EVENT_COLORS, EVENT_LABELS } from '@/lib/mapConfig';

const DAYS = ['February_10', 'February_11', 'February_12', 'February_13', 'February_14'];
const DAY_LABELS = {
  February_10: 'Feb 10',
  February_11: 'Feb 11',
  February_12: 'Feb 12',
  February_13: 'Feb 13',
  February_14: 'Feb 14 (partial)',
};

export default function Sidebar({
  grouped,
  selectedMap,
  selectedDay,
  selectedMatch,
  onMapChange,
  onDayChange,
  onMatchChange,
  showHumans,
  showBots,
  onToggleHumans,
  onToggleBots,
  activeEvents,
  onToggleEvent,
  heatmapLayer,
  onHeatmapChange,
  heatmapOpacity,
  onHeatmapOpacityChange,
  matchInfo,
}) {
  const availableDays = selectedMap
    ? DAYS.filter(d => grouped[selectedMap]?.[d]?.length > 0)
    : [];

  const [matchSearch, setMatchSearch] = useState('');
  const allMatches = selectedMap && selectedDay
    ? (grouped[selectedMap]?.[selectedDay] || [])
    : [];
  const matches = allMatches
    .filter(m => !matchSearch || m.matchId.includes(matchSearch))
    .sort((a, b) => (b.kills + b.deaths) - (a.kills + a.deaths));

  return (
    <div className="w-[300px] shrink-0 h-full flex flex-col glass border-r border-white/5 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/5">
        <div className="flex items-center gap-2 mb-0.5">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-live" />
          <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase">Lila Black</span>
        </div>
        <h1 className="text-sm font-semibold text-slate-100">Level Designer Tool</h1>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1">
        {/* Map selector */}
        <Section title="Map">
          <div className="grid grid-cols-1 gap-1.5">
            {Object.entries(MAP_CONFIG).map(([id, cfg]) => (
              <button
                key={id}
                onClick={() => { onMapChange(id); onDayChange(null); onMatchChange(null); }}
                className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedMap === id
                    ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                    : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Day selector */}
        {selectedMap && (
          <Section title="Date">
            <div className="grid grid-cols-2 gap-1.5">
              {availableDays.map(day => (
                <button
                  key={day}
                  onClick={() => { onDayChange(day); onMatchChange(null); }}
                  className={`text-center px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedDay === day
                      ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                      : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  {DAY_LABELS[day]}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Match selector */}
        {selectedDay && (
          <Section title={`Matches (${matches.length})`}>
            <input
              type="text"
              placeholder="Search match ID…"
              value={matchSearch}
              onChange={e => setMatchSearch(e.target.value)}
              className="w-full mb-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-indigo-500/50"
            />
            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
              {matches.map(m => (
                <button
                  key={m.matchId}
                  onClick={() => onMatchChange(m.matchId)}
                  className={`text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedMatch === m.matchId
                      ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                      : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-slate-300">{m.matchId.slice(0, 8)}…</span>
                    <span className="text-slate-500">{formatDuration(m.duration_ms)}</span>
                  </div>
                  <div className="flex gap-2 mt-0.5 text-[10px] text-slate-500">
                    <span>👤 {m.humans}</span>
                    <span>🤖 {m.bots}</span>
                    <span>⚔️ {m.kills}</span>
                    <span>💀 {m.deaths}</span>
                  </div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Player type toggle */}
        <Section title="Show Players">
          <div className="flex gap-2">
            <Toggle active={showHumans} onClick={onToggleHumans} color="indigo" label="Humans" icon="👤" />
            <Toggle active={showBots} onClick={onToggleBots} color="slate" label="Bots" icon="🤖" />
          </div>
        </Section>

        {/* Event filters */}
        <Section title="Events">
          <div className="grid grid-cols-2 gap-1.5">
            {Object.entries(EVENT_LABELS).map(([type, label]) => (
              <button
                key={type}
                onClick={() => onToggleEvent(type)}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                  activeEvents.has(type)
                    ? 'border-opacity-50 text-slate-100'
                    : 'bg-transparent border-transparent text-slate-600'
                }`}
                style={activeEvents.has(type) ? {
                  borderColor: EVENT_COLORS[type] + '80',
                  backgroundColor: EVENT_COLORS[type] + '18',
                } : {}}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: EVENT_COLORS[type] }}
                />
                {label}
              </button>
            ))}
          </div>
        </Section>

        {/* Heatmap selector */}
        <Section title="Heatmap Overlay">
          <div className="flex flex-col gap-1.5">
            {[
              { id: 'none', label: 'Off' },
              { id: 'traffic', label: '🔵 Traffic' },
              { id: 'kills', label: '🔴 Kill Zones' },
              { id: 'deaths', label: '🟠 Death Zones' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => onHeatmapChange(opt.id)}
                className={`text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  heatmapLayer === opt.id
                    ? 'bg-indigo-600/30 border border-indigo-500/50 text-indigo-200'
                    : 'bg-white/5 border border-transparent text-slate-400 hover:bg-white/10 hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Intensity slider — only shown when a layer is active */}
          {heatmapLayer && heatmapLayer !== 'none' && (
            <div className="mt-3">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[10px] text-slate-500">Intensity</span>
                <span className="text-[10px] text-indigo-400 font-medium">{Math.round(heatmapOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={heatmapOpacity}
                onChange={e => onHeatmapOpacityChange(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
            </div>
          )}
        </Section>

        {/* Legend */}
        <Section title="Legend">
          <div className="flex flex-col gap-1.5">
            <LegendItem color="#6366f1" label="Human player path" />
            <LegendItem color="#475569" label="Bot path" />
            {Object.entries(EVENT_COLORS).map(([type, color]) => (
              <LegendItem key={type} color={color} label={EVENT_LABELS[type]} circle />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">{title}</p>
      {children}
    </div>
  );
}

function Toggle({ active, onClick, color, label, icon }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
        active
          ? color === 'indigo'
            ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200'
            : 'bg-slate-700/50 border-slate-500/50 text-slate-200'
          : 'bg-white/5 border-transparent text-slate-600'
      }`}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

function LegendItem({ color, label, circle }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      {circle
        ? <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        : <div className="w-5 h-0.5 rounded shrink-0" style={{ background: color }} />
      }
      {label}
    </div>
  );
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(1)}s`;
  const m   = Math.floor(totalSec / 60);
  const sec = Math.floor(totalSec % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
