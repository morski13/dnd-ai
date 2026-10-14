// The list of AIs the app may use, in order, read from .env.local (server only).
//
// AI 1 is the one you already have:      AI_BASE_URL, AI_MODEL, AI_API_KEY
// Backups (optional) are numbered 2–9:    AI_2_BASE_URL, AI_2_MODEL, AI_2_API_KEY, …
// Extra settings for any of them (use the same prefix, e.g. AI_2_NAME):
//   AI_NAME / AI_2_NAME          a short name shown to the DM ("groq"); default = taken from the address
//   AI_SECRETS / AI_2_SECRETS    "no" = never send DM-only notes to this one (it only gets shared pages)
//   AI_JSON_MODE / AI_2_JSON_MODE "off" = this one doesn't support strict JSON mode
// AI_MODEL may list several models, comma separated ("model-a, model-b"): each is its own step,
// tried in that order with the same key (each model has its own free limit on most providers).
//
// When one says "limit reached", the app moves on to the next and skips the tired one until its limit resets.

export type Provider = {
  id: string;        // stable key for remembering its limits: "host|model"
  name: string;      // shown to the DM
  base: string;      // ends without a slash, e.g. https://api.groq.com/openai/v1
  model: string;
  key: string;
  host: string;
  secrets: boolean;  // may it read DM-only notes?
  json: boolean;     // may we ask for strict JSON mode?
  prefix: string;    // its settings in .env.local: "AI_" or "AI_2_"…
};

type Env = Record<string, string | undefined>;

const no = (v: string | undefined) => /^(no|off|false|0)$/i.test(v?.trim() ?? "");

/** A friendly name from the address: api.groq.com → groq, openrouter.ai → openrouter, localhost:11434 → ollama. */
export function nameFromHost(host: string) {
  const h = host.toLowerCase();
  if (/generativelanguage\.googleapis/.test(h)) return "gemini";
  if (/localhost|127\.0\.0\.1/.test(h)) return h.endsWith(":11434") ? "ollama" : "local";
  const parts = h.replace(/:\d+$/, "").split(".").filter((p) => !/^(api|www|inference|openai)$/.test(p));
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? h;
}

export function readProviders(env: Env = process.env): Provider[] {
  const out: Provider[] = [];
  const seen = new Set<string>();
  for (let n = 1; n <= 9; n++) {
    const p = n === 1 ? "AI_" : `AI_${n}_`;
    const base = env[`${p}BASE_URL`]?.trim().replace(/\/+$/, "");
    const models = (env[`${p}MODEL`] ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    if (!base || !models.length) continue;
    let host = base;
    try { host = new URL(base).host; } catch { /* keep as is */ }
    const name = env[`${p}NAME`]?.trim() || nameFromHost(host);
    for (const model of models) {
      const id = `${host}|${model}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id, name, base, model, host, prefix: p,
        key: env[`${p}API_KEY`]?.trim() ?? "",
        secrets: !no(env[`${p}SECRETS`]),
        json: !no(env[`${p}JSON_MODE`]),
      });
    }
  }
  return out;
}

/** "groq · openai/gpt-oss-120b" */
export const label = (p: Pick<Provider, "name" | "model">) => `${p.name} · ${p.model}`;
