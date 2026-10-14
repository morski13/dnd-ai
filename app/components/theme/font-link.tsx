"use client";
// Loads a Google Fonts stylesheet once, without holding up the page (if it can't load, the fallback font is used).
import { useEffect } from "react";

export function FontLink({ href }: { href: string | null }) {
  useEffect(() => {
    if (!href || document.querySelector(`link[data-font-href="${CSS.escape(href)}"]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.dataset.fontHref = href;
    document.head.appendChild(l);
  }, [href]);
  return null;
}
