// A shop. Players can see it (and buy) only while the DM has it open; the DM sets it up here.
import { Suspense } from "react";
import { getShop } from "@/lib/items-data";
import { BottomNav } from "../../components/bottom-nav";
import { ShopView } from "./shop-view";

export default function ShopPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-16 rounded-2xl bg-surface" />{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-surface" />)}</div>}>
          <Shop params={params} />
        </Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Shop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getShop(id);
  return <ShopView {...data} />;
}
