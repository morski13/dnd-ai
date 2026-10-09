// Statistics: per session or the whole campaign, the party or one character, plus the DM's view.
import Link from "next/link";
import { Suspense } from "react";
import { getStatsData, type StatsView } from "@/lib/stats-data";
import { BottomNav } from "../components/bottom-nav";
import { CharacterView } from "./parts/character-view";
import { PartyView } from "./parts/party-view";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function StatsPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-48 rounded bg-surface" /><div className="h-11 rounded-xl bg-surface" /><div className="h-28 rounded-2xl bg-surface" /><div className="h-64 rounded-[18px] bg-surface" /></div>}>
          <Stats searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="stats" />
    </>
  );
}

async function Stats({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const data = await getStatsData({ scope: str("scope"), s: str("s"), c: str("c") });

  if (data.campaignName === null) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Join a campaign first</p>
        <p className="mt-1 text-sm text-muted">Enter your DM&apos;s invite code on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>
      </div>
    );
  }
  const d = data as StatsView;

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{d.campaignName}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold">Statistics</h1>
      </header>

      {!d.sessions.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
          <p className="font-semibold text-text">No session rolls yet</p>
          <p className="mt-1">Stats fill in from the rolls made in Session mode. Start a session, roll, and they show up here.</p>
        </div>
      ) : (
        <>
          <Filters d={d} />
          {d.focus ? <CharacterView d={d} /> : <PartyView d={d} />}
          <p className="mt-8 text-center text-[11px] leading-snug text-muted">
            Only rolls made during a session count.{!d.isDm && " Secret DM rolls stay hidden until the fight ends."}
          </p>
        </>
      )}
    </>
  );
}

function href(d: StatsView, change: { scope?: "session" | "campaign"; s?: number; c?: string | null }) {
  const scope = change.scope ?? d.scope;
  const q = new URLSearchParams();
  if (scope === "campaign") q.set("scope", "campaign");
  else {
    const s = change.s ?? d.session?.number;
    if (s !== undefined) q.set("s", String(s));
  }
  const c = change.c === undefined ? d.focus?.id : change.c;
  if (c) q.set("c", c);
  const qs = q.toString();
  return `/stats${qs ? `?${qs}` : ""}`;
}

function Filters({ d }: { d: StatsView }) {
  const chip = (on: boolean) =>
    `inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${on ? "border-accent bg-accent-surface text-accent" : "border-line bg-surface text-soft"}`;
  return (
    <div className="mt-5 space-y-3">
      {/* Session or whole campaign */}
      <div className="grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-1 text-sm font-semibold">
        {(["session", "campaign"] as const).map((s) => (
          <Link
            key={s}
            href={href(d, { scope: s })}
            aria-current={d.scope === s ? "page" : undefined}
            className={`flex h-10 items-center justify-center rounded-lg ${d.scope === s ? "bg-accent text-accent-text" : "text-muted"}`}
          >
            {s === "session" ? "Session" : "Whole campaign"}
          </Link>
        ))}
      </div>

      {d.scope === "session" && (
        <nav aria-label="Sessions" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {d.sessions.map((s) => (
            <Link key={s.id} href={href(d, { s: s.number })} className={chip(d.session?.id === s.id)}>
              Session {s.number}{s.live && <span className="text-[10px] uppercase tracking-wider">· live</span>}
            </Link>
          ))}
        </nav>
      )}
      {d.session?.title && <p className="text-sm text-muted">Session {d.session.number} · {d.session.title}</p>}

      <nav aria-label="Who" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        <Link href={href(d, { c: null })} className={chip(!d.focus)}>Party</Link>
        {d.characters.map((c) => (
          <Link key={c.id} href={href(d, { c: c.id })} className={chip(d.focus?.id === c.id)}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
            {c.short}{c.mine && <span className="text-[10px] font-normal text-muted">you</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
