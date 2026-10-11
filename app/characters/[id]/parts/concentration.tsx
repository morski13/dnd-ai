"use client";
// "Concentrating on Bless": shown under HP. Casting another concentration spell replaces it; taking damage asks for a CON save.
import { useState } from "react";

export function ConcentrationChip({ spell, note, canEdit, pending, choices, onSet }: {
  spell: string | null; note: string | null; canEdit: boolean; pending: boolean; choices: string[]; onSet: (spell: string | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  if (!spell && !note && (!canEdit || !choices.length)) return null;
  return (
    <div className="mt-3" aria-live="polite">
      {spell ? (
        <div className="animate-pop flex items-center gap-2 rounded-xl border border-[#5A4024] bg-accent-surface px-3 py-2" role="status">
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent text-[10px] font-bold text-accent" aria-hidden>◎</span>
          <span className="min-w-0 flex-1 text-sm">Concentrating on <b>{spell}</b></span>
          {canEdit && <button type="button" disabled={pending} onClick={() => onSet(null)} className="text-xs text-muted underline">End</button>}
        </div>
      ) : canEdit && choices.length > 0 && (
        picking ? (
          <div className="flex flex-wrap gap-1.5">
            {choices.map((c) => <button key={c} type="button" disabled={pending} onClick={() => { setPicking(false); onSet(c); }} className="h-9 rounded-full border border-line px-3 text-sm text-soft">{c}</button>)}
            <button type="button" onClick={() => setPicking(false)} className="h-9 px-2 text-sm text-muted">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setPicking(true)} className="text-xs text-muted underline">Concentrating on a spell? Set it</button>
        )
      )}
      {note && <p className={`mt-1.5 text-xs ${/ends/.test(note) ? "text-danger" : "text-soft"}`}>{note}</p>}
    </div>
  );
}
