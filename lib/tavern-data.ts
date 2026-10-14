// Loads the Tavern assistant screen: your speaking style, characters to ask about, recent chats and one chat.
import { aiConfig } from "@/lib/ai/client";
import { DEFAULT_STYLE } from "@/lib/assistant/styles";
import { vaultContext } from "@/lib/vault-data";
import type { ChatMessageView, ChatSource } from "@/app/tavern/actions";

export type TavernChar = { id: string; name: string; mine: boolean };
export type ChatSummary = { id: string; title: string; mode: string; characterId: string | null; at: string };

export async function getTavern(chatId: string | null) {
  const ctx = await vaultContext();
  const { supabase, userId, campaign, isDm } = ctx;
  const [{ data: prof }, chars, { data: chats }] = await Promise.all([
    supabase.from("profiles").select("assistant_style").eq("id", userId).maybeSingle(),
    campaign ? supabase.from("characters").select("id, name, owner_user_id").eq("campaign_id", campaign.id).order("name") : Promise.resolve({ data: [] }),
    supabase.from("assistant_chats").select("id, title, mode, character_id, updated_at").order("updated_at", { ascending: false }).limit(20),
  ]);
  const characters: TavernChar[] = ((chars.data ?? []) as { id: string; name: string; owner_user_id: string | null }[])
    .map((c) => ({ id: c.id, name: c.name, mine: c.owner_user_id === userId }))
    .filter((c) => isDm || c.mine)
    .sort((a, b) => Number(b.mine) - Number(a.mine));

  let messages: ChatMessageView[] = [];
  let chat: ChatSummary | null = null;
  const list: ChatSummary[] = ((chats ?? []) as { id: string; title: string; mode: string; character_id: string | null; updated_at: string }[])
    .map((c) => ({ id: c.id, title: c.title, mode: c.mode, characterId: c.character_id, at: c.updated_at }));
  if (chatId) {
    chat = list.find((c) => c.id === chatId) ?? null;
    if (chat) {
      const { data } = await supabase.from("assistant_messages").select("id, role, content, verdict, style, model, sources, checks, rating, correction, has_secrets, created_at")
        .eq("chat_id", chatId).order("created_at").limit(200);
      messages = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string, role: r.role as "user" | "assistant", content: r.content as string, verdict: (r.verdict as string) ?? null,
        style: (r.style as string) ?? null, model: (r.model as string) ?? null, sources: (r.sources as ChatSource[]) ?? [], checks: (r.checks as string[]) ?? [],
        rating: (r.rating as number) ?? 0, correction: (r.correction as string) ?? null, hasSecrets: !!r.has_secrets, at: r.created_at as string,
      }));
    }
  }
  return {
    campaign, isDm, characters, chats: list, chat, messages,
    style: ((prof as { assistant_style?: string } | null)?.assistant_style ?? DEFAULT_STYLE),
    configured: !!aiConfig(),
  };
}
