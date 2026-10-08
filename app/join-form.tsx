"use client";
import { useActionState } from "react";
import { joinCampaign, type ActionState } from "./campaign-actions";

const initial: ActionState = { error: null };

export function JoinForm() {
  const [state, action, pending] = useActionState(joinCampaign, initial);

  return (
    <form action={action} className="mt-4 flex flex-col gap-3">
      <input
        name="code"
        placeholder="Invite code, e.g. 735E3D5A"
        autoComplete="off"
        autoCapitalize="characters"
        required
        className="h-12 rounded-xl border border-line bg-surface-2 px-4 text-[15px] uppercase tracking-widest outline-none placeholder:normal-case placeholder:tracking-normal focus:border-accent"
      />
      {state.error && (
        <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-accent text-[15px] font-bold text-accent-text disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join campaign"}
      </button>
    </form>
  );
}
