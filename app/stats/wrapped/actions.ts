"use server";
// Session Wrapped: the Moment of the night vote (one per member per session, changeable) and the DM's teaser.
// Both go through the user's own client, so the database rules (SQL 32) decide who may do what.
import { refresh } from "next/cache";
import { recapContext, recapFor } from "@/lib/stats-data";
import { voteMoments } from "@/lib/stats/session-wrapped";
import { createClient } from "@/lib/supabase/server";

type Fail = { error: string };

async function sessionOf(sessionId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Log in first." } as Fail;
  const ctx = await recapContext(supabase, userId);
  if (!ctx) return { error: "Join a campaign first." } as Fail;
  const { data: s } = await supabase.from("sessions").select("id, ended_at").eq("id", sessionId).eq("campaign_id", ctx.campaign.id).maybeSingle();
  if (!s) return { error: "Session not found." } as Fail;
  return { supabase, userId, ctx, session: s as { id: string; ended_at: string | null } };
}

/** Vote for a moment (`key`), change the vote, or take it back (`null`). */
export async function voteMoment(sessionId: string, key: string | null): Promise<Fail | { ok: true }> {
  refresh();
  const r = await sessionOf(sessionId);
  if ("error" in r) return r;
  const { supabase, userId, ctx, session } = r;
  if (!session.ended_at) return { error: "Voting opens when the session ends." };
  if (key === null) {
    const { error } = await supabase.from("session_votes").delete().eq("session_id", session.id).eq("user_id", userId);
    return error ? { error: error.message } : { ok: true };
  }
  // only moments of this session's open recap can be voted for
  const { recap } = await recapFor(supabase, ctx.campaign.id, session.id, userId, { onlyOpen: true });
  if (!voteMoments(recap.moments).some((m) => m.key === key)) return { error: "That moment isn't in this session any more." };
  const { error } = await supabase.from("session_votes").upsert(
    { session_id: session.id, campaign_id: ctx.campaign.id, user_id: userId, moment_key: key, updated_at: new Date().toISOString() },
    { onConflict: "session_id,user_id" },
  );
  if (error) return { error: /session_votes/.test(error.message) ? "Voting needs the database update (SQL 32)." : error.message };
  return { ok: true };
}

/** The DM's "next time…" line on the last slide. Empty text removes it. */
export async function saveTeaser(sessionId: string, text: string): Promise<Fail | { teaser: string | null }> {
  refresh();
  const r = await sessionOf(sessionId);
  if ("error" in r) return r;
  if (!r.ctx.isDm) return { error: "Only the DM writes the teaser." };
  const teaser = text.replace(/\s+\n/g, "\n").trim().slice(0, 400) || null;
  const { error } = await r.supabase.from("sessions").update({ teaser }).eq("id", r.session.id);
  if (error) return { error: /teaser/.test(error.message) ? "The teaser needs the database update (SQL 32)." : error.message };
  return { teaser };
}
