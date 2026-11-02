"use client";
// "Print / PDF": our own sheet, filled in from the app. It can be printed, filled in by hand or in any
// PDF app, and imported back exactly (Characters → Import). Without a character id: a blank sheet.
import { useState } from "react";
import { BLANK, type PrintData } from "@/lib/own-sheet/fields";
import { printSheet } from "../print-actions";

/** Builds the PDF in the browser and hands it over as a download. */
export async function downloadSheet(characterId: string | null): Promise<string | null> {
  let data: PrintData = BLANK;
  if (characterId) {
    const r = await printSheet(characterId);
    if ("error" in r) return r.error;
    data = r.data;
  }
  const { makeSheetPdf, loadSheetFonts } = await import("@/lib/own-sheet/make-pdf"); // pdf-lib loads only when someone prints
  const bytes = await makeSheetPdf(data, await loadSheetFonts());
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(data.name || "character-sheet").replace(/[\\/:*?"<>|]+/g, "").trim() || "character-sheet"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return null;
}

export function PrintButton({ characterId, label = "PDF", className }: { characterId: string | null; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={busy} aria-label={characterId ? "Print or download the character sheet as a PDF" : "Download a blank character sheet"}
        onClick={async () => {
          setBusy(true); setError(null);
          try { const e = await downloadSheet(characterId); if (e) setError(e); }
          catch { setError("Couldn't make the PDF. Try again."); }
          finally { setBusy(false); }
        }}
        className={className ?? "flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-bold text-soft disabled:opacity-60"}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
        </svg>
        {busy ? "Making…" : label}
      </button>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </>
  );
}
