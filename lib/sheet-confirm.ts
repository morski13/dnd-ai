// "Confirm your numbers" (pure, tested): numbers the paper sheet had (characters.sheet_values) that the app
// works out differently. The player picks one once ("Use sheet" / "Keep the app's"), and the note is gone for good.
export type ConfirmKey = "ac" | "speed" | "hp_max";
export type ConfirmRow = { key: ConfirmKey; label: string; sheet: number; app: number; why: string };

const LABEL: Record<ConfirmKey, string> = { ac: "AC", speed: "Speed", hp_max: "Max HP" };

/** Why they may differ, in plain words. */
export function reason(key: ConfirmKey, sheet: number, app: number): string {
  const d = sheet - app;
  if (key === "ac") return d > 0
    ? `Your sheet adds +${d} AC; the app only knows your armor, shield and DEX. Missing a magic item (Ring of Protection, +1 armor), a feat or a spell?`
    : `The app gives ${-d} more AC than your sheet. Maybe an item on the app isn't really worn, or the sheet is out of date.`;
  if (key === "speed") return d > 0
    ? `Your sheet is ${d} ft faster. A species or boots from a book, or a feat like Mobile?`
    : `The app has ${-d} ft more, from features like Fast Movement or Unarmored Movement. The sheet may not count them yet.`;
  return d > 0
    ? `Your sheet has ${d} more hit points. Rolled hit points, the Tough feat or a magic item?`
    : `The app has ${-d} more hit points (average per level). If you rolled lower, keep the sheet's.`;
}

/** What's still to confirm for this character. */
export function toConfirm(c: { ac: number | null; speed: number | null; hp_max: number | null; sheet_values?: Partial<Record<ConfirmKey, number>> | null }): ConfirmRow[] {
  const sv = c.sheet_values ?? {};
  return (["ac", "speed", "hp_max"] as ConfirmKey[]).flatMap((key) => {
    const sheet = sv[key], app = c[key];
    if (typeof sheet !== "number" || app == null || sheet === app) return [];
    return [{ key, label: LABEL[key], sheet, app, why: reason(key, sheet, app) }];
  });
}
