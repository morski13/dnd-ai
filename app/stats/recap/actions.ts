"use server";
// The session's story, written by the AI from the recap's facts only, and saved on the session
// (sessions.recap) so the whole table reads the same one. Secret DM rolls are never used.
import { refresh } from "next/cache";
import { aiProviders, AiError, chatWith } from "@/lib/ai/client";
import { recapContext, recapFor } from "@/lib/stats-data";
import { facts } from "@/lib/stats/recap";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StoryLang = "en" | "sr";
const LANG: Record<StoryLang, string> = { en: "English", sr: "Serbian, in the Latin alphabet" };

export async function writeRecapStory(sessionId: string, lang: StoryLang): Promise<{ story: string } | { error: string }> {
  refresh();
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return { error: "Log in first." };
  if (!aiProviders().length) return { error: "No AI is set up for this app yet (AI_BASE_URL, AI_MODEL, AI_API_KEY)." };
  const ctx = await recapContext(supabase, userId);
  if (!ctx) return { error: "Join a campaign first." };
  const { data: s } = await supabase.from("sessions").select("id, number, title").eq("id", sessionId).eq("campaign_id", ctx.campaign.id).maybeSingle();
  if (!s) return { error: "Session not found." };

  const { recap, party } = await recapFor(supabase, ctx.campaign.id, s.id, userId, { onlyOpen: true });
  if (!recap.moments.length && !recap.party.rolls) return { error: "Nothing happened in this session yet: no rolls to tell a story about." };
  const body = facts(recap, { campaign: ctx.campaign.name, session: s.number, title: s.title, party });
  const language = LANG[lang === "sr" ? "sr" : "en"];
  try {
    const { text } = await chatWith([
      {
        role: "system",
        content: [
          `You write the recap of one D&D session for the players to read, in ${language}.`,
          "Use ONLY the facts you are given. Don't invent events, places, enemies, names, dialogue or reasons that aren't in the facts.",
          "You may describe the facts vividly, like a short story told at the table, but keep it clear and easy to read: plain sentences, no role-play voice.",
          "Keep game words as they are (natural 20, hit points, Rage, spell and attack names).",
          "Length: 2 to 4 short paragraphs, 120 to 250 words. Mention every hero at least once. End with one sentence naming the session's MVP and why.",
          "Plain text only: no headings, no lists, no markdown.",
        ].join("\n"),
      },
      { role: "user", content: body },
    ], { maxTokens: 900, timeoutMs: 60_000, secrets: false, temperature: 0.6 });
    const story = text.replace(/```[a-z]*\n?|```/g, "").trim().slice(0, 4000);
    if (!story) return { error: "The AI sent back an empty answer. Try again." };
    // any player may write it; the app saves it (the table shares one story)
    const { error } = await createAdminClient().from("sessions").update({ recap: story }).eq("id", s.id);
    if (error) return { error: error.message };
    return { story };
  } catch (e) {
    return { error: e instanceof AiError ? e.message : "Couldn't reach the AI. Try again in a minute." };
  }
}
