"use client";
// Tablets and computers: the side menu can be tucked away to the left edge (like Claude's sidebar),
// leaving a slim strip with a button to bring it back. Remembered on this device. Phones keep the bottom bar.
// The choice is put on <html data-nav="hidden"> before the page paints (script in app/layout.tsx).
import { useSyncExternalStore } from "react";
import { NAV_KEY as KEY } from "./nav-script";

const EVENT = "nav-change";
const read = () => document.documentElement.dataset.nav === "hidden";
const subscribe = (f: () => void) => { window.addEventListener(EVENT, f); return () => window.removeEventListener(EVENT, f); };

function set(hidden: boolean) {
  if (hidden) document.documentElement.dataset.nav = "hidden"; else delete document.documentElement.dataset.nav;
  try { localStorage.setItem(KEY, hidden ? "hidden" : "shown"); } catch { /* private mode: this visit only */ }
  window.dispatchEvent(new Event(EVENT));
}

function PanelIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />
      {open ? <path d="M15.5 10 13.5 12l2 2" /> : <path d="M13.5 10l2 2-2 2" />}
    </svg>
  );
}

/** Inside the side menu: tuck it away. */
export function HideNavButton() {
  return (
    <button type="button" onClick={() => set(true)} aria-label="Hide the menu" title="Hide the menu"
      className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-text md:flex">
      <PanelIcon open />
    </button>
  );
}

/** The slim strip on the left edge while the menu is hidden: bring it back. */
export function NavRail() {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  return (
    <div className="nav-rail fixed inset-y-0 left-0 z-20 hidden w-[var(--nav-rail)] flex-col items-center border-r border-line bg-surface-2 pt-3">
      <button type="button" onClick={() => set(false)} aria-label="Show the menu" title="Show the menu" aria-expanded={!hidden}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-text">
        <PanelIcon open={false} />
      </button>
    </div>
  );
}
