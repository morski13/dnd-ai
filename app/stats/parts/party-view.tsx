// The whole party: headline numbers, who did what, awards, comparison, trends and the DM's side.
import type { StatsView } from "@/lib/stats-data";
import type { ActorStats } from "@/lib/stats/compute";
import { TierBadge } from "../../fights/tier";
import { Awards, Section, Tiles, avg, pct } from "./bits";
import { CharacterBars, TrendChart } from "./charts";

export function PartyView({ d }: { d: StatsView }) {
  const chars = d.characters.filter((c) => d.stats[c.key]);
  const colorOf = (name: string) => d.characters.find((c) => c.name === name)?.color;
  const bars = (f: (s: ActorStats) => number) => chars.map((c) => ({ name: c.short, value: f(d.stats[c.key]), color: c.color }));
  const p = d.party;

  const rows: { label: string; get: (s: ActorStats) => string | number }[] = [
    { label: "Damage dealt", get: (s) => s.damageDealt },
    { label: "Healing done", get: (s) => s.healingDone },
    { label: "Kills", get: (s) => s.kills },
    { label: "Attacks (hits)", get: (s) => (s.attacks ? `${s.attacks} (${s.hits})` : "—") },
    { label: "Hit rate", get: (s) => pct(s.hitRate) },
    { label: "Average d20", get: (s) => avg(s.d20Avg) },
    { label: "Nat 20s", get: (s) => s.nat20 },
    { label: "Nat 1s", get: (s) => s.nat1 },
    { label: "HP lost", get: (s) => s.damageTaken },
    { label: "Dropped to 0", get: (s) => s.timesDropped },
    { label: "Spells cast", get: (s) => s.spellsCast },
    { label: "Spell slots used", get: (s) => s.slotsUsed },
    { label: "Rolls", get: (s) => s.rolls },
  ];

  return (
    <>
      <div className="mt-5">
        <Tiles items={[
          { label: "Party damage", value: p.damage },
          { label: "Healing", value: p.healing },
          { label: "Kills", value: p.kills },
          { label: "Nat 20s", value: p.nat20 },
          { label: "Nat 1s", value: p.nat1 },
          { label: "Average d20", value: avg(p.d20Avg) },
        ]} />
      </div>

      {chars.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No character rolls in this {d.scope === "session" ? "session" : "campaign"} yet.</p>
      ) : (
        <>
          <Section title="Damage dealt" sub="What actually landed (half on a save, after resistance)">
            <div className="rounded-[18px] border border-line bg-surface p-3"><CharacterBars data={bars((s) => s.damageDealt)} /></div>
          </Section>

          {p.healing > 0 && (
            <Section title="Healing done">
              <div className="rounded-[18px] border border-line bg-surface p-3"><CharacterBars data={bars((s) => s.healingDone)} /></div>
            </Section>
          )}

          <Section title="Awards" sub={d.scope === "session" ? `Session ${d.session?.number}` : "Whole campaign"}>
            <Awards awards={d.awards} colorOf={colorOf} />
          </Section>

          <Section title="Side by side">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[22rem] border-separate border-spacing-0 text-sm">
                <caption className="sr-only">Party comparison</caption>
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-bg py-2 pr-2 text-left text-xs font-normal text-muted" scope="col"><span className="sr-only">Stat</span></th>
                    {chars.map((c) => (
                      <th key={c.key} scope="col" className="px-1 py-2 text-right text-xs font-bold text-soft">
                        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c.color }} />{c.short}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const vals = chars.map((c) => r.get(d.stats[c.key]));
                    const nums = vals.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => !Number.isNaN(n));
                    const best = nums.length > 1 ? Math.max(...nums) : null;
                    return (
                      <tr key={r.label}>
                        <th scope="row" className="sticky left-0 border-t border-line bg-bg py-2 pr-2 text-left font-normal text-muted">{r.label}</th>
                        {vals.map((v, i) => {
                          const n = typeof v === "number" ? v : parseFloat(String(v));
                          const top = best !== null && best > 0 && n === best && !["Nat 1s", "HP lost", "Dropped to 0"].includes(r.label);
                          return <td key={i} className={`border-t border-line px-1 py-2 text-right tabular-nums ${top ? "font-bold text-accent" : "text-text"}`}>{v}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {d.scope === "campaign" && d.trends && (
        <Section title="Over the campaign" sub="Each session, per character">
          <div className="rounded-[18px] border border-line bg-surface p-3">
            {d.sessions.length < 2 ? (
              <p className="py-4 text-center text-sm text-muted">Trends appear after your second session with rolls.</p>
            ) : (
              <TrendChart trends={d.trends} series={chars.map((c) => ({ key: c.key, name: c.short, color: c.color }))} />
            )}
          </div>
        </Section>
      )}

      {d.dm && <DmSection d={d} />}
    </>
  );
}

function DmSection({ d }: { d: StatsView }) {
  const dm = d.dm!;
  return (
    <section className="mt-8 rounded-[18px] border border-line bg-surface-2 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">Behind the DM screen</p>
      <p className="mt-0.5 text-xs text-muted">Only you see this.</p>
      <div className="mt-3">
        <Tiles items={[
          { label: "Monster damage", value: dm.monsterDamage },
          { label: "PCs dropped", value: dm.pcsDropped },
          { label: "Enemies down", value: dm.monstersDown },
          { label: "Monster hit rate", value: pct(dm.monsterHitRate) },
          { label: "Monster avg d20", value: avg(dm.monsterD20Avg) },
          { label: "Fights", value: dm.fights.length },
        ]} />
      </div>

      {dm.monsters.length > 0 && (
        <>
          <p className="mt-5 text-sm font-bold">Most dangerous</p>
          <ul className="mt-2 divide-y divide-line">
            {dm.monsters.slice(0, 6).map((m, i) => (
              <li key={m.type} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-5 text-muted">{i + 1}</span>
                <span className="flex-1 truncate">{m.type}{m.count > 1 && <span className="text-muted"> ×{m.count}</span>}</span>
                <span className="text-right text-xs text-soft">
                  <span className="font-semibold text-text">{m.damageDealt}</span> dmg · {m.downs} drop{m.downs === 1 ? "" : "s"} · hits {pct(m.hitRate)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {dm.fights.length > 0 && (
        <>
          <p className="mt-5 text-sm font-bold">Fights: planned vs how it went</p>
          <ul className="mt-2 space-y-2">
            {dm.fights.map((f) => (
              <li key={f.combatId} className="rounded-xl border border-line bg-surface p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{f.name}</span>
                  {f.plannedTier ? <TierBadge tier={f.plannedTier} /> : <span className="text-xs text-muted">not planned</span>}
                </div>
                <p className="mt-1 text-xs text-soft">
                  {f.sessionNumber !== null && `Session ${f.sessionNumber} · `}{f.rounds} round{f.rounds === 1 ? "" : "s"} · party dealt {f.partyDamage}, took {f.enemyDamage}
                  {" · "}{f.enemiesDown} enemies down{f.pcsDropped > 0 && ` · ${f.pcsDropped} PC${f.pcsDropped === 1 ? "" : "s"} dropped`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
