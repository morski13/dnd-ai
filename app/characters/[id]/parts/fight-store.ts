"use client";
// Fight mode state for one character, kept on this device (localStorage), so a page refresh or the
// phone locking in the middle of a fight doesn't lose the turn. Read with useSyncExternalStore.
import { useCallback, useSyncExternalStore } from "react";
import { NEW_FIGHT, type Turn } from "@/lib/turn";

export type Fight = { on: boolean; turn: Turn; sessionId: string | null };
const OFF: Fight = { on: false, turn: NEW_FIGHT, sessionId: null };

const cache = new Map<string, Fight>();
const listeners = new Set<() => void>();
const key = (id: string) => `fight-${id}`;

function read(id: string): Fight {
  const hit = cache.get(id);
  if (hit) return hit;
  let f = OFF;
  try {
    const raw = localStorage.getItem(key(id));
    const j = raw ? JSON.parse(raw) : null;
    if (j && typeof j === "object" && j.turn) f = { on: !!j.on, turn: { ...NEW_FIGHT, ...j.turn }, sessionId: typeof j.sessionId === "string" ? j.sessionId : null };
  } catch { f = OFF; }
  cache.set(id, f);
  return f;
}

function write(id: string, f: Fight) {
  cache.set(id, f);
  try { localStorage.setItem(key(id), JSON.stringify(f)); } catch { /* private mode: kept for this visit only */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** [fight, update]: `update` takes the next value or a function of the current one (safe inside one roll sequence). */
export function useFight(characterId: string): [Fight, (next: Fight | ((f: Fight) => Fight)) => void] {
  const fight = useSyncExternalStore(subscribe, () => read(characterId), () => OFF);
  const update = useCallback((next: Fight | ((f: Fight) => Fight)) => {
    write(characterId, typeof next === "function" ? next(read(characterId)) : next);
  }, [characterId]);
  return [fight, update];
}
