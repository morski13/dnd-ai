"use client";
// "Start session" on the Home screen (DM only).
import { useState, useTransition } from "react";
import { startSession } from "./actions";

export function StartSessionButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => { const r = await startSession(); if (r?.error) setError(r.error); })}
        className="mt-5 h-12 rounded-xl bg-accent px-6 text-[15px] font-bold text-accent-text disabled:opacity-60"
      >
        {pending ? "Starting…" : "Start session"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </>
  );
}
