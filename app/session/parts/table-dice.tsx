"use client";
// Everyone sees everyone's dice: when someone else at the table rolls, their dice tumble across your
// screen in their own dice skin. Secret DM rolls never come here (the log hides who rolled them).
// Never interrupts your own roll, and can be turned off in Dice settings.
import { useEffect, useRef } from "react";
import type { LogRow } from "@/lib/session-data";
import { sanitizeSkin, type DiceSkin } from "@/lib/dice3d/skin";
import { createClient } from "@/lib/supabase/client";
import { useDice } from "../../components/dice/dice-provider";

const FRESH_MS = 60_000; // only rolls from the last minute (not a replay of the whole log)

export function TableDice({ rows, me }: { rows: LogRow[]; me: string }) {
  const dice = useDice();
  const seen = useRef<Set<string> | null>(null);
  const skins = useRef(new Map<string, Promise<DiceSkin | undefined>>());

  useEffect(() => {
    if (!seen.current) { seen.current = new Set(rows.map((r) => r.id)); return; } // what was already there when you opened the page
    const fresh = rows.filter((r) => !seen.current!.has(r.id));
    fresh.forEach((r) => seen.current!.add(r.id));
    const theirs = fresh.filter((r) => !r.masked && r.rolled_by && r.rolled_by !== me && r.expression && r.dice_all?.length
      && Date.now() - new Date(r.created_at).getTime() < FRESH_MS);
    const r = theirs[0]; // newest first: show the latest one
    if (!r) return;
    const skinOf = (uid: string) => {
      if (!skins.current.has(uid)) {
        skins.current.set(uid, (async () => {
          try {
            const { data } = await createClient().from("dice_skins").select("data").eq("user_id", uid).eq("is_active", true).maybeSingle();
            return sanitizeSkin(data?.data) ?? undefined;
          } catch { return undefined; }
        })());
      }
      return skins.current.get(uid)!;
    };
    (async () => {
      const skin = await skinOf(r.rolled_by!);
      await dice.show({
        expression: r.expression!, dice: r.dice ?? [], diceAll: r.dice_all ?? [], total: r.total,
        isCrit: r.is_crit, isFumble: r.is_fumble,
        label: `${r.actor.split(" ")[0]}: ${r.source ?? "Roll"}`,
        tone: r.roll_type === "heal" ? "heal" : r.roll_type === "damage" ? "damage" : "plain",
      }, { skin, quiet: true });
    })();
  }, [rows, me, dice]);

  return null;
}
