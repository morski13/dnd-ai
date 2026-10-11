"use client";
// DM: add a folder of your own.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PlusIcon } from "../../components/icons";
import { createFolder } from "../actions";

export function NewFolder() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted">
        <PlusIcon className="h-6 w-6" />New folder
      </button>
    );
  }
  return (
    <form className="flex min-h-36 flex-col justify-between gap-2 rounded-2xl border border-accent bg-surface p-3"
      onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await createFolder(name);
        if ("error" in r) return setError(r.error);
        router.push(`/campaign/f/${r.id}`);
      }); }}>
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Folder name" aria-label="Folder name"
        className="h-10 w-full rounded-lg border border-line bg-bg px-2 text-[15px] outline-none focus:border-accent" />
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending || !name.trim()} className="h-10 flex-1 rounded-lg bg-accent text-sm font-bold text-accent-text">Create</button>
        <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg px-2 text-sm text-muted">Cancel</button>
      </div>
    </form>
  );
}
