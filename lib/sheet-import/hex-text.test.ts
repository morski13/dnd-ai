// D&D Beyond writes long field texts as hex strings broken over several lines (seen on a real export).
import { describe, expect, it } from "vitest";
import { PDFDocument, PDFHexString, PDFName, PDFString } from "pdf-lib";
import { readPdfFields } from "./read-pdf";
import { stripControl } from "./clean";

const utf16Hex = (s: string) => "FEFF" + [...s].map((c) => c.charCodeAt(0).toString(16).padStart(4, "0").toUpperCase()).join("");

async function pdfWithField(name: string, hex: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const widget = doc.context.obj({ Type: "Annot", Subtype: "Widget", FT: "Tx", Rect: [0, 0, 100, 20] });
  widget.set(PDFName.of("T"), PDFString.of(name));
  widget.set(PDFName.of("V"), PDFHexString.of(hex));
  page.node.set(PDFName.of("Annots"), doc.context.obj([doc.context.register(widget)]));
  return doc.save();
}

describe("hex strings split over lines", () => {
  it("reads the text right, with no NUL characters", async () => {
    const text = "=== ARMOR ===\nLight Armor, Hand Crossbow, Thieves’ Cant";
    const hex = utf16Hex(text);
    const broken = hex.slice(0, 50) + "\n" + hex.slice(50, 97) + "\n" + hex.slice(97); // odd split, like D&D Beyond
    const { fields } = await readPdfFields(await pdfWithField("ProficienciesLang", broken));
    expect(fields[0].value).toBe(text);
    expect(fields[0].value).not.toMatch(/\u0000/);
  });
  it("stripControl removes NUL from nested data", () => {
    expect(stripControl({ a: ["x\u0000y"], b: { c: "ok\n" }, n: 3 })).toEqual({ a: ["xy"], b: { c: "ok\n" }, n: 3 });
  });
});
