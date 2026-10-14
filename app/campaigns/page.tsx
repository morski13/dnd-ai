// Your campaigns: switch between them, start a new one, or join with a code.
import Link from "next/link";
import { Suspense } from "react";
import { getMyCampaigns } from "@/lib/campaigns-data";
import { BottomNav } from "../components/bottom-nav";
import { JoinForm } from "../join-form";
import { CampaignList, NewCampaignForm } from "./parts";

export default function CampaignsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Link href="/" className="text-xs uppercase tracking-[0.12em] text-muted">← Home</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Your campaigns</h1>
        <Suspense fallback={<div className="mt-5 animate-pulse space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 rounded-2xl bg-surface" />)}</div>}>
          <List />
        </Suspense>
        <section className="mt-8 rounded-2xl border border-accent-line bg-accent-surface p-5" aria-label="Start a new campaign">
          <p className="font-heading text-xl font-semibold">Start a new campaign</p>
          <p className="mt-1 text-sm text-soft">You&apos;ll be its DM. You get an invite code to give your players.</p>
          <NewCampaignForm />
        </section>
        <section className="mt-5 rounded-2xl border border-line bg-surface p-5" aria-label="Join a campaign">
          <p className="font-semibold">Join someone else&apos;s campaign</p>
          <p className="mt-1 text-sm text-muted">Enter the invite code your DM gave you.</p>
          <JoinForm />
        </section>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function List() {
  const { list } = await getMyCampaigns();
  if (!list.length) return <p className="mt-5 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">You&apos;re not in a campaign yet. Start one or join one below.</p>;
  return <CampaignList list={list} />;
}
