// Feeds the campaign reader. The DM's reading uses the full documents (secrets included);
// players — and the DM's "Player view" — only ever get the shared, secret-free copies.
// If the DM ran the AI reader, its saved reading is laid on top (players: only the copy made from shared pages).
import { aiConfig } from "@/lib/ai/client";
import { loadAiReading, notesHash } from "@/lib/ai-reading";
import { getReader } from "@/lib/reader/engine";
import { mergeAi, type AiState } from "@/lib/reader/ai";
import type { Analysis, ReaderDoc } from "@/lib/reader/types";
import { vaultContext } from "@/lib/vault-data";
import type { DocNode } from "@/lib/vault/doc";

type Ctx = Awaited<ReturnType<typeof vaultContext>>;

/** The pages this viewer may read, and the party. */
export async function readerInput(ctx: Ctx, playerView: boolean) {
  const { supabase, campaign } = ctx;
  if (!campaign) return { docs: [] as ReaderDoc[], party: [] as { id: string; name: string }[] };
  const [{ data: rows }, { data: chars }, full] = await Promise.all([
    supabase.from("vault_entries").select("id, title, status, shared, public_doc, updated_at, vault_folders(kind, name)")
      .eq("campaign_id", campaign.id).eq("kind", "doc").is("parent_id", null).order("sort").order("created_at"),
    supabase.from("characters").select("id, name").eq("campaign_id", campaign.id).order("name"),
    playerView ? Promise.resolve({ data: [] as { entry_id: string; doc: DocNode }[] })
      : supabase.from("vault_docs").select("entry_id, doc").eq("campaign_id", campaign.id),
  ]);
  const fullDoc = new Map(((full.data ?? []) as { entry_id: string; doc: DocNode }[]).map((d) => [d.entry_id, d.doc]));
  const docs: ReaderDoc[] = ((rows ?? []) as unknown as {
    id: string; title: string; status: string | null; shared: boolean; public_doc: DocNode | null; updated_at: string; vault_folders: { kind: string; name: string } | null;
  }[])
    .filter((r) => !playerView || r.shared)
    .map((r) => ({
      id: r.id, title: r.title, folder: r.vault_folders?.kind ?? "custom", folderName: r.vault_folders?.name, status: r.status, shared: r.shared, updatedAt: r.updated_at,
      doc: (playerView ? r.public_doc : fullDoc.get(r.id) ?? r.public_doc) ?? { type: "doc", content: [] },
    }));
  return { docs, party: (chars ?? []) as { id: string; name: string }[] };
}

export async function getReading(asPlayer: boolean) {
  const ctx = await vaultContext();
  const { campaign, isDm } = ctx;
  const playerView = !isDm || asPlayer;
  const cfg = aiConfig();
  const noAi: AiState = { configured: !!cfg, host: cfg?.host ?? null, at: null, stale: false, model: null };
  if (!campaign) return { ...ctx, playerView, analysis: null as Analysis | null, ai: noAi };

  const input = await readerInput(ctx, playerView);
  const smart = await getReader().analyze(input);
  const view = playerView ? "player" : "dm";
  const [mine, pub] = await Promise.all([
    loadAiReading(campaign.id, view),
    view === "dm" ? loadAiReading(campaign.id, "player") : Promise.resolve(null),
  ]);
  // DM: their own reading, plus anything the players' reading found that theirs missed (AI answers vary run to run)
  const analysis = view === "dm"
    ? mergeAi(mergeAi(smart, mine?.reading ?? null, "dm", pub?.reading ?? null), pub?.reading ?? null, "player")
    : mergeAi(smart, mine?.reading ?? null, "player");
  const ai: AiState = { ...noAi, at: mine?.at ?? null, model: mine?.model ?? null, stale: !!mine && mine.hash !== notesHash(input.docs) };
  return { ...ctx, playerView, analysis, ai };
}
