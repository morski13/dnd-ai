// Documents are stored as editor JSON (Tiptap / ProseMirror). Plain functions, safe on server and client.

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export const EMPTY_DOC: DocNode = { type: "doc", content: [{ type: "paragraph" }] };

const BLOCKS = new Set(["paragraph", "heading", "listItem", "blockquote", "secret", "codeBlock", "horizontalRule", "image"]);

/** The player copy: every secret block removed (and pictures that only the DM may see). */
export function stripSecrets(node: DocNode): DocNode {
  if (!node.content) return { ...node };
  const content = node.content.filter((c) => c.type !== "secret").map(stripSecrets);
  return { ...node, content: content.length || node.type !== "doc" ? content : [{ type: "paragraph" }] };
}

/** Does the document contain a secret block? */
export function hasSecrets(node: DocNode): boolean {
  return node.type === "secret" || !!node.content?.some(hasSecrets);
}

/** Plain text, one line per paragraph / heading / list item (for search and the smart reader). */
export function docText(node: DocNode): string {
  const out: string[] = [];
  let line = "";
  const walk = (n: DocNode) => {
    if (n.type === "text") { line += n.text ?? ""; return; }
    if (n.type === "hardBreak") { line += "\n"; return; }
    const block = BLOCKS.has(n.type);
    if (block && line) { out.push(line); line = ""; }
    n.content?.forEach(walk);
    if (block && line) { out.push(line); line = ""; }
  };
  walk(node);
  if (line) out.push(line);
  return out.map((l) => l.trim()).filter(Boolean).join("\n");
}

/** A short preview for lists. */
export function snippet(text: string | null | undefined, max = 140): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

/** Guards what the browser sends: must be a doc, not huge, no unknown node types. */
const ALLOWED = new Set([
  "doc", "paragraph", "text", "heading", "bulletList", "orderedList", "listItem", "blockquote", "hardBreak",
  "horizontalRule", "secret", "image",
]);
const MARKS = new Set(["bold", "italic", "underline", "strike", "textStyle", "link"]);
export function cleanDoc(input: unknown, maxChars = 400_000): DocNode | null {
  if (!input || typeof input !== "object" || (input as DocNode).type !== "doc") return null;
  if (JSON.stringify(input).length > maxChars) return null;
  const clean = (n: DocNode): DocNode | null => {
    if (!n || typeof n !== "object" || typeof n.type !== "string" || !ALLOWED.has(n.type)) return null;
    const out: DocNode = { type: n.type };
    if (n.type === "text") {
      out.text = typeof n.text === "string" ? n.text : "";
      const marks = (n.marks ?? []).filter((m) => m && MARKS.has(m.type)).map((m) => {
        if (m.type === "textStyle") {
          const a = m.attrs ?? {};
          const attrs: Record<string, unknown> = {};
          if (typeof a.fontFamily === "string" && a.fontFamily.length < 80) attrs.fontFamily = a.fontFamily;
          if (typeof a.fontSize === "string" && /^\d{1,2}px$/.test(a.fontSize)) attrs.fontSize = a.fontSize;
          return { type: m.type, attrs };
        }
        if (m.type === "link") {
          const href = String(m.attrs?.href ?? "");
          return /^https?:\/\//.test(href) ? { type: "link", attrs: { href } } : null;
        }
        return { type: m.type };
      }).filter(Boolean) as DocNode["marks"];
      if (marks?.length) out.marks = marks;
      return out;
    }
    if (n.type === "heading") out.attrs = { level: [1, 2, 3].includes(Number(n.attrs?.level)) ? Number(n.attrs?.level) : 2 };
    if (n.type === "orderedList" && Number.isFinite(Number(n.attrs?.start))) out.attrs = { start: Number(n.attrs?.start) };
    if (n.type === "image") {
      const src = String(n.attrs?.src ?? "");
      if (!/^\/api\/vault\/file\/[0-9a-f-]{36}(\?.*)?$/.test(src)) return null; // only our own pictures
      out.attrs = { src, alt: typeof n.attrs?.alt === "string" ? n.attrs.alt.slice(0, 200) : "" };
      return out;
    }
    if (Array.isArray(n.content)) out.content = n.content.map(clean).filter((x): x is DocNode => !!x);
    return out;
  };
  return clean(input as DocNode);
}

// ---------------------------------------------------------------------------
// Small builders (used by templates and the example data)

export const t = (text: string, marks?: string[]): DocNode => ({ type: "text", text, ...(marks?.length ? { marks: marks.map((m) => ({ type: m })) } : {}) });
export const p = (...parts: (string | DocNode)[]): DocNode =>
  ({ type: "paragraph", content: parts.filter((x) => x !== "").map((x) => (typeof x === "string" ? t(x) : x)) });
export const h = (level: 1 | 2 | 3, text: string): DocNode => ({ type: "heading", attrs: { level }, content: [t(text)] });
export const ul = (...items: (string | DocNode)[]): DocNode =>
  ({ type: "bulletList", content: items.map((i) => ({ type: "listItem", content: [typeof i === "string" ? p(i) : i] })) });
export const secret = (...blocks: DocNode[]): DocNode => ({ type: "secret", content: blocks });
export const doc = (...blocks: DocNode[]): DocNode => ({ type: "doc", content: blocks });
/** "Label: value" line with a bold label. */
export const field = (label: string, value = ""): DocNode => p(t(`${label}: `, ["bold"]), value);
