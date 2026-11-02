// Reactions off your turn (pure, tested): when something attacks you, which of your reactions could help, and why.
import type { Option } from "./rules";

export type Incoming = { kind: "attack" | "damage" | "spell"; total: number | null; hit: boolean | null; ac: number | null; by: string };
export type ReactionHint = { name: string; key: string | null; why: string };

const featureNames = (features: (string | { name: string })[]) => new Set(features.map((f) => (typeof f === "string" ? f : f.name)));

export function reactionHints(options: Option[], features: (string | { name: string })[], incoming: Incoming, reactionUsed = false): ReactionHint[] {
  if (reactionUsed) return [];
  const has = featureNames(features);
  const opt = (name: string) => options.find((o) => o.name === name) ?? null;
  const out: ReactionHint[] = [];
  if (incoming.kind === "attack" && incoming.hit !== false) {
    const shield = opt("Shield");
    if (shield) {
      const beats = incoming.total != null && incoming.ac != null ? incoming.total - incoming.ac : null;
      out.push({ name: "Shield", key: shield.key, why: beats != null && beats < 5 ? `+5 AC: ${incoming.total} would miss you (AC ${incoming.ac! + 5}).` : "+5 AC until your next turn, against this and later attacks." });
    }
    if (has.has("Uncanny Dodge")) out.push({ name: "Uncanny Dodge", key: null, why: "Halve the damage of this hit (tell the DM before damage is applied)." });
    if (has.has("Defensive Duelist")) out.push({ name: "Defensive Duelist", key: null, why: "Add your proficiency bonus to AC against this melee attack (finesse weapon in hand)." });
    if (has.has("Parry")) out.push({ name: "Parry", key: null, why: "Reduce the damage with a Superiority Die." });
  }
  if (incoming.kind === "damage" || (incoming.kind === "attack" && incoming.hit)) {
    const rebuke = opt("Hellish Rebuke");
    if (rebuke) out.push({ name: "Hellish Rebuke", key: rebuke.key, why: `${incoming.by} just hurt you: 2d10 fire back.` });
    const absorb = opt("Absorb Elements");
    if (absorb) out.push({ name: "Absorb Elements", key: absorb.key, why: "Resist elemental damage and add it to your next hit." });
  }
  if (incoming.kind === "spell") {
    const counter = opt("Counterspell");
    if (counter) out.push({ name: "Counterspell", key: counter.key, why: `Stop ${incoming.by}'s spell.` });
  }
  // always worth remembering when they move away from you
  const melee = options.find((o) => o.kind === "weapon" && !o.ranged);
  if (melee && (incoming.kind === "attack" || incoming.kind === "damage")) out.push({ name: "Opportunity Attack", key: melee.key, why: `If ${incoming.by} moves out of your reach: one ${melee.name} attack.` });
  return out;
}
