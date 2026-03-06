'use client';

import { useRef, useEffect, useCallback } from 'react';
import { MAP_CONFIG, MINIMAP_SIZE, EVENT_COLORS } from '@/lib/mapConfig';

const HUMAN_COLOR = '#818cf8';  // indigo-400
const BOT_COLOR   = '#64748b';  // slate-500

// Heatmap color palettes — vivid, fully opaque at peak
const HEAT_PALETTES = {
  traffic: {
    colors: ['#04a', '#26f', '#6af', '#aef', '#fff'],
    stops:  [0, 0.25, 0.5, 0.75, 1.0],
  },
  kills: {
    colors: ['#900', '#f22', '#f80', '#fed', '#fff'],
    stops:  [0, 0.3, 0.6, 0.85, 1.0],
  },
  deaths: {
    colors: ['#630', '#f60', '#fa0', '#fe8', '#fff'],
    stops:  [0, 0.3, 0.6, 0.85, 1.0],
  },
};

export default function MapCanvas({
  mapId,
  matchData,
  currentTimeMs,
  showHumans,
  showBots,
  heatmapData,
  heatmapLayer,
  heatmapOpacity = 0.75,
  activeEvents,
}) {
  const canvasRef       = useRef(null);
  const mapImageRef     = useRef(null);
  const viewRef         = useRef({ scale: 1, offsetX: 0, offsetY: 0 });
  const dragRef         = useRef({ dragging: false, startX: 0, startY: 0, startOX: 0, startOY: 0 });
  const heatCanvases    = useRef({});
  const currentTimeMsRef = useRef(currentTimeMs); // ref so draw() doesn't recreate on every scrub

  // ─── Fit map to fill canvas ───────────────────────────────────────────────
  const fitToCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = canvas.offsetWidth  || canvas.width;
    const H = canvas.offsetHeight || canvas.height;
    const scale = Math.min(W, H) / MINIMAP_SIZE * 0.97;  // 3% padding
    const offsetX = (W - MINIMAP_SIZE * scale) / 2;
    const offsetY = (H - MINIMAP_SIZE * scale) / 2;
    viewRef.current = { scale, offsetX, offsetY };
  }, []);

  // ─── Load map image ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapId) return;
    const img = new Image();
    img.src = MAP_CONFIG[mapId]?.image;
    img.onload = () => {
      mapImageRef.current = img;
      fitToCanvas();
      draw();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  // ─── Pre-render heatmap to off-screen canvas (radial gradient spots) ────────
  const getHeatCanvas = useCallback((layer) => {
    if (!heatmapData || !layer || layer === 'none') return null;
    if (heatCanvases.current[layer]) return heatCanvases.current[layer];

    const grid     = heatmapData[layer];
    const gridSize = heatmapData.grid_size;
    if (!grid || !gridSize) return null;

    const size  = MINIMAP_SIZE;
    const cellW = size / gridSize;
    const cellH = size / gridSize;
    const pal   = HEAT_PALETTES[layer] || HEAT_PALETTES.kills;
    const spotR = cellW * 1.5;       // each spot spreads 1.5 cells

    const big  = Object.assign(document.createElement('canvas'), { width: size, height: size });
    const ctx  = big.getContext('2d');

    // Additive-style: draw each hot cell as a radial gradient circle
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const raw = grid[row][col];
        if (raw <= 0.005) continue;

        // Power-curve amplification so low-value cells are still visible
        const t = Math.pow(raw, 0.4);

        // Pick color from palette based on t
        const peakColor = pickPaletteColor(pal, t);

        const cx = (col + 0.5) * cellW;
        const cy = (row + 0.5) * cellH;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, spotR);
        grad.addColorStop(0,    peakColor.replace('|A|', (t * 0.85).toFixed(3)));
        grad.addColorStop(0.5,  peakColor.replace('|A|', (t * 0.45).toFixed(3)));
        grad.addColorStop(1,    peakColor.replace('|A|', '0'));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, spotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    heatCanvases.current[layer] = big;
    return big;
  }, [heatmapData]);

  // Sync currentTimeMs into a ref and redraw — avoids recreating draw() callback on every tick
  useEffect(() => {
    currentTimeMsRef.current = currentTimeMs;
    draw();
  // draw is stable (doesn't depend on currentTimeMs anymore)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTimeMs]);

  // Invalidate heat cache when heatmap data changes
  useEffect(() => {
    heatCanvases.current = {};
  }, [heatmapData]);

  // ─── Main draw ────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { scale, offsetX, offsetY } = viewRef.current;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Minimap image
    if (mapImageRef.current) {
      ctx.drawImage(mapImageRef.current, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    } else {
      ctx.fillStyle = '#1a1f35';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    }

    // Heatmap overlay
    if (heatmapLayer && heatmapLayer !== 'none') {
      const heatCanvas = getHeatCanvas(heatmapLayer);
      if (heatCanvas) {
        ctx.globalAlpha = heatmapOpacity;
        ctx.drawImage(heatCanvas, 0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
        ctx.globalAlpha = 1;
      }
    }

    // Player data
    const ts = currentTimeMsRef.current;  // read from ref — no React dep
    if (matchData) {
      for (const [, player] of Object.entries(matchData.players)) {
        if (player.human && !showHumans) continue;
        if (!player.human && !showBots)  continue;

        const color = player.human ? HUMAN_COLOR : BOT_COLOR;
        const alpha = player.human ? 0.9 : 0.45;
        const lw    = player.human ? 2.2 / scale : 1.2 / scale;

        // Binary search: find last path index with ts <= currentTs  — O(log n)
        const fullPath = player.path;
        let endIdx = fullPath.length;
        if (ts != null) {
          let lo = 0, hi = fullPath.length - 1;
          endIdx = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (fullPath[mid][2] <= ts) { endIdx = mid + 1; lo = mid + 1; }
            else hi = mid - 1;
          }
        }

        if (endIdx > 1) {
          // Glow pass — indigo for humans, grey for bots
          ctx.beginPath();
          ctx.moveTo(fullPath[0][0], fullPath[0][1]);
          for (let i = 1; i < endIdx; i++) ctx.lineTo(fullPath[i][0], fullPath[i][1]);
          ctx.strokeStyle = player.human ? HUMAN_COLOR : BOT_COLOR;
          ctx.globalAlpha = player.human ? 0.18 : 0.35;
          ctx.lineWidth   = player.human ? 8 / scale : 3.5 / scale;
          ctx.stroke();

          // Main path
          ctx.beginPath();
          ctx.moveTo(fullPath[0][0], fullPath[0][1]);
          for (let i = 1; i < endIdx; i++) ctx.lineTo(fullPath[i][0], fullPath[i][1]);
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth   = lw;
          ctx.lineJoin    = 'round';
          ctx.lineCap     = 'round';
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Current position dot
          const last = fullPath[endIdx - 1];
          const r    = (player.human ? 5 : 3) / scale;
          ctx.beginPath();
          ctx.arc(last[0], last[1], r * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(last[0], last[1], r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.globalAlpha = 1;
          ctx.fill();
        }

        // Events: sorted by ts, so we can break early
        for (const ev of player.events) {
          if (ts != null && ev.ts > ts) break;
          if (activeEvents?.has(ev.type)) drawEventMarker(ctx, ev, scale);
        }
      }
    }

    ctx.restore();
  }, [matchData, showHumans, showBots, heatmapLayer, heatmapOpacity, activeEvents, getHeatCanvas]);

  // Redraw on prop changes
  useEffect(() => { draw(); }, [draw]);

  // ─── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      fitToCanvas();
      draw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, fitToCanvas]);

  // ─── Wheel zoom ───────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const { scale, offsetX, offsetY } = viewRef.current;
    const delta    = e.deltaY < 0 ? 1.12 : 0.89;
    const newScale = Math.min(Math.max(scale * delta, 0.25), 10);
    viewRef.current = {
      scale:   newScale,
      offsetX: mx - (mx - offsetX) * (newScale / scale),
      offsetY: my - (my - offsetY) * (newScale / scale),
    };
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ─── Pan drag ─────────────────────────────────────────────────────────────
  const handleMouseDown = (e) => {
    const { offsetX, offsetY } = viewRef.current;
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOX: offsetX, startOY: offsetY };
  };
  const handleMouseMove = (e) => {
    if (!dragRef.current.dragging) return;
    const { startX, startY, startOX, startOY } = dragRef.current;
    viewRef.current.offsetX = startOX + (e.clientX - startX);
    viewRef.current.offsetY = startOY + (e.clientY - startY);
    draw();
  };
  const handleMouseUp = () => { dragRef.current.dragging = false; };

  // Double-click to reset view
  const handleDblClick = useCallback(() => {
    fitToCanvas(); draw();
  }, [fitToCanvas, draw]);

  return (
    <div className="relative w-full h-full bg-[#070810]">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDblClick}
      />

      {/* Empty state */}
      {!matchData && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3 px-8 py-6 rounded-2xl
                          bg-[#0a0c18]/80 backdrop-blur-md border border-white/10 shadow-2xl">
            <div className="text-5xl">🗺️</div>
            <p className="text-base font-semibold text-slate-200">Select a match to begin</p>
            <p className="text-xs text-slate-500">Choose a map, date, and match from the sidebar</p>
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-3 right-4 flex items-center gap-3 text-[10px] text-slate-700 pointer-events-none select-none">
        <span>Scroll to zoom</span>
        <span>·</span>
        <span>Drag to pan</span>
        <span>·</span>
        <span>Double-click to reset</span>
      </div>

      {/* Active heatmap badge */}
      {heatmapLayer && heatmapLayer !== 'none' && (
        <div className="absolute top-3 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur text-[11px] font-medium text-slate-300 border border-white/10 pointer-events-none">
          <span className={`w-2 h-2 rounded-full ${
            heatmapLayer === 'kills'   ? 'bg-red-400'    :
            heatmapLayer === 'deaths'  ? 'bg-orange-400' :
            'bg-blue-400'
          }`} />
          {heatmapLayer === 'kills' ? 'Kill Zones' : heatmapLayer === 'deaths' ? 'Death Zones' : 'Traffic'} Heatmap
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Interpolate palette hex colors by t and return an rgba string with '|A|' alpha placeholder */
function pickPaletteColor(pal, t) {
  const { colors, stops } = pal;
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1]) {
      const f  = (t - stops[i]) / (stops[i + 1] - stops[i]);
      const c0 = hexToRgb(colors[i]);
      const c1 = hexToRgb(colors[i + 1]);
      const r  = Math.round(c0[0] + (c1[0] - c0[0]) * f);
      const g  = Math.round(c0[1] + (c1[1] - c0[1]) * f);
      const b  = Math.round(c0[2] + (c1[2] - c0[2]) * f);
      return `rgba(${r},${g},${b},|A|)`;
    }
  }
  const last = hexToRgb(colors[colors.length - 1]);
  return `rgba(${last[0]},${last[1]},${last[2]},|A|)`;
}

function hexToRgb(hex) {
  // Handle shorthand #abc → #aabbcc
  const h = hex.replace('#', '');
  const full = h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawEventMarker(ctx, ev, scale) {
  const color = EVENT_COLORS[ev.type] || '#ffffff';
  const r     = 5.5 / scale;

  // Glow ring
  ctx.beginPath();
  ctx.arc(ev.x, ev.y, r * 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fill();

  // Filled dot
  ctx.beginPath();
  ctx.arc(ev.x, ev.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fill();

  // White outline
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth   = 0.8 / scale;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
