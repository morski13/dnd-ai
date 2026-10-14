"use client";
// DM: the look of the table in Session mode (everyone at the table sees it).
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { THEME, THEMES, type ThemeId } from "@/lib/themes";
import { BottomSheet } from "../../items/parts/ui";
import { FontLink } from "../../components/theme/font-link";
import { ALL_THEME_FONTS, ThemeCard } from "../../components/theme/theme-card";
import { setSessionTheme } from "../moderator-actions";

export function TableTheme({ current }: { current: ThemeId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pick = (id: ThemeId) => start(async () => {
    const r = await setSessionTheme(id);
    if (r && "error" in r) return setError(r.error);
    router.refresh();
  });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left">
        <span><span className="block text-sm font-semibold">Table look</span><span className="block text-xs text-muted">Everyone at the table sees it</span></span>
        <span className="text-sm text-accent">{THEME[current].name} ›</span>
      </button>
      {open && (
        <BottomSheet title="Table look" onClose={() => setOpen(false)}>
          <FontLink href={ALL_THEME_FONTS} />
          <p className="text-sm text-muted">Pick the world your session feels like. Players see it on their Session screen right away.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {THEMES.map((t) => <ThemeCard key={t.id} t={t} on={t.id === current} onPick={() => pick(t.id)} />)}
          </div>
          {pending && <p className="mt-2 text-xs text-muted">Changing the look…</p>}
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </BottomSheet>
      )}
    </>
  );
}
