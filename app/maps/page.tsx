// The DM's battle maps: upload a picture, fit the grid on it, put it in a fight.
import Link from "next/link";
import { Suspense } from "react";
import { listMaps } from "@/lib/maps-data";
import { BottomNav } from "../components/bottom-nav";
import { MapLibrary } from "./map-library";

export default function MapsPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-10 pb-28">
        <Link href="/" className="text-sm text-muted">← Home</Link>
        <h1 className="mt-2 font-heading text-3xl font-bold">Battle maps</h1>
        <p className="mt-1 text-[15px] text-muted">Upload a map, fit the squares on it (1 square = 5 ft), then use it in a fight.</p>
        <Suspense fallback={<div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface" />}>
          <Maps />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Maps() {
  const data = await listMaps();
  if (!data.isDm) return <p className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm text-muted">Only the DM can add battle maps. You&apos;ll see the map in Session mode when the DM puts one in a fight.</p>;
  if (!data.ready) return <p className="mt-6 rounded-2xl border border-danger-line bg-danger-bg p-5 text-sm text-danger">Run <code>supabase/23-battle-maps.sql</code> in the Supabase SQL Editor first.</p>;
  return <MapLibrary maps={data.maps} fightId={data.fightId} inFight={data.inFight} />;
}
