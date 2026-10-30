// Practice fight: any player tests their own character against library monsters (with their real dice).
import { Suspense } from "react";
import { getPractice } from "@/lib/fights-data";
import { BottomNav } from "../components/bottom-nav";
import { PracticeView } from "./practice-view";

export default function PracticePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-6xl lg:px-10 flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-52 rounded-[18px] bg-surface" /></div>}>
          <Practice />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Practice() {
  const data = await getPractice();
  return <PracticeView {...data} />;
}
