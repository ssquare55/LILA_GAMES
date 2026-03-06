'use client';

import { useEffect, useRef, useCallback } from 'react';

// How many ms of match time advance per ms of real time at 1× speed.
// 0.1 means a 800ms match takes ~8 seconds at 1×.
const STRETCH_FACTOR = 0.1;

export default function Timeline({
  minTs,
  maxTs,
  currentTs,
  onSeek,
  playing,
  onPlayPause,
  speed,
  onSpeedChange,
  hasMatch,   // true when a match is loaded
}) {
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);
  const tsRef = useRef(currentTs);

  useEffect(() => { tsRef.current = currentTs; }, [currentTs]);

  const tick = useCallback((timestamp) => {
    if (!lastFrameRef.current) lastFrameRef.current = timestamp;
    const dt = timestamp - lastFrameRef.current;
    lastFrameRef.current = timestamp;
    const next = Math.min(tsRef.current + dt * speed * STRETCH_FACTOR, maxTs);
    onSeek(next);
    if (next < maxTs) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      lastFrameRef.current = null;
    }
  }, [speed, maxTs, onSeek]);

  useEffect(() => {
    if (playing) {
      lastFrameRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      lastFrameRef.current = null;
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, tick]);

  const duration = maxTs - minTs;
  const elapsed  = currentTs - minTs;
  const disabled = !hasMatch;

  return (
    <div className="glass border-t border-white/5 px-5 py-3 flex items-center gap-5">
      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        disabled={disabled || duration <= 0}
        title={duration <= 0 ? 'No time range in this match' : (playing ? 'Pause' : 'Play')}
        className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors shrink-0"
      >
        {playing ? '⏸' : '▶'}
      </button>

      {/* Playback note */}
      <span className="text-[9px] text-slate-700 hidden sm:block shrink-0 w-16 leading-tight">
        Speed
      </span>

      {/* Scrubber */}
      <div className="flex-1 flex flex-col gap-1">
        <input
          type="range"
          min={minTs}
          max={maxTs > minTs ? maxTs : minTs + 1}
          value={currentTs}
          step={1}
          disabled={disabled || duration <= 0}
          onChange={e => onSeek(Number(e.target.value))}
          className="w-full accent-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed"
        />
        <div className="flex justify-between text-[10px] text-slate-500 select-none">
          {hasMatch ? (
            <>
              <span>0:00.0</span>
              <span className="text-indigo-400 font-semibold">{formatTime(elapsed)}</span>
              <span>{formatTime(duration)}</span>
            </>
          ) : (
            <span className="text-center w-full">Select a match to use the timeline</span>
          )}
        </div>
      </div>

      {/* Speed */}
      <div className="flex items-center gap-1.5 shrink-0">
        {[0.25, 0.5, 1, 2, 4].map(s => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            disabled={disabled}
            title={`Playback speed: ${s}×`}
            className={`px-2 h-7 rounded text-xs font-bold transition-colors disabled:opacity-30 ${
              speed === s
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

/** Format ms → m:ss.d (showing tenths of second for sub-minute values) */
function formatTime(ms) {
  if (ms === null || ms === undefined || ms < 0) return '0:00.0';
  const totalSec = ms / 1000;
  const m   = Math.floor(totalSec / 60);
  const s   = Math.floor(totalSec % 60);
  const dec = Math.floor((totalSec % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${dec}`;
}
