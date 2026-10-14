"use client";
// Fitting the squares on a map picture. Three ways:
//  • Found: the grid painted on the picture, found automatically
//  • Count + trim: how many squares across; squares stay square; the leftover edge is cut off
//  • Stretch: the whole picture becomes exactly N × M squares (stretched a little)
import { useEffect, useMemo, useState } from "react";
import { detectGrid, fitDetected, fitStretch, fitTrim, type GridFit } from "@/lib/maps/grid";
import { Board } from "../components/map/board";

export type Picture = { src: string; w: number; h: number };
type Mode = "found" | "trim" | "stretch";

/** Look for a grid painted on the picture (on a 400 px copy). */
export async function findGrid(pic: Picture): Promise<GridFit | null> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't open the picture.")); i.src = pic.src; });
  const sw = Math.min(400, pic.w), scale = sw / pic.w, sh = Math.max(1, Math.round(pic.h * scale));
  const c = document.createElement("canvas");
  c.width = sw; c.height = sh;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, sw, sh);
  const px = g.getImageData(0, 0, sw, sh).data;
  const lum = new Uint8ClampedArray(sw * sh);
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const found = detectGrid(lum, sw, sh);
  return found ? fitDetected(pic.w, pic.h, found, scale) : null;
}

const num = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-[15px]";

function Stepper({ label, value, set, min = 2, max = 100 }: { label: string; value: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <div className="mt-1 flex items-center gap-1">
        <button type="button" aria-label={`Fewer: ${label}`} onClick={() => set(Math.max(min, value - 1))} className="h-11 w-11 rounded-xl border border-line text-lg font-bold">−</button>
        <input aria-label={label} inputMode="numeric" value={value} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n) set(Math.min(max, n)); }} className={`${num} text-center`} />
        <button type="button" aria-label={`More: ${label}`} onClick={() => set(Math.min(max, value + 1))} className="h-11 w-11 rounded-xl border border-line text-lg font-bold">+</button>
      </div>
    </div>
  );
}

export function GridEditor({ picture, initial, name: name0, feet: feet0, saving, onSave, onCancel, saveLabel = "Save map" }: {
  picture: Picture | null; initial?: GridFit | null; name: string; feet: number; saving: boolean;
  onSave: (v: { fit: GridFit; name: string; feet: number }) => void; onCancel: () => void; saveLabel?: string;
}) {
  const [name, setName] = useState(name0);
  const [feet, setFeet] = useState(feet0);
  const [found, setFound] = useState<GridFit | null | undefined>(picture ? undefined : null); // undefined = still looking
  const [mode, setMode] = useState<Mode>(initial?.stretch ? "stretch" : "trim");
  const [cols, setCols] = useState(initial?.cols ?? (picture ? 20 : 24));
  const [rows, setRows] = useState(initial?.rows ?? 24);
  const [ox, setOx] = useState(initial && !initial.stretch ? initial.crop.x : 0);
  const [oy, setOy] = useState(initial && !initial.stretch ? initial.crop.y : 0);
  const [cell, setCell] = useState<{ x: number; y: number } | null>(initial && !initial.stretch && picture ? { x: initial.crop.w / initial.cols, y: initial.crop.h / initial.rows } : null);

  useEffect(() => {
    if (!picture) return;
    let live = true;
    findGrid(picture).then((f) => {
      if (!live) return;
      setFound(f);
      if (f && !initial) { setMode("found"); setCols(f.cols); setRows(f.rows); setOx(f.crop.x); setOy(f.crop.y); setCell({ x: f.crop.w / f.cols, y: f.crop.h / f.rows }); }
      if (!f && !initial) { setCols(Math.max(2, Math.round(picture.w / 70))); setRows(Math.max(2, Math.round(picture.h / 70))); }
    }).catch(() => live && setFound(null));
    return () => { live = false; };
  }, [picture]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit: GridFit = useMemo(() => {
    if (!picture) return { cols, rows, stretch: false, crop: { x: 0, y: 0, w: cols, h: rows } };
    if (mode === "found" && found) return found;
    if (mode === "stretch") return fitStretch(picture.w, picture.h, cols, rows);
    // count + trim: keep a found square size if the count still matches it, else exactly `cols` squares
    // across what's left after the offset (so the count you pick is the count you get)
    const useCell = cell && Math.abs(picture.w / cell.x - cols) < 1 ? cell : null;
    if (useCell) return fitTrim(picture.w, picture.h, cols, ox, oy, useCell.x, useCell.y);
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy), size = (picture.w - x0) / cols;
    return fitTrim(picture.w, picture.h, cols, Math.min(x0, size * 0.99), y0, size, size);
  }, [picture, mode, found, cols, rows, ox, oy, cell]);

  const step = picture ? Math.max(1, (fit.crop.w / fit.cols) / 12) : 1;

  return (
    <div className="space-y-4">
      <label className="block text-sm">Name
        <input value={name} onChange={(e) => setName(e.target.value)} className={`${num} mt-1`} placeholder="Forest clearing" />
      </label>

      <Board cols={fit.cols} rows={fit.rows} image={picture} fit={fit} height="min(55vh, 460px)" label="Map preview with the grid" />

      <p className="text-sm text-soft" aria-live="polite">
        <strong>{fit.cols} × {fit.rows} squares</strong> = {fit.cols * feet} × {fit.rows * feet} ft
        {picture && mode === "trim" && (fit.crop.x > 1 || fit.crop.y > 1 || fit.crop.x + fit.crop.w < picture.w - 1 || fit.crop.y + fit.crop.h < picture.h - 1) && <span className="text-muted"> · the leftover edge is cut off</span>}
      </p>

      {picture && (
        <div role="radiogroup" aria-label="How the squares fit" className="grid grid-cols-3 gap-1.5">
          {([["found", "Found on picture"], ["trim", "Count + trim"], ["stretch", "Stretch"]] as const).map(([m, l]) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={m === "found" && !found}
              onClick={() => { setMode(m); if (m === "found" && found) { setCols(found.cols); setRows(found.rows); } if (m === "stretch") setRows(Math.max(2, Math.round(picture.h / (picture.w / cols)))); }}
              className={`min-h-11 rounded-xl border px-2 text-xs font-semibold disabled:opacity-40 ${mode === m ? "border-accent bg-accent text-accent-text" : "border-line text-soft"}`}>{l}</button>
          ))}
        </div>
      )}
      {picture && found === undefined && <p className="text-xs text-muted">Looking for a grid on the picture…</p>}
      {picture && found === null && <p className="text-xs text-muted">No grid painted on this picture: pick how many squares go across.</p>}
      {mode === "found" && found && <p className="text-xs text-muted">The squares sit right on the lines painted on your map. The part outside the last whole square is cut off.</p>}

      {(!picture || mode !== "found") && (
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Squares across" value={cols} set={(n) => { setCols(n); setCell(null); }} />
          {(!picture || mode === "stretch") && <Stepper label="Squares down" value={rows} set={setRows} />}
        </div>
      )}
      {picture && mode === "trim" && (
        <div>
          <p className="text-xs text-muted">Nudge the grid onto the painted lines</p>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {([["←", -step, 0], ["→", step, 0], ["↑", 0, -step], ["↓", 0, step]] as const).map(([l, dx, dy]) => (
              <button key={l} type="button" aria-label={`Nudge ${l}`} onClick={() => { setOx((v) => Math.max(0, v + dx)); setOy((v) => Math.max(0, v + dy)); }} className="h-11 rounded-xl border border-line text-lg">{l}</button>
            ))}
          </div>
        </div>
      )}

      <label className="block text-sm">One square is
        <select value={feet} onChange={(e) => setFeet(Number(e.target.value))} className={`${num} mt-1`}>
          {[5, 10, 15, 20, 30, 50].map((f) => <option key={f} value={f}>{f} ft</option>)}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-line font-semibold">Cancel</button>
        <button type="button" disabled={saving || (!!picture && found === undefined)} onClick={() => onSave({ fit, name, feet })}
          className="h-12 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">{saving ? "Saving…" : saveLabel}</button>
      </div>
    </div>
  );
}
