// The standard folders on the Campaign page, what an empty one offers, and its document template.
import { doc, field, h, p, secret, ul, type DocNode } from "./doc";

export type FolderKind = "plans" | "npcs" | "party" | "maps" | "places" | "shops" | "fights" | "goals" | "factions" | "lore" | "handouts" | "custom";

export type FolderDef = {
  kind: FolderKind;
  name: string;
  blurb: string;                         // shown under the name / in the empty state
  first: "doc" | "image";                // what the empty folder offers first
  newDocLabel: string;
  template: (title: string) => DocNode;
};

const notes = (title: string) => doc(h(1, title), p(""));

export const FOLDERS: FolderDef[] = [
  {
    kind: "plans", name: "Session plans", blurb: "Plan the next session: scenes, hooks, what must happen", first: "doc", newDocLabel: "New session plan",
    template: (title) => doc(h(1, title), h(2, "Must happen"), ul(""), h(2, "Scenes"), h(3, "Scene 1"), p(""), h(2, "If the party goes off track"), ul(""), h(2, "Loot & rewards"), ul("")),
  },
  {
    kind: "npcs", name: "NPCs", blurb: "Everyone the party meets, with portraits", first: "doc", newDocLabel: "New NPC",
    template: (title) => doc(h(1, title), field("Role"), field("Faction"), field("Lives in"), field("Relationship to the party"), h(2, "Description"), p(""),
      secret(h(3, "Secrets / real goal"), p(""))),
  },
  {
    kind: "party", name: "Player characters", blurb: "Backstories, family, bonds and secrets of the party", first: "doc", newDocLabel: "New character page",
    template: (title) => doc(h(1, title), field("Player"), field("Class & species"), h(2, "Backstory"), p(""), h(2, "Family & friends"), ul(""),
      h(2, "Goals & bonds"), ul(""), secret(h(3, "DM notes & hooks"), p(""))),
  },
  {
    kind: "maps", name: "Maps", blurb: "World, town and battle maps", first: "image", newDocLabel: "New map notes",
    template: notes,
  },
  {
    kind: "places", name: "Towns & places", blurb: "Towns, taverns, dungeons, landmarks", first: "doc", newDocLabel: "New place",
    template: (title) => doc(h(1, title), field("Type"), field("Located in"), h(2, "Description"), p(""), h(2, "Important NPCs here"), ul(""),
      secret(h(3, "Secrets"), p(""))),
  },
  {
    kind: "shops", name: "Shops", blurb: "Shops, merchants and price lists (secret until you open them)", first: "doc", newDocLabel: "New shop notes",
    template: (title) => doc(h(1, title), field("Owner"), field("Located in"), h(2, "What they sell"), ul(""), secret(h(3, "Notes"), p(""))),
  },
  {
    kind: "fights", name: "Fights", blurb: "Your planned fights and how past ones went", first: "doc", newDocLabel: "New fight notes",
    template: (title) => doc(h(1, title), field("Where"), field("Enemies"), h(2, "Tactics"), ul(""), h(2, "Terrain"), p("")),
  },
  {
    kind: "goals", name: "Goals & milestones", blurb: "What must happen in the story, and what's done", first: "doc", newDocLabel: "New goal",
    template: (title) => doc(h(1, title), field("Given by"), field("Reward"), h(2, "What needs to happen"), ul(""), secret(h(3, "DM notes"), p(""))),
  },
  {
    kind: "factions", name: "Factions", blurb: "Groups, guilds, cults and who they serve", first: "doc", newDocLabel: "New faction",
    template: (title) => doc(h(1, title), field("Goal"), field("Leader"), field("Allies / enemies"), secret(h(3, "Hidden plans"), p(""))),
  },
  {
    kind: "lore", name: "Lore & notes", blurb: "History, items, rumors, anything else", first: "doc", newDocLabel: "New note",
    template: notes,
  },
  {
    kind: "handouts", name: "Handouts", blurb: "Letters, pictures and clues to show players", first: "image", newDocLabel: "New letter",
    template: (title) => doc(h(1, title), p("")),
  },
];

export const CUSTOM: FolderDef = { kind: "custom", name: "Folder", blurb: "Your own folder", first: "doc", newDocLabel: "New document", template: notes };

export const folderDef = (kind: string): FolderDef => FOLDERS.find((f) => f.kind === kind) ?? CUSTOM;
