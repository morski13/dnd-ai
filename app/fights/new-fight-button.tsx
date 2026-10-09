"use client";
import { useState, useTransition } from "react";
import { createFight } from "./actions";

export function NewFightButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" disabled={pending}
        onClick={() => start(async () => { const r = await createFight(); if (r?.error) setError(r.error); })}
        className="h-12 w-full rounded-xl bg-accent text-[15px] font-bold text-accent-text disabled:opacity-60">
        {pending ? "Creating…" : "+ New fight"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </>
  );
}
