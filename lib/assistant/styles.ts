// How the assistant talks: one plain, easy-to-read style for everyone.
// (The role-play voices — tavern keeper, dwarf, pirate… — were removed after the first real session:
// the answers were hard to read at the table.)

export type StyleId = "plain";

export type Style = {
  id: StyleId; name: string; who: string;
  /** how it talks */
  how: string;
};

export const STYLES: Style[] = [
  { id: "plain", name: "The Tavern", who: "Rules, your character and the campaign, answered plainly",
    how: "a clear, neutral rules helper. No character voice, no role-play, no accent, no jokes or flavour text. Lead with the answer (yes / no / the number), then the reason in short, simple sentences. Use the exact game terms (Action, Bonus Action, Reaction, Advantage, saving throw…) and the exact spell, feature and item names" },
];

export const DEFAULT_STYLE: StyleId = "plain";
/** Older chats saved a voice id; every answer now uses the plain style. */
export const styleOf = (id?: string | null): Style => STYLES.find((s) => s.id === id) ?? STYLES[0];
