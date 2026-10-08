// "Your characters" screen.
import Link from "next/link";
import { Suspense } from "react";
import { getCharactersData } from "@/lib/characters-data";
import { BottomNav } from "../components/bottom-nav";
import { CharacterList } from "./character-list";

export default function CharactersPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-10 pb-28">
        <h1 className="font-heading text-3xl font-bold">Your characters</h1>
        <Suspense fallback={<ListSkeleton />}>
          <Characters />
        </Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function Characters() {
  const data = await getCharactersData();

  if (!data.inCampaign) {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">Join a campaign first</p>
        <p className="mt-1 text-sm text-muted">
          Enter your DM&apos;s invite code on the{" "}
          <Link href="/" className="text-accent underline">Home</Link> screen.
        </p>
      </div>
    );
  }

  return <CharacterList characters={data.characters} userId={data.userId} isDm={data.isDm} />;
}

function ListSkeleton() {
  return (
    <div className="mt-6 animate-pulse space-y-4">
      <div className="h-11 w-64 rounded-full bg-surface" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-40 rounded-2xl bg-surface" />
      ))}
    </div>
  );
}
