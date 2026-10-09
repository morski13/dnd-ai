// Fight builder (DM only).
import { Suspense } from "react";
import { getFight } from "@/lib/fights-data";
import { BottomNav } from "../../components/bottom-nav";
import { FightBuilder } from "./builder";

export default function FightPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-44">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-52 rounded-[18px] bg-surface" /></div>}>
          <Fight params={params} />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Fight({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getFight(id);
  return <FightBuilder {...data} />;
}
