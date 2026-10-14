// Fitting a square grid onto a map picture (pure, no browser APIs except in detectGrid's input).
//  • "trim":    squares are square; the part of the picture that doesn't make a whole square is cut off
//  • "stretch": the picture is stretched a little so it ends exactly on whole squares
// The result says which part of the picture (crop, in picture pixels) sits under a cols × rows grid.

export type Crop = { x: number; y: number; w: number; h: number };
export type GridFit = { cols: number; rows: number; crop: Crop; stretch: boolean };

/** Trim: `cols` squares across; as many whole rows as fit. Offsets shift the grid (in picture pixels). */
export function fitTrim(imgW: number, imgH: number, cols: number, offsetX = 0, offsetY = 0, cell?: number, cellY?: number): GridFit {
  const c = Math.max(2, Math.round(cols));
  const size = cell && cell > 4 ? cell : imgW / c;
  const sizeY = cellY && cellY > 4 ? cellY : size;
  const ox = ((offsetX % size) + size) % size, oy = ((offsetY % sizeY) + sizeY) % sizeY;
  const fitCols = Math.max(2, Math.floor((imgW - ox) / size + 1e-6));
  const rows = Math.max(2, Math.floor((imgH - oy) / sizeY + 1e-6));
  const cc = Math.min(c, fitCols);
  return { cols: cc, rows, stretch: false, crop: { x: ox, y: oy, w: cc * size, h: rows * sizeY } };
}

/** Use a grid found on the picture (detectGrid ran on a copy `scale` times the picture's size). */
export function fitDetected(imgW: number, imgH: number, g: { cell: number; cellY: number; ox: number; oy: number }, scale: number): GridFit {
  const cell = g.cell / scale, cellY = g.cellY / scale;
  return fitTrim(imgW, imgH, Math.floor(imgW / cell + 1e-6), g.ox / scale, g.oy / scale, cell, cellY);
}

/** Stretch: the whole picture becomes exactly cols × rows squares (rows default: the nearest whole number). */
export function fitStretch(imgW: number, imgH: number, cols: number, rows?: number): GridFit {
  const c = Math.max(2, Math.round(cols));
  const r = Math.max(2, Math.round(rows ?? (imgH / (imgW / c))));
  return { cols: c, rows: r, stretch: true, crop: { x: 0, y: 0, w: imgW, h: imgH } };
}

/** A plain grid with no picture. */
export const plainGrid = (cols: number, rows: number): GridFit => ({ cols, rows, stretch: false, crop: { x: 0, y: 0, w: cols, h: rows } });

/**
 * Find a grid painted on the picture: dark lines repeating at the same spacing across and down.
 * `lum` is the picture's brightness (0–255), `w` × `h` pixels (a small copy is enough, e.g. 600 px wide).
 * Returns the square size and where the first line is (in those pixels), or null if no clear grid.
 */
export function detectGrid(lum: Uint8ClampedArray | number[], w: number, h: number): { cell: number; cellY: number; ox: number; oy: number; score: number } | null {
  const colDark = new Float64Array(w), rowDark = new Float64Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = 255 - lum[y * w + x];
    colDark[x] += d / h; rowDark[y] += d / w;
  }
  // lines are thin and darker than what's around them: keep only the "sharper than the neighbourhood" part
  const ridge = (a: Float64Array) => {
    const out = new Float64Array(a.length);
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let k = -6; k <= 6; k++) if (k && a[i + k] !== undefined) { s += a[i + k]; n++; }
      out[i] = Math.max(0, a[i] - s / Math.max(1, n));
    }
    return out;
  };
  const cx = ridge(colDark), cy = ridge(rowDark);
  const mean = (a: Float64Array) => a.reduce((s, v) => s + v, 0) / a.length || 1e-9;
  const best = (a: Float64Array, minP: number, maxP: number) => {
    const m = mean(a);
    const perP: { p: number; phase: number; score: number }[] = [];
    for (let p = minP; p <= maxP; p += 0.25) {
      let top = { p, phase: 0, score: 0 };
      for (let ph = 0; ph < p; ph += 0.5) {
        let s = 0, n = 0;
        for (let pos = ph; pos < a.length; pos += p) { const i = Math.round(pos); s += Math.max(a[i] ?? 0, a[i - 1] ?? 0, a[i + 1] ?? 0); n++; }
        const score = n >= 3 ? s / n / m : 0;
        if (score > top.score) top = { p, phase: ph, score };
      }
      perP.push(top);
    }
    // 2×, 3×… the real spacing score just as well (they hit every 2nd, 3rd line): take the smallest spacing that's nearly the best
    const max = Math.max(...perP.map((x) => x.score));
    return perP.find((x) => x.score >= max * 0.85) ?? { p: 0, phase: 0, score: 0 };
  };
  const minP = Math.max(8, Math.min(w, h) / 60), maxP = Math.min(w, h) / 2.5;
  const bx = best(cx, minP, maxP);
  if (bx.score < 2.2) return null;
  // down the picture: about the same spacing (painted maps are sometimes a little stretched one way)
  const by = best(cy, bx.p * 0.85, bx.p * 1.15);
  if (by.score < 1.8) return null;
  return { cell: bx.p, cellY: by.p, ox: bx.phase, oy: by.phase, score: Math.min(bx.score, by.score) };
}

/** Where the picture goes so that `crop` lands exactly on the grid (in grid units, 1 = one square). */
export function imagePlacement(fit: GridFit, imgW: number, imgH: number) {
  const sx = fit.cols / fit.crop.w, sy = fit.rows / fit.crop.h;
  return { x: -fit.crop.x * sx, y: -fit.crop.y * sy, width: imgW * sx, height: imgH * sy };
}

/** Grid settings from a browser, checked against the picture's size. */
export function cleanFit(x: unknown, imgW: number, imgH: number): GridFit {
  const f = (x ?? {}) as Partial<GridFit>;
  const cols = Math.round(Number(f.cols)), rows = Math.round(Number(f.rows));
  if (!(cols >= 2 && cols <= 100 && rows >= 2 && rows <= 100)) throw new Error("bad size");
  const c = f.crop ?? { x: 0, y: 0, w: imgW, h: imgH };
  const crop = { x: Number(c.x), y: Number(c.y), w: Number(c.w), h: Number(c.h) };
  if (![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) || crop.w <= 0 || crop.h <= 0) throw new Error("bad crop");
  return { cols, rows, stretch: !!f.stretch, crop };
}
