"use client";
// "Install the app": on Android/Chrome the browser's own install prompt; on iPhone how to add it to the Home Screen.
import { useEffect, useState } from "react";

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [ios, setIos] = useState(false);
  const [hide, setHide] = useState(true);
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try { dismissed = localStorage.getItem("install-dismissed") === "1"; } catch { /* fine */ }
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as Prompt); setHide(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { setIos(true); setHide(false); } // eslint-disable-line react-hooks/set-state-in-effect -- read once from the browser
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (hide) return null;
  const close = () => { setHide(true); try { localStorage.setItem("install-dismissed", "1"); } catch { /* fine */ } };
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
      <span aria-hidden className="text-xl">📲</span>
      <span className="min-w-0 flex-1 text-soft">{ios ? <>Install the app: tap <b className="text-text">Share</b>, then <b className="text-text">Add to Home Screen</b>.</> : "Install the app: it opens full screen and starts faster."}</span>
      {prompt && <button type="button" onClick={async () => { await prompt.prompt(); await prompt.userChoice.catch(() => null); close(); }} className="h-10 shrink-0 rounded-xl bg-accent px-3 font-bold text-accent-text">Install</button>}
      <button type="button" onClick={close} aria-label="Not now" className="h-10 w-10 shrink-0 text-muted">✕</button>
    </div>
  );
}
