// The plain text of a PDF, page by page, for sheets that have no fields (printed and re-saved, "flattened",
// or homemade). Runs in the browser; the PDF engine is only downloaded when a sheet needs it.
// A scan (pictures of pages) has no text at all: we say so instead of guessing.
export async function readPdfText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes)); // a copy: the engine may take over the buffer
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (Array.isArray(text) ? text : [text]).map((t) => t.replace(/[ \t]+/g, " ").trim());
  return { text: pages.map((t, i) => `--- page ${i + 1} ---\n${t}`).join("\n\n").trim(), pages: totalPages };
}
