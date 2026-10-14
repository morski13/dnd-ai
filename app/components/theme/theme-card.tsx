// A small live preview of a theme: its backdrop, a card, a heading in its font and its button color.
import { FONTS, fontHref, THEMES, type Theme } from "@/lib/themes";

export function ThemeCard({ t, on, onPick }: { t: Theme; on: boolean; onPick: () => void }) {
  const p = t.palette;
  return (
    <button type="button" onClick={onPick} aria-pressed={on} aria-label={`${t.name}: ${t.blurb}`}
      className={`relative overflow-hidden rounded-2xl border-2 text-left ${on ? "border-accent" : "border-line"}`}
      style={{ background: p.bg, color: p.text }}>
      <span className="absolute inset-0" style={{ background: t.backdrop }} aria-hidden />
      <span className="relative block p-3">
        <span className="block text-[19px] leading-tight" style={{ fontFamily: `"${FONTS[t.heading].family}", Georgia, serif`, fontWeight: 700 }}>{t.name}</span>
        <span className="mt-2 flex items-center gap-1.5">
          <span className="h-5 flex-1 rounded-md border" style={{ background: p.surface, borderColor: p.line }} />
          <span className="h-5 w-9 rounded-md" style={{ background: p.accent }} />
        </span>
        <span className="mt-1.5 block text-[11px] leading-snug" style={{ color: p.muted }}>{t.blurb}</span>
      </span>
      {on && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: p.accent, color: p.accentText }} aria-hidden>✓</span>}
    </button>
  );
}

/** All theme fonts in one stylesheet (for the pickers). */
export const ALL_THEME_FONTS = fontHref(THEMES.map((t) => t.heading));
