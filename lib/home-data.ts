// Loads everything the Home screen needs, as the logged-in user.
// The database's security rules decide what this user is allowed to see.
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { lastSessionStrip } from "@/lib/stats-data";

type CampaignSettings = {
  home_base?: string;
  party_level?: number;
  level_up?: { to?: number; at?: string };
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
    .select("*") // "*": the username column only exists after 33-usernames.sql
    .eq("id", userId)
    .single();

  // Your campaign (the first one you joined) and your role in it.
  const { data: membership } = await supabase
    .from("campaign_members")
    .select("role, campaigns(id, name, settings, invite_code)")
    .eq("user_id", userId)
    .order("last_active_at", { ascending: false, nullsFirst: false }).order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const displayName = profile?.display_name ?? "Adventurer";
  const username = ((profile as { username?: string | null } | null)?.username) ?? null;
  const campaign = membership?.campaigns as unknown as
    | { id: string; name: string; settings: CampaignSettings; invite_code: string }
    | null;

  if (!membership || !campaign) {
    return { displayName, username, campaign: null } as const;
  }

  const isDm = membership.role === "dm" || membership.role === "co_dm";

  // Run the remaining lookups at the same time.
  const [characters, partySize, lastSession, activeSession, myRolls, campaigns, strip] = await Promise.all([
    supabase.from("characters").select("id, name, class_levels", { count: "exact" })
      .eq("campaign_id", campaign.id).eq("owner_user_id", userId).order("name"),
    supabase.from("characters").select("id, name, class_levels", { count: "exact" })
      .eq("campaign_id", campaign.id).order("name"),
    supabase.from("sessions").select("number, title")
      .eq("campaign_id", campaign.id).order("number", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sessions").select("number")
      .eq("campaign_id", campaign.id).not("started_at", "is", null).is("ended_at", null)
      .limit(1).maybeSingle(),
    supabase.from("roll_events").select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id).eq("rolled_by", userId),
    supabase.from("campaign_members").select("campaign_id", { count: "exact", head: true }).eq("user_id", userId),
    lastSessionStrip(supabase, campaign.id, userId).catch(() => null),
  ]);

  return {
    displayName,
    username,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      homeBase: campaign.settings?.home_base ?? null,
      partyLevel: campaign.settings?.party_level ?? null,
      levelUpTo: Number(campaign.settings?.level_up?.to) || null,
      schedule: campaign.settings?.schedule?.split("–")[0]?.trim() ?? null,
      inviteCode: campaign.invite_code,
    },
    isDm,
    myCharacters: characters.count ?? 0,
    // your characters below the level the DM announced ("the party levels up")
    behind: ((characters.data ?? []) as { id: string; name: string; class_levels: { level: number }[] | null }[])
      .map((c) => ({ id: c.id, name: c.name, level: (c.class_levels ?? []).reduce((s, l) => s + (l.level ?? 0), 0) }))
      .filter((c) => !!campaign.settings?.level_up?.to && c.level < Number(campaign.settings.level_up.to)),
    partySize: partySize.count ?? 0,
    // the DM's view of "the party levels up": everyone's level
    party: isDm ? ((partySize.data ?? []) as { id: string; name: string; class_levels: { level: number }[] | null }[])
      .map((c) => ({ id: c.id, name: c.name, level: (c.class_levels ?? []).reduce((s, l) => s + (l.level ?? 0), 0) })) : [],
    lastSession: lastSession.data ?? null,
    activeSessionNumber: activeSession.data?.number ?? null,
    nextSessionNumber: (lastSession.data?.number ?? 0) + 1,
    myRolls: myRolls.count ?? 0,
    campaignCount: campaigns.count ?? 1,
    strip,
  } as const;
}
