import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiStatus, chat, chatWith } from "./client";
import { restAfter, readLimits, untilMs } from "./limits";
import { nameFromHost, readProviders } from "./providers";
import { clearAiMemory, memoryStore, setAiStore } from "./store";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const ok = (text: string, headers: Record<string, string> = {}) => reply(200, { choices: [{ message: { content: text } }] }, headers);
const calls: { url: string; body: Record<string, unknown> }[] = [];
const ENV = ["AI_BASE_URL", "AI_MODEL", "AI_API_KEY", "AI_2_BASE_URL", "AI_2_MODEL", "AI_2_API_KEY", "AI_2_SECRETS", "AI_2_NAME", "AI_3_BASE_URL", "AI_3_MODEL"];

beforeEach(() => {
  calls.length = 0;
  for (const k of ENV) delete process.env[k];
  process.env.AI_BASE_URL = "http://fake/v1"; process.env.AI_MODEL = "m"; process.env.AI_API_KEY = "k";
  setAiStore(memoryStore);
  clearAiMemory();
});
afterEach(() => { vi.unstubAllGlobals(); setAiStore(null); });

/** answers in order; a function answer can look at the address */
function stub(...answers: (Response | ((url: string) => Response | Promise<Response>))[]) {
  vi.stubGlobal("fetch", vi.fn(async (u: string, init: { body: string }) => {
    calls.push({ url: u, body: JSON.parse(init.body) });
    const a = answers.shift();
    if (!a) throw new Error("no more answers");
    return typeof a === "function" ? a(u) : a;
  }));
}
const two = () => { process.env.AI_2_BASE_URL = "http://backup/v1"; process.env.AI_2_MODEL = "b"; process.env.AI_2_API_KEY = "k2"; };

describe("AI client", () => {
  it("strict JSON refused → asks again without strict mode and with more room", async () => {
    stub(reply(400, { error: { message: "Failed to validate JSON.", code: "json_validate_failed" } }), ok('```json\n{"a":1}\n```'));
    expect(await chat([{ role: "user", content: "x" }], { json: true, maxTokens: 100 })).toContain('{"a":1}');
    expect(calls[0].body.response_format).toBeTruthy();
    expect(calls[1].body.response_format).toBeUndefined();
    expect(calls[1].body.max_tokens).toBe(200);
  });
  it("uses the refused answer when it is still a usable object", async () => {
    stub(reply(400, { error: { message: "Failed to validate JSON.", failed_generation: 'here: {"links":[]}' } }));
    expect(await chat([{ role: "user", content: "x" }], { json: true })).toContain('{"links":[]}');
    expect(calls).toHaveLength(1);
  });
  it("explains a wrong model and a cut-off answer", async () => {
    stub(reply(404, { error: { message: "The model `m` does not exist" } }));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/404: The model `m` does not exist.*AI_MODEL/);
    clearAiMemory();
    stub(reply(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] }));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/ran out of room/);
  });
});

describe("AI backups", () => {
  it("limit reached → the backup answers, and the tired one is skipped next time", async () => {
    two();
    stub(reply(429, { error: { message: "Rate limit reached for requests per day (RPD)" } }, { "retry-after": "120" }), ok("from backup"));
    const r = await chatWith([{ role: "user", content: "x" }]);
    expect(r.text).toBe("from backup");
    expect(r.by.model).toBe("b");
    expect(calls.map((c) => c.url)).toEqual(["http://fake/v1/chat/completions", "http://backup/v1/chat/completions"]);
    stub(ok("again"));
    expect(await chat([{ role: "user", content: "y" }])).toBe("again");
    expect(calls[2].url).toBe("http://backup/v1/chat/completions"); // AI 1 not asked again
    const st = await aiStatus();
    expect(st[0]).toMatchObject({ state: "resting", why: "daily limit reached", usedToday: 1 });
    expect(st[1]).toMatchObject({ state: "ready", usedToday: 2 });
  });
  it("comes back after its rest", async () => {
    two();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      stub(reply(429, { error: { message: "slow down" } }, { "retry-after": "30" }), ok("backup"));
      await chat([{ role: "user", content: "x" }]);
      vi.setSystemTime(Date.now() + 31_000);
      stub(ok("first again"));
      expect(await chat([{ role: "user", content: "x" }])).toBe("first again");
      expect(calls[2].url).toBe("http://fake/v1/chat/completions");
    } finally { vi.useRealTimers(); }
  });
  it("the last allowed call makes it rest without wasting another request", async () => {
    two();
    stub(ok("last one", { "x-ratelimit-remaining-requests-day": "0", "x-ratelimit-limit-requests-day": "1000", "x-ratelimit-reset-requests-day": "3600" }), ok("backup"));
    expect(await chat([{ role: "user", content: "x" }])).toBe("last one");
    expect(await chat([{ role: "user", content: "x" }])).toBe("backup");
    expect((await aiStatus())[0]).toMatchObject({ state: "resting", why: "daily limit reached", limit: 1000 });
  });
  it("can't reach one, or the request is too big for it → tries the next", async () => {
    two();
    process.env.AI_3_BASE_URL = "http://third/v1"; process.env.AI_3_MODEL = "c";
    stub(() => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); },
      reply(413, { error: { message: "Request too large for model: tokens per minute" } }), ok("third"));
    const r = await chatWith([{ role: "user", content: "x" }]);
    expect(r.by.model).toBe("c");
    const st = await aiStatus();
    expect(st[0].state).toBe("resting"); // unreachable: short rest
    expect(st[1].state).toBe("problem"); // too big: not rested, it can take smaller requests
  });
  it("never sends DM-only notes to an AI marked SECRETS=no", async () => {
    two();
    process.env.AI_2_SECRETS = "no";
    stub(reply(429, { error: { message: "limit" } }));
    await expect(chat([{ role: "user", content: "secret" }])).rejects.toThrow(/free limit.*other AI isn't allowed to read DM-only notes/);
    expect(calls).toHaveLength(1);
    clearAiMemory();
    stub(reply(429, { error: { message: "limit" } }), ok("shared only"));
    expect(await chat([{ role: "user", content: "shared" }], { secrets: false })).toBe("shared only");
  });
  it("everyone resting → says when they're back, without calling anyone", async () => {
    two();
    stub(reply(429, { error: { message: "limit" } }, { "retry-after": "600" }), reply(429, { error: { message: "limit" } }, { "retry-after": "60" }));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/None of your AIs could answer/);
    stub();
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/out of free uses.*back in 10 min.*back in 1 min/);
    expect(calls).toHaveLength(2);
  });
});

describe("AI list and limits", () => {
  it("reads the numbered backups and comma-separated models", () => {
    const ps = readProviders({ AI_BASE_URL: "https://api.groq.com/openai/v1/", AI_MODEL: "a, b", AI_API_KEY: "k", AI_3_BASE_URL: "https://openrouter.ai/api/v1", AI_3_MODEL: "x:free", AI_3_SECRETS: "no", AI_3_NAME: "OR" });
    expect(ps.map((p) => `${p.name}/${p.model}/${p.secrets}/${p.prefix}`)).toEqual(["groq/a/true/AI_", "groq/b/true/AI_", "OR/x:free/false/AI_3_"]);
    expect(ps[0].base).toBe("https://api.groq.com/openai/v1");
    expect([nameFromHost("api.cerebras.ai"), nameFromHost("generativelanguage.googleapis.com"), nameFromHost("localhost:11434"), nameFromHost("openrouter.ai")]).toEqual(["cerebras", "gemini", "ollama", "openrouter"]);
  });
  it("understands every provider's way of saying when it resets", () => {
    const now = 1_800_000_000_000;
    expect(untilMs("2m59.56s", now)).toBe(179_560);
    expect(untilMs("350ms", now)).toBe(350);
    expect(untilMs("1h2m", now)).toBe(3_720_000);
    expect(untilMs("42", now)).toBe(42_000);
    expect(untilMs(String(now + 5000), now)).toBe(5000);          // OpenRouter: epoch ms
    expect(untilMs(String(now / 1000 + 9), now)).toBe(9000);      // epoch seconds
    expect(untilMs("soon", now)).toBeNull();
    const groq = readLimits(new Headers({ "x-ratelimit-remaining-requests": "12", "x-ratelimit-limit-requests": "1000", "x-ratelimit-reset-requests": "2m" }), now);
    expect(groq).toEqual({ remaining: 12, limit: 1000, resetAt: now + 120_000, daily: false });
    const cer = readLimits(new Headers({ "x-ratelimit-remaining-requests-day": "3", "x-ratelimit-remaining-requests": "99" }), now);
    expect(cer.remaining).toBe(3);
    expect(cer.daily).toBe(true);
    const gem = restAfter(429, new Headers(), JSON.stringify([{ error: { message: "You exceeded your current quota", details: [{ retryDelay: "35s" }] } }]), now);
    expect(gem?.until).toBe(now + 35_000);
    const or = restAfter(429, new Headers({ "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(now + 4 * 3_600_000) }), "Rate limit exceeded: free-models-per-day", now);
    expect(or).toMatchObject({ until: now + 4 * 3_600_000, daily: true });
    expect(restAfter(429, new Headers(), "slow down", now)?.until).toBe(now + 60_000);
    expect(restAfter(401, new Headers(), "", now)?.why).toMatch(/key/);
    expect(restAfter(413, new Headers(), "", now)).toBeNull();
    expect(restAfter(410, new Headers(), "end of life", now)).toMatchObject({ until: now + 24 * 3_600_000, why: expect.stringMatching(/retired/) });
    expect(restAfter(400, new Headers(), "bad request", now)).toBeNull();
  });
});
