"use client";
// "Not in the free rules": shown on the import review, so players know up front what the app
// can't do by itself for their character (and what it does instead). Information only.
import { useEffect, useState } from "react";
import type { ReportItem } from "@/lib/sheet-import/rules-report";
import type { ImportedSheet } from "@/lib/sheet-import/types";
import { checkRules } from "./actions";

const ICON: Record<ReportItem["kind"], string> = {
  class: "⚔", subclass: "✦", species: "🧬", background: "📜", spells: "🔮", items: "🎒", multiclass: "⚖", edition: "📘", level: "⬆",
};

export function RulesCard({ sheet, rules }: { sheet: ImportedSheet; rules: string }) {
  const [items, setItems] = useState<ReportItem[] | null>(null);
  useEffect(() => {
    let live = true;
    checkRules(rules, sheet).then((r) => { if (live) setItems(r); }).catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [rules, sheet]);

  if (items === null) return <div className="mt-3 h-20 animate-pulse rounded-2xl bg-surface" aria-label="Checking the rules…" />;
  if (!items.length) {
    return (
      <p className="mt-3 rounded-2xl border border-success-line bg-success-bg px-4 py-3 text-sm text-success" role="status">
        ✓ Everything on this sheet is in the free {rules === "2014" ? "2014" : "2024"} rules the app knows.
      </p>
    );
  }
  return (
    <section aria-label="Not in the free rules" className="mt-3 rounded-2xl border border-accent-line bg-surface p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Not in the free rules · {items.length}</p>
      <p className="mt-1 text-sm text-soft">The app only knows the free rules (SRD). These parts of your character still come in, but here&apos;s what that means:</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it) => (
          <li key={it.kind + it.title} className={`flex gap-3 rounded-xl border px-3 py-2.5 ${it.severity === "warn" ? "border-danger-line bg-danger-bg" : "border-line bg-bg"}`}>
            <span aria-hidden className="mt-0.5 text-base">{ICON[it.kind]}</span>
            <span className="min-w-0">
              <span className={`block text-sm font-semibold [overflow-wrap:anywhere] ${it.severity === "warn" ? "text-danger" : ""}`}>{it.title}</span>
              <span className="block text-xs leading-snug text-muted">{it.what}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
