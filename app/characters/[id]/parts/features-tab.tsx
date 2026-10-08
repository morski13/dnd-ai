"use client";
// Features & feats: tap one to read what it does.
import type { Feature } from "@/lib/character-data";
import { Empty, RulesText, Tag } from "./ui";

export function FeaturesTab({ features, featText }: { features: (string | Feature)[]; featText: Record<string, string> }) {
  if (features.length === 0) return <Empty text="No features yet." />;
  return (
    <div className="flex flex-col gap-2">
      {features.map((raw, i) => {
        const f: Feature = typeof raw === "string" ? { name: raw } : raw;
        const text = f.description ?? (f.feat ? featText[f.name] : undefined);
        return (
          <details key={f.name + i} className="group rounded-2xl bg-surface">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{f.name}</p>
                {(f.source || f.feat) && (
                  <div className="mt-1 flex items-center gap-1.5">
                    {f.feat && <Tag tone="accent">Feat</Tag>}
                    {f.source && <span className="text-xs text-muted">{f.source}</span>}
                  </div>
                )}
              </div>
              <span className="text-muted transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <div className="border-t border-line px-4 pb-4 pt-3">
              {text ? <RulesText text={text} /> : <p className="text-sm text-muted">No description yet.</p>}
            </div>
          </details>
        );
      })}
    </div>
  );
}
