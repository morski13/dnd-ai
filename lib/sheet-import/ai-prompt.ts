// What we ask an AI when a PDF has no fields to read (printed and scanned with text, "flattened", or a
// homemade sheet). It only gets the PDF's text, and must answer with JSON that cleanAiSheet() checks.
import type { ChatMessage } from "../ai/client";

export const MAX_SHEET_TEXT = 24_000;

const SHAPE = `{
  "name": "", "playerName": "", "species": "", "background": "", "alignment": "",
  "classes": [{ "class": "Ranger", "subclass": "Hunter", "level": 3 }],
  "scores": { "STR": 12, "DEX": 17, "CON": 14, "INT": 10, "WIS": 15, "CHA": 8 },
  "profBonus": 2,
  "saves": ["STR", "DEX"],
  "skills": ["Stealth", "Perception"],
  "expertise": ["Stealth"],
  "hp": 32, "ac": 15, "speed": 30,
  "attacks": [{ "name": "Longbow", "bonus": 5, "damage": "1d8+3", "damageType": "piercing" }],
  "spells": ["Hunter's Mark"], "spellAbility": "WIS",
  "equipment": [{ "name": "Arrows", "qty": 20 }],
  "coins": { "pp": 0, "gp": 37, "ep": 0, "sp": 5, "cp": 0 },
  "features": [{ "name": "Favored Enemy", "description": "short text from the sheet" }],
  "warnings": ["anything you were unsure about, in one short sentence each"]
}`;

export function sheetPrompt(text: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You read Dungeons & Dragons 5e character sheets. You get the text of one sheet (taken from a PDF, so the order may be jumbled).",
        "Answer with ONE JSON object shaped exactly like this example, nothing else:",
        SHAPE,
        "Rules:",
        "- Only copy what the sheet says. Never invent a value. If something isn't on the sheet, leave it out (or empty).",
        "- scores are the ability SCORES (3-20 usually), not the modifiers. If only a modifier is shown, leave that score out and add a warning.",
        "- saves and skills: only the ones the sheet marks as proficient (a filled dot, a tick, or a total that includes the proficiency bonus). expertise: skills with double proficiency.",
        "- classes: one entry per class with its level. Use the English class name.",
        "- attacks: weapon and attack rows only; bonus is the attack bonus number. Spells go in spells, not attacks.",
        "- spells: every spell name listed, cantrips too, names only.",
        "- equipment: one entry per item with its amount. Coins go in coins, not equipment.",
        "- features: class features, species traits and feats, each with a short description copied from the sheet (at most 300 characters).",
        "- If you're unsure about something, still give your best reading and say so in warnings.",
      ].join("\n"),
    },
    { role: "user", content: `Character sheet text:\n\n${text.slice(0, MAX_SHEET_TEXT)}` },
  ];
}
