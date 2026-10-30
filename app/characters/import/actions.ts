"use server";
// Importing a character sheet PDF. The PDF itself is read in the browser; only for a sheet without fields
// does its text come here, to be read by the AI chain. Nothing is saved until the player confirms.
import { aiProviders, AiError, chatWith, parseJson } from "@/lib/ai/client";
import { who } from "@/lib/items/server";
import { MAX_SHEET_TEXT, sheetPrompt } from "@/lib/sheet-import/ai-prompt";
import { cleanAiSheet, stripControl } from "@/lib/sheet-import/clean";
import { libraryCheck } from "@/lib/sheet-import/server";
import type { ImportedSheet } from "@/lib/sheet-import/types";

export async function readSheetWithAi(input: string): Promise<{ sheet: ImportedSheet; by: string } | { error: string; code?: "no-ai" | "scan" }> {
  const text = stripControl(String(input ?? ""));
  const { userId } = await who();
  if (!userId) return { error: "Log in first." };
  if (!aiProviders().length) return { error: "No AI is set up for this app, so a sheet without fields can't be read automatically.", code: "no-ai" };
  const body = String(text ?? "").slice(0, MAX_SHEET_TEXT);
  if (body.replace(/--- page \d+ ---/g, "").replace(/\s+/g, "").length < 60) {
    return { error: "This PDF has no text in it: it's probably a scan or a photo of the pages.", code: "scan" };
  }
  try {
    // a player's own sheet holds no DM secrets, so every AI in the chain may read it
    const { text: answer, by } = await chatWith(sheetPrompt(body), { json: true, maxTokens: 3000, timeoutMs: 60_000, secrets: false, temperature: 0 });
    const raw = parseJson<unknown>(answer);
    if (!raw) return { error: "The AI's answer didn't make sense. Try again, or fill the character in by hand." };
    return { sheet: cleanAiSheet(raw), by: by.name ?? by.id };
  } catch (e) {
    return { error: e instanceof AiError ? e.message : "Couldn't reach the AI. Try again in a minute." };
  }
}

export async function checkLibrary(rules: string, spells: string[], items: string[]) {
  const { supabase, userId } = await who();
  if (!userId) return { spells: [], items: [] };
  const r = rules === "2014" ? "2014" : "2024";
  return libraryCheck(supabase, r, (spells ?? []).map(String), (items ?? []).map(String));
}
