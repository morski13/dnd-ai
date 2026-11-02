// "Campaign Wrapped" (pure, tested): the whole campaign as a tap-through story, one big number per slide.
// Built only from rolls everyone can see (secret DM rolls are left out before this runs).
import type { ActorStats } from "./compute";

export type Slide = { id: string; kicker: string; big: string; title: string; sub: string; who: string | null; emoji: string };

const top = <T,>(list: T[], score: (x: T) => number) => [...list].sort((a, b) => score(b) - score(a))[0] ?? null;
const sumMap = (maps: Record<string, number>[]) => {
  const m = new Map<string, number>();
  for (const x of maps) for (const [k, v] of Object.entries(x)) m.set(k, (m.get(k) ?? 0) + v);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

export function wrappedSlides(chars: ActorStats[], monsters: ActorStats[], sessions: number): Slide[] {
  const pcs = chars.filter((c) => c.rolls > 0);
  if (!pcs.length) return [];
  const slides: Slide[] = [];
  const total = pcs.reduce((s, c) => s + c.damageDealt, 0);
  const rolls = pcs.reduce((s, c) => s + c.rolls, 0);
  slides.push({ id: "damage", kicker: `${sessions} session${sessions === 1 ? "" : "s"} · ${rolls} rolls`, big: String(total), title: "damage dealt by the party", sub: pcs.map((c) => `${c.name.split(" ")[0]} ${c.damageDealt}`).join(" · "), who: null, emoji: "⚔️" });

  const attacks = sumMap(pcs.map((c) => c.attacksUsed));
  if (attacks[0]) {
    const who = top(pcs, (c) => c.attacksUsed[attacks[0][0]] ?? 0);
    slides.push({ id: "attack", kicker: "Most used attack", big: `${attacks[0][1]}×`, title: attacks[0][0], sub: who ? `Mostly by ${who.name}` : "", who: who?.name ?? null, emoji: "🗡️" });
  }
  const spells = sumMap(pcs.map((c) => c.spells));
  if (spells[0]) {
    const who = top(pcs, (c) => c.spells[spells[0][0]] ?? 0);
    slides.push({ id: "spell", kicker: "Most cast spell", big: `${spells[0][1]}×`, title: spells[0][0], sub: who ? `Mostly by ${who.name}` : "", who: who?.name ?? null, emoji: "✨" });
  }
  const rollers = pcs.filter((c) => c.d20Count >= 10 && c.d20Avg != null);
  if (rollers.length >= 2) {
    const lucky = top(rollers, (c) => c.d20Avg!)!, unlucky = top(rollers, (c) => -c.d20Avg!)!;
    slides.push({ id: "lucky", kicker: "Luckiest roller", big: lucky.d20Avg!.toFixed(1), title: lucky.name, sub: `average d20 over ${lucky.d20Count} rolls (10.5 is normal)`, who: lucky.name, emoji: "🍀" });
    slides.push({ id: "unlucky", kicker: "Cursed dice", big: unlucky.d20Avg!.toFixed(1), title: unlucky.name, sub: `average d20 over ${unlucky.d20Count} rolls. Maybe new dice?`, who: unlucky.name, emoji: "🎲" });
  }
  const dropped = top(pcs, (c) => c.timesDropped);
  if (dropped && dropped.timesDropped > 0) slides.push({ id: "close", kicker: "Closest calls", big: `${dropped.timesDropped}×`, title: `${dropped.name} hit the floor`, sub: "…and got back up every time it mattered.", who: dropped.name, emoji: "💀" });
  const hitter = top(pcs, (c) => c.biggestHit?.amount ?? 0);
  if (hitter?.biggestHit) slides.push({ id: "hit", kicker: "Biggest hit", big: String(hitter.biggestHit.amount), title: hitter.name, sub: `with ${hitter.biggestHit.source}`, who: hitter.name, emoji: "💥" });
  const healer = top(pcs, (c) => c.healingDone);
  if (healer && healer.healingDone > 0) slides.push({ id: "heal", kicker: "Top healer", big: String(healer.healingDone), title: healer.name, sub: "hit points healed", who: healer.name, emoji: "💚" });
  const n20 = pcs.reduce((s, c) => s + c.nat20, 0);
  if (n20) { const best = top(pcs, (c) => c.nat20)!; slides.push({ id: "nat20", kicker: "Natural 20s", big: String(n20), title: "critical moments", sub: `${best.name} rolled the most: ${best.nat20}`, who: best.name, emoji: "🌟" }); }
  const deadly = top(monsters.filter((m) => m.damageDealt > 0), (m) => m.damageDealt);
  if (deadly) slides.push({ id: "monster", kicker: "The DM's deadliest monster", big: String(deadly.damageDealt), title: deadly.name, sub: `damage to the party${deadly.kills ? ` · dropped ${deadly.kills}` : ""}`, who: null, emoji: "🐉" });
  return slides;
}
