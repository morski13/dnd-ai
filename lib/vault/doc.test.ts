import { describe, expect, it } from "vitest";
import { cleanDoc, doc, docText, field, h, hasSecrets, p, secret, snippet, stripSecrets, ul } from "./doc";
import { FOLDERS } from "./folders";

const morwen = doc(
  h(1, "Abbess Morwen"),
  field("Role", "Quest giver"),
  p("Old, calm, speaks softly."),
  secret(h(3, "Secrets"), p("She arranged the theft herself.")),
  ul("Lyra's mentor", "Leads the Order"),
);

describe("secret blocks", () => {
  it("players get the document without secrets", () => {
    const pub = stripSecrets(morwen);
    expect(docText(pub)).not.toContain("arranged the theft");
    expect(docText(pub)).toContain("Old, calm");
    expect(hasSecrets(morwen)).toBe(true);
    expect(hasSecrets(pub)).toBe(false);
  });
  it("a document that is only a secret becomes an empty page, not nothing", () => {
    expect(stripSecrets(doc(secret(p("x"))))).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

it("plain text, one line per block", () => {
  expect(docText(morwen).split("\n")).toEqual([
    "Abbess Morwen", "Role: Quest giver", "Old, calm, speaks softly.", "Secrets", "She arranged the theft herself.", "Lyra's mentor", "Leads the Order",
  ]);
  expect(snippet("a ".repeat(200), 20).length).toBeLessThanOrEqual(20);
});

describe("cleaning what the browser sends", () => {
  it("keeps headings, lists, marks, fonts and sizes", () => {
    const d = doc(h(2, "x"), p({ type: "text", text: "big", marks: [{ type: "bold" }, { type: "textStyle", attrs: { fontSize: "22px", fontFamily: "Georgia, serif" } }] }));
    expect(cleanDoc(d)).toEqual(d);
  });
  it("drops unknown nodes, scripts and outside images", () => {
    const bad = { type: "doc", content: [
      { type: "iframe", attrs: { src: "https://evil" } },
      { type: "image", attrs: { src: "https://evil/x.png" } },
      { type: "image", attrs: { src: "/api/vault/file/0f8fad5b-d9cb-469f-a165-70867728950e" } },
      p({ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }, { type: "textStyle", attrs: { fontSize: "999px; color: red" } }] }),
    ] };
    const c = cleanDoc(bad)!;
    expect(c.content!.map((n) => n.type)).toEqual(["image", "paragraph"]);
    expect(c.content![1].content![0].marks).toEqual([{ type: "textStyle", attrs: {} }]);
  });
  it("rejects non-documents and huge ones", () => {
    expect(cleanDoc({ type: "paragraph" })).toBeNull();
    expect(cleanDoc(doc(p("x".repeat(500_000))))).toBeNull();
  });
});

it("every standard folder has a template that survives cleaning", () => {
  for (const f of FOLDERS) {
    const d = f.template("Test");
    expect(cleanDoc(d)).toEqual(d);
    expect(docText(d).startsWith("Test")).toBe(true);
  }
});
