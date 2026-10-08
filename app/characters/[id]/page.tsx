// Character sheet screen.
import { Suspense } from "react";
import { getCharacterSheet } from "@/lib/character-data";
import { BottomNav } from "../../components/bottom-nav";
import { CharacterSheet } from "./sheet";

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-60">
        <Suspense fallback={<SheetSkeleton />}>
          <Sheet params={params} />
        </Suspense>
      </main>
      <BottomNav active="characters" />
    </>
  );
}

async function Sheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { character, canEdit, library, featText } = await getCharacterSheet(id);
  return <CharacterSheet character={character} canEdit={canEdit} library={library} featText={featText} />;
}

function SheetSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-9 w-48 rounded bg-surface" />
      <div className="h-36 rounded-[18px] bg-surface" />
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-surface" />)}
      </div>
      <div className="grid grid-cols-6 gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 rounded-xl bg-surface" />)}
      </div>
    </div>
  );
}
