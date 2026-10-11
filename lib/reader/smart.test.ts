import { describe, expect, it } from "vitest";
import example from "../test-fixtures/vault-example.json";
import { stripSecrets, type DocNode } from "../vault/doc";
import { ask } from "./ask";
import { bounds, layout } from "./layout";
import { analyzeSync, docLines, makeMatcher } from "./smart";
import type { ReaderDoc } from "./types";

type Ex = { kind: string; title: string; doc: DocNode; shared: boolean; status: string | null };
const party = [
  { id: "b", name: "Brakka Stonehew" }, { id: "l", name: "Lyra Venn" }, { id: "v", name: "Vex" }, { id: "o", name: "Orrin Ashby" },
];
const docs: ReaderDoc[] = (example as Ex[]).map((e, i) => ({ id: `d${i}`, title: e.title, folder: e.kind, status: e.status, shared: e.shared, doc: e.doc }));
// what players get: shared documents only, secret blocks removed
const publicDocs: ReaderDoc[] = docs.filter((d) => d.shared).map((d) => ({ ...d, doc: stripSecrets(d.doc) }));

const dm = analyzeSync({ docs, party });
const pl = analyzeSync({ docs: publicDocs, party });
const node = (a: typeof dm, label: string) => a.nodes.find((n) => n.label === label);
const edge = (a: typeof dm, x: string, y: string) => {
  const i = node(a, x)?.id, j = node(a, y)?.id;
  return a.edges.find((e) => (e.a === i && e.b === j) || (e.a === j && e.b === i));
};

describe("smart reader", () => {
  it("reads documents as lines and knows which are secret", () => {
    const morwen = docs.find((d) => d.title === "Abbess Morwen")!;
    const lines = docLines(morwen.doc);
    expect(lines[0]).toMatchObject({ kind: "h1", text: "Abbess Morwen", secret: false });
    expect(lines.find((l) => l.field?.label === "Faction")?.field?.value).toBe("Order of Saint Aldric");
    expect(lines.find((l) => l.text.includes("arranged the theft"))?.secret).toBe(true);
  });

  it("finds names, short names and nicknames, longest first", () => {
    const m = makeMatcher([
      { text: "Grub", ci: false, id: "grub", full: true },
      { text: "Grub's Iron Key", ci: false, id: "key", full: true },
      { text: "the key", ci: true, id: "key", full: false },
    ]);
    expect(m("Brakka took Grub's Iron Key from Grub.")).toEqual(["key", "grub"]);
    expect(m("Kessa wants The Key")).toEqual(["key"]);
    expect(m("Grubby")).toEqual([]);
  });

  it("makes a node for every NPC, place, faction, item, quest and party member", () => {
    const types = (t: string) => dm.nodes.filter((n) => n.type === t).length;
    expect([types("npc"), types("place"), types("faction"), types("party"), types("quest")]).toEqual([6, 6, 3, 4, 7]);
    expect(node(dm, "Timeline of past sessions")?.type).toBe("note"); // every page is on the map; notes are "other pages"
    expect(node(dm, "Grub")?.type).toBe("npc");
  });

  it("connects Abbess Morwen like the DM wrote her", () => {
    expect(edge(dm, "Abbess Morwen", "Order of Saint Aldric")?.label).toBe("member of");
    expect(edge(dm, "Abbess Morwen", "Saint Aldric's Abbey")?.label).toBe("lives in");
    expect(edge(dm, "Abbess Morwen", "Lyra Venn")).toBeTruthy();          // "Lyra's mentor"
    expect(edge(dm, "Abbess Morwen", "The Ashen Crown")).toBeTruthy();     // "recover the Crown"
    expect(node(dm, "Abbess Morwen")!.summary).toMatch(/Quest giver.*Old, calm/);
  });

  it("nicknames and short names work: the Fog Lord, Morwen, the abbey", () => {
    expect(node(dm, "Lord Varn Malchor")!.aliases).toEqual(expect.arrayContaining(["Varn", "Malchor", "the Fog Lord"]));
    expect(edge(dm, "Lord Varn Malchor", "Abbess Morwen")).toBeTruthy();
    expect(edge(dm, "Kessa Nightvane", "Saint Aldric's Abbey")).toBeTruthy(); // "a stolen abbey map"? no — "the abbey" in the timeline
  });

  it("marks connections that only exist in secret notes", () => {
    const pellWick = edge(dm, "Pell", "The Lanternhands")!;
    expect(pellWick.secret).toBe(true);                                         // he secretly leads them
    expect(edge(dm, "Pell", "The Drowned Lantern")!.secret).toBe(false);
  });

  it("gives players only what was shared (no secret nodes, links or facts)", () => {
    expect(node(pl, "Lord Varn Malchor")).toBeUndefined();
    expect(edge(pl, "Pell", "The Lanternhands")).toBeUndefined();
    expect(pl.nodes.every((n) => !n.secret && n.facts.every((f) => !f.secret))).toBe(true);
    expect(JSON.stringify(pl)).not.toMatch(/arranged the theft|dead army|doesn't exist/);
    expect(pl.edges.every((e) => !e.secret)).toBe(true);
  });

  it("puts the milestones in story order", () => {
    const ms = dm.milestones.filter((m) => m.kind === "milestone").map((m) => [m.title, m.when]);
    expect(ms).toEqual([
      ["The party opens the Greyspire vault", "before session 6"],
      ["Morwen's betrayal is revealed", "middle of the campaign"],
      ["The Fog Lord shows himself", "Final act"],
    ]);
    const done = dm.milestones.find((m) => m.title === "Clear the Old Bridge")!;
    expect(dm.milestones.indexOf(done)).toBe(dm.milestones.length - 1);
    expect(dm.milestones.find((m) => m.title === "Recover the Ashen Crown")).toMatchObject({ kind: "quest", givenBy: "Abbess Morwen", reward: "500 gp + the Order's favor" });
  });

  it("finds what must happen next session, whatever the party does", () => {
    const top = dm.mustHappen.map((p) => p.text);
    expect(top).toEqual(expect.arrayContaining([
      "The party learns Grub's Iron Key carries the imperial seal of Greyspire",
      "Kessa Nightvane shows up again, wanting the key",
      "The Grey creeps closer to Hollowford",
    ]));
    expect(top.some((t) => t.startsWith("Next milestone: The party opens the Greyspire vault"))).toBe(true);
    expect(dm.mustHappen.length).toBeLessThanOrEqual(7);
    expect(top.some((t) => /empire must return/.test(t))).toBe(false); // "must" in a story sentence isn't a DM instruction
    expect(dm.mustHappen.find((p) => p.text.startsWith("Kessa"))!.nodes.length).toBeGreaterThanOrEqual(2);
  });

  it("is quick and counts the work", () => {
    const t = performance.now();
    for (let i = 0; i < 20; i++) analyzeSync({ docs, party });
    expect((performance.now() - t) / 20).toBeLessThan(50);
    expect(dm.stats.docs).toBe(27);
    expect(dm.stats.secretFacts).toBeGreaterThan(20);
  });
});


describe("ask about the world", () => {
  it("answers from the notes, about the thing asked", () => {
    const r = ask("What do we know about the Lanternhands?", pl);
    expect(r.nodes[0]?.label).toBe("The Lanternhands");
    expect(r.lines.length).toBeGreaterThan(0);
    expect(r.lines.some((l) => /smuggling/.test(l.text))).toBe(true);
    expect(r.lines.every((l) => !l.secret)).toBe(true);
  });
  it("players can't dig secrets out with questions", () => {
    const r = ask("Who is the Wick really? Is Pell the leader?", pl);
    expect(JSON.stringify(r)).not.toMatch(/doesn't exist|invented him/);
    const d = ask("Who is the Wick really? Is Pell the leader?", dm);
    expect(d.lines.some((l) => /invented him|doesn't exist/.test(l.text) && l.secret)).toBe(true);
  });
  it("short names work in questions", () => expect(ask("where does Morwen live", dm).nodes[0]?.label).toBe("Abbess Morwen"));
});

describe("mind map layout", () => {
  const boxes = dm.nodes.map((n) => ({ id: n.id, w: n.label.length * 7 + 24, h: 30, group: ["npc", "place", "faction", "party", "lore", "quest"].indexOf(n.type) }));
  const placed = layout(boxes, dm.edges);
  it("is the same every time", () => expect(layout(boxes, dm.edges)).toEqual(placed));
  it("labels never overlap", () => {
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
      expect(overlap, `${a.id} / ${b.id}`).toBe(false);
    }
  });
  it("linked things end up closer than unlinked ones", () => {
    const at = new Map(placed.map((p) => [p.id, p]));
    const d = (x: string, y: string) => Math.hypot(at.get(x)!.x - at.get(y)!.x, at.get(x)!.y - at.get(y)!.y);
    const linked = dm.edges.map((e) => d(e.a, e.b));
    const ids = placed.map((p) => p.id);
    const all: number[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) all.push(d(ids[i], ids[j]));
    const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(avg(linked)).toBeLessThan(avg(all));
    expect(bounds(placed).w).toBeGreaterThan(100);
  });
});

describe("a brand-new session plan", () => {
  const h = (level: number, text: string): DocNode => ({ type: "heading", attrs: { level }, content: [{ type: "text", text }] });
  const li = (t: string): DocNode => ({ type: "listItem", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });
  const plan: ReaderDoc = {
    id: "mine", title: "New session plan", folder: "plans", status: null, shared: false, updatedAt: "2099-01-01T00:00:00Z",
    doc: { type: "doc", content: [h(1, "New session plan"), h(2, "Must happen"),
      { type: "bulletList", content: [li("Lord of the Seven Seas"), li("Fire in Milltown"), li("Jar of confidence")] },
      h(2, "Scenes"), h(3, "Scene 1"), { type: "paragraph" }, h(2, "If the party goes off track"), { type: "bulletList", content: [li("")] }] },
  };
  const a = analyzeSync({ docs: [...docs, plan], party });
  const n = (label: string) => a.nodes.find((x) => x.label === label);
  const linked = (x: string, y: string) => a.edges.find((e) => [e.a, e.b].sort().join() === [n(x)!.id, n(y)!.id].sort().join());

  it("puts the plan and what it names on the map, even without pages", () => {
    expect(n("New session plan")?.type).toBe("plan");
    expect(n("Lord of the Seven Seas")).toMatchObject({ type: "npc", noPage: true });
    expect(n("Milltown")).toMatchObject({ type: "place", noPage: true });
    expect(n("Jar of confidence")).toMatchObject({ type: "lore", noPage: true });
    expect(n("Fire in Milltown")?.type).toBe("event");
  });
  it("connects them: plan → must happen → what it involves", () => {
    expect(linked("New session plan", "Lord of the Seven Seas")?.label).toBe("must happen");
    expect(linked("New session plan", "Jar of confidence")?.label).toBe("must happen");
    expect(linked("New session plan", "Fire in Milltown")?.label).toBe("must happen");
    expect(linked("Fire in Milltown", "Milltown")?.label).toBe("involves");
  });
  it("the newest plan leads the Must happen list; no made-up names from the example notes", () => {
    expect(a.mustHappen.slice(0, 3).map((p) => p.text)).toEqual(["Lord of the Seven Seas", "Fire in Milltown", "Jar of confidence"]);
    expect(dm.nodes.filter((x) => x.noPage).map((x) => x.label)).toEqual([]);
  });
});

describe("writing relationships inside a page", () => {
  const p = (t: string): DocNode => ({ type: "paragraph", content: [{ type: "text", text: t }] });
  const h1 = (t: string): DocNode => ({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: t }] });
  const barrik: ReaderDoc = {
    id: "barrik", title: "Barrik", folder: "npcs", status: null, shared: true,
    doc: { type: "doc", content: [h1("Barrik"), p("Role: Blacksmith in Hollowford"), p("Barrik has a brother Warrik."),
      { type: "secret", content: [p("Warrik is now, in secret, the Lord of the Seven Seas.")] }] },
  };
  const plan: ReaderDoc = {
    id: "p2", title: "Session 5 plan", folder: "plans", status: null, shared: false,
    doc: { type: "doc", content: [h1("Session 5 plan"), { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Must happen" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [p("Lord of the Seven Seas")] }] }] },
  };
  const a = analyzeSync({ docs: [...docs, barrik, plan], party });
  const n = (label: string) => a.nodes.find((x) => x.label === label);
  const e = (x: string, y: string) => a.edges.find((k) => [k.a, k.b].sort().join() === [n(x)!.id, n(y)!.id].sort().join());

  it("one page is enough: Barrik links to his brother, Hollowford and (secretly) the Lord of the Seven Seas", () => {
    expect(n("Warrik")).toMatchObject({ type: "npc", noPage: true });
    expect(e("Barrik", "Warrik")?.secret).toBe(false);
    expect(e("Barrik", "Hollowford")?.label).toBe("role");
    expect(e("Barrik", "Lord of the Seven Seas")?.secret).toBe(true);
    expect(e("Session 5 plan", "Lord of the Seven Seas")?.label).toBe("must happen");
  });
  it("players see the brother, not the secret", () => {
    const pl2 = analyzeSync({ docs: [...publicDocs, { ...barrik, doc: stripSecrets(barrik.doc) }], party });
    expect(pl2.nodes.find((x) => x.label === "Warrik")).toBeTruthy();
    expect(pl2.nodes.find((x) => x.label === "Lord of the Seven Seas")).toBeUndefined();
  });
});

describe("every page is on the map, and backstories join the party", () => {
  const p = (t: string): DocNode => ({ type: "paragraph", content: [{ type: "text", text: t }] });
  const h = (l: number, t: string): DocNode => ({ type: "heading", attrs: { level: l }, content: [{ type: "text", text: t }] });
  const ul = (...items: string[]): DocNode => ({ type: "bulletList", content: items.map((t) => ({ type: "listItem", content: [p(t)] })) });
  const vexPage: ReaderDoc = {
    id: "vexbs", title: "Vex", folder: "party", folderName: "Player characters", status: null, shared: false,
    doc: { type: "doc", content: [h(1, "Vex"), p("Player: Stefan"), h(2, "Backstory"), p("Grew up on the docks of Hollowford, running errands for Pell."),
      h(2, "Family & friends"), ul("Sister: Nella Quickfoot"), { type: "secret", content: [h(3, "DM notes & hooks"), p("Nella secretly works for the Grey Court.")] }] },
  };
  const lonely: ReaderDoc = { id: "lonely", title: "Weather table", folder: "custom", folderName: "Random tables", status: null, shared: false, doc: { type: "doc", content: [h(1, "Weather table"), p("1-2 rain, 3-6 sun")] } };
  const a = analyzeSync({ docs: [...docs, vexPage, lonely], party });
  const n = (label: string) => a.nodes.find((x) => x.label === label);
  const e = (x: string, y: string) => a.edges.find((k) => [k.a, k.b].sort().join() === [n(x)!.id, n(y)!.id].sort().join());

  it("a backstory page becomes the character's box (not a second Vex)", () => {
    expect(a.nodes.filter((x) => x.label === "Vex")).toHaveLength(1);
    expect(n("Vex")).toMatchObject({ type: "party", docId: "vexbs", secret: false });
    expect(n("Vex")!.summary).toMatch(/^Player character\. .*docks of Hollowford/);
  });
  it("backstory links: home, people, family (with labels), secrets stay secret", () => {
    expect(e("Vex", "Hollowford")).toBeTruthy();
    expect(e("Vex", "Pell")).toBeTruthy();
    expect(e("Vex", "Nella Quickfoot")?.label).toBe("sister");
    expect(e("Vex", "The Grey Court")?.secret).toBe(true);
  });
  it("a page with no links at all is still on the map", () => {
    expect(n("Weather table")).toMatchObject({ type: "note", degree: 0, folder: "Random tables" });
    expect(n("Weather table")!.summary).toMatch(/^Random tables\./);
  });
});
