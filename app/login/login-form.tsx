"use client";
import { useActionState, useState } from "react";
import { logIn, signUp, type AuthState } from "../auth-actions";

const initial: AuthState = { error: null, message: null };
const inputClass =
  "h-12 rounded-xl border border-line bg-surface-2 px-4 text-[15px] outline-none focus:border-accent";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loggingIn] = useActionState(logIn, initial);
  const [signupState, signupAction, signingUp] = useActionState(signUp, initial);

  const isSignup = mode === "signup";
  const state = isSignup ? signupState : loginState;
  const pending = isSignup ? signingUp : loggingIn;

  return (
    <>
      {/* Log in / Create account switch */}
      <div className="mt-8 grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-1">
        {(["login", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`h-10 rounded-lg text-sm font-semibold ${
              mode === m ? "bg-surface text-text" : "text-muted"
            }`}
          >
            {m === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form key={mode} action={isSignup ? signupAction : loginAction} className="mt-6 flex flex-col gap-4">
        {isSignup && (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-[0.12em] text-muted">Your name</span>
            <input name="name" autoComplete="nickname" required className={inputClass} placeholder="e.g. Marko" />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">Email</span>
          <input name="email" type="email" autoComplete="email" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-[0.12em] text-muted">Password</span>
          <input
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            minLength={isSignup ? 6 : undefined}
            required
            className={inputClass}
          />
        </label>

        {state.error && (
          <p className="rounded-xl border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        )}
        {state.message && (
          <p className="rounded-xl border border-success-line bg-success-bg px-4 py-3 text-sm text-success">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 h-12 rounded-xl bg-accent text-[15px] font-bold text-accent-text disabled:opacity-60"
        >
          {pending ? "One moment…" : isSignup ? "Create account" : "Log in"}
        </button>
      </form>
    </>
  );
}
