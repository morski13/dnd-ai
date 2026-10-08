import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-14">
      <p className="text-xs uppercase tracking-[0.12em] text-accent">D&amp;D AI</p>
      <h1 className="mt-2 font-heading text-3xl font-bold">Welcome back</h1>
      <p className="mt-2 text-[15px] text-muted">Log in to roll, track your party and see your stats.</p>
      <LoginForm />
    </main>
  );
}
