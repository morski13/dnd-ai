import { describe, expect, it } from "vitest";
import { toConfirm } from "./sheet-confirm";

describe("confirm your numbers", () => {
  it("lists only numbers that differ, with a plain reason", () => {
    const rows = toConfirm({ ac: 17, speed: 45, hp_max: 112, sheet_values: { ac: 22, speed: 35, hp_max: 112 } });
    expect(rows.map((r) => [r.key, r.sheet, r.app])).toEqual([["ac", 22, 17], ["speed", 35, 45]]);
    expect(rows[0].why).toMatch(/adds \+5 AC/);
    expect(rows[1].why).toMatch(/10 ft more/);
    expect(toConfirm({ ac: 17, speed: 30, hp_max: 10, sheet_values: {} })).toEqual([]);
    expect(toConfirm({ ac: null, speed: 30, hp_max: 10, sheet_values: { ac: 15 } })).toEqual([]);
  });
});
