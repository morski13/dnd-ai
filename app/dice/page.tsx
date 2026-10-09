// Dice workshop: design your own dice, pick the set you roll with, and test-throw them.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { sanitizeSkin } from "@/lib/dice3d/skin";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "../components/bottom-nav";
import { Workshop, type SavedSkin } from "./workshop";

export default function DicePage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-48 rounded bg-surface" /><div className="h-72 rounded-[18px] bg-surface" /><div className="h-40 rounded-2xl bg-surface" /></div>}>
          <Loader />
        </Suspense>
      </main>
      <BottomNav active="home" />
    </>
  );
}

async function Loader() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data } = await supabase.from("dice_skins").select("id, name, data, is_active").eq("user_id", userId).order("created_at");
  const sets: SavedSkin[] = (data ?? []).flatMap((r) => {
    const skin = sanitizeSkin(r.data);
    return skin ? [{ id: r.id as string, skin, active: !!r.is_active }] : [];
  });
  return <Workshop sets={sets} />;
}
