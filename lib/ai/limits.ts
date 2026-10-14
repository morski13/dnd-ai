// Reads the "how much is left / when does it reset" hints that AI providers send back (pure, tested).
// Every provider says it differently:
//   Groq        x-ratelimit-remaining-requests / -limit-requests / -reset-requests ("2m59.56s"), retry-after
//   Cerebras    x-ratelimit-remaining-requests-day / -limit-requests-day / -reset-requests-day (seconds)
//   OpenRouter  X-RateLimit-Remaining / -Limit / -Reset (epoch milliseconds)
//   Gemini      no headers; the 429 body has RetryInfo "retryDelay": "35s" or "Please retry in 35.2s"

export type Limits = { remaining: number | null; limit: number | null; resetAt: number | null; daily: boolean };
export type Rest = { until: number; why: string; daily: boolean };

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

/** "2m59.56s" · "7.66s" · "350ms" · "1h2m" · "35" (seconds) · epoch s/ms · HTTP date → milliseconds from now. */
export function untilMs(v: string | null | undefined, now = Date.now()): number | null {
  const s = v?.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 1e12) return Math.max(0, n - now);        // epoch milliseconds
    if (n > 1e9) return Math.max(0, n * 1000 - now);  // epoch seconds
    return n * 1000;                                  // seconds
  }
  const parts = [...s.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|m|s)/gi)];
  if (parts.length && parts.map((p) => p[0]).join("").replace(/\s/g, "") === s.replace(/\s/g, "")) {
    return Math.round(parts.reduce((t, [, n, u]) => t + Number(n) * ({ ms: 1, s: 1000, m: MIN, h: HOUR } as Record<string, number>)[u.toLowerCase()], 0));
  }
  const date = Date.parse(s);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const num = (v: string | null) => (v != null && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

/** What's left, from the headers of any answer (good or bad). Daily numbers win over per-minute ones. */
export function readLimits(h: Headers, now = Date.now()): Limits {
  const sets: [string, string, string, boolean][] = [
    ["x-ratelimit-remaining-requests-day", "x-ratelimit-limit-requests-day", "x-ratelimit-reset-requests-day", true],
    ["x-ratelimit-remaining-requests", "x-ratelimit-limit-requests", "x-ratelimit-reset-requests", false],
    ["x-ratelimit-remaining", "x-ratelimit-limit", "x-ratelimit-reset", false],
  ];
  for (const [r, l, z, day] of sets) {
    const remaining = num(h.get(r));
    if (remaining == null) continue;
    const ms = untilMs(h.get(z), now);
    const limit = num(h.get(l));
    // Groq's request limit is per day; a reset hours away also means "per day"
    return { remaining, limit, resetAt: ms == null ? null : now + ms, daily: day || (ms ?? 0) > HOUR };
  }
  return { remaining: null, limit: null, resetAt: null, daily: false };
}

const DAILY = /per[\s_-]?day|daily|\bRPD\b|\bTPD\b|free-models-per-day|requests? per day|tokens? per day|quota/i;

/** Gemini: RetryInfo "retryDelay": "35s", or "retry in 35.2s" in the message. */
function bodyDelay(raw: string, now: number) {
  const m = raw.match(/"retryDelay"\s*:\s*"([^"]+)"/) ?? raw.match(/retry (?:in|after) ([\d.]+\s*(?:ms|s|m|h|seconds?|minutes?))/i);
  if (!m) return null;
  return untilMs(m[1].replace(/\s*seconds?/i, "s").replace(/\s*minutes?/i, "m"), now);
}

/**
 * After a failed call: how long to leave this AI alone (null = don't rest it, just try the next one for this request).
 * `status` 0 = couldn't reach it at all.
 */
export function restAfter(status: number, h: Headers, raw: string, now = Date.now()): Rest | null {
  const cap = (ms: number) => now + Math.min(Math.max(ms, 5_000), DAY);
  if (status === 429) {
    const lim = readLimits(h, now);
    const daily = DAILY.test(raw) || lim.daily;
    const hints = [
      untilMs(h.get("retry-after"), now),
      lim.remaining === 0 && lim.resetAt ? lim.resetAt - now : null,
      num(h.get("x-ratelimit-remaining-requests-day")) === 0 ? untilMs(h.get("x-ratelimit-reset-requests-day"), now) : null,
      bodyDelay(raw, now),
    ].filter((x): x is number => x != null);
    const ms = hints.length ? Math.max(...hints) : daily ? HOUR : MIN;
    return { until: cap(ms), why: daily ? "daily limit reached" : "limit reached", daily };
  }
  if (status === 402) return { until: cap(HOUR), why: "out of credits", daily: false };
  if (status === 401 || status === 403) return { until: cap(10 * MIN), why: "key refused (check its API_KEY)", daily: false };
  if (status === 404) return { until: cap(10 * MIN), why: "address or model not found", daily: false };
  if (status === 410) return { until: cap(DAY), why: "model retired (pick another in .env.local)", daily: false }; // "Gone": it won't come back
  if (status === 413 || (status === 400 && /context|too (long|large)|maximum.*tokens|reduce/i.test(raw))) return null; // this request is too big for it; others may take it
  if (status === 0 || status === 408 || status >= 500) return { until: cap(30_000), why: status ? `server trouble (${status})` : "couldn't reach it", daily: false };
  return null;
}
