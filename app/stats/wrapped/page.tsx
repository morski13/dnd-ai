// Campaign Wrapped: the whole campaign as a story you tap through, each slide shareable.
import Link from "next/link";
import { Suspense } from "react";
import { getWrappedData } from "@/lib/stats-data";
import { BottomNav } from "../../components/bottom-nav";
import { WrappedStory } from "./story";

export default function WrappedPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-2xl flex-1 px-5 pt-8 pb-28">
        <Link href="/stats" className="text-xs uppercase tracking-[0.12em] text-muted">← Stats</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">Campaign Wrapped</h1>
        <Suspense fallback={<div className="mt-5 aspect-[4/5] animate-pulse rounded-3xl bg-surface" />}><Content /></Suspense>
      </main>
      <BottomNav active="stats" />
    </>
  );
}

async function Content() {
  const d = await getWrappedData();
  if (!d.campaignName) return <p className="mt-4 text-soft">Join a campaign first.</p>;
  if (!d.slides.length) return <p className="mt-4 text-soft">Nothing to wrap yet. Turn on <b>Track game</b> at the table: every roll in a session counts.</p>;
  return <WrappedStory slides={d.slides} campaign={d.campaignName} />;
}
