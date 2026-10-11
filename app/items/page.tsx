// Items & loot. DM: homebrew requests, giving items and coins, shops, loot tables, custom items, history.
// Players: their own homebrew items and the DM's answers.
import Link from "next/link";
import { Suspense } from "react";
import { getItemsHub } from "@/lib/items-data";
import { BottomNav } from "../components/bottom-nav";
import { ItemsHub } from "./hub";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function ItemsPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-48 rounded bg-surface" /><div className="h-11 rounded-xl bg-surface" />{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-2xl bg-surface" />)}</div>}>
          <Hub searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Hub({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const data = await getItemsHub();
  if (!data.campaignId) return <p className="text-sm text-muted">Join a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  return (
    <ItemsHub
      isDm={data.isDm} tab={typeof sp.tab === "string" ? sp.tab : undefined}
      characters={data.characters} requests={data.requests} custom={data.custom} loot={data.loot} log={data.log} shops={data.shops}
    />
  );
}
