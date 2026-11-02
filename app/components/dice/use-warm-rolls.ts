"use client";
// Makes the first roll as fast as the later ones. Rolling screens (character sheet, Session,
// roller) call this once: right after the page has settled it
//  - gets the 3D dice ready (code, your skin, painted faces, compiled shaders), and
//  - wakes the server: loads the roll code, checks the login, opens the database connection.
// While the screen stays open and visible it pings the server every few minutes, so a long
// pause in the game (talking, a break) doesn't make the next roll slow again.
import { useEffect } from "react";
import { warmUp } from "@/app/characters/[id]/actions";
import { useDice } from "./dice-provider";

const KEEP_WARM_MS = 4 * 60 * 1000;

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function useWarmRolls(opts: { server?: boolean } = {}) {
  const { prepare } = useDice();
  const server = opts.server !== false;

  useEffect(() => {
    const w = window as IdleWindow;
    const ping = () => { if (server && document.visibilityState === "visible") void warmUp().catch(() => {}); };
    // the server ping goes out at once (it's only a small request); the dice wait for a quiet moment
    ping();
    const idleId = w.requestIdleCallback ? w.requestIdleCallback(() => void prepare(), { timeout: 1500 }) : null;
    const timeoutId = idleId === null ? setTimeout(() => void prepare(), 400) : null;
    const keep = setInterval(ping, KEEP_WARM_MS);
    const onVisible = () => { if (document.visibilityState === "visible") ping(); }; // back from the lock screen
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (idleId !== null) w.cancelIdleCallback?.(idleId);
      if (timeoutId !== null) clearTimeout(timeoutId);
      clearInterval(keep);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [prepare, server]);
}
