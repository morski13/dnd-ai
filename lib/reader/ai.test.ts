import { describe, expect, it } from "vitest";
import { askContext, cleanReading, mergeAi, nodeIds, readingPrompt } from "./ai";
import type { Analysis, MapNode } from "./types";

const node = (id: string, label: string, secret = false, facts: { text: string; secret: boolean }[] = []): MapNode =>
  ({ id, label, type: "npc", docId: id, aliases: [], summary: "", facts, status: null, degree: 0, secret });
const base: Analysis = {
  engine: "smart",
  nodes: [node("barrik", "Barrik", false, [{ text: "A dwarf smith.", secret: false }]), node("warrik", "Warrik", false, [{ text: "Warrik is the Lord of the Seven Seas.", secret: true }]), node("lord", "Lord of the Seven Seas", true)],
  edges: [], mustHappen: [], milestones: [], stats: { docs: 0, words: 0, secretFacts: 1 },
};

describe("AI reader", () => {
  it("only accepts links between known things (no invented names, no duplicates, no self-links)", () => {
    const r = cleanReading({ links: [
      { a: "n1", b: "n2", label: "brother of", why: "Barrik has a brother Warrik." },
      { a: "n2", b: "n1", label: "again" },
      { a: "n1", b: "n1", label: "self" },
      { a: "n1", b: "n99", label: "made up" },
    ], summaries: { n1: "A dwarf smith.", n42: "nobody" } }, base);
    expect(r.links).toEqual([{ a: "barrik", b: "warrik", label: "brother of", why: "Barrik has a brother Warrik." }]);
    expect(r.summaries).toEqual({ barrik: "A dwarf smith." });
  });

  it("the prompt lists the things by short id and marks DM-only lines", () => {
    const [, user] = readingPrompt(base, [{ id: "d", title: "Barrik", folder: "npcs", status: null, shared: true,
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Has a brother." }] }, { type: "secret", content: [{ type: "paragraph", content: [{ type: "text", text: "Brother is the Lord." }] }] }] } }]);
    expect(user.content).toContain("n1 | Barrik | npc");
    expect(nodeIds(base).byShort.get("n3")).toBe("lord");
    expect(user.content).toMatch(/Has a brother\./);
    expect(user.content).toContain("[DM only] Brother is the Lord.");
  });

  it("DM copy: links not also found from shared pages are secret; players' copy never is", () => {
    const reading = { links: [{ a: "barrik", b: "warrik", label: "brother of", why: "x" }, { a: "warrik", b: "lord", label: "secretly is", why: "y" }], summaries: { warrik: "Secretly the Lord." } };
    const pub = { links: [{ a: "barrik", b: "warrik", label: "brother of", why: "x" }], summaries: {} };
    const dm = mergeAi(base, reading, "dm", pub);
    expect(dm.edges.map((e) => [e.label, e.secret, e.ai])).toEqual([["brother of", false, true], ["secretly is", true, true]]);
    expect(dm.nodes.find((n) => n.id === "warrik")!.aiSummary).toEqual({ text: "Secretly the Lord.", secret: true });
    const pl = mergeAi(base, pub, "player");
    expect(pl.edges.every((e) => !e.secret)).toBe(true);
  });

  it("asking without secrets never includes DM-only lines", () => {
    const dm = mergeAi(base, { links: [{ a: "warrik", b: "lord", label: "secretly is", why: "y" }], summaries: {} }, "dm", null);
    const open = askContext(dm, false);
    expect(open).toContain("A dwarf smith.");
    expect(open).not.toMatch(/Seven Seas|secretly/);
    expect(askContext(dm, true)).toMatch(/Seven Seas/);
  });
});

describe("DM map with both readings", () => {
  it("adds what only the players' reading found, open; keeps the DM's summary", () => {
    const dmR = { links: [{ a: "warrik", b: "lord", label: "secretly is", why: "y" }], summaries: { barrik: "DM summary." } };
    const pub = { links: [{ a: "barrik", b: "warrik", label: "brother of", why: "x" }], summaries: { barrik: "Player summary." } };
    const m = mergeAi(mergeAi(base, dmR, "dm", pub), pub, "player");
    expect(m.edges.map((e) => [e.label, e.secret])).toEqual([["secretly is", true], ["brother of", false]]);
    expect(m.nodes.find((n) => n.id === "barrik")!.aiSummary!.text).toBe("DM summary.");
  });
});
