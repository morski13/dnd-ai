"use client";
// Your own pictures on the dice: on every face, on the highest face, or on one chosen face.
import { useState } from "react";
import { labelText, maxValue, type DieType } from "@/lib/dice3d/shapes";
import { MAX_IMAGE_CHARS, type DiceSkin } from "@/lib/dice3d/skin";
import { PREVIEW_TYPES } from "./preview";

/** Shrinks a picture to at most 256 px so it can be saved with the dice. */
export async function shrinkImage(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) throw new Error("Use a PNG, JPG or WEBP picture.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Couldn't open that picture."));
      im.src = url;
    });
    for (const size of [256, 192, 128]) {
      const k = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      for (const out of [c.toDataURL("image/png"), c.toDataURL("image/webp", 0.85)]) {
        if (out.startsWith("data:image/") && out.length <= MAX_IMAGE_CHARS) return out;
      }
    }
    throw new Error("That picture is too detailed. Try a simpler one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Upload({ label, value, onChange, onError }: { label: string; value?: string; onChange: (v?: string) => void; onError: (e: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-bg">
        {/* eslint-disable-next-line @next/next/no-img-element -- small data: pictures, nothing to optimize */}
        {value ? <img src={value} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted">none</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <div className="mt-1 flex gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-line px-3 text-xs font-semibold text-soft active:scale-[0.97]">
            {value ? "Change" : "Add picture"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                try { onChange(await shrinkImage(f)); } catch (err) { onError((err as Error).message); }
              }}
            />
          </label>
          {value && <button type="button" onClick={() => onChange(undefined)} className="h-9 rounded-lg px-3 text-xs text-muted">Remove</button>}
        </div>
      </div>
    </div>
  );
}

export function Pictures({ skin, set, onError }: { skin: DiceSkin; set: (s: Partial<DiceSkin>) => void; onError: (e: string) => void }) {
  const [die, setDie] = useState<DieType>("d20");
  const [face, setFace] = useState<number>(20);
  const faces = skin.images.faces ?? {};
  const key = `${die}:${face}`;
  const setFaces = (f: Record<string, string>) => set({ images: { ...skin.images, faces: f } });

  return (
    <div className="space-y-4">
      <Upload label="On every face (behind the number)" value={skin.images.all} onChange={(v) => set({ images: { ...skin.images, all: v } })} onError={onError} />
      {skin.images.all && (
        <label className="flex items-center gap-3 text-sm text-soft">
          Strength
          <input type="range" min={0.1} max={1} step={0.05} value={skin.allOpacity} onChange={(e) => set({ allOpacity: Number(e.target.value) })} className="flex-1 accent-[var(--color-accent)]" />
        </label>
      )}
      <Upload label="On the highest face (your nat 20)" value={skin.images.max} onChange={(v) => set({ images: { ...skin.images, max: v } })} onError={onError} />

      <div className="rounded-xl border border-line bg-bg/40 p-3">
        <p className="text-sm font-semibold">On one face</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PREVIEW_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => { setDie(t); setFace(maxValue(t)); }}
              className={`h-8 rounded-lg border px-2.5 text-xs font-semibold ${die === t ? "border-accent bg-accent-surface text-accent" : "border-line text-soft"}`}>{t}</button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-10 gap-1">
          {Array.from({ length: maxValue(die) }, (_, i) => i + 1).map((v) => (
            <button key={v} type="button" onClick={() => setFace(v)} aria-label={`Face ${labelText(die, v)}`}
              className={`relative h-8 rounded-md border text-[11px] font-semibold ${face === v ? "border-accent text-accent" : "border-line text-soft"} ${faces[`${die}:${v}`] ? "bg-accent-surface" : ""}`}>
              {labelText(die, v)}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Upload label={`Picture on ${die} face ${labelText(die, face)}`} value={faces[key]}
            onChange={(v) => { const f = { ...faces }; if (v) f[key] = v; else delete f[key]; setFaces(f); }} onError={onError} />
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 text-sm">
        <span className="text-soft">Keep a small number on picture faces</span>
        <input type="checkbox" checked={skin.numbersOnPictures} onChange={(e) => set({ numbersOnPictures: e.target.checked })} className="h-5 w-5 accent-[var(--color-accent)]" />
      </label>
    </div>
  );
}
