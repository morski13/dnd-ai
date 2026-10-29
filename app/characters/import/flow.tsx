"use client";
// Import a character from a PDF sheet: pick the file → we read it on the phone → the player checks
// everything in the normal creator form → Make character. The PDF is never uploaded; only for a sheet
// without fields is its text sent to the AI.
import Link from "next/link";
import { useRef, useState } from "react";
import type { ImportedSheet } from "@/lib/sheet-import/types";
import { CharacterForm } from "../new/form";
import { readSheetWithAi } from "./actions";

type Step =
  | { at: "pick"; error?: string }
  | { at: "reading"; what: string }
  | { at: "review"; sheet: ImportedSheet; file: string; by?: string }
  | { at: "stuck"; file: string; why: string; partial: ImportedSheet | null };

const MAX_MB = 20;

export function ImportFlow({ isDm, campaignRules, aiReady }: { isDm: boolean; campaignRules: string; aiReady: boolean }) {
  const [step, setStep] = useState<Step>({ at: "pick" });
  const input = useRef<HTMLInputElement>(null);

  async function read(file: File) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return setStep({ at: "pick", error: "That isn't a PDF. Pick the .pdf file of your character sheet." });
    if (file.size > MAX_MB * 1024 * 1024) return setStep({ at: "pick", error: `That file is over ${MAX_MB} MB. Export the sheet again without pictures, or pick a smaller file.` });
    setStep({ at: "reading", what: "Reading your sheet…" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const [{ readPdfFields }, { fieldsToSheet, sheetScore }] = await Promise.all([import("@/lib/sheet-import/read-pdf"), import("@/lib/sheet-import/parse")]);
      let fieldsSheet: ImportedSheet | null = null;
      try {
        const { fields } = await readPdfFields(bytes);
        fieldsSheet = fieldsToSheet(fields);
      } catch {
        fieldsSheet = null; // a broken or locked form: try the text below
      }
      if (fieldsSheet && sheetScore(fieldsSheet) >= 6) return setStep({ at: "review", sheet: fieldsSheet, file: file.name });

      // no usable fields: read the text and let the AI make sense of it
      setStep({ at: "reading", what: "This sheet has no form fields. Reading its text…" });
      const { readPdfText } = await import("@/lib/sheet-import/read-text");
      let text = "";
      try { text = (await readPdfText(bytes)).text; } catch { text = ""; }
      const partial = fieldsSheet && sheetScore(fieldsSheet) > 0 ? fieldsSheet : null;
      if (text.replace(/--- page \d+ ---/g, "").replace(/\s+/g, "").length < 60) {
        return setStep({ at: "stuck", file: file.name, partial, why: "This PDF has no text in it. It's probably a scan or a photo of a paper sheet, which the app can't read yet." });
      }
      if (!aiReady) {
        return setStep({ at: "stuck", file: file.name, partial, why: "This PDF has no form fields, only text, and reading text needs an AI, which isn't set up in this app yet." });
      }
      setStep({ at: "reading", what: "The AI is reading your sheet. This takes up to a minute…" });
      const r = await readSheetWithAi(text);
      if ("error" in r) return setStep({ at: "stuck", file: file.name, partial, why: r.error });
      setStep({ at: "review", sheet: r.sheet, file: file.name, by: r.by });
    } catch {
      setStep({ at: "pick", error: "Couldn't open that PDF. If it has a password, remove it and try again." });
    }
  }

  const again = () => { setStep({ at: "pick" }); if (input.current) input.current.value = ""; };
  const fileInput = (
    <input ref={input} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Character sheet PDF"
      onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
  );

  if (step.at === "review") {
    const s = step.sheet;
    return (
      <div className="mt-5">
        <div className={`rounded-2xl border p-4 text-sm ${s.source === "ai" ? "border-accent-line bg-accent-surface" : "border-line bg-surface"}`} role="status">
          <p className="font-semibold">{s.source === "ai" ? `Read by an AI${step.by ? ` (${step.by})` : ""} from ${step.file}` : `Read from ${step.file}`}</p>
          <p className="mt-1 text-soft">{s.source === "ai" ? "Check every number below before you save. Nothing is saved yet." : "Everything is filled in below. Check it and change anything; nothing is saved yet."}</p>
          {s.warnings.filter((w) => !w.startsWith("An AI read")).length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-soft">
              {s.warnings.filter((w) => !w.startsWith("An AI read")).map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <button type="button" onClick={again} className="mt-2 inline-flex min-h-10 items-center text-sm text-accent underline">Pick a different file</button>
        </div>
        <CharacterForm key={step.file + s.name} isDm={isDm} campaignRules={campaignRules} imported={s} />
      </div>
    );
  }

  if (step.at === "stuck") {
    return (
      <div className="mt-5 flex flex-col gap-3">
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm" role="alert">
          <p className="font-semibold">Couldn&apos;t read {step.file}</p>
          <p className="mt-1 text-soft">{step.why}</p>
          <p className="mt-2 text-soft">What works best: on D&amp;D Beyond, open the character → <b>Export to PDF</b>, or fill in the official fillable sheet on a computer.</p>
        </div>
        {step.partial && (
          <button type="button" onClick={() => setStep({ at: "review", sheet: step.partial!, file: step.file })}
            className="h-12 rounded-xl border border-accent-strong font-bold text-accent">Continue with what was found</button>
        )}
        <button type="button" onClick={again} className="h-12 rounded-xl bg-accent font-bold text-accent-text">Try another file</button>
        <Link href="/characters/new" className="flex h-12 items-center justify-center rounded-xl border border-line text-soft">Make the character by hand</Link>
      </div>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {fileInput}
      <button type="button" disabled={step.at === "reading"} onClick={() => input.current?.click()}
        className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent-line bg-accent-surface/40 px-4 py-6 text-center disabled:opacity-70">
        {step.at === "reading" ? (
          <>
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden />
            <span className="font-semibold text-accent" role="status">{step.what}</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-9 w-9 text-accent" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 18v-6" /><path d="M9 15l3-3 3 3" />
            </svg>
            <span className="font-heading text-xl font-bold">Pick your sheet (PDF)</span>
            <span className="text-sm text-soft">It&apos;s read on your phone; nothing is saved until you check it.</span>
          </>
        )}
      </button>
      {step.at === "pick" && step.error && <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">{step.error}</p>}
      <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-soft">
        <p className="font-semibold text-text">Which sheets work</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>D&amp;D Beyond:</b> open your character → Export to PDF. Read exactly.</li>
          <li><b>The official fillable sheet</b> (filled in on a computer). Read exactly.</li>
          <li><b>Other PDFs with text</b> (homemade or other apps): {aiReady ? "read by the AI; check the numbers." : "need the app's AI, which isn't set up yet."}</li>
          <li><b>Scans and photos</b> of paper sheets: not yet. Make the character by hand.</li>
        </ul>
        <p className="mt-2 text-xs text-muted">Classes outside the free rules (Artificer, Blood Hunter…) and their spells are kept as notes.</p>
      </div>
    </div>
  );
}
