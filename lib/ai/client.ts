// Talks to any "OpenAI-compatible" chat API, with automatic backups. Set them up in .env.local (server only, never NEXT_PUBLIC_):
//   AI_BASE_URL  e.g. https://api.groq.com/openai/v1 · https://openrouter.ai/api/v1 · https://api.cerebras.ai/v1
//                     https://generativelanguage.googleapis.com/v1beta/openai · http://localhost:11434/v1 (Ollama)
//   AI_API_KEY   the provider's key (Ollama: anything)
//   AI_MODEL     e.g. openai/gpt-oss-120b · meta-llama/llama-3.3-70b-instruct:free · gemini-2.5-flash (several: comma separated)
//   AI_2_BASE_URL / AI_2_API_KEY / AI_2_MODEL … up to AI_9_: backups, tried in order when the ones before are
//   out of free uses, down or broken. More options (names, "never send DM-only notes", JSON mode) in lib/ai/providers.ts.
// No AI_BASE_URL → the AI buttons simply don't show and the free smart reader does everything.
// Server only: only import this from server code (it reads the secret keys).
import { readLimits, restAfter } from "./limits";
import { label, readProviders, type Provider } from "./providers";
import { aiStore, blankState, utcDay, type ProviderState } from "./store";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type { Provider } from "./providers";

/** The first AI in the list (or null when none is set up). */
export function aiConfig() {
  const p = readProviders()[0];
  return p ? { base: p.base, model: p.model, key: p.key, host: p.host } : null;
}
export const aiProviders = () => readProviders();

export class AiError extends Error {}

type ChatOpts = {
  json?: boolean; maxTokens?: number;
  /** 0 = always the same wording, 1 = more lively; default 0.2 (facts). The Tavern's voices use more. */
  temperature?: number;
  timeoutMs?: number;  // per AI tried
  /** Does this request hold DM-only notes? Then AIs set to SECRETS=no are skipped. Default true (the safe side). */
  secrets?: boolean;
};

/** One chat call. `json: true` asks for a JSON object back. */
export async function chat(messages: ChatMessage[], opts: ChatOpts = {}): Promise<string> {
  return (await chatWith(messages, opts)).text;
}

const inMin = (until: number, now: number) => {
  const m = Math.max(1, Math.round((until - now) / 60_000));
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** Like chat(), and also says which AI answered. Tries each AI in order until one answers. */
export async function chatWith(messages: ChatMessage[], opts: ChatOpts = {}): Promise<{ text: string; by: Provider }> {
  const all = readProviders();
  if (!all.length) throw new AiError("No AI is set up (AI_BASE_URL and AI_MODEL in .env.local).");
  const secrets = opts.secrets ?? true;
  const allowed = secrets ? all.filter((p) => p.secrets) : all;
  if (!allowed.length) throw new AiError("None of your AIs may read DM-only notes (they are all set to SECRETS=no in .env.local).");

  const store = aiStore();
  const states = await store.load(allowed.map((p) => p.id));
  const start = Date.now();
  // backups that exist but may not read DM-only notes: say so, or "it didn't switch" looks like a bug
  const skipped = all.length - allowed.length;
  const hint = secrets && skipped ? ` ${skipped === 1 ? "Your other AI isn't" : `Your other ${skipped} AIs aren't`} allowed to read DM-only notes (SECRETS=no): hide the secrets to let ${skipped === 1 ? "it" : "them"} answer.` : "";
  const resting = allowed.filter((p) => (states[p.id]?.restUntil ?? 0) > start);
  const ready = allowed.filter((p) => !resting.includes(p));
  if (!ready.length) {
    const back = resting.map((p) => `${label(p)}: ${states[p.id].why ?? "resting"}, back in ${inMin(states[p.id].restUntil!, start)}`);
    throw new AiError(`${allowed.length === all.length ? "All your AIs are" : allowed.length === 1 ? "The AI that may read DM-only notes is" : "The AIs that may read DM-only notes are"} out of free uses for now. ${back.join(" · ")}.${hint} The smart reader still works.`);
  }

  const perTry = opts.timeoutMs ?? 60_000;
  const deadline = start + perTry * 2; // don't keep someone waiting for several minutes
  const fails: string[] = [];
  for (const [i, p] of ready.entries()) {
    if (i > 0 && Date.now() > deadline) { fails.push(`${label(p)}: not tried (out of time)`); continue; }
    const st: ProviderState = { ...blankState(), ...states[p.id] };
    const now = Date.now();
    if (st.day !== utcDay(now)) { st.day = utcDay(now); st.used = 0; }
    st.used += 1;

    const r = await attempt(p, messages, opts, perTry);
    if (r.headers) {
      const lim = readLimits(r.headers, now);
      if (lim.remaining != null) Object.assign(st, { remaining: lim.remaining, limit: lim.limit, resetAt: lim.resetAt, daily: lim.daily });
    }
    if (r.ok && r.text.trim()) {
      Object.assign(st, { lastOkAt: now, restUntil: null, why: null });
      // that was the last one it allows: skip it next time until it resets, instead of wasting a call
      if (st.remaining === 0 && st.resetAt && st.resetAt > now) Object.assign(st, { restUntil: st.resetAt, why: st.daily ? "daily limit reached" : "limit reached" });
      await store.save(p.id, st);
      return { text: r.text, by: p };
    }

    const rest = r.ok ? null : restAfter(r.status, r.headers ?? new Headers(), r.raw, now);
    let msg = r.ok ? (r.finish === "length" ? "The AI ran out of room before answering. Try a different model." : "The AI sent back nothing.") : explain(p, r);
    if (r.status === 429 && rest) msg += ` Back in ${inMin(rest.until, now)}.`;
    if (rest) Object.assign(st, { restUntil: rest.until, why: rest.why, daily: rest.daily || st.daily });
    Object.assign(st, { lastError: msg.slice(0, 300), lastErrorAt: now });
    await store.save(p.id, st);
    fails.push(all.length === 1 ? msg : `${label(p)}: ${msg}`);
  }
  for (const p of resting) fails.push(`${label(p)}: ${states[p.id].why ?? "resting"}, back in ${inMin(states[p.id].restUntil!, Date.now())}`);
  throw new AiError((fails.length === 1 ? fails[0] : `None of your AIs could answer. ${fails.join(" · ")}`) + hint);
}

type Sent = { ok: boolean; status: number; raw: string; reason: string; text: string; finish: string | null; headers: Headers | null };

function explain(p: Provider, r: Sent) {
  if (r.status === 0) return r.reason;
  if (r.status === 429) return "The AI's free limit is used up for now.";
  const what = r.status === 401 || r.status === 403 ? `check ${p.prefix}API_KEY` : r.status === 404 ? `check ${p.prefix}BASE_URL and ${p.prefix}MODEL` : "check the AI settings";
  return `The AI said no (${r.status}: ${r.reason || "no reason given"}). ${what[0].toUpperCase()}${what.slice(1)}. Address used: ${p.base}/chat/completions, model "${p.model}".`;
}

/** One AI, including the strict-JSON second chance. */
async function attempt(p: Provider, messages: ChatMessage[], opts: ChatOpts, timeoutMs: number): Promise<Sent> {
  const body: Record<string, unknown> = { model: p.model, messages, temperature: opts.temperature ?? 0.2, max_tokens: opts.maxTokens ?? 1500 };
  const jsonMode = !!opts.json && p.json && process.env.AI_JSON_MODE !== "off";
  if (jsonMode) body.response_format = { type: "json_object" };

  let r = await send(p, body, timeoutMs);
  if (!r.ok && jsonMode && r.status === 400 && /json|failed_generation/i.test(r.raw)) {
    // Strict JSON mode refused the answer (often: a "thinking" model ran out of room mid-answer).
    // If the refused answer still holds a usable object, take it; otherwise ask again without strict mode and with more room.
    const failed = (() => { try { return (JSON.parse(r.raw) as { error?: { failed_generation?: string } }).error?.failed_generation ?? ""; } catch { return ""; } })();
    if (failed && parseJson(failed)) return { ...r, ok: true, text: failed };
    const { response_format: _drop, ...loose } = body;
    void _drop;
    r = await send(p, { ...loose, max_tokens: Number(body.max_tokens) * 2 }, timeoutMs);
  }
  return r;
}

async function send(p: Provider, body: Record<string, unknown>, timeoutMs: number): Promise<Sent> {
  let res: Response;
  try {
    res = await fetch(`${p.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(p.key ? { Authorization: `Bearer ${p.key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    // "fetch failed" alone says nothing; the real reason (no internet, blocked, timeout…) is in e.cause
    const c = (e as { cause?: { code?: string; message?: string } }).cause;
    const detail = c?.code ?? c?.message ?? (e as Error).name;
    const hint = /ENOTFOUND|EAI_AGAIN/.test(detail ?? "") ? ` (the address can't be found: check the internet connection and ${p.prefix}BASE_URL)`
      : /ETIMEDOUT|TimeoutError|UND_ERR_CONNECT_TIMEOUT/.test(detail ?? "") ? " (no answer: a firewall, antivirus or VPN may be blocking it)"
      : /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(detail ?? "") ? " (security certificate problem: often antivirus web protection)"
      : /ECONNREFUSED/.test(detail ?? "") ? " (nothing is listening there: is the AI program running?)" : "";
    const reason = `Couldn't reach the AI (${p.host}): ${(e as Error).message}${detail ? ` [${detail}]` : ""}${hint}`;
    return { ok: false, status: 0, raw: "", reason, text: "", finish: null, headers: null };
  }
  const raw = await res.text().catch(() => "");
  let j: { error?: { message?: string } | string; message?: string; choices?: { message?: { content?: string }; finish_reason?: string }[] } | null = null;
  try { j = JSON.parse(raw); } catch { /* not JSON */ }
  if (Array.isArray(j)) j = j[0] ?? null; // Gemini sometimes wraps its error in a list
  // the provider's own reason ("model not found", "invalid api key"…); never includes the key
  const reason = res.ok ? "" : String((typeof j?.error === "string" ? j.error : j?.error?.message) ?? j?.message ?? raw).replace(/\s+/g, " ").slice(0, 200);
  return { ok: res.ok, status: res.status, raw, reason, text: j?.choices?.[0]?.message?.content ?? "", finish: j?.choices?.[0]?.finish_reason ?? null, headers: res.headers };
}

/** Pull the first JSON object out of a reply (some models wrap it in ```json fences or chatter). */
export function parseJson<T>(text: string): T | null {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; }
}

/** For the DM's AI status: every AI in the chain and how it's doing (no keys). */
export async function aiStatus() {
  const all = readProviders();
  const states = await aiStore().load(all.map((p) => p.id));
  const now = Date.now(), today = utcDay(now);
  return all.map((p) => {
    const s = { ...blankState(), ...states[p.id] };
    const resting = (s.restUntil ?? 0) > now;
    return {
      name: p.name, model: p.model, secrets: p.secrets,
      state: (resting ? "resting" : s.lastErrorAt && (!s.lastOkAt || s.lastErrorAt > s.lastOkAt) ? "problem" : "ready") as "ready" | "resting" | "problem",
      why: resting ? s.why : null,
      until: resting ? new Date(s.restUntil!).toISOString() : null,
      left: s.remaining != null && (!s.resetAt || s.resetAt > now) ? s.remaining : null,
      limit: s.limit,
      usedToday: s.day === today ? s.used : 0,
      lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null,
      lastError: s.lastError,
    };
  });
}
export type AiProviderStatus = Awaited<ReturnType<typeof aiStatus>>[number];
