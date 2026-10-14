"use client";
// The sheet's look (theme, accent, font, text size): shared so the customize panel can preview it live.
import { createContext, useContext, useState } from "react";
import type { SheetStyle } from "@/lib/themes";
import { ThemeScope } from "../../components/theme/theme-scope";

const Ctx = createContext<{ style: SheetStyle; setStyle: (s: SheetStyle) => void; saved: SheetStyle; setSaved: (s: SheetStyle) => void } | null>(null);
export const useLook = () => useContext(Ctx);

export const sheetImageUrl = (characterId: string, image?: number) => (image ? `/api/sheet-bg/${characterId}?v=${image}` : null);

export function LookProvider({ characterId, initial, children }: { characterId: string; initial: SheetStyle; children: React.ReactNode }) {
  const [style, setStyle] = useState<SheetStyle>(initial);
  const [saved, setSaved] = useState<SheetStyle>(initial);
  return (
    <Ctx.Provider value={{ style, setStyle, saved, setSaved }}>
      <ThemeScope theme={style.theme ?? "tavern"} style={style} imageUrl={sheetImageUrl(characterId, style.image)}>{children}</ThemeScope>
    </Ctx.Provider>
  );
}

/** Text size: the sheet (not the menu) is scaled. */
export function Zoomed({ children }: { children: React.ReactNode }) {
  const z = useLook()?.style.zoom ?? 1;
  return <div style={z !== 1 ? { zoom: z } : undefined}>{children}</div>;
}
