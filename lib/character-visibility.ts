// Who sees which characters on the "Your characters" screen (pure, tested).
// The DM sees every character in the campaign. A player sees only the characters they made or imported,
// plus characters the DM made for a player by name and nobody has claimed yet (so they can say "This is mine").
// Other players' characters and the DM's own characters / NPCs stay off a player's list.

export type ListRow = { ownerId: string | null; playerName: string | null };

export function charactersOnList<T extends ListRow>(rows: T[], userId: string, isDm: boolean): { mine: T[]; toClaim: T[]; all: T[] } {
  const mine = rows.filter((r) => r.ownerId === userId);
  const toClaim = rows.filter((r) => !r.ownerId && (isDm || !!r.playerName?.trim()));
  return { mine, toClaim, all: isDm ? rows : [...mine, ...toClaim] };
}
