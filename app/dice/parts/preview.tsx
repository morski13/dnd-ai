"use client";
// Live 3D preview of the dice you are designing. Drag to turn them.
import { useEffect, useRef, useState } from "react";
import type { DieType } from "@/lib/dice3d/shapes";
import type { DiceSkin } from "@/lib/dice3d/skin";
import type { DiceStage } from "@/lib/dice3d/stage";
import { useDice } from "../../components/dice/dice-provider";

export const PREVIEW_TYPES: DieType[] = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];

export function DicePreview({ skin, view }: { skin: DiceSkin; view: DieType | "all" }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<DiceStage | null>(null);
  const [failed, setFailed] = useState(false);
  const { loadStage } = useDice();
  const drag = useRef<{ x: number; y: number } | null>(null);

  // Create the 3D view once
  useEffect(() => {
    let alive = true;
    loadStage().then((mod) => {
      if (!alive || !host.current || stage.current) return;
      try { stage.current = new mod.DiceStage(host.current); } catch { setFailed(true); }
    });
    const onResize = () => stage.current && stage.current.idleSpin && stage.current.resize();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
      stage.current?.dispose();
      stage.current = null;
    };
  }, [loadStage]);

  // Redraw when the design or the die changes (a moment after you stop changing it)
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      // wait for the stage on first load
      for (let i = 0; i < 50 && !stage.current; i++) await new Promise((r) => setTimeout(r, 60));
      const st = stage.current;
      if (!alive || !st) return;
      await st.useSkin(skin);
      if (alive) st.showcase(view === "all" ? ["d4", "d6", "d8", "d10", "d12", "d20"] : [view]);
    }, 120);
    return () => { alive = false; clearTimeout(t); };
  }, [skin, view]);

  return (
    <div
      className="relative h-72 touch-none overflow-hidden rounded-[18px] border border-line"
      style={{ background: "radial-gradient(ellipse at 50% 40%, #2c251d, #15130f 75%)" }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        stage.current?.drag(e.clientX - drag.current.x, e.clientY - drag.current.y);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => { drag.current = null; }}
      aria-label="3D preview of your dice. Drag to turn them."
      role="img"
    >
      <div ref={host} className="absolute inset-0" />
      {failed && <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-muted">This device can&apos;t show 3D graphics.</p>}
    </div>
  );
}
