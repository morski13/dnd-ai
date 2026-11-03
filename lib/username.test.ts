import { describe, expect, it } from "vitest";
import { cleanUsername, looksLikeEmail, placeholderEmail, usernameProblem } from "./username";

describe("usernames", () => {
  it("are case-insensitive and trimmed", () => expect(cleanUsername("  Marko_99 ")).toBe("marko_99"));
  it("accept letters, numbers, . _ -", () => {
    for (const ok of ["marko", "Lyra.Moon", "vex_2", "kazar-the-lion"]) expect(usernameProblem(ok), ok).toBeNull();
  });
  it("say what's wrong", () => {
    expect(usernameProblem("ab")).toMatch(/at least 3/);
    expect(usernameProblem("a".repeat(21))).toMatch(/20 characters/);
    expect(usernameProblem("two words")).toMatch(/no spaces/);
    expect(usernameProblem("_marko")).toMatch(/Start/);
    expect(usernameProblem("marko@mail")).toMatch(/only letters/);
  });
  it("build the placeholder email", () => expect(placeholderEmail("Marko", "users.example")).toBe("marko@users.example"));
  it("spot an old email login", () => {
    expect(looksLikeEmail("marko@gmail.com")).toBe(true);
    expect(looksLikeEmail("marko")).toBe(false);
  });
});
