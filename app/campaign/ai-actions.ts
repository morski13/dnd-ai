"use server";
// The optional AI reader. Only works when an AI is set up in .env.local (see lib/ai/client.ts).
import { AiError } from "@/lib/ai/client";
import { runAiReading } from "@/lib/ai-reading";
import { getReader } from "@/lib/reader/engine";
import { getReading, readerInput } from "@/lib/reader-data";
import { vaultContext } from "@/lib/vault-data";
import { askTavern } from "../tavern/actions";

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

/** Ask the AI about the world: this is the Tavern assistant in lore mode (the same AI as the Home screen's).
 *  Players (and the DM's player view) only ever send shared notes. The chat is saved, so it can go on in the Tavern. */
export async function askAi(question: string, asPlayer: boolean, withSecrets: boolean): Promise<Fail | { answer: string; about: string[]; by?: string; chatId?: string; verdict?: string }> {
  const q = question.trim();
  if (q.length < 3) return { error: "Ask a longer question." };
  const { analysis, playerView } = await getReading(asPlayer);
  if (!analysis) return { error: "Join a campaign first." };
  const r = await askTavern({ mode: "lore", question: q, withSecrets: !playerView && withSecrets });
  if ("error" in r) return r;
  // the boxes on the map that the answer used ("NPC: Morwen" → Morwen's box)
  const used = r.reply.sources.filter((s) => s.kind === "lore").map((s) => s.title.replace(/^[^:]+:\s*/, "").toLowerCase());
  const about = analysis.nodes.filter((n) => (!n.secret || (!playerView && withSecrets)) && used.includes(n.label.toLowerCase())).map((n) => n.id).slice(0, 4);
  return { answer: r.reply.content, about, by: r.reply.model ?? undefined, chatId: r.chatId, verdict: r.reply.verdict ?? undefined };
}
