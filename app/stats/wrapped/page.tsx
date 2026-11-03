// Wrapped: `?s=N` is one session's story (it opens for the whole table when the session ends);
// without it, the whole campaign. Each slide is shareable; secret DM rolls never appear.
import Link from "next/link";
import { Suspense } from "react";
import { getSessionWrappedData, getWrappedData, type SessionWrappedView } from "@/lib/stats-data";
import { BottomNav } from "../../components/bottom-nav";
import { SessionWrappedStory } from "./session-story";
import { WrappedStory } from "./story";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function WrappedPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-xl flex-1 px-4 sm:px-5 pt-6 pb-28">
        <Suspense fallback={<><div className="h-4 w-20 rounded bg-surface" /><div className="mt-2 h-9 w-56 rounded bg-surface" /><div className="mt-5 h-[30rem] animate-pulse rounded-3xl bg-surface" /></>}>
          <Content searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="stats" />
    </>
  );
}

async function Content({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const s = typeof sp.s === "string" ? sp.s : undefined;
  if (s) return <SessionContent s={s} />;
  const d = await getWrappedData();
  return (
    <>
      <Link href="/stats" className="text-xs uppercase tracking-[0.12em] text-muted">← Stats</Link>
      <h1 className="mt-1 font-heading text-3xl font-bold">Campaign Wrapped</h1>
      {!d.campaignName ? <p className="mt-4 text-soft">Join a campaign first.</p>
        : !d.slides.length ? <p className="mt-4 text-soft">Nothing to wrap yet. Turn on <b>Track game</b> at the table: every roll in a session counts.</p>
        : <WrappedStory slides={d.slides} campaign={d.campaignName} />}
    </>
  );
}

async function SessionContent({ s }: { s: string }) {
  const data = await getSessionWrappedData({ s });
  if ("empty" in data) {
    return (
      <>
        <Link href="/stats" className="text-xs uppercase tracking-[0.12em] text-muted">← Stats</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">Session Wrapped</h1>
        <p className="mt-4 text-soft">{data.campaignName ? "No session to wrap yet." : "Join a campaign first."}</p>
      </>
    );
  }
  const d = data as SessionWrappedView;
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <Link href={`/stats/recap?s=${d.session.number}`} className="text-xs uppercase tracking-[0.12em] text-muted">← Recap</Link>
        <Link href="/stats/wrapped" className="text-xs font-semibold text-accent underline">Campaign Wrapped</Link>
      </div>
      <h1 className="mt-1 font-heading text-3xl font-bold">Session {d.session.number} Wrapped</h1>
      {d.session.live && <p className="mt-1 text-sm text-muted">Still running: this fills in as you play, and voting opens when the session ends.</p>}
      {!d.slides.length
        ? <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No rolls in this session, so there&apos;s nothing to wrap. Next time turn on <b className="text-text">Track game</b> (or the DM runs Session mode) and every roll counts.</p>
        : <SessionWrappedStory sessionId={d.session.id} number={d.session.number} campaign={d.campaignName} slides={d.slides}
            moments={d.moments} tally={d.tally} votesReady={d.votesReady && !d.session.live} isDm={d.isDm} teaser={d.session.teaser} />}
    </>
  );
}
