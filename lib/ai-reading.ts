// Runs the AI reader and keeps its result (server only; uses the secret key, never sent to browsers).
// Not a "use server" file on purpose: nothing here can be called from a browser directly.
import { createHash } from "node:crypto";
import { chat, parseJson, aiConfig } from "@/lib/ai/client";
import { cleanReading, readingPrompt, type AiReading } from "@/lib/reader/ai";
import type { Analysis, ReaderDoc } from "@/lib/reader/types";
import { createAdminClient } from "@/lib/supabase/admin";

/** Which version of the notes (any edit changes it). */
export function notesHash(docs: ReaderDoc[]) {
  const h = createHash("sha256");
  for (const d of docs) h.update(`${d.id}|${d.title}|${d.updatedAt ?? ""}|${d.shared}\n`);
  return h.digest("hex").slice(0, 32);
}

export async function loadAiReading(campaignId: string, view: "dm" | "player") {
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  try {
    const { data } = await createAdminClient().from("ai_readings").select("result, notes_hash, model, created_at")
      .eq("campaign_id", campaignId).eq("view", view).maybeSingle();
    if (!data) return null;
    return { reading: data.result as AiReading, hash: data.notes_hash as string, model: data.model as string | null, at: data.created_at as string };
  } catch { return null; } // table not made yet (SQL 19 not run): just no AI
}

/** Ask the AI to read these notes, check its answer, save it. */
export async function runAiReading(campaignId: string, view: "dm" | "player", analysis: Analysis, docs: ReaderDoc[]) {
  const text = await chat(readingPrompt(analysis, docs), { json: true, maxTokens: 6000, timeoutMs: 90_000 });
  const raw = parseJson<unknown>(text);
  if (!raw) throw new Error("The AI's answer wasn't readable. Try again (or a different AI_MODEL).");
  const reading = cleanReading(raw, analysis);
  const { error } = await createAdminClient().from("ai_readings").upsert({
    campaign_id: campaignId, view, notes_hash: notesHash(docs), result: reading, model: aiConfig()?.model ?? null, created_at: new Date().toISOString(),
  });
  if (error) throw new Error(/ai_readings/.test(error.message) ? "Run supabase/19-ai-reader.sql first." : error.message);
  return reading;
}
