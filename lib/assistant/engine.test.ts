import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Analysis } from "../reader/types";

// campaign notes: one shared NPC, one secret one
const analysis: Analysis = {
  engine: "smart",
  nodes: [
    { id: "n1", label: "Morwen", type: "npc", docId: "d1", aliases: [], summary: "Abbess of the Ashen Abbey.", facts: [{ text: "Morwen runs the Ashen Abbey and distrusts the Lanternhands.", secret: false, docId: "d1" }], status: null, degree: 1, secret: false },
    { id: "n2", label: "Warrik", type: "npc", docId: "d2", aliases: [], summary: "", facts: [{ text: "Warrik is secretly the Lord of the Seven Seas.", secret: true, docId: "d2" }], status: null, degree: 0, secret: true },
  ],
  edges: [], mustHappen: [], milestones: [], quests: [], stats: { docs: 2, words: 40 },
} as unknown as Analysis;

vi.mock("../reader-data", () => ({ readerInput: async () => ({ docs: [], party: [] }) }));
vi.mock("../reader/engine", () => ({ getReader: () => ({ analyze: async () => analysis }) }));

const { answer } = await import("./engine");
const { setAiStore, memoryStore, clearAiMemory } = await import("../ai/store");

const T: Record<string, Record<string, unknown>[]> = {
  campaigns: [{ rule_set: "2024", settings: { house_rules: { crit: "double_dice", flanking: "advantage" } } }],
  characters: [{
    id: "c1", name: "Orrin", species: "Human", rule_set: "2024", class_levels: [{ class: "Wizard", level: 5 }], ability_scores: { INT: 18, DEX: 14 },
    proficiencies: { saves: ["INT", "WIS"] }, ac: 12, hp_max: 27, hp_current: 27, temp_hp: 0, speed: 30, attacks: [], spells: { known: ["Misty Step", "Fireball"], ability: "INT", slots: { "1": 4, "2": 3, "3": 2 }, slots_used: { "3": 1 } },
    resources: [], features: ["Arcane Recovery"], concentration: null,
  }],
  combatants: [],
  srd_spells: [
    { name: "Misty Step", level: 2, school: "Conjuration", classes: ["Wizard"], casting_time: "Bonus Action", ritual: false, range: "Self", components: "V", duration: "Instantaneous", concentration: false, description: "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied space you can see.", higher_levels: null },
    { name: "Fireball", level: 3, school: "Evocation", classes: ["Wizard"], casting_time: "Action", ritual: false, range: "150 feet", components: "V, S, M", duration: "Instantaneous", concentration: false, description: "A bright streak flashes from you to a point you choose within range and then blossoms into an explosion of flame.", higher_levels: null },
  ],
  srd_items: [], srd_monsters: [],
};
function fakeDb() {
  return {
    from(table: string) {
      const rows = T[table] ?? [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "order", "range", "is", "limit", "not"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
      return q;
    },
  };
}

const sent: { messages: { role: string; content: string }[] }[] = [];
beforeEach(() => {
  sent.length = 0;
  process.env.AI_BASE_URL = "http://fake/v1"; process.env.AI_MODEL = "m"; process.env.AI_API_KEY = "k";
  setAiStore(memoryStore); clearAiMemory();
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"verdict":"no","answer":"Nae, lad: one slot per turn.","sources":["S1","S2"]}' } }] }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const base = { supabase: fakeDb() as never, userId: "u1", campaign: { id: "camp", name: "The Ashen Crown" }, isDm: false };

describe("Tavern engine", () => {
  it("a combo question about a character: sheet, house rules, app checks, sources, style", async () => {
    const r = await answer({ ...base, mode: "character", characterId: "c1", styleId: "dwarf", question: "Can I cast Misty Step and Fireball in the same turn?" });
    expect(r).toMatchObject({ verdict: "no", answer: "Nae, lad: one slot per turn.", style: "dwarf", by: "fake · m", hasSecrets: false });
    expect(r.checks.join("\n")).toMatch(/only one spell slot/);
    expect(r.sourcesUsed.map((s) => s.title)).toEqual(expect.arrayContaining(["Spell: Fireball", "Spell: Misty Step"]));
    expect(r.sourcesAll.some((s) => /Gaining and Casting Spells/.test(s.title))).toBe(true);
    const user = sent[0].messages.at(-1)!.content;
    expect(sent[0].messages[0].content).toMatch(/Durgan/);
    expect((sent[0] as unknown as { temperature: number }).temperature).toBe(0.7);
    expect(user).toMatch(/CHARACTER SHEET:\nOrrin: Human Wizard 5/);
    expect(user).toMatch(/level 2: Misty Step; level 3: Fireball/);
    expect(user).toMatch(/Spell slots left: L1 4\/4, L2 3\/3, L3 1\/2/);
    expect(user).toMatch(/HOUSE RULES:\nCritical hits: double the damage dice\.\nFlanking gives advantage\./);
    expect(r.prompt).toEqual(sent[0].messages);
  });
  it("lore: players never get secret notes; the DM does only when asking for them", async () => {
    await answer({ ...base, mode: "lore", question: "Who is Warrik?" });
    expect(JSON.stringify(sent[0])).not.toMatch(/Seven Seas/);
    await answer({ ...base, isDm: true, mode: "lore", question: "Who is Warrik?" });
    expect(JSON.stringify(sent[1])).not.toMatch(/Seven Seas/);
    const dm = await answer({ ...base, isDm: true, mode: "lore", withSecrets: true, question: "Who is Warrik?" });
    expect(JSON.stringify(sent[2])).toMatch(/Seven Seas/);
    expect(dm.hasSecrets).toBe(true);
    const pub = await answer({ ...base, mode: "lore", question: "What does Morwen think of the Lanternhands?" });
    expect(JSON.stringify(sent[3])).toMatch(/distrusts the Lanternhands/);
    expect(pub.hasSecrets).toBe(false);
  });
  it("a secret answer only goes to AIs allowed to read secrets", async () => {
    process.env.AI_2_BASE_URL = "http://open/v1"; process.env.AI_2_MODEL = "o"; process.env.AI_2_SECRETS = "no";
    vi.stubGlobal("fetch", vi.fn(async (u: string, init: { body: string }) => {
      sent.push({ ...JSON.parse(init.body), url: u } as never);
      return u.startsWith("http://fake") ? new Response("{}", { status: 429 }) : new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"ok"}' } }] }), { status: 200 });
    }));
    await expect(answer({ ...base, isDm: true, mode: "lore", withSecrets: true, question: "Who is Warrik?" })).rejects.toThrow(/DM-only notes/);
    const r = await answer({ ...base, mode: "rules", question: "Can I cast Misty Step and Fireball in the same turn?" });
    expect(r.by).toBe("open · o");
    delete process.env.AI_2_BASE_URL; delete process.env.AI_2_MODEL; delete process.env.AI_2_SECRETS;
  });
});
