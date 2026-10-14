// Hard rule checks the app makes itself before the AI answers (pure, tested). They're certain, so the AI is
// told to follow them. They cover the combo questions people ask most: two spells in one turn, two
// concentration spells, two bonus actions, spells while raging.

export type Rules = "2014" | "2024";
export type NamedThing = {
  name: string;
  kind: "spell" | "feature" | "feat";
  level?: number;                 // spells: 0 = cantrip
  castingTime?: string | null;    // spells: "Bonus Action", "1 action", "Reaction, which you take when…"
  concentration?: boolean;
  text?: string;                  // features: their rules text (for "as a Bonus Action")
};

export type Timing = "action" | "bonus" | "reaction" | "long" | "free" | null;

export function timingOf(t: NamedThing): Timing {
  if (t.kind === "spell") {
    const c = (t.castingTime ?? "").toLowerCase();
    if (/bonus/.test(c)) return "bonus";
    if (/reaction/.test(c)) return "reaction";
    if (/minute|hour/.test(c)) return "long";
    if (/action/.test(c)) return "action";
    return null;
  }
  const x = (t.text ?? "").toLowerCase();
  if (/(as|take|use) a bonus action|bonus action to/.test(x)) return "bonus";
  if (/(as|take|use) a reaction|your reaction/.test(x)) return "reaction";
  if (/(take|use) an action|as an action|magic action/.test(x)) return "action";
  return null;
}

const label = (t: Timing) => (t === "bonus" ? "a Bonus Action" : t === "reaction" ? "a Reaction" : t === "long" ? "more than one turn" : t === "action" ? "an action" : "");
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Facts the AI must respect, as short plain sentences. */
export function comboChecks(things: NamedThing[], rules: Rules, opts: { raging?: boolean } = {}): string[] {
  const out: string[] = [];
  const uniq = [...new Map(things.map((t) => [t.name.toLowerCase(), t])).values()];

  for (const t of uniq) {
    const tm = timingOf(t);
    if (t.kind === "spell" && tm) out.push(`${t.name} ${t.level ? `is a level ${t.level} spell` : "is a cantrip"} and takes ${label(tm)} to cast${t.concentration ? " (Concentration)" : ""}.`);
    else if (tm === "bonus" || tm === "reaction") out.push(`${t.name} uses ${label(tm)}.`);
  }

  const spells = uniq.filter((t) => t.kind === "spell");
  const leveled = spells.filter((t) => (t.level ?? 0) > 0);
  if (spells.length >= 2) {
    if (rules === "2024") {
      if (leveled.length >= 2) out.push(`2024 rule: on one turn you can expend only one spell slot to cast a spell, so ${list(leveled.map((s) => s.name))} can't all be cast with spell slots on the same turn (a Reaction spell on someone else's turn is a different turn).`);
    } else {
      const bonus = spells.filter((s) => timingOf(s) === "bonus");
      if (bonus.length) out.push(`2014 rule: if you cast a spell as a Bonus Action (${list(bonus.map((s) => s.name))}), the only other spell you can cast that turn is a cantrip with a casting time of 1 action.`);
    }
  }
  const conc = spells.filter((s) => s.concentration);
  if (conc.length >= 2) out.push(`${list(conc.map((s) => s.name))} all need Concentration: you can concentrate on only one at a time, and casting the second ends the first.`);

  const bonus = uniq.filter((t) => timingOf(t) === "bonus");
  if (bonus.length >= 2) out.push(`${list(bonus.map((t) => t.name))} each use a Bonus Action, and you get only one Bonus Action per turn.`);
  const reactions = uniq.filter((t) => timingOf(t) === "reaction");
  if (reactions.length >= 2) out.push(`${list(reactions.map((t) => t.name))} each use a Reaction; you get one Reaction per round (it comes back at the start of your turn).`);

  const rage = opts.raging || uniq.some((t) => t.kind === "feature" && /^rage$/i.test(t.name));
  if (rage && spells.length) out.push(`While raging, a Barbarian can't cast spells or keep Concentration, so ${list(spells.map((s) => s.name))} won't work during Rage.`);

  return [...new Set(out)];
}

/** Extra words for the rules search, from what the question names (two spells → the spell-slot rule, etc.). */
export function expandQuery(question: string, things: NamedThing[]): string {
  const extra: string[] = [];
  const spells = things.filter((t) => t.kind === "spell");
  if (spells.length >= 2) extra.push("one spell with a spell slot per turn casting time");
  if (things.some((t) => timingOf(t) === "bonus")) extra.push("bonus action");
  if (things.some((t) => timingOf(t) === "reaction")) extra.push("reaction trigger");
  if (spells.some((t) => t.concentration)) extra.push("concentration");
  return extra.length ? `${question} ${extra.join(" ")}` : question;
}
