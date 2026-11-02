// Homebrew made in the app: spells, feats, subclasses (players can request them) and monsters (DM).
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { HomebrewRow } from "@/lib/campaign-homebrew";
import { rulesData } from "@/lib/levelup/data";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "../components/bottom-nav";
import { HomebrewEditor, type MonsterRow } from "./editor";

export default function HomebrewPage() {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 flex-1 px-5 pt-8 pb-28">
        <Link href="/campaign" className="text-xs uppercase tracking-[0.12em] text-muted">← Campaign</Link>
        <h1 className="mt-1 font-heading text-3xl font-bold">Homebrew</h1>
        <Suspense fallback={<div className="mt-5 h-64 animate-pulse rounded-2xl bg-surface" />}><Content /></Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Content() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: m } = await supabase.from("campaign_members").select("campaign_id, role, campaigns(rule_set)").eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true }).limit(1).maybeSingle();
  if (!m) return <p className="mt-4 text-soft">Join a campaign first.</p>;
  const isDm = m.role === "dm" || m.role === "co_dm";
  const campaignRules = ((m.campaigns as unknown as { rule_set?: string } | null)?.rule_set ?? "2024") as string;
  const [{ data: rows, error }, { data: mons }] = await Promise.all([
    supabase.from("campaign_homebrew").select("id, kind, rules, parent, name, data, status, requested_by, dm_note, profiles(display_name)").eq("campaign_id", m.campaign_id).order("updated_at", { ascending: false }),
    isDm ? supabase.from("monsters").select("id, name, ac, hp_max, stat_block").eq("campaign_id", m.campaign_id).order("name") : Promise.resolve({ data: [] }),
  ]);
  const rulesList: ("2014" | "2024")[] = campaignRules === "mixed" ? ["2024", "2014"] : [campaignRules === "2014" ? "2014" : "2024"];
  return (
    <HomebrewEditor isDm={isDm} userId={userId} rulesList={rulesList} needsSql={!!error}
      classes={Object.fromEntries(rulesList.map((r) => [r, Object.keys(rulesData(r).classes)]))}
      rows={((rows ?? []) as unknown as (HomebrewRow & { profiles: { display_name: string } | null })[]).map((r) => ({ ...r, by: r.profiles?.display_name ?? null }))}
      monsters={((mons ?? []) as MonsterRow[]).filter((x) => (x.stat_block as { homebrew?: boolean } | null)?.homebrew)} />
  );
}
