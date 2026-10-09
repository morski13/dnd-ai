// Session mode: live session, initiative, your turn, and the table log.
import Link from "next/link";
import { Suspense } from "react";
import { getSessionData } from "@/lib/session-data";
import { BottomNav } from "../components/bottom-nav";
import { SessionView } from "./session-view";

export default function SessionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-20 rounded-2xl bg-surface" /><div className="h-72 rounded-[18px] bg-surface" /></div>}>
          <Session searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="session" />
    </>
  );
}

async function Session({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const data = await getSessionData(focus);
  if (!data.campaign) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Join a campaign first</p>
        <p className="mt-1 text-sm text-muted">Enter your DM&apos;s invite code on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>
      </div>
    );
  }
  return <SessionView data={data} />;
}
