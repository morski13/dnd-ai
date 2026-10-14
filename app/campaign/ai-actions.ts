"use server";
// The optional AI reader. Only works when an AI is set up in .env.local (see lib/ai/client.ts).
import { AiError, chatWith, parseJson } from "@/lib/ai/client";
import { label } from "@/lib/ai/providers";
import { runAiReading } from "@/lib/ai-reading";
import { askContext, askPrompt } from "@/lib/reader/ai";
import { getReader } from "@/lib/reader/engine";
import { getReading, readerInput } from "@/lib/reader-data";
import { vaultContext } from "@/lib/vault-data";

type Fail = { error: string };
const why = (e: unknown) => (e instanceof AiError || e instanceof Error ? e.message : "Something went wrong.");

/** DM: let the AI read the notes now. Makes two copies: all notes (for you) and shared pages only (for players). */
export async function aiReadCampaign(): Promise<Fail | { links: number; playerLinks: number; by: string[] }> {
  const ctx = await vaultContext();
  if (!ctx.campaign || !ctx.isDm) return { error: "Only the DM can do that." };
  try {
    const dmIn = await readerInput(ctx, false);
    const dm = await runAiReading(ctx.campaign.id, "dm", await getReader().analyze(dmIn), dmIn.docs);
    const plIn = await readerInput(ctx, true);
    // the players' copy is made only from what they can already read
    const pl = plIn.docs.length ? await runAiReading(ctx.campaign.id, "player", await getReader().analyze(plIn), plIn.docs) : null;
    return { links: dm.links.length, playerLinks: pl?.links.length ?? 0, by: [...new Set([dm.by, pl?.by].filter((x): x is string => !!x))] };
  } catch (e) { return { error: why(e) }; }
}

/** Ask the AI a question about the world. Players (and the DM's player view) only ever send shared notes. */
export async function askAi(question: string, asPlayer: boolean, withSecrets: boolean): Promise<Fail | { answer: string; about: string[]; by?: string }> {
  const q = question.trim();
  if (q.length < 3) return { error: "Ask a longer question." };
  const { analysis, playerView } = await getReading(asPlayer);
  if (!analysis) return { error: "Join a campaign first." };
  const secrets = !playerView && withSecrets;
  const context = askContext(analysis, secrets);
  if (!context.trim()) return { answer: "There's nothing in the notes yet.", about: [] };
  try {
    const { text, by } = await chatWith(askPrompt(q, context), { json: true, maxTokens: 1500, secrets });
    const raw = parseJson<{ answer?: unknown; about?: unknown }>(text);
    const answer = typeof raw?.answer === "string" ? raw.answer.trim().slice(0, 1500) : "";
    if (!answer) return { error: "The AI's answer wasn't readable. Try again." };
    const names = Array.isArray(raw?.about) ? raw!.about.map(String) : [];
    const visible = analysis.nodes.filter((n) => secrets || !n.secret);
    const about = visible.filter((n) => names.some((x) => x.toLowerCase() === n.label.toLowerCase())).map((n) => n.id).slice(0, 4);
    return { answer, about, by: label(by) };
  } catch (e) { return { error: why(e) }; }
}
