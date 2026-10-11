import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "./client";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const calls: Record<string, unknown>[] = [];

beforeEach(() => {
  calls.length = 0;
  process.env.AI_BASE_URL = "http://fake/v1"; process.env.AI_MODEL = "m"; process.env.AI_API_KEY = "k";
});
afterEach(() => vi.unstubAllGlobals());

function stub(...answers: Response[]) {
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: { body: string }) => { calls.push(JSON.parse(init.body)); return answers.shift()!; }));
}

describe("AI client", () => {
  it("strict JSON refused → asks again without strict mode and with more room", async () => {
    stub(reply(400, { error: { message: "Failed to validate JSON.", code: "json_validate_failed" } }), reply(200, { choices: [{ message: { content: '```json\n{"a":1}\n```' } }] }));
    expect(await chat([{ role: "user", content: "x" }], { json: true, maxTokens: 100 })).toContain('{"a":1}');
    expect(calls[0].response_format).toBeTruthy();
    expect(calls[1].response_format).toBeUndefined();
    expect(calls[1].max_tokens).toBe(200);
  });
  it("uses the refused answer when it is still a usable object", async () => {
    stub(reply(400, { error: { message: "Failed to validate JSON.", failed_generation: 'here: {"links":[]}' } }));
    expect(await chat([{ role: "user", content: "x" }], { json: true })).toContain('{"links":[]}');
    expect(calls).toHaveLength(1);
  });
  it("explains a wrong model and a cut-off answer", async () => {
    stub(reply(404, { error: { message: "The model `m` does not exist" } }));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/404: The model `m` does not exist.*AI_MODEL/);
    stub(reply(200, { choices: [{ message: { content: "" }, finish_reason: "length" }] }));
    await expect(chat([{ role: "user", content: "x" }])).rejects.toThrow(/ran out of room/);
  });
});
