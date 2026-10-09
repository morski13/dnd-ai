"use client";
// The live rating: Easy / Medium / Hard / Deadly + what the simulations show.
import type { Analysis } from "@/lib/encounter/analyze";
import { TIER_STYLE, TierBadge } from "../../tier";

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ResultCard({ analysis: a, calculating, hasEnemies, hasParty }: {
  analysis: Analysis | null; calculating: boolean; hasEnemies: boolean; hasParty: boolean;
}) {
  if (!hasParty || !hasEnemies || !a) {
    return (
      <section className="rounded-[18px] border border-dashed border-line p-5 text-sm text-muted">
        {!hasParty ? "Pick at least one party member." : "Add monsters below and the rating appears here."}
      </section>
    );
  }
  const s = a.summary;
  const style = TIER_STYLE[a.tier];
  return (
    <section className="rounded-[18px] border p-4" style={{ borderColor: style.border, background: style.bg }} aria-live="polite">
      <div className="flex items-center justify-between">
        <span key={a.tier} className="animate-pop inline-block"><TierBadge tier={a.tier} size="lg" /></span>
        <span className="text-xs text-muted">{calculating ? "Calculating…" : `${s.runs.toLocaleString()} fights · ${Math.max(1, Math.round(a.ms))} ms`}</span>
      </div>
      <ul className="mt-2 space-y-0.5 text-sm text-soft">
        {a.reasons.map((r) => <li key={r}>{r}</li>)}
      </ul>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { l: "Party wins", v: pct(s.pWin) },
          { l: "Rounds", v: `~${s.avgRounds.toFixed(1)}` },
          { l: "Someone drops", v: pct(s.pAnyDown) },
          { l: "Someone dies", v: s.pDeath > 0 && s.pDeath < 0.01 ? "<1%" : pct(s.pDeath) },
          { l: "Half the party dies", v: s.pHalfDead > 0 && s.pHalfDead < 0.01 ? "<1%" : pct(s.pHalfDead) },
          { l: "HP lost", v: pct(s.avgHpLost) },
        ].map((x) => (
          <div key={x.l} className="rounded-xl bg-bg/60 px-1 py-2">
            <p className="text-lg font-bold text-text">{x.v}</p>
            <p className="text-[11px] leading-tight text-muted">{x.l}</p>
          </div>
        ))}
      </div>

      {a.threats.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Who deals the damage</p>
          {a.threats.slice(0, 4).map((t) => (
            <div key={t.name} className="mt-1.5 flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 truncate">{t.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                <div className="bar-fill h-full rounded-full" style={{ width: pct(t.share), background: style.text }} />
              </div>
              <span className="w-10 text-right text-xs text-muted">{pct(t.share)}</span>
            </div>
          ))}
        </div>
      )}

      {a.atRisk.some((r) => r.down > 0.05) && (
        <p className="mt-3 text-sm text-soft">
          Most at risk: {a.atRisk.filter((r) => r.down > 0.05).slice(0, 2).map((r) => `${r.name.split(" ")[0]} (drops ${pct(r.down)})`).join(", ")}
        </p>
      )}

      {a.suggestions.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">How much is too much</p>
          <ul className="mt-1 space-y-0.5 text-sm text-soft">
            {a.suggestions.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-muted">
        XP check (2024 rules): {a.xp.enemyXp.toLocaleString()} XP = {a.xp.label} budget
        (Low {a.xp.low.toLocaleString()} · Moderate {a.xp.moderate.toLocaleString()} · High {a.xp.high.toLocaleString()}).
        The rating above comes from the simulations, not XP.
      </p>
    </section>
  );
}
