// Reads every filled-in field of a PDF character sheet.
// Works on the official fillable sheet (a normal PDF form) and on D&D Beyond exports, which have the
// fields as page annotations but no form dictionary, so ordinary form readers see nothing there.
// We walk each page's widget annotations ourselves and climb to their parents for the name and value.
// Runs in the browser (the file never has to leave the phone) and in tests.
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFString, type PDFObject } from "pdf-lib";
import type { PdfField } from "./types";

const N = (s: string) => PDFName.of(s);
const OFF = new Set(["", "off", "false", "no", "0", "--"]);

function text(o: PDFObject | undefined): string {
  if (!o) return "";
  if (o instanceof PDFString || o instanceof PDFHexString) return o.decodeText();
  if (o instanceof PDFName) return o.decodeText();
  if (o instanceof PDFNumber) return String(o.asNumber());
  if (o instanceof PDFArray) return o.asArray().map((x) => text(x)).filter(Boolean).join(", ");
  return "";
}

export type ReadResult = { fields: PdfField[]; pages: number; filled: number };

export async function readPdfFields(bytes: Uint8Array | ArrayBuffer): Promise<ReadResult> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const pages = doc.getPages();
  const out: PdfField[] = [];
  const seen = new Map<string, number>(); // name → index in out (radio kids and page copies share a name)

  pages.forEach((page, pageIndex) => {
    const annots = page.node.lookupMaybe(N("Annots"), PDFArray);
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const a = annots.lookup(i);
      if (!(a instanceof PDFDict)) continue;
      const subtype = a.lookupMaybe(N("Subtype"), PDFName);
      if (subtype && subtype !== N("Widget")) continue;

      // full name = parent names joined with dots; value and type may sit on any ancestor
      const parts: string[] = [];
      let value: PDFObject | undefined;
      let ft = "";
      let node: PDFDict | undefined = a;
      for (let depth = 0; node && depth < 12; depth++) {
        const t = node.lookup(N("T"));
        if (t) parts.unshift(text(t));
        if (value === undefined) { const v = node.lookup(N("V")); if (v) value = v; }
        if (!ft) ft = text(node.lookup(N("FT")));
        const parent: PDFObject | undefined = node.lookup(N("Parent"));
        node = parent instanceof PDFDict ? parent : undefined;
      }
      const name = parts.filter(Boolean).join(".").trim();
      if (!name) continue;
      const checkbox = ft === "Btn";
      let v = text(value);
      if (checkbox && !v) v = text(a.lookup(N("AS"))); // some writers only set the appearance state
      if (checkbox && v) v = OFF.has(v.toLowerCase()) ? "" : "Yes";
      v = v.replace(/\r\n?/g, "\n").trim();

      const rect = a.lookupMaybe(N("Rect"), PDFArray);
      const y = rect && rect.size() >= 4 ? Number(text(rect.get(3))) || 0 : 0; // top edge: bigger = higher on the page
      const prev = seen.get(name);
      if (prev !== undefined) {
        if (!out[prev].value && v) out[prev] = { ...out[prev], value: v };
        continue;
      }
      seen.set(name, out.length);
      out.push({ name, value: v, page: pageIndex + 1, y, ...(checkbox ? { checkbox: true } : {}) });
    }
  });

  return { fields: out, pages: pages.length, filled: out.filter((f) => f.value).length };
}
