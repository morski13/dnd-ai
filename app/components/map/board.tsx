"use client";
// A zoomable, draggable grid board (SVG, 1 unit = 1 square). Zoom goes from 4 squares across
// up to the whole map: pinch, mouse wheel, or the + / − buttons. A tap (no drag) reports the point.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { imagePlacement, type GridFit } from "@/lib/maps/grid";

export type Pt = { x: number; y: number };
type View = { x: number; y: number; w: number };

export function Board({ cols, rows, image, fit, children, onTap, onHover, focus, gridLines = true, height = "min(68dvh, 560px)", label = "Battle map", toolbar }: {
  cols: number; rows: number;
  image?: { src: string; w: number; h: number } | null;
  fit?: GridFit | null;                 // where the picture sits under the grid
  children?: ReactNode;                 // drawn in grid units, above the picture and grid
  onTap?: (p: Pt) => void;
  onHover?: (p: Pt | null) => void;
  focus?: Pt | null;                    // centre here when it first appears (e.g. your token)
  gridLines?: boolean;
  height?: string;
  label?: string;
  toolbar?: ReactNode;
}) {
  const clipId = `clip-${useId().replace(/:/g, "")}`;
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null);
  const vp = measured ?? { w: 360, h: 420 };
  const aspect = vp.h / Math.max(1, vp.w);
  // the narrowest view shows 4 squares across the short side; the widest shows the whole map
  const minW = Math.min(4 * Math.max(1, 1 / aspect), Math.max(cols, rows / aspect));
  const maxW = Math.max(cols, rows / aspect);
  const clamp = useCallback((v: View): View => {
    const w = Math.min(maxW, Math.max(minW, v.w)), h = w * aspect;
    const x = w >= cols ? (cols - w) / 2 : Math.min(cols - w, Math.max(0, v.x));
    const y = h >= rows ? (rows - h) / 2 : Math.min(rows - h, Math.max(0, v.y));
    return { x, y, w };
  }, [aspect, cols, rows, maxW, minW]);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: cols });

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setMeasured({ w: el.clientWidth || 360, h: el.clientHeight || 420 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // first view (once the box is measured): around your token (about 12 squares), else the whole map;
  // after that, keep the view valid when the map or the box changes size
  const sizeKey = `${cols}x${rows}x${aspect.toFixed(4)}x${measured ? 1 : 0}`;
  const [seenKey, setSeenKey] = useState("");
  if (sizeKey !== seenKey) {
    const first = !seenKey.endsWith("x1");
    setSeenKey(sizeKey);
    if (first && focus && Math.max(cols, rows) > 14) { const w = 12; setView(clamp({ x: focus.x + 0.5 - w / 2, y: focus.y + 0.5 - (w * aspect) / 2, w })); }
    else setView(first ? clamp({ x: 0, y: 0, w: maxW }) : clamp(view));
  }

  const toGrid = (clientX: number, clientY: number): Pt | null => {
    const s = svg.current;
    const m = s?.getScreenCTM();
    if (!s || !m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => setView((v) => {
    const w = Math.min(maxW, Math.max(minW, v.w * factor));
    const h0 = v.w * aspect, h = w * aspect;
    const fx = cx ?? 0.5, fy = cy ?? 0.5;  // keep this spot (0–1 of the view) still
    return clamp({ x: v.x + (v.w - w) * fx, y: v.y + (h0 - h) * fy, w });
  });

  // pointers: one finger drags, two pinch; a press that barely moves is a tap
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch?: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) gesture.current = { moved: false, startX: e.clientX, startY: e.clientY };
    if (ptrs.current.size === 2 && gesture.current) {
      const [a, b] = [...ptrs.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = ptrs.current.get(e.pointerId);
    if (!prev) { if (e.pointerType === "mouse") onHover?.(toGrid(e.clientX, e.clientY)); return; }
    const g = gesture.current;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (ptrs.current.size >= 2 && g.pinch) {
      const [a, b] = [...ptrs.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const r = box.current!.getBoundingClientRect();
      zoomAt(g.pinch / Math.max(1, d), ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
      g.pinch = d;
      return;
    }
    if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 7) return;
    g.moved = true;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    setView((v) => clamp({ x: v.x - (dx * v.w) / vp.w, y: v.y - (dy * v.w) / vp.w, w: v.w }));
  };
  const onUp = (e: React.PointerEvent) => {
    const had = ptrs.current.delete(e.pointerId);
    const g = gesture.current;
    if (had && g && !g.moved && ptrs.current.size === 0) {
      const p = toGrid(e.clientX, e.clientY);
      if (p && p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows) onTap?.(p);
    }
    if (ptrs.current.size === 0) gesture.current = null;
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(e.deltaY * 0.0015), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  });

  const h = view.w * aspect;
  const place = image && fit ? imagePlacement(fit, image.w, image.h) : null;
  const zoomPct = Math.round(((maxW - view.w) / Math.max(0.001, maxW - minW)) * 100);
  const lines: ReactNode[] = [];
  if (gridLines) {
    for (let i = 0; i <= cols; i++) lines.push(<line key={`c${i}`} x1={i} y1={0} x2={i} y2={rows} />);
    for (let j = 0; j <= rows; j++) lines.push(<line key={`r${j}`} x1={0} y1={j} x2={cols} y2={j} />);
  }

  return (
    <div className="relative">
      <div ref={box} className="relative touch-none select-none overflow-hidden rounded-2xl border border-line bg-[#0c0b0a]" style={{ height }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") onHover?.(null); }}>
        <svg ref={svg} role="img" aria-label={label} className="block h-full w-full" viewBox={`${view.x} ${view.y} ${view.w} ${h}`} preserveAspectRatio="xMidYMid meet">
          <defs><clipPath id={clipId}><rect x={0} y={0} width={cols} height={rows} /></clipPath></defs>
          <rect x={0} y={0} width={cols} height={rows} fill="#2a2620" />
          {place && <image href={image!.src} x={place.x} y={place.y} width={place.width} height={place.height} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />}
          <g stroke="rgba(0,0,0,0.45)" strokeWidth={0.035}>{lines}</g>
          <g stroke="rgba(255,255,255,0.18)" strokeWidth={0.015}>{lines}</g>
          {children}
        </svg>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 flex flex-col gap-1.5">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(1 / 1.5)} disabled={view.w <= minW + 0.01}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface/90 text-xl font-bold disabled:opacity-40">+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(1.5)} disabled={view.w >= maxW - 0.01}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface/90 text-xl font-bold disabled:opacity-40">−</button>
        <button type="button" aria-label="Whole map" title="Whole map" onClick={() => setView(clamp({ x: 0, y: 0, w: maxW }))}
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface/90 text-[10px] font-bold">ALL</button>
      </div>
      <p className="sr-only" aria-live="polite">Zoom {zoomPct}%</p>
      {toolbar}
    </div>
  );
}
