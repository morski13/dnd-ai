"use client";
// The running fight, as the character sheet sees it: whose turn, the order, this character's conditions.
// Realtime pushes changes to the fight (turns, initiative, conditions); a gentle poll catches the rest.
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sheetCombat, type SheetCombat } from "../combat-actions";

export type CombatView = { combat: SheetCombat; conditions: string[] };

export function useSheetCombat(characterId: string, campaignId: string, sessionId: string | null, everyMs = 10_000) {
  const [view, setView] = useState<CombatView | null>(null);
  const loader = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let busy = false;
    let again = false;
    let alive = true;
    const load = async (): Promise<void> => {
      if (busy) { again = true; return; }
      busy = true;
      try {
        const r = await sheetCombat(characterId);
        if (alive && !("error" in r)) setView(r);
      } catch { /* offline: keep what we have */ } finally {
        busy = false;
        if (again && alive) { again = false; void load(); }
      }
    };
    loader.current = load;
    void load();
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void load(), 250); };
    const channel = supabase.channel(`sheet-fight-${characterId}`);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "combatants", filter: `campaign_id=eq.${campaignId}` }, soon);
    channel.on("postgres_changes", { event: "*", schema: "public", table: "sessions", filter: `campaign_id=eq.${campaignId}` }, soon);
    if (sessionId) channel.on("postgres_changes", { event: "*", schema: "public", table: "combats", filter: `session_id=eq.${sessionId}` }, soon);
    channel.subscribe();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(); }, everyMs);
    return () => { alive = false; clearInterval(poll); if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [characterId, campaignId, sessionId, everyMs]);

  const reload = useCallback(() => loader.current(), []);
  return { view, setView, reload };
}
