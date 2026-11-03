import { describe, expect, it } from "vitest";
import type { Award } from "./compute";
import { buildRecap } from "./recap";
import { momentKey, rotateAwards, sessionAwards, sessionWrappedSlides, tallyVotes, voteMoments, type WrapHero } from "./session-wrapped";
import { fromLog } from "./test-log";

const SPELLS = new Set(["Sacred Flame", "Healing Word", "Shatter", "Fire Bolt", "Magic Missile"]);
const { actors, rolls, effects } = fromLog();
const recap = buildRecap(rolls, effects, actors, [{ id: "e1", name: "Ogre at the bridge", round: 4 }], SPELLS);
const chars = actors.filter((a) => a.kind === "character");
const heroes: WrapHero[] = chars.map((a, i) => ({ key: a.key, name: a.name, short: a.name.split(" ")[0], color: `#00000${i}`, mine: i === chars.length - 1, portrait: null }));

describe("Session Wrapped", () => {
  const slides = sessionWrappedSlides({ session: { number: 3, title: "The bridge" }, recap, heroes, teaser: null, isDm: false, campaign: "The Ashen Crown" });

  it("intro, MVP, a slide per hero (yours first), awards, vote, wrap", () => {
    const kinds = slides.map((s) => s.kind);
    expect(kinds[0]).toBe("intro");
    expect(kinds[1]).toBe("mvp");
    expect(kinds.filter((k) => k === "hero").length).toBe(recap.heroes.length);
    const firstHero = slides.find((s) => s.kind === "hero")!;
    expect(firstHero.kicker).toMatch(/^Your night/);
    expect(firstHero.mine).toBe(true);
    expect(kinds.filter((k) => k === "award").length).toBeLessThanOrEqual(3);
    expect(kinds.slice(-2)).toEqual(["vote", "end"]); // players get no teaser slide when the DM wrote none
    expect(slides[0]).toMatchObject({ kicker: "Session 3 · The bridge", big: String(recap.party.rolls) });
    expect(slides.find((s) => s.kind === "mvp")!.title).toBe(recap.mvp);
  });

  it("the DM gets an empty teaser slide to fill; everyone sees a written one", () => {
    const dm = sessionWrappedSlides({ session: { number: 3, title: null }, recap, heroes, teaser: null, isDm: true, campaign: "C" });
    expect(dm.find((s) => s.kind === "teaser")).toMatchObject({ title: "" });
    const all = sessionWrappedSlides({ session: { number: 3, title: null }, recap, heroes, teaser: "  The abbey bells ring at midnight.  ", isDm: false, campaign: "C" });
    expect(all.find((s) => s.kind === "teaser")).toMatchObject({ title: "The abbey bells ring at midnight.", kicker: "Next time on C" });
  });

  it("nothing to wrap without rolls (unless the DM left a teaser)", () => {
    const empty = buildRecap([], [], actors, []);
    expect(sessionWrappedSlides({ session: { number: 1, title: null }, recap: empty, heroes, teaser: null, isDm: false, campaign: "C" })).toEqual([]);
    expect(sessionWrappedSlides({ session: { number: 1, title: null }, recap: empty, heroes, teaser: "Soon.", isDm: false, campaign: "C" }).map((s) => s.kind)).toEqual(["teaser", "end"]);
  });

  it("first blood and the last word come from the log", () => {
    expect(recap.firsts.firstBlood).toMatch(/^c:/);
    const names = (k: string) => actors.find((a) => a.key === k)?.name ?? "?";
    const ids = sessionAwards(recap, names).map((a) => a.id);
    expect(ids).toContain("first-blood");
  });
});

describe("Moment of the night", () => {
  const candidates = voteMoments(recap.moments);
  it("no 'fight begins', at most 6, in the order they happened, stable keys", () => {
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(6);
    expect(candidates.some((c) => c.kind === "fight")).toBe(false);
    const order = candidates.map((c) => recap.moments.findIndex((m) => momentKey(m) === c.key));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(voteMoments(recap.moments).map((c) => c.key)).toEqual(candidates.map((c) => c.key));
  });

  it("tally: most votes wins, ties go to the earlier moment, unknown keys don't count", () => {
    const [a, b] = candidates;
    const t = tallyVotes([
      { moment_key: b.key, user_id: "u1" }, { moment_key: a.key, user_id: "u2" }, { moment_key: "gone|x|", user_id: "u3" },
    ], candidates, "u1");
    expect(t).toMatchObject({ total: 2, winner: a.key, mine: b.key });
    expect(tallyVotes([{ moment_key: b.key, user_id: "u1" }, { moment_key: b.key, user_id: "u2" }, { moment_key: a.key, user_id: "u3" }], candidates, null).winner).toBe(b.key);
    expect(tallyVotes([], candidates, "u1")).toEqual({ counts: {}, total: 0, winner: null, mine: null });
  });
});

describe("rotating awards", () => {
  const aw = (id: string, ...winners: string[]): Award => ({ id, title: id, emoji: "*", blurb: id, winners, value: "1" });
  const pool = [aw("mvp", "Kazar"), aw("reaper", "Kazar"), aw("crit", "Kazar"), aw("healer", "Lyra"), aw("goblin", "Vex"), aw("bag", "Kazar"), aw("slinger", "Lyra")];

  it("leaves out the MVP award and spreads the spotlight", () => {
    const picked = rotateAwards(pool, 4, { mvp: "Kazar" });
    expect(picked.length).toBe(3);
    expect(picked.some((a) => a.id === "mvp")).toBe(false);
    const winners = new Set(picked.flatMap((a) => a.winners));
    expect(winners.has("Lyra") && winners.has("Vex")).toBe(true);
  });

  it("same session → same awards; different sessions rotate", () => {
    expect(rotateAwards(pool, 5).map((a) => a.id)).toEqual(rotateAwards(pool, 5).map((a) => a.id));
    const seen = new Set<string>();
    for (let s = 1; s <= 8; s++) for (const a of rotateAwards(pool, s, { mvp: "Kazar" })) seen.add(a.id);
    expect(seen.size).toBeGreaterThan(3);
  });
});
