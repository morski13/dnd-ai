"use client";
// The DM's document editor: headings, lists, bold/italic/underline, fonts, sizes, secret blocks, pictures.
// Saves by itself a moment after you stop typing.
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocNode } from "@/lib/vault/doc";
import { saveDoc } from "../actions";
import { extensions, FONTS, SIZES } from "./extensions";
import { fileUrl, uploadPicture } from "./upload";

type Status = "saved" | "saving" | "unsaved" | "error";

/** Always an empty line at the end, so you can tap below a DM-only block and keep writing normally. */
function withEmptyLastLine(doc: DocNode | null): DocNode | undefined {
  if (!doc) return undefined;
  const last = doc.content?.[doc.content.length - 1];
  if (last && last.type === "paragraph" && !last.content?.length) return doc;
  return { ...doc, content: [...(doc.content ?? []), { type: "paragraph" }] };
}

export function DocEditor({ entryId, folderId, initialTitle, initialDoc }: {
  entryId: string; folderId: string; initialTitle: string; initialDoc: DocNode | null;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [status, setStatus] = useState<Status>("saved");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const editorRef = useRef<Editor | null>(null);

  const save = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    setStatus("saving");
    const r = await saveDoc(entryId, titleRef.current, JSON.stringify(ed.getJSON())); // sent as text: editor objects can't cross to the server as-is
    if ("error" in r) { setStatus("error"); setError(r.error); }
    else { setStatus("saved"); setError(null); }
  }, [entryId]);

  const schedule = useCallback(() => {
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
  }, [save]);

  const editor = useEditor({
    extensions: extensions({ placeholder: "Write here… Use the toolbar for headings, lists and secret (DM only) parts." }),
    content: withEmptyLastLine(initialDoc),
    immediatelyRender: false,
    editorProps: { attributes: { class: "vault-doc min-h-[50dvh] outline-none", "aria-label": "Document" } },
    onUpdate: () => schedule(),
  });
  useEffect(() => { editorRef.current = editor; }, [editor]);

  // Save before leaving the page
  useEffect(() => {
    const flush = () => { if (timer.current) { clearTimeout(timer.current); void save(); } };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [save]);

  return (
    <div>
      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); titleRef.current = e.target.value; schedule(); }}
        maxLength={120}
        aria-label="Title"
        className="w-full bg-transparent font-heading text-3xl font-bold leading-tight outline-none placeholder:text-muted"
        placeholder="Title"
      />
      <p className="mt-1 h-4 text-xs text-muted" role="status" aria-live="polite" data-save-status>
        {status === "saving" ? "Saving…" : status === "unsaved" ? "Editing…" : status === "error" ? <span className="text-danger">Not saved: {error}</span> : "Saved"}
      </p>
      {editor && <Toolbar editor={editor} entryId={entryId} folderId={folderId} onError={(e) => { setError(e); setStatus("error"); }} />}
      <div
        className="mt-3 cursor-text rounded-2xl border border-line bg-surface px-4 py-4"
        onMouseDown={(e) => {
          // Tapping the empty space below the text continues writing at the end
          const target = e.target as HTMLElement;
          if (!editor || (target !== e.currentTarget && !target.classList.contains("ProseMirror"))) return;
          const last = editor.view.dom.lastElementChild?.getBoundingClientRect();
          if (last && e.clientY < last.bottom) return;
          e.preventDefault();
          editor.chain().focus("end").run();
        }}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({ editor, entryId, folderId, onError }: { editor: Editor; entryId: string; folderId: string; onError: (e: string) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      bold: e.isActive("bold"), italic: e.isActive("italic"), underline: e.isActive("underline"),
      bullets: e.isActive("bulletList"), numbers: e.isActive("orderedList"), secret: e.isActive("secret"),
      font: (e.getAttributes("textStyle").fontFamily as string | undefined) ?? "",
      size: (e.getAttributes("textStyle").fontSize as string | undefined) ?? "",
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const [uploading, setUploading] = useState(false);
  const c = () => editor.chain().focus();
  const btn = (on: boolean) => `flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg px-2 text-sm ${on ? "bg-accent text-accent-text" : "text-soft"}`;
  const sel = "h-9 shrink-0 rounded-lg border border-line bg-bg px-2 text-sm text-soft outline-none";

  return (
    <div className="sticky top-0 z-10 -mx-5 mt-2 border-y border-line bg-surface-2/95 px-5 py-1.5 backdrop-blur" role="toolbar" aria-label="Formatting"
      // keep the cursor in the text when tapping a toolbar button
      onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
      <div className="flex items-center gap-1 overflow-x-auto">
        <select aria-label="Text style" className={sel} value={s.block} onChange={(e) => {
          const v = e.target.value;
          if (v === "p") c().setParagraph().run();
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}>
          <option value="p">Text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option>
        </select>
        <button type="button" aria-label="Bold" aria-pressed={s.bold} className={btn(s.bold)} onClick={() => c().toggleBold().run()}><b>B</b></button>
        <button type="button" aria-label="Italic" aria-pressed={s.italic} className={btn(s.italic)} onClick={() => c().toggleItalic().run()}><i className="font-serif">I</i></button>
        <button type="button" aria-label="Underline" aria-pressed={s.underline} className={btn(s.underline)} onClick={() => c().toggleUnderline().run()}><u>U</u></button>
        <button type="button" aria-label="Bullet list" aria-pressed={s.bullets} className={btn(s.bullets)} onClick={() => c().toggleBulletList().run()}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" /></svg>
        </button>
        <button type="button" aria-label="Numbered list" aria-pressed={s.numbers} className={btn(s.numbers)} onClick={() => c().toggleOrderedList().run()}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M10 6h10M10 12h10M10 18h10M4 5h1v3M3.5 12.5c.5-1 2-1 2 0 0 .8-2 1.5-2 2.5h2" /></svg>
        </button>
        <select aria-label="Font" className={sel} value={s.font} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}>
          {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
        <select aria-label="Font size" className={sel} value={s.size} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
          <option value="">Size</option>
          {SIZES.map((x) => <option key={x} value={x}>{parseInt(x)}</option>)}
        </select>
        <button type="button" aria-pressed={s.secret} className={`${btn(s.secret)} gap-1 font-semibold`} onClick={() => c().toggleSecret().run()} title="Players never see this part">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          DM only
        </button>
        <label className={`${btn(false)} cursor-pointer gap-1`} aria-label="Insert picture">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></svg>
          {uploading && <span className="text-xs">…</span>}
          <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setUploading(true);
            try {
              const { id } = await uploadPicture(f, { folderId, parentId: entryId });
              c().setImage({ src: fileUrl(id), alt: f.name.replace(/\.[^.]+$/, "") }).run();
            } catch (err) { onError((err as Error).message); }
            setUploading(false);
          }} />
        </label>
        <button type="button" aria-label="Undo" disabled={!s.canUndo} className={`${btn(false)} disabled:opacity-30`} onClick={() => c().undo().run()}>↶</button>
        <button type="button" aria-label="Redo" disabled={!s.canRedo} className={`${btn(false)} disabled:opacity-30`} onClick={() => c().redo().run()}>↷</button>
      </div>
    </div>
  );
}

/** Read-only view (players, or the DM's "Player view"). */
export function DocReader({ doc }: { doc: DocNode | null }) {
  const editor = useEditor({
    extensions: extensions(),
    content: doc ?? undefined,
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "vault-doc" } },
  });
  return <EditorContent editor={editor} />;
}
