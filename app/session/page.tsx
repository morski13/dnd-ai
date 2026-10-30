// Session mode: live session, initiative, your turn, and the table log.
import Link from "next/link";
import { Suspense } from "react";
import { itemsSummary } from "@/lib/items-data";
import { getSessionData } from "@/lib/session-data";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "../components/bottom-nav";
import { ThemeScope } from "../components/theme/theme-scope";
import { SessionView } from "./session-view";

export default function SessionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The whole screen (and the menu) takes the table theme the DM picked, so it waits for the session data.
  return (
    <Suspense fallback={<>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-28">
        <div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-20 rounded-2xl bg-surface" /><div className="h-72 rounded-[18px] bg-surface" /></div>
      </main>
      <BottomNav active="session" />
    </>}>
      <Session searchParams={searchParams} />
    </Suspense>
  );
}

async function Session({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const focus = typeof sp.focus === "string" ? sp.focus : null;
  const data = await getSessionData(focus);
  const shell = (children: React.ReactNode) => (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-28">{children}</main>
      <BottomNav active="session" />
    </>
  );
  if (!data.campaign) {
    return shell(
      <div className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Join a campaign first</p>
        <p className="mt-1 text-sm text-muted">Enter your DM&apos;s invite code on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>
      </div>
    );
  }
  const items = await itemsSummary(await createClient(), data.campaign.id, data.isDm);
  return <ThemeScope theme={data.theme}>{shell(<SessionView data={data} shops={items.openShops} />)}</ThemeScope>;
}
