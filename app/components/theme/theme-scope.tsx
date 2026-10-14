// Wraps a screen in a theme: swaps the color/font variables, draws the theme's backdrop and loads its font.
// Scoped to this screen only (other screens keep the usual look).
import { FontLink } from "./font-link";
import { isLightColor, backdropOf, fontHref, fontsOf, THEME, themeVars, type SheetStyle, type ThemeId } from "@/lib/themes";

export function ThemeScope({ theme, style, imageUrl, children }: { theme: ThemeId; style?: SheetStyle; imageUrl?: string | null; children: React.ReactNode }) {
  const t = THEME[theme] ?? THEME.tavern;
  const vars = themeVars(t.id, style);
  const f = fontsOf(t.id, style);
  // Spectral (the usual heading font) is already on the page; load it only when it's also used for all text
  const href = fontHref([f.heading === "spectral" ? undefined : f.heading, f.body ?? undefined]);
  return (
    <div data-theme={t.id} style={{ ...vars, colorScheme: (style?.bg ? isLightColor(style.bg) : t.light) ? "light" : "dark" } as React.CSSProperties}
      className="relative isolate flex min-h-dvh flex-1 flex-col bg-bg text-text font-sans">
      <FontLink href={href} />
      <div className="theme-backdrop" style={{ background: backdropOf(t.id, style, imageUrl) }} aria-hidden />
      {children}
    </div>
  );
}
