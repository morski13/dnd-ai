// Remembers, per AI, when it's resting (limit reached), what's left and how often we used it today.
// Kept in the database (table ai_provider_status, SQL 24) so it survives restarts and works on Vercel,
// where every request may run on a different server. Without that table it simply remembers in memory.
// Server only (uses the secret key).
import { createAdminClient } from "../supabase/admin";

export type ProviderState = {
  restUntil: number | null;  // skip it until then
  why: string | null;        // "daily limit reached"…
  remaining: number | null;  // the provider's own count, when it sends one
  limit: number | null;
  resetAt: number | null;
  daily: boolean;
  day: string | null;        // UTC day the counter below is for
  used: number;              // our calls that day (answered or not)
  lastOkAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
};

export const blankState = (): ProviderState => ({
  restUntil: null, why: null, remaining: null, limit: null, resetAt: null, daily: false, day: null, used: 0, lastOkAt: null, lastError: null, lastErrorAt: null,
});

export type AiStore = {
  load(ids: string[]): Promise<Record<string, ProviderState>>;
  save(id: string, s: ProviderState): Promise<void>;
};

const memory = new Map<string, ProviderState>();

export const memoryStore: AiStore = {
  async load(ids) { return Object.fromEntries(ids.map((id) => [id, { ...blankState(), ...memory.get(id) }])); },
  async save(id, s) { memory.set(id, s); },
};

let dbBroken = false; // table missing (SQL 24 not run) → stop asking

const dbStore: AiStore = {
  async load(ids) {
    const mem = await memoryStore.load(ids);
    if (dbBroken || !ids.length) return mem;
    try {
      const { data, error } = await createAdminClient().from("ai_provider_status").select("id, state").in("id", ids);
      if (error) { dbBroken = /ai_provider_status/.test(error.message); return mem; }
      for (const r of (data ?? []) as { id: string; state: Partial<ProviderState> }[]) mem[r.id] = { ...blankState(), ...r.state };
      return mem;
    } catch { return mem; }
  },
  async save(id, s) {
    await memoryStore.save(id, s);
    if (dbBroken) return;
    try {
      const { error } = await createAdminClient().from("ai_provider_status").upsert({ id, state: s, updated_at: new Date().toISOString() });
      if (error && /ai_provider_status/.test(error.message)) dbBroken = true;
    } catch { /* memory still has it */ }
  },
};

let override: AiStore | null = null;
/** Tests: use your own store. */
export function setAiStore(s: AiStore | null) { override = s; }
export function aiStore(): AiStore {
  if (override) return override;
  return process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL ? dbStore : memoryStore;
}
/** Tests: forget everything remembered in memory. */
export function clearAiMemory() { memory.clear(); dbBroken = false; }

export const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);
