"use client";
// A number that counts up from 0 when it appears ("118", "67%", "13.8", "2 / 0" counts the first number).
import { useEffect, useRef } from "react";

export function CountUp({ value, ms = 700 }: { value: string | number; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = String(value);
  useEffect(() => {
    const el = ref.current;
    const m = text.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
    if (!el || !m || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const target = Number(m[1]);
    const decimals = m[1].includes(".") ? m[1].split(".")[1].length : 0;
    const rest = m[2];
    if (target === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = (target * eased).toFixed(decimals) + rest;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.textContent = text; };
  }, [text, ms]);
  return <span ref={ref} className="tabular">{text}</span>;
}
