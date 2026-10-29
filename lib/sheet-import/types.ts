// What we read from a character sheet PDF, before it becomes a character.
// Pure data: the player checks and edits all of it on the import screen before anything is saved.
import type { Ability } from "../rules";

/** One field from the PDF: its name, what's written in it, and where it sits (for ordering). */
export type PdfField = { name: string; value: string; page: number; y: number; checkbox?: boolean };

export type SheetAttack = { name: string; bonus: number | null; damage: string; damageType: string; notes: string };
export type SheetItem = { name: string; qty: number };
export type SheetFeature = { name: string; description: string };
export type Coins = { pp: number; gp: number; ep: number; sp: number; cp: number };

export type ImportedSheet = {
  name: string;
  playerName: string;
  species: string;
  background: string;
  alignment: string;
  /** Only the 12 SRD classes; anything else is listed in unknownClasses. */
  classes: { class: string; subclass: string; level: number }[];
  unknownClasses: string[];
  scores: Partial<Record<Ability, number>>;
  profBonus: number | null;
  saves: Ability[];
  skills: string[];
  expertise: string[];
  hp: number | null;
  ac: number | null;
  speed: number | null;
  attacks: SheetAttack[];
  spells: string[];
  spellAbility: Ability | null;
  equipment: SheetItem[];
  coins: Coins;
  features: SheetFeature[];
  /** Things the player should look at: guesses, unreadable bits, classes the app doesn't know. */
  warnings: string[];
  /** "form": read from the PDF's fields (exact). "ai": an AI read the text (check it). */
  source: "form" | "ai";
};

export const EMPTY_COINS: Coins = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

export function emptySheet(source: ImportedSheet["source"] = "form"): ImportedSheet {
  return {
    name: "", playerName: "", species: "", background: "", alignment: "", classes: [], unknownClasses: [], scores: {},
    profBonus: null, saves: [], skills: [], expertise: [], hp: null, ac: null, speed: null, attacks: [], spells: [],
    spellAbility: null, equipment: [], coins: { ...EMPTY_COINS }, features: [], warnings: [], source,
  };
}
