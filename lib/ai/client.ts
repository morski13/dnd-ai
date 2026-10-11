// Talks to any "OpenAI-compatible" chat API. Pick a provider in .env.local (server only, never NEXT_PUBLIC_):
//   AI_BASE_URL  e.g. https://api.groq.com/openai/v1 · https://openrouter.ai/api/v1
//                     https://generativelanguage.googleapis.com/v1beta/openai · http://localhost:11434/v1 (Ollama)
//   AI_API_KEY   the provider's key (Ollama: anything)
//   AI_MODEL     e.g. llama-3.3-70b-versatile · meta-llama/llama-3.3-70b-instruct:free · gemini-2.0-flash · llama3.1
// No AI_BASE_URL → the AI buttons simply don't show and the free smart reader does everything.
// Server only: only import this from server code (it reads the secret key).

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export function aiConfig() {
  const base = process.env.AI_BASE_URL?.trim().replace(/\/+$/, "");
  const model = process.env.AI_MODEL?.trim();
  if (!base || !model) return null;
  let host = base;
  try { host = new URL(base).host; } catch { /* keep as is */ }
  return { base, model, key: process.env.AI_API_KEY?.trim() ?? "", host };
}

export class AiError extends Error {}

/** One chat call. `json: true` asks for a JSON object back. */
export async function chat(messages: ChatMessage[], opts: { json?: boolean; maxTokens?: number; timeoutMs?: number } = {}): Promise<string> {
  const cfg = aiConfig();
  if (!cfg) throw new AiError("No AI is set up (AI_BASE_URL and AI_MODEL in .env.local).");
  const body: Record<string, unknown> = { model: cfg.model, messages, temperature: 0.2, max_tokens: opts.maxTokens ?? 1500 };
  const jsonMode = !!opts.json && process.env.AI_JSON_MODE !== "off";
  if (jsonMode) body.response_format = { type: "json_object" };

  let r = await send(cfg, body, opts.timeoutMs);
  if (!r.ok && jsonMode && r.status === 400 && /json|failed_generation/i.test(r.raw)) {
    // Strict JSON mode refused the answer (often: a "thinking" model ran out of room mid-answer).
    // If the refused answer still holds a usable object, take it; otherwise ask again without strict mode and with more room.
    const failed = (() => { try { return (JSON.parse(r.raw) as { error?: { failed_generation?: string } }).error?.failed_generation ?? ""; } catch { return ""; } })();
    if (failed && parseJson(failed)) return failed;
    const { response_format: _drop, ...loose } = body;
    void _drop;
    r = await send(cfg, { ...loose, max_tokens: Number(body.max_tokens) * 2 }, opts.timeoutMs);
  }
  if (r.status === 429) throw new AiError("The AI's free limit is used up for now. Try again in a minute.");
  if (!r.ok) {
    const what = r.status === 401 || r.status === 403 ? "check AI_API_KEY" : r.status === 404 ? "check AI_BASE_URL and AI_MODEL" : "check the AI settings";
    throw new AiError(`The AI said no (${r.status}: ${r.reason || "no reason given"}). ${what[0].toUpperCase()}${what.slice(1)}. Address used: ${cfg.base}/chat/completions, model "${cfg.model}".`);
  }
  if (!r.text.trim()) throw new AiError(r.finish === "length" ? "The AI ran out of room before answering. Try a different AI_MODEL." : "The AI sent back nothing.");
  return r.text;
}

type Sent = { ok: boolean; status: number; raw: string; reason: string; text: string; finish: string | null };

async function send(cfg: NonNullable<ReturnType<typeof aiConfig>>, body: Record<string, unknown>, timeoutMs = 60_000): Promise<Sent> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.key ? { Authorization: `Bearer ${cfg.key}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    // "fetch failed" alone says nothing; the real reason (no internet, blocked, timeout…) is in e.cause
    const c = (e as { cause?: { code?: string; message?: string } }).cause;
    const detail = c?.code ?? c?.message ?? (e as Error).name;
    const hint = /ENOTFOUND|EAI_AGAIN/.test(detail ?? "") ? " (the address can't be found: check the internet connection and AI_BASE_URL)"
      : /ETIMEDOUT|TimeoutError|UND_ERR_CONNECT_TIMEOUT/.test(detail ?? "") ? " (no answer: a firewall, antivirus or VPN may be blocking it)"
      : /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(detail ?? "") ? " (security certificate problem: often antivirus web protection)"
      : /ECONNREFUSED/.test(detail ?? "") ? " (nothing is listening there: is the AI program running?)" : "";
    throw new AiError(`Couldn't reach the AI (${cfg.host}): ${(e as Error).message}${detail ? ` [${detail}]` : ""}${hint}`);
  }
  const raw = await res.text().catch(() => "");
  let j: { error?: { message?: string } | string; message?: string; choices?: { message?: { content?: string }; finish_reason?: string }[] } | null = null;
  try { j = JSON.parse(raw); } catch { /* not JSON */ }
  // the provider's own reason ("model not found", "invalid api key"…); never includes the key
  const reason = res.ok ? "" : String((typeof j?.error === "string" ? j.error : j?.error?.message) ?? j?.message ?? raw).replace(/\s+/g, " ").slice(0, 200);
  return { ok: res.ok, status: res.status, raw, reason, text: j?.choices?.[0]?.message?.content ?? "", finish: j?.choices?.[0]?.finish_reason ?? null };
}

/** Pull the first JSON object out of a reply (some models wrap it in ```json fences or chatter). */
export function parseJson<T>(text: string): T | null {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)) as T; } catch { return null; }
}
