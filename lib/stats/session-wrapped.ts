// Session Wrapped (pure, tested): one session as a tap-through story that opens for the whole table when
// the session ends. Built from the recap of open rolls only (secret DM rolls never reach it), so every
// slide can be shared.
//   intro → MVP → a slide per hero (yours first) → rotating awards → Moment of the night vote
//   → the DM's teaser → that's a wrap.
import type { Award } from "./compute";
import type { Hero, Moment, Recap } from "./recap";
import type { Slide } from "./wrapped";

export type WrapHero = { key: string; name: string; short: string; color: string; mine: boolean; portrait: string | null };
export type VoteMoment = { key: string; kind: Moment["kind"]; text: string; who: string | null };
export type Tally = { counts: Record<string, number>; total: number; winner: string | null; mine: string | null };

export type SessionSlide = Slide & {
  kind: "intro" | "mvp" | "hero" | "award" | "vote" | "teaser" | "end";
  color?: string;
  portrait?: string | null;
  mine?: boolean;
};

const MOMENT_EMOJI: Record<Moment["kind"], string> = { fight: "⚔️", crit: "🎯", fumble: "🎲", "big-hit": "💥", down: "💀", "pc-down": "🛌", heal: "🩹" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// Moment of the night

/** Stable key for a moment (same data → same key), so votes keep pointing at it. */
export const momentKey = (m: Moment) => `${m.kind}|${m.at}|${m.who ?? ""}`;

const PRIORITY: Moment["kind"][] = ["crit", "big-hit", "pc-down", "down", "heal", "fumble"];

/** Up to `max` moments worth voting for (no "a fight begins"), best kinds first, then shown in the order they happened. */
export function voteMoments(moments: Moment[], max = 6): VoteMoment[] {
  const ranked = moments
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.kind !== "fight")
    .sort((a, b) => PRIORITY.indexOf(a.m.kind) - PRIORITY.indexOf(b.m.kind) || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i);
  return ranked.map(({ m }) => ({ key: momentKey(m), kind: m.kind, text: m.text, who: m.who }));
}

/** Votes for moments that exist; the winner has the most votes (a tie goes to the moment that came first). */
export function tallyVotes(votes: { moment_key: string; user_id: string }[], candidates: VoteMoment[], me: string | null): Tally {
  const valid = new Set(candidates.map((c) => c.key));
  const counts: Record<string, number> = {};
  let total = 0, mine: string | null = null;
  for (const v of votes) {
    if (!valid.has(v.moment_key)) continue;
    counts[v.moment_key] = (counts[v.moment_key] ?? 0) + 1;
    total++;
    if (me && v.user_id === me) mine = v.moment_key;
  }
  let winner: string | null = null;
  for (const c of candidates) if ((counts[c.key] ?? 0) > 0 && (!winner || counts[c.key] > counts[winner])) winner = c.key;
  return { counts, total, winner, mine };
}

// ---------------------------------------------------------------------------
// Rotating awards

/** Session-only awards on top of the usual ones, so a night isn't always "most damage" again. */
export function sessionAwards(r: Recap, names: (key: string) => string): Award[] {
  const out: Award[] = [];
  const best = (score: (h: Hero) => number | null) => {
    const scored = r.heroes.map((h) => ({ h, v: score(h) })).filter((x): x is { h: Hero; v: number } => x.v !== null && x.v > 0);
    if (!scored.length) return null;
    const top = Math.max(...scored.map((x) => x.v));
    return { v: top, winners: scored.filter((x) => x.v === top).map((x) => x.h.name) };
  };
  if (r.firsts.firstBlood) out.push({ id: "first-blood", title: "First Blood", emoji: "🩸", blurb: "Landed the party's first hit", winners: [names(r.firsts.firstBlood)], value: "first hit" });
  if (r.firsts.lastWord) out.push({ id: "last-word", title: "The Last Word", emoji: "🗝️", blurb: "Took down the last enemy", winners: [names(r.firsts.lastWord)], value: "final blow" });
  const wall = best((h) => (h.dropped === 0 && h.taken >= 10 ? h.taken : null));
  if (wall) out.push({ id: "iron-wall", title: "Iron Wall", emoji: "🛡️", blurb: "Took the most hits and stayed up", winners: wall.winners, value: `${wall.v} HP soaked` });
  const steady = best((h) => (h.attacks >= 3 && h.hits === h.attacks ? h.attacks : null));
  if (steady) out.push({ id: "steady", title: "Steady Hands", emoji: "🎯", blurb: "Never missed (3+ attacks)", winners: steady.winners, value: `${steady.v} of ${steady.v} hit` });
  const back = best((h) => (h.dropped > 0 && h.damage > 0 ? h.damage : null));
  if (back) out.push({ id: "comeback", title: "Comeback Kid", emoji: "🔥", blurb: "Dropped to 0 and kept fighting", winners: back.winners, value: `${back.v} damage anyway` });
  return out;
}

/** Small seeded shuffle, so the same session always shows the same awards but the next one differs. */
function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * Picks up to `max` awards for this session. The pool rotates with the session number, the MVP's award
 * (Wrecking Ball) is left out because the MVP has its own slide, and heroes without an award yet go first,
 * so the spotlight moves around the table.
 */
export function rotateAwards(pool: Award[], session: number, opts: { max?: number; mvp?: string | null } = {}): Award[] {
  const max = opts.max ?? 3;
  const rand = seeded(session + 7);
  const list = pool.filter((a) => a.id !== "mvp" && a.winners.length).map((a) => ({ a, r: rand() }));
  const picked: Award[] = [];
  const lit = new Set<string>(opts.mvp ? [opts.mvp] : []);
  while (picked.length < max && list.length) {
    let bi = 0, bs = -Infinity;
    list.forEach(({ a, r }, i) => {
      const fresh = a.winners.filter((w) => !lit.has(w)).length;
      const score = (fresh ? 2 : 0) + r;
      if (score > bs) { bs = score; bi = i; }
    });
    const [{ a }] = list.splice(bi, 1);
    picked.push(a);
    for (const w of a.winners) lit.add(w);
  }
  return picked;
}

// ---------------------------------------------------------------------------
// The slides

function heroLine(h: Hero): string {
  return [
    h.attacks ? `hit ${h.hits} of ${h.attacks}` : null,
    h.biggest ? `biggest hit ${h.biggest.amount}` : null,
    h.nat20 ? `${h.nat20}× nat 20` : null,
    h.kills ? `${plural(h.kills, "foe")} down` : null,
    h.topSpell ? `loved ${h.topSpell}` : h.topAttack ? `mostly ${h.topAttack}` : null,
    h.dropped ? `dropped ${h.dropped}×` : null,
  ].filter(Boolean).join(" · ");
}

function rankOf(h: Hero, heroes: Hero[]): string | null {
  if (heroes.length < 2) return null;
  const by = (f: (x: Hero) => number) => [...heroes].sort((a, b) => f(b) - f(a));
  if (h.damage > 0 && by((x) => x.damage)[0].key === h.key) return "most damage at the table";
  if (h.healing > 0 && by((x) => x.healing)[0].key === h.key) return "top healer";
  if (h.kills > 0 && by((x) => x.kills)[0].key === h.key) return "most foes down";
  if (h.nat20 > 0 && by((x) => x.nat20)[0].key === h.key) return "most natural 20s";
  return null;
}

const leadNumber = (value: string) => value.match(/^\d+(\.\d+)?%?/)?.[0] ?? null;

export function sessionWrappedSlides(p: {
  session: { number: number; title: string | null };
  recap: Recap;
  heroes: WrapHero[];
  teaser: string | null;
  isDm: boolean;
  campaign: string;
}): SessionSlide[] {
  const { recap: r, session } = p;
  const slides: SessionSlide[] = [];
  const label = `Session ${session.number}${session.title ? ` · ${session.title}` : ""}`;
  const info = new Map(p.heroes.map((h) => [h.key, h]));
  const nameOf = (key: string) => info.get(key)?.name ?? "Someone";

  if (r.party.rolls) {
    const hours = r.minutes >= 60 ? `${Math.floor(r.minutes / 60)} h ${r.minutes % 60} min` : r.minutes ? `${r.minutes} min` : null;
    slides.push({
      id: "intro", kind: "intro", kicker: label, big: String(r.party.rolls), title: "rolls at the table tonight", emoji: "🎲", who: null,
      sub: [`${r.party.damage} damage`, `${plural(r.party.kills, "foe")} down`, `${r.party.nat20}× natural 20`, hours].filter(Boolean).join(" · "),
    });

    const mvp = r.mvp ? r.heroes[0] : null;
    if (mvp) {
      const healer = mvp.healing > mvp.damage;
      const h = info.get(mvp.key);
      slides.push({
        id: "mvp", kind: "mvp", kicker: "MVP of the night", big: String(healer ? mvp.healing : mvp.damage), title: mvp.name, emoji: "👑", who: mvp.name,
        sub: [healer ? "HP healed" : "damage dealt", mvp.kills ? `${plural(mvp.kills, "foe")} down` : null, healer && mvp.damage ? `${mvp.damage} damage too` : null].filter(Boolean).join(" · "),
        color: h?.color, portrait: h?.portrait ?? null, mine: h?.mine,
      });
    }

    // a slide for every hero who rolled, yours first
    const order = [...r.heroes].sort((a, b) => Number(!!info.get(b.key)?.mine) - Number(!!info.get(a.key)?.mine));
    for (const hero of order) {
      const h = info.get(hero.key);
      const healer = hero.healing > hero.damage;
      const rank = rankOf(hero, r.heroes);
      slides.push({
        id: `hero-${hero.key}`, kind: "hero",
        kicker: `${h?.mine ? "Your night" : `${h?.short ?? hero.name.split(" ")[0]}'s night`}${rank ? ` · ${rank}` : ""}`,
        big: String(healer ? hero.healing : hero.damage), title: hero.name, emoji: healer ? "💚" : hero.damage ? "⚔️" : "🛡️", who: hero.name,
        sub: [healer ? "HP healed" : "damage dealt", heroLine(hero)].filter(Boolean).join(" · "),
        color: h?.color, portrait: h?.portrait ?? null, mine: h?.mine,
      });
    }

    for (const a of rotateAwards([...r.awards, ...sessionAwards(r, nameOf)], session.number, { mvp: r.mvp })) {
      const who = p.heroes.find((h) => h.name === a.winners[0]);
      slides.push({
        id: `award-${a.id}`, kind: "award", kicker: `Award · ${a.blurb}`, big: leadNumber(a.value) ?? a.emoji, title: a.title, emoji: a.emoji,
        sub: `${a.winners.join(" & ")} · ${a.value}`, who: a.winners.join(" & "), color: who?.color, portrait: a.winners.length === 1 ? who?.portrait ?? null : null,
        mine: p.heroes.some((h) => h.mine && a.winners.includes(h.name)),
      });
    }

    if (voteMoments(r.moments).length) {
      slides.push({ id: "vote", kind: "vote", kicker: "Moment of the night", big: "★", title: "Which moment was the best?", sub: "Everyone at the table gets one vote.", who: null, emoji: "🗳️" });
    }
  }

  if (p.teaser?.trim()) slides.push({ id: "teaser", kind: "teaser", kicker: `Next time on ${p.campaign}`, big: "…", title: p.teaser.trim(), sub: "", who: null, emoji: "📜" });
  else if (p.isDm && (r.party.rolls || slides.length)) slides.push({ id: "teaser", kind: "teaser", kicker: "Next time…", big: "…", title: "", sub: "Write a teaser for the table (only you see this slide until you do).", who: null, emoji: "📜" });

  if (slides.length) slides.push({ id: "end", kind: "end", kicker: label, big: "That's a wrap", title: "See you next session", sub: "", who: null, emoji: "🎬" });
  return slides;
}

export { MOMENT_EMOJI };
