"use client";
// "Delete character" at the bottom of the sheet: asks you to type the name, then deletes for good.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BottomSheet } from "../../../items/parts/ui";
import { deleteCharacter } from "../actions";

export function DeleteCharacter({ characterId, name }: { characterId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  function close() { if (!pending) { setOpen(false); setTyped(""); setError(null); } }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="mt-6 h-11 w-full rounded-xl border border-danger-line text-sm font-semibold text-danger">
        Delete character
      </button>

      {open && (
        <BottomSheet title={`Delete ${name}?`} onClose={close}>
          <p className="text-sm text-soft">
            This deletes {name} for good, with their inventory and item history. It can&apos;t be undone.
          </p>
          <p className="mt-2 text-sm text-muted">
            Past rolls stay in the session log and stats, but no longer show as {name}&apos;s.
          </p>
          <form className="mt-4" onSubmit={(e) => {
            e.preventDefault();
            if (!matches || pending) return;
            setError(null);
            start(async () => {
              const res = await deleteCharacter(characterId, typed);
              if ("error" in res) return setError(res.error);
              router.replace("/characters");
              router.refresh();
            });
          }}>
            <label className="block text-sm">
              <span className="text-muted">Type <b className="text-text">{name}</b> to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus
                className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-base" />
            </label>
            {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={close} className="h-11 rounded-xl border border-line text-sm text-soft">Keep</button>
              <button type="submit" disabled={!matches || pending}
                className="h-11 rounded-xl border border-danger-line bg-danger-bg text-sm font-bold text-danger disabled:opacity-40">
                {pending ? "Deleting…" : "Delete for good"}
              </button>
            </div>
          </form>
        </BottomSheet>
      )}
    </>
  );
}
