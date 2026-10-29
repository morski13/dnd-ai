// Turns a checked sheet into what the app stores: attacks the app can roll, which items to equip,
// and the features list. Pure (tested); the server passes in the library rows it found.
import type { Attack } from "../rules";
import type { Ability } from "../rules";
import { parseDamage } from "./parse";
import type { SheetAttack, SheetFeature } from "./types";

export type LibWeapon = { name: string; damage?: string; type?: string; props?: string[]; range?: { normal?: number; long?: number } };

const mod = (n: number | undefined) => Math.floor(((n ?? 10) - 10) / 2);

/**
 * Sheet attack rows → app attacks.
 * - Spells (Fire Bolt, Sacred Flame…) are skipped: the Spells tab rolls them.
 * - A library weapon is equipped, so the app makes its attack from the weapon itself; an extra attack is only
 *   added when the sheet's numbers show a magic bonus the library weapon doesn't have.
 * - Anything else (homebrew, unarmed strike with a feat…) becomes an attack from the sheet's numbers.
 */
export function buildAttacks(rows: SheetAttack[], o: {
  scores: Partial<Record<Ability, number>>; prof: number; isSpell: (name: string) => boolean; weapon: (name: string) => LibWeapon | null;
}): { attacks: Attack[]; equip: string[]; skipped: string[] } {
  const attacks: Attack[] = [];
  const equip: string[] = [];
  const skipped: string[] = [];
  for (const r of rows) {
    if (o.isSpell(r.name)) { skipped.push(r.name); continue; }
    const lib = o.weapon(r.name);
    const d = parseDamage(r.damage);
    const props = lib?.props ?? [];
    const ranged = lib ? !!lib.range?.long && !props.includes("Thrown") : /bow|sling|dart|crossbow/i.test(r.name);
    const str = mod(o.scores.STR), dex = mod(o.scores.DEX);
    // which ability fits the sheet's bonus best
    let ability: Ability = ranged ? "DEX" : props.includes("Finesse") ? (dex > str ? "DEX" : "STR") : "STR";
    if (!lib && r.bonus != null) ability = Math.abs(o.prof + dex - r.bonus) < Math.abs(o.prof + str - r.bonus) ? "DEX" : "STR";
    const abMod = ability === "DEX" ? dex : str;
    const extra = r.bonus != null ? r.bonus - (o.prof + abMod) : 0; // magic +1, or a fighting style
    const flatExtra = d.flat - abMod;

    if (lib) {
      equip.push(lib.name);
      // the equipped weapon covers it unless the numbers are clearly different (a +1 weapon on the sheet)
      if (extra === 0 && (flatExtra === 0 || !d.dice)) continue;
    }
    if (!d.dice && !d.flat && !lib) { skipped.push(r.name); continue; }
    const dice = d.dice || lib?.damage || "";
    const dmg = dice ? `${dice}${flatExtra ? (flatExtra > 0 ? `+${flatExtra}` : `${flatExtra}`) : ""}` : String(Math.max(0, d.flat));
    attacks.push({
      name: r.name, kind: "weapon", damage: dmg, damage_type: r.damageType || lib?.type?.toLowerCase() || undefined,
      ability: props.includes("Finesse") ? "finesse" : ability, add_mod: !!dice, ...(ranged ? { ranged: true } : {}),
      ...(extra && extra >= -5 && extra <= 5 ? { bonus: extra } : {}),
      ...(lib?.range?.long ? { range: `${lib.range.normal}/${lib.range.long} ft` } : {}),
    });
  }
  return { attacks, equip: [...new Set(equip)], skipped };
}

/** The sheet's features, labelled so the player can tell them from the app's own, plus anything we couldn't place. */
export function buildFeatures(features: SheetFeature[], leftovers: { spells: string[]; classes: string[] }) {
  const out = features.map((f) => ({ name: f.name, source: "From your sheet", description: f.description }));
  if (leftovers.spells.length) out.push({ name: "Spells not in the app's library", source: "From your sheet", description: `${leftovers.spells.join(", ")}. The app only knows spells from the free rules (SRD), so these stay here as a note.` });
  if (leftovers.classes.length) out.push({ name: "Classes the app doesn't have yet", source: "From your sheet", description: leftovers.classes.join(", ") });
  return out.slice(0, 80);
}
