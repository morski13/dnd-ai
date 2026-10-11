// Every campaign you're in (as DM or player), the active one first.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type MyCampaign = { id: string; name: string; role: string; rules: string; inviteCode: string | null; active: boolean; party: number };

export async function getMyCampaigns() {
  await connection();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const { data } = await supabase.from("campaign_members").select("role, campaigns(id, name, rule_set, invite_code, characters(count))")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true });
  const rows = (data ?? []) as unknown as { role: string; campaigns: { id: string; name: string; rule_set: string; invite_code: string; characters: { count: number }[] } | null }[];
  const list: MyCampaign[] = rows.filter((r) => r.campaigns).map((r, i) => ({
    id: r.campaigns!.id, name: r.campaigns!.name, role: r.role, rules: r.campaigns!.rule_set, active: i === 0,
    inviteCode: r.role === "dm" || r.role === "co_dm" ? r.campaigns!.invite_code : null, party: r.campaigns!.characters?.[0]?.count ?? 0,
  }));
  return { list };
}
