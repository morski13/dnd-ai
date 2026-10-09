// One character's stats: numbers, favorite attacks and spells, awards won, and their trend.
import type { StatsView } from "@/lib/stats-data";
import { Awards, CountList, Section, Tiles, avg, pct } from "./bits";
import { TrendChart } from "./charts";

const sorted = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);

export function CharacterView({ d }: { d: StatsView }) {
  const c = d.focus!;
  const s = d.stats[c.key];
  const won = d.awards.filter((a) => a.winners.includes(c.name));

  return (
    <>
      <div className="mt-5 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full font-heading text-xl font-bold text-bg" style={{ background: c.color }}>
          {c.name.charAt(0)}
        </span>
        <div>
          <p className="font-heading text-2xl font-bold leading-tight">{c.name}</p>
          <p className="text-sm text-muted">{d.scope === "session" ? `Session ${d.session?.number}` : "Whole campaign"}</p>
        </div>
      </div>

      {!s ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
          {c.short} didn&apos;t roll in this {d.scope === "session" ? "session" : "campaign"} yet.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <Tiles items={[
              { label: "Damage dealt", value: s.damageDealt },
              { label: "Healing done", value: s.healingDone },
              { label: "Kills", value: s.kills },
              { label: "Hit rate", value: pct(s.hitRate), sub: s.attacks ? `${s.hits} of ${s.hits + s.misses}` : undefined },
              { label: "Average d20", value: avg(s.d20Avg), sub: `${s.d20Count} rolls` },
              { label: "Nat 20 / Nat 1", value: `${s.nat20} / ${s.nat1}` },
              { label: "HP lost", value: s.damageTaken, sub: s.resisted ? `${s.resisted} resisted` : undefined },
              { label: "Dropped to 0", value: s.timesDropped },
              { label: "Spells cast", value: s.spellsCast, sub: s.slotsUsed ? `${s.slotsUsed} slot${s.slotsUsed === 1 ? "" : "s"}` : undefined },
            ]} />
          </div>

          {s.biggestHit && (
            <div className="mt-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="text-muted">Biggest hit: </span>
              <span className="font-bold text-text">{s.biggestHit.amount}</span>
              <span className="text-soft"> with {s.biggestHit.source}</span>
            </div>
          )}

          <Section title="Most used attacks">
            <CountList items={sorted(s.attacksUsed)} color={c.color} empty="No attacks rolled." />
          </Section>
          <Section title="Spells cast">
            <CountList items={sorted(s.spells)} color={c.color} empty="No spells cast." />
          </Section>

          <Section title="Saves and checks">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="text-muted">Saves</p>
                <p className="mt-1 font-semibold">{s.savesMade} made · {s.savesFailed} failed</p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-3">
                <p className="text-muted">Checks with a DC</p>
                <p className="mt-1 font-semibold">{s.checksMade} passed · {s.checksFailed} failed</p>
              </div>
            </div>
            {s.failedChecks.length > 0 && <p className="mt-2 text-sm text-muted">Failed: {s.failedChecks.join(", ")}</p>}
          </Section>

          {won.length > 0 && (
            <Section title="Awards won">
              <Awards awards={won} colorOf={() => c.color} />
            </Section>
          )}
        </>
      )}

      {d.scope === "campaign" && d.trends && d.sessions.length >= 2 && (
        <Section title="Over the campaign">
          <div className="rounded-[18px] border border-line bg-surface p-3">
            <TrendChart trends={d.trends} series={[{ key: c.key, name: c.short, color: c.color }]} />
          </div>
        </Section>
      )}
    </>
  );
}
