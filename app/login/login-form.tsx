"use client";
import { useActionState } from "react";
import { logIn, type LoginState } from "../auth-actions";

const initial: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(logIn, initial);

  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-[0.12em] text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-12 rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-accent"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs uppercase tracking-[0.12em] text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-12 rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-accent"
        />
      </label>

      {state.error && (
        <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-12 rounded-xl bg-accent text-[15px] font-bold text-accent-text disabled:opacity-60"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
