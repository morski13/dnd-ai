"use client";
// "Customize": the player picks their sheet's look. The sheet changes behind the panel as they tap.
import { useState, useTransition } from "react";
import { ACCENTS, BACKGROUNDS, DIM_DEFAULT, FONTS, fontHref, SIZES, THEME, THEMES, type FontId, type SheetStyle } from "@/lib/themes";
import { load, toBlob } from "../../../campaign/parts/upload";
import { BottomSheet } from "../../../items/parts/ui";
import { FontLink } from "../../../components/theme/font-link";
import { ThemeCard } from "../../../components/theme/theme-card";
import { saveSheetStyle } from "../actions";
import { sheetImageUrl, useLook } from "../look";

const FONT_IDS = Object.keys(FONTS) as FontId[];
const ALL_FONTS = fontHref(FONT_IDS);

export function CustomizeButton({ characterId }: { characterId: string }) {
  const look = useLook();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!look) return null;
  const { style, setStyle, saved, setSaved } = look;
  const theme = THEME[style.theme ?? "tavern"];
  const set = (patch: Partial<SheetStyle>) => setStyle({ ...style, ...patch });

  const close = () => { setStyle(saved); setOpen(false); setError(null); }; // closing without saving puts the old look back
  const save = () => start(async () => {
    const r = await saveSheetStyle(characterId, style);
    if ("error" in r) return setError(r.error);
    setSaved(r.style); setStyle(r.style); setOpen(false);
  });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Customize the sheet's look"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line text-soft">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4z" />
          <circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7.5" r="1" /><circle cx="14.5" cy="7.5" r="1" />
        </svg>
      </button>
      {open && (
        <BottomSheet title="Your sheet's look" onClose={close}>
          <FontLink href={ALL_FONTS} />
          <p className="text-sm text-muted">Everyone who opens this sheet sees it this way. The sheet behind changes as you tap.</p>

          <h3 className="mt-4 font-semibold">Background picture</h3>
          <BackgroundPicture characterId={characterId} style={style} set={set} />

          <h3 className="mt-5 font-semibold">World</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEMES.map((t) => <ThemeCard key={t.id} t={t} on={(style.theme ?? "tavern") === t.id} onPick={() => set({ theme: t.id })} />)}
          </div>

          <h3 className="mt-5 font-semibold">Color</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Accent color">
            <button type="button" onClick={() => set({ accent: undefined })} aria-pressed={!style.accent}
              className={`h-10 rounded-full border-2 px-3 text-xs ${!style.accent ? "border-text" : "border-line"} text-soft`}>{theme.name}&apos;s own</button>
            {ACCENTS.map((a) => (
              <button key={a.hex} type="button" onClick={() => set({ accent: a.hex })} aria-pressed={style.accent === a.hex} aria-label={a.name} title={a.name}
                className={`h-10 w-10 rounded-full border-2 ${style.accent === a.hex ? "border-text" : "border-transparent"}`} style={{ background: a.hex }} />
            ))}
          </div>

          <h3 className="mt-5 font-semibold">Background color</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Background color">
            <button type="button" onClick={() => set({ bg: undefined })} aria-pressed={!style.bg}
              className={`h-10 rounded-full border-2 px-3 text-xs ${!style.bg ? "border-text" : "border-line"} text-soft`}>{theme.name}&apos;s own</button>
            {BACKGROUNDS.map((c) => (
              <button key={c} type="button" onClick={() => set({ bg: c })} aria-pressed={style.bg === c} aria-label={`Background ${c}`}
                className={`h-10 w-10 rounded-full border-2 ${style.bg === c ? "border-accent" : "border-line"}`} style={{ background: c }} />
            ))}
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border-2 border-line px-3 text-xs text-soft">
              <input type="color" value={style.bg ?? "#15130f"} onChange={(e) => set({ bg: e.target.value })} aria-label="Any background color"
                className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
              Any color
            </label>
          </div>

          <h3 className="mt-5 font-semibold">Font</h3>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            <li>
              <button type="button" onClick={() => set({ font: undefined })} aria-pressed={!style.font}
                className={`w-full rounded-xl border px-3 py-2 text-left ${!style.font ? "border-accent-strong bg-accent-surface" : "border-line"}`}>
                <span className="block text-lg leading-tight" style={{ fontFamily: `"${FONTS[theme.heading].family}", Georgia, serif` }}>{FONTS[theme.heading].sample}</span>
                <span className="block text-xs text-muted">{theme.name}&apos;s own</span>
              </button>
            </li>
            {FONT_IDS.map((f) => (
              <li key={f}>
                <button type="button" onClick={() => set({ font: f })} aria-pressed={style.font === f}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${style.font === f ? "border-accent-strong bg-accent-surface" : "border-line"}`}>
                  <span className="block text-lg leading-tight" style={{ fontFamily: `"${FONTS[f].family}", Georgia, serif` }}>{FONTS[f].sample}</span>
                  <span className="block text-xs text-muted">{FONTS[f].name}</span>
                </button>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex min-h-11 items-center gap-3 text-sm text-soft">
            <input type="checkbox" checked={!!style.allText} onChange={(e) => set({ allText: e.target.checked || undefined })}
              className="h-5 w-5 accent-accent" />
            <span>Use this font for all text, not just headings
              {style.allText && !FONTS[style.font ?? theme.heading].body && <span className="block text-xs text-muted">Fancy font: long text may be harder to read.</span>}
            </span>
          </label>

          <h3 className="mt-4 font-semibold">Text size</h3>
          <div className="mt-2 grid grid-cols-4 rounded-xl bg-surface p-1" role="group" aria-label="Text size">
            {SIZES.map((z, i) => (
              <button key={z.name} type="button" aria-label={z.name} onClick={() => set({ zoom: z.zoom === 1 ? undefined : z.zoom })} aria-pressed={(style.zoom ?? 1) === z.zoom}
                className={`h-10 whitespace-nowrap rounded-lg ${(style.zoom ?? 1) === z.zoom ? "bg-bg font-bold" : "text-muted"}`} style={{ fontSize: 12 + i }}>{z.name === "Extra large" ? "XL" : z.name}</button>
            ))}
          </div>

          {error && <p className="mt-3 text-sm text-danger" role="alert">{error}</p>}
          <div className="sticky bottom-0 mt-5 flex gap-2 bg-surface-2 pt-2">
            <button type="button" onClick={() => setStyle({})} className="h-12 rounded-xl border border-line px-4 text-sm text-soft">Reset</button>
            <button type="button" onClick={save} disabled={pending} className="h-12 flex-1 rounded-xl bg-accent font-bold text-accent-text">{pending ? "Saving…" : "Save look"}</button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}

/** A picture behind the sheet: upload (shrunk in the browser), how strongly it's covered, remove. */
function BackgroundPicture({ characterId, style, set }: { characterId: string; style: SheetStyle; set: (p: Partial<SheetStyle>) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = sheetImageUrl(characterId, style.image);
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null); setBusy(true);
    try {
      if (!/^image\//.test(file.type)) throw new Error("Choose a picture (PNG, JPG or WEBP).");
      const img = await load(file);
      let shrunk = await toBlob(img, 1800, 0.84);
      if (shrunk.blob.size > 5.5 * 1024 * 1024) shrunk = await toBlob(img, 1400, 0.8);
      const form = new FormData();
      form.set("file", shrunk.blob, "background.webp");
      const res = await fetch(`/api/sheet-bg/${characterId}`, { method: "POST", body: form });
      const data = await res.json().catch(() => ({ error: "Upload failed." }));
      if (!res.ok || data.error) throw new Error(data.error ?? "Upload failed.");
      set({ image: data.image, dim: style.dim ?? DIM_DEFAULT });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const d = Math.round((style.dim ?? DIM_DEFAULT) * 100);
  const input = (
    <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy}
      onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} aria-label={url ? "Change the background picture" : "Add a background picture"} />
  );
  return (
    <div className="mt-2">
      {url ? (
        <>
          {/* how it will look: the picture, covered by the background color, with a card on top */}
          <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-line"
            style={{ background: `linear-gradient(color-mix(in srgb, var(--color-bg) ${d}%, transparent), color-mix(in srgb, var(--color-bg) ${d}%, transparent)), url("${url}") center / cover no-repeat` }}>
            <span className="absolute inset-x-4 bottom-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
              <b className="font-heading">Your sheet</b> <span className="text-muted">sits on top like this</span>
            </span>
          </div>
          <label className="mt-3 block text-xs text-muted">How much of the picture shows
            <input type="range" min={20} max={90} step={5} value={Math.round((1.1 - (style.dim ?? DIM_DEFAULT)) * 100)}
              onChange={(e) => set({ dim: Math.round((1.1 - Number(e.target.value) / 100) * 100) / 100 })}
              aria-label="How much of the picture shows" className="mt-1 w-full accent-accent" />
            <span className="flex justify-between"><span>Easier to read</span><span>More picture</span></span>
          </label>
          <div className="mt-2 flex gap-2">
            <label className="flex h-10 flex-1 cursor-pointer items-center justify-center rounded-lg border border-line text-sm text-soft">{input}{busy ? "Uploading…" : "Change picture"}</label>
            <button type="button" onClick={() => set({ image: undefined, dim: undefined })} className="h-10 flex-1 rounded-lg border border-line text-sm text-soft">Remove</button>
          </div>
        </>
      ) : (
        <label className={`flex aspect-[16/7] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-center ${busy ? "text-muted" : "text-accent"}`}>
          {input}
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 8" />
          </svg>
          <span className="font-semibold">{busy ? "Uploading…" : "Add a background picture"}</span>
          <span className="text-xs text-muted">PNG, JPG or WEBP from your phone or computer</span>
        </label>
      )}
      {error && <p className="mt-1 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}
