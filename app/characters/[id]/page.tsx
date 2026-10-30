// Character sheet screen.
import { Suspense } from "react";
import { getCharacterSheet } from "@/lib/character-data";
import { BottomNav } from "../../components/bottom-nav";
import { LookProvider, Zoomed } from "./look";
import { CharacterSheet } from "./sheet";

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  // The sheet (and the menu) wear the character's own look, so the whole screen waits for it.
  return (
    <Suspense fallback={<>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-60"><SheetSkeleton /></main>
      <BottomNav active="characters" />
    </>}>
      <Sheet params={params} />
    </Suspense>
  );
}

async function Sheet({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { character, canEdit, library, featText, gear, levelPlan, sheetStyle, portrait } = await getCharacterSheet(id);
  return (
    <LookProvider characterId={character.id} initial={sheetStyle}>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-60">
        <Zoomed>
          <CharacterSheet character={character} canEdit={canEdit} library={library} featText={featText} gear={gear} levelPlan={levelPlan} portrait={portrait} />
        </Zoomed>
      </main>
      <BottomNav active="characters" />
    </LookProvider>
  );
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
