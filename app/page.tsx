import { Suspense } from "react";

async function checkSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, message: "Missing keys: check .env.local, then restart the app." };
  try {
    const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, cache: "no-store" });
    if (res.ok) return { ok: true, message: "Connected to Supabase" };
    if (res.status === 401) return { ok: false, message: "Supabase answered, but the anon key is wrong." };
    return { ok: false, message: `Supabase answered with error ${res.status}.` };
  } catch {
    return { ok: false, message: "Can't reach Supabase: check the Project URL." };
  }
}

async function DatabaseStatus() {
  const s = await checkSupabase();
  return (
    <div className={`mt-8 rounded-2xl border p-5 ${s.ok ? "border-success-line bg-success-bg" : "border-danger-line bg-danger-bg"}`}>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Database</p>
      <p className={`mt-2 font-semibold ${s.ok ? "text-success" : "text-danger"}`}>{s.message}</p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 pt-14">
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Your campaign</p>
      <h1 className="font-heading text-3xl font-bold">The Ashen Crown</h1>
      <p className="mt-1 text-sm text-muted">Hollowford · Party level 3</p>
      <Suspense fallback={<div className="mt-8 rounded-2xl border border-line bg-surface p-5 text-muted">Checking the database…</div>}>
        <DatabaseStatus />
      </Suspense>
    </main>
  );
}