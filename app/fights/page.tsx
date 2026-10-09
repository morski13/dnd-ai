// Fight planner: your saved fights (DM only).
import Link from "next/link";
import { Suspense } from "react";
import { listFights } from "@/lib/fights-data";
import { BottomNav } from "../components/bottom-nav";
import { NewFightButton } from "./new-fight-button";
import { TierBadge } from "./tier";

export default function FightsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10 pb-28">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <h1 className="mt-2 font-heading text-3xl font-bold">Fight planner</h1>
        <p className="mt-1 text-[15px] text-muted">Build fights before the session. Each one is tested 2,000 times against your party.</p>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface" />}>
          <Fights />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Fights() {
  const { isDm, fights } = await listFights();
  if (!isDm) return <p className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Only the DM can plan fights.</p>;
  return (
    <>
      <div className="mt-6"><NewFightButton /></div>
      <ul className="mt-5 flex flex-col gap-3">
        {fights.length === 0 && <li className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No fights yet. Make your first one.</li>}
        {fights.map((f) => (
          <li key={f.id}>
            <Link href={`/fights/${f.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 active:border-accent">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{f.name}</p>
                <p className="text-xs text-muted">
                  {f.summary ? `Party wins ${Math.round(f.summary.pWin * 100)}% · someone drops ${Math.round(f.summary.pAnyDown * 100)}%` : "Not calculated yet"}
                </p>
              </div>
              {f.summary?.tier && <TierBadge tier={f.summary.tier} />}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
