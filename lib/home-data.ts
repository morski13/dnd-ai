// Loads everything the Home screen needs, as the logged-in user.
// The database's security rules decide what this user is allowed to see.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

type CampaignSettings = {
  home_base?: string;
  party_level?: number;
  schedule?: string;
};

export async function getHomeData() {
  // This page depends on who is logged in, so build it fresh on every visit.
  await connection();
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .single();

  // Your campaign (the first one you joined) and your role in it.
  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name, settings)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const displayName = profile?.display_name ?? "Adventurer";
  const campaign = membership?.campaigns as unknown as
    | { id: string; name: string; settings: CampaignSettings }
    | null;

  if (!membership || !campaign) {
    return { displayName, campaign: null } as const;
  }

  const isDm = membership.role === "dm" || membership.role === "co_dm";

  // Run the remaining lookups at the same time.
  const [characters, partySize, lastSession, activeSession, myRolls] = await Promise.all([
    supabase.from("characters").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("owner_user_id", userId),
    supabase.from("characters").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id),
    supabase.from("sessions").select("number, title")
      .eq("campaign_id", campaign.id).order("number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sessions").select("number")
      .eq("campaign_id", campaign.id).not("started_at", "is", null).is("ended_at", null)
      .limit(1).maybeSingle(),
    supabase.from("roll_events").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("rolled_by", userId),
  ]);

  return {
    displayName,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      homeBase: campaign.settings?.home_base ?? null,
      partyLevel: campaign.settings?.party_level ?? null,
      schedule: campaign.settings?.schedule?.split("–")[0]?.trim() ?? null,
    },
    isDm,
    myCharacters: characters.count ?? 0,
    partySize: partySize.count ?? 0,
    lastSession: lastSession.data ?? null,
    activeSessionNumber: activeSession.data?.number ?? null,
    nextSessionNumber: (lastSession.data?.number ?? 0) + 1,
    myRolls: myRolls.count ?? 0,
  } as const;
}