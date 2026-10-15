"use server";
// The Tavern assistant: ask, rate an answer, pick how it talks, delete a chat.
import { AiError } from "@/lib/ai/client";
import { answer } from "@/lib/assistant/engine";
import type { Mode } from "@/lib/assistant/prompt";
import { STYLES } from "@/lib/assistant/styles";
import { vaultContext } from "@/lib/vault-data";

export type ChatSource = { id: string; kind: string; title: string; text: string; secret: boolean };
export type ChatMessageView = {
  id: string; role: "user" | "assistant"; content: string; verdict: string | null; style: string | null; model: string | null;
  sources: ChatSource[]; checks: string[]; rating: number; correction: string | null; hasSecrets: boolean; at: string;
};

type Fail = { error: string };
const MODES: Mode[] = ["rules", "character", "session", "lore"];

const TRAINING_TITLE = "🎓 Training"; // ("use server" files may only export async functions)

export async function askTavern(input: {
  chatId?: string | null; mode: Mode; characterId?: string | null; question: string; withSecrets?: boolean;
  /** Train page: answer in this voice (not your own), and don't feed earlier questions in as conversation */
  styleId?: string; training?: boolean;
}):
  Promise<Fail | { chatId: string; question: ChatMessageView; reply: ChatMessageView }> {
  const question = input.question.trim();
  if (question.length < 3) return { error: "Ask a longer question." };
  if (question.length > 800) return { error: "That's a long one: keep it under 800 letters." };
  const mode = MODES.includes(input.mode) ? input.mode : "rules";
  const ctx = await vaultContext();
  const { supabase, userId, campaign, isDm } = ctx;

  const { data: prof } = await supabase.from("profiles").select("display_name, assistant_style").eq("id", userId).maybeSingle();
  // the chat: an existing one of yours, or a new one
  let chatId = input.chatId ?? null;
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (chatId) {
    const { data: chat } = await supabase.from("assistant_chats").select("id").eq("id", chatId).maybeSingle();
    if (!chat) chatId = null;
    else if (!input.training) {
      const { data: msgs } = await supabase.from("assistant_messages").select("role, content").eq("chat_id", chatId).order("created_at", { ascending: false }).limit(6);
      history = ((msgs ?? []) as { role: "user" | "assistant"; content: string }[]).reverse();
    }
  }

  let reply;
  try {
    reply = await answer({
      supabase, userId, campaign, isDm, mode, question, history,
      characterId: input.characterId || null,
      styleId: input.styleId && STYLES.some((x) => x.id === input.styleId) ? input.styleId : (prof as { assistant_style?: string } | null)?.assistant_style,
      withSecrets: !!input.withSecrets, askerName: (prof as { display_name?: string } | null)?.display_name,
    });
  } catch (e) {
    return { error: e instanceof AiError || e instanceof Error ? e.message : "Something went wrong." };
  }

  if (!chatId) {
    const { data: chat, error } = await supabase.from("assistant_chats")
      .insert({ campaign_id: campaign?.id ?? null, character_id: input.characterId || null, mode, title: input.training ? `${TRAINING_TITLE} · ${new Date().toISOString().slice(0, 10)}` : question.slice(0, 80) })
      .select("id").single();
    if (error) return { error: /assistant_chats/.test(error.message) ? "Run supabase/25-tavern-assistant.sql first." : error.message };
    chatId = chat.id as string;
  } else {
    await supabase.from("assistant_chats").update(input.training ? { updated_at: new Date().toISOString() } : { updated_at: new Date().toISOString(), mode, character_id: input.characterId || null }).eq("id", chatId);
  }
  const src = (s: typeof reply.sourcesUsed) => s.map((x) => ({ id: x.id, kind: x.kind, title: x.title, text: x.text, secret: x.secret }));
  const t = Date.now(); // the question first, then the answer (same insert = same time otherwise)
  const { data: rows, error } = await supabase.from("assistant_messages").insert([
    // every column on both rows: in a multi-row insert, a column one row leaves out becomes NULL, not its default
    { chat_id: chatId, role: "user", content: question, verdict: null, style: null, model: null, sources: [], checks: [], rating: 0, has_secrets: reply.hasSecrets, prompt: null, created_at: new Date(t).toISOString() },
    { chat_id: chatId, role: "assistant", content: reply.answer, verdict: reply.verdict, style: reply.style, model: reply.by, sources: src(reply.sourcesUsed), checks: reply.checks, rating: 0, has_secrets: reply.hasSecrets,
      prompt: reply.hasSecrets ? null : reply.prompt, created_at: new Date(t + 1).toISOString() },
  ]).select("id, role, content, verdict, style, model, sources, checks, rating, correction, has_secrets, created_at");
  if (error || !rows) return { error: error?.message ?? "Couldn't save the answer." };
  const view = (r: Record<string, unknown>): ChatMessageView => ({
    id: r.id as string, role: r.role as "user" | "assistant", content: r.content as string, verdict: (r.verdict as string) ?? null, style: (r.style as string) ?? null,
    model: (r.model as string) ?? null, sources: (r.sources as ChatSource[]) ?? [], checks: (r.checks as string[]) ?? [], rating: (r.rating as number) ?? 0, correction: (r.correction as string) ?? null,
    hasSecrets: !!r.has_secrets, at: r.created_at as string,
  });
  const q = rows.find((r) => r.role === "user")!, a = rows.find((r) => r.role === "assistant")!;
  return { chatId, question: view(q), reply: view(a) };
}

/** 👍 / 👎 an answer. After a 👎 the player can write what the right answer is: that's the best training data. */
export async function rateAnswer(messageId: string, rating: -1 | 0 | 1, correction?: string): Promise<Fail | { ok: true }> {
  if (![-1, 0, 1].includes(rating)) return { error: "Bad rating." };
  const { supabase } = await vaultContext();
  const patch: { rating: number; correction?: string | null } = { rating };
  if (correction !== undefined) patch.correction = correction.trim().slice(0, 2000) || null;
  const { error } = await supabase.from("assistant_messages").update(patch).eq("id", messageId).eq("role", "assistant");
  return error ? { error: error.message } : { ok: true };
}

export async function setAssistantStyle(style: string): Promise<Fail | { ok: true }> {
  if (!STYLES.some((s) => s.id === style)) return { error: "Unknown style." };
  const { supabase, userId } = await vaultContext();
  const { error } = await supabase.from("profiles").update({ assistant_style: style }).eq("id", userId);
  return error ? { error: /assistant_style/.test(error.message) ? "Run supabase/25-tavern-assistant.sql first." : error.message } : { ok: true };
}

export async function deleteChat(chatId: string): Promise<Fail | { ok: true }> {
  const { supabase } = await vaultContext();
  const { error } = await supabase.from("assistant_chats").delete().eq("id", chatId);
  return error ? { error: error.message } : { ok: true };
}

/** For the small assistant panel (session screen): your voice, characters and whether an AI is set up. */
export async function tavernPanel() {
  const { getTavern } = await import("@/lib/tavern-data");
  const t = await getTavern(null);
  return { style: t.style, characters: t.characters, configured: t.configured, isDm: t.isDm };
}

export type ReviewItem = { id: string; question: string; answer: string; style: string | null; verdict: string | null; model: string | null; sources: ChatSource[]; checks: string[] };

/** Training progress (your own answers): how many are ready to train on, and how many still wait for a rating. */
export async function trainingStats(): Promise<{ liked: number; corrected: number; disliked: number; waiting: number }> {
  const { supabase } = await vaultContext();
  const count = async (f: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await f(base())).count ?? 0;
  const base = () => supabase.from("assistant_messages").select("id", { count: "exact", head: true }).eq("role", "assistant").eq("has_secrets", false);
  const [liked, corrected, disliked, waiting] = await Promise.all([
    count((q) => q.eq("rating", 1)),
    count((q) => q.not("correction", "is", null)),
    count((q) => q.eq("rating", -1)),
    count((q) => q.eq("rating", 0)),
  ]);
  return { liked, corrected, disliked, waiting };
}

/** Answers you haven't rated yet (newest first), each with its question. */
export async function reviewQueue(limit = 20): Promise<ReviewItem[]> {
  const { supabase } = await vaultContext();
  const { data: ans } = await supabase.from("assistant_messages").select("id, chat_id, content, style, verdict, model, sources, checks, created_at")
    .eq("role", "assistant").eq("rating", 0).is("correction", null).eq("has_secrets", false).order("created_at", { ascending: false }).limit(limit);
  const rows = (ans ?? []) as { id: string; chat_id: string; content: string; style: string | null; verdict: string | null; model: string | null; sources: ChatSource[]; checks: string[]; created_at: string }[];
  if (!rows.length) return [];
  // the question = the last question in the same chat at or before the answer
  const { data: qs } = await supabase.from("assistant_messages").select("chat_id, content, created_at").eq("role", "user")
    .in("chat_id", [...new Set(rows.map((r) => r.chat_id))]).order("created_at");
  const byChat = new Map<string, { content: string; at: number }[]>();
  for (const q of (qs ?? []) as { chat_id: string; content: string; created_at: string }[]) {
    byChat.set(q.chat_id, [...(byChat.get(q.chat_id) ?? []), { content: q.content, at: new Date(q.created_at).getTime() }]);
  }
  const questionFor = (r: (typeof rows)[number]) => {
    const t = new Date(r.created_at).getTime();
    return (byChat.get(r.chat_id) ?? []).filter((q) => q.at <= t).at(-1)?.content ?? "(question not found)";
  };
  return rows.map((r) => ({
    id: r.id, question: questionFor(r),
    answer: r.content, style: r.style, verdict: r.verdict, model: r.model, sources: r.sources ?? [], checks: r.checks ?? [],
  }));
}
