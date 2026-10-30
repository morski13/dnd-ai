// The book template: its tabs and columns. One spec for both the Excel template (tools/books/template.ts)
// and the checker (lib/books/check.ts), so the two can't drift apart.
// Help texts are in Serbian (for the people filling the sheet); the data itself stays in English, like the app.

export const CLASS_NAMES = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"];
export const ABILITY_NAMES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
export const SCHOOLS = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"];
export const DAMAGE_TYPES = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"];
export const ITEM_KINDS = ["gear", "weapon", "armor", "ammo", "tool", "pack", "mount", "magic"];
export const RARITIES = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact", "Varies"];
export const MASTERIES = ["Cleave", "Graze", "Nick", "Push", "Sap", "Slow", "Topple", "Vex"];
export const FEAT_CATEGORIES = ["Origin", "General", "Fighting Style", "Epic Boon"];
export const ROLL_KINDS = ["none", "attack", "save", "heal", "damage"];
export const RULES = ["2014", "2024", "both"];
export const YES_NO = ["Yes", "No"];

export type Col = {
  key: string;
  header: string;
  required?: boolean;
  /** dropdown in Excel; the checker also only accepts these (case doesn't matter) */
  list?: string[];
  /** grey hint under the header (an example value) */
  hint: string;
  /** cell note with the explanation (Serbian) */
  help: string;
  width?: number;
  /** long text: wrap in Excel */
  long?: boolean;
};
export type Tab = { name: string; help: string; cols: Col[] };

const rules: Col = { key: "rules", header: "Rules", list: RULES, hint: "2024", width: 9,
  help: "Za koja pravila: 2014, 2024 ili both (oba). Prazno = ono što piše na tabu Book." };

export const TABS: Tab[] = [
  {
    name: "Spells",
    help: "Jedan red = jedan spell. Kolone od Roll pa nadesno su za automatska bacanja (napad, spas, lečenje); ako ih ostaviš prazne, provera pokuša da ih pogodi iz opisa i javi ti šta je pogodila.",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Ember Lance", help: "Ime spella tačno kao u knjizi (engleski).", width: 22 },
      { key: "level", header: "Level", required: true, hint: "2", help: "0 za cantrip, inače 1–9.", width: 7 },
      { key: "school", header: "School", required: true, list: SCHOOLS, hint: "Evocation", help: "Škola magije.", width: 14 },
      { key: "classes", header: "Classes", required: true, hint: "Sorcerer, Wizard", help: "Klase koje imaju spell, odvojene zarezom.", width: 20 },
      { key: "casting_time", header: "Casting Time", required: true, hint: "Action", help: "Action, Bonus Action, Reaction, 1 minute…", width: 14 },
      { key: "ritual", header: "Ritual", list: YES_NO, hint: "No", help: "Yes ako je ritual.", width: 8 },
      { key: "range", header: "Range", required: true, hint: "60 feet", help: "Domet.", width: 12 },
      { key: "components", header: "Components", required: true, hint: "V, S, M (a burnt match)", help: "V, S, M (…).", width: 20 },
      { key: "duration", header: "Duration", required: true, hint: "Instantaneous", help: "Trajanje. Ako počinje sa Concentration, spell je koncentracija.", width: 18 },
      { key: "concentration", header: "Concentration", list: YES_NO, hint: "", help: "Prazno = iz Duration.", width: 13 },
      { key: "description", header: "Description", required: true, long: true, hint: "A lance of fire… 3d8 Fire damage…", help: "Ceo opis. Novi red u ćeliji: Alt+Enter.", width: 50 },
      { key: "higher_levels", header: "Higher Levels", long: true, hint: "The damage increases by 1d8 for each slot level above 2.", help: "Tekst za jače slotove / cantrip upgrade.", width: 30 },
      { key: "roll", header: "Roll", list: ROLL_KINDS, hint: "attack", help: "attack = spell attack, save = spasavanje, heal = lečenje, damage = šteta bez bacanja (Magic Missile), none = ništa. Prazno = pogodi iz opisa.", width: 9 },
      { key: "dice", header: "Dice", hint: "3d8", help: "Kocke štete ili lečenja na najnižem nivou.", width: 8 },
      { key: "damage_type", header: "Damage Type", list: DAMAGE_TYPES, hint: "Fire", help: "Vrsta štete.", width: 12 },
      { key: "save", header: "Save", list: ABILITY_NAMES, hint: "", help: "Za roll = save: koji atribut se baca.", width: 7 },
      { key: "half", header: "Half on Save", list: YES_NO, hint: "", help: "Yes ako uspešan spas daje pola štete.", width: 10 },
      { key: "per_level", header: "Per Slot Level", hint: "1d8", help: "Koliko se dodaje za svaki viši slot.", width: 12 },
      { key: "add_mod", header: "Add Ability Mod", list: YES_NO, hint: "No", help: "Yes ako se dodaje modifikator (npr. Cure Wounds).", width: 12 },
    ],
  },
  {
    name: "Items",
    help: "Jedan red = jedan predmet. Za oružje popuni Damage…Mastery, za oklop AC/Adds DEX/Max DEX. Magic items: Kind = magic.",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Stormglass Dagger", help: "Ime predmeta.", width: 22 },
      rules,
      { key: "kind", header: "Kind", required: true, list: ITEM_KINDS, hint: "magic", help: "gear, weapon, armor, ammo, tool, pack, mount ili magic.", width: 9 },
      { key: "category", header: "Category", hint: "Weapons", help: "Npr. Martial Melee Weapon, Light Armor, Wondrous Items, Adventuring Gear.", width: 20 },
      { key: "rarity", header: "Rarity", list: RARITIES, hint: "Uncommon", help: "Za magične predmete.", width: 11 },
      { key: "attunement", header: "Attunement", list: YES_NO, hint: "Yes", help: "Yes ako traži attunement.", width: 11 },
      { key: "cost", header: "Cost", hint: "25 gp", help: "Cena: broj + cp/sp/ep/gp/pp (npr. 5 sp).", width: 9 },
      { key: "weight", header: "Weight", hint: "1", help: "Težina u funtama (lb).", width: 8 },
      { key: "bundle", header: "Bundle", hint: "", help: "Prodaje se u paketu od N komada (20 strela).", width: 8 },
      { key: "summary", header: "Summary", hint: "Weapon (Dagger)", help: "Jedan red pregleda. Prazno = napravi se samo za oružje/oklop.", width: 22 },
      { key: "description", header: "Description", long: true, hint: "You have a +1 bonus… lightning…", help: "Ceo opis (za obične predmete može prazno).", width: 50 },
      { key: "damage", header: "Damage", hint: "1d4", help: "Oružje: kocke štete.", width: 8 },
      { key: "damage_type", header: "Damage Type", list: DAMAGE_TYPES, hint: "Piercing", help: "Oružje: vrsta štete.", width: 12 },
      { key: "properties", header: "Properties", hint: "Finesse, Light, Thrown", help: "Oružje: osobine, odvojene zarezom.", width: 20 },
      { key: "range", header: "Range", hint: "20/60", help: "Domet: normalni/dugi u stopama (20/60).", width: 8 },
      { key: "versatile", header: "Versatile", hint: "", help: "Kocke u dve ruke (1d10).", width: 9 },
      { key: "mastery", header: "Mastery", list: MASTERIES, hint: "Nick", help: "2024 weapon mastery.", width: 9 },
      { key: "ac", header: "AC", hint: "", help: "Oklop: osnovni AC (štit: 2).", width: 6 },
      { key: "dex", header: "Adds DEX", list: YES_NO, hint: "", help: "Oklop: da li se dodaje DEX.", width: 9 },
      { key: "max_dex", header: "Max DEX", hint: "", help: "Oklop: najviše DEX (2 za srednji oklop). Prazno = bez granice.", width: 8 },
    ],
  },
  {
    name: "Monsters",
    help: "Jedan red = jedno čudovište. Actions upiši kao u knjizi, svaki napad u svom pasusu (Alt+Enter): provera iz njih sama izvuče napade za Battle planner. Ako nešto ne prepozna, dodaj red na tabu Monster Attacks.",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Bog Lurker", help: "Ime.", width: 20 },
      { key: "size_type", header: "Size & Type", required: true, hint: "Medium Monstrosity, Neutral Evil", help: "Veličina, tip, alignment.", width: 26 },
      { key: "ac", header: "AC", required: true, hint: "13", help: "Armor Class (samo broj).", width: 6 },
      { key: "hp", header: "HP", required: true, hint: "45", help: "Prosečni HP.", width: 6 },
      { key: "hit_dice", header: "Hit Dice", hint: "7d8 + 14", help: "Kocke za HP.", width: 10 },
      { key: "speed", header: "Speed", required: true, hint: "30 ft., Swim 30 ft.", help: "Brzina.", width: 16 },
      ...ABILITY_NAMES.map((a): Col => ({ key: a.toLowerCase(), header: a, required: true, hint: a === "STR" ? "16" : "12", help: `${a} score (broj, npr. 16).`, width: 6 })),
      { key: "saves", header: "Saving Throws", hint: "DEX +4, WIS +2", help: "Samo oni koji su drugačiji od modifikatora.", width: 16 },
      { key: "skills", header: "Skills", hint: "Stealth +5", help: "Veštine.", width: 16 },
      { key: "resistances", header: "Resistances", hint: "", help: "Otpornosti.", width: 14 },
      { key: "immunities", header: "Immunities", hint: "", help: "Imuniteti (štete i stanja).", width: 14 },
      { key: "vulnerabilities", header: "Vulnerabilities", hint: "", help: "Ranjivosti.", width: 14 },
      { key: "senses", header: "Senses", hint: "Darkvision 60 ft.; Passive Perception 11", help: "Čula.", width: 22 },
      { key: "languages", header: "Languages", hint: "—", help: "Jezici.", width: 14 },
      { key: "cr", header: "CR", required: true, hint: "2", help: "Challenge rating: 0, 1/8, 1/4, 1/2, 1–30.", width: 6 },
      { key: "initiative", header: "Initiative", hint: "", help: "Bonus inicijative. Prazno = DEX modifikator.", width: 9 },
      { key: "traits", header: "Traits", long: true, hint: "Hold Breath. The lurker can hold its breath for 1 hour.", help: "Osobine, svaka u svom pasusu: Ime. Tekst", width: 40 },
      { key: "actions", header: "Actions", required: true, long: true, hint: "Bite. Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Piercing damage.", help: "Akcije, svaka u svom pasusu. 2014 i 2024 format se prepoznaju.", width: 50 },
      { key: "bonus_actions", header: "Bonus Actions", long: true, hint: "", help: "Bonus akcije.", width: 30 },
      { key: "reactions", header: "Reactions", long: true, hint: "", help: "Reakcije.", width: 30 },
      { key: "legendary_actions", header: "Legendary Actions", long: true, hint: "", help: "Legendarne akcije.", width: 30 },
      { key: "legendary_uses", header: "Legendary Uses", hint: "", help: "Koliko legendarnih akcija po rundi (obično 3).", width: 9 },
    ],
  },
  {
    name: "Monster Attacks",
    help: "Nije obavezno. Samo ako provera kaže da nije prepoznala napad nekog čudovišta: tada ovde upiši njegove napade. Redovi ovde zamenjuju ono što je provera izvukla iz teksta.",
    cols: [
      { key: "monster", header: "Monster", required: true, hint: "Bog Lurker", help: "Ime čudovišta sa taba Monsters.", width: 20 },
      { key: "action", header: "Action", required: true, hint: "Bite", help: "Ime napada.", width: 18 },
      { key: "type", header: "Type", required: true, list: ["attack", "save", "multiattack"], hint: "attack", help: "attack, save (npr. dah) ili multiattack.", width: 11 },
      { key: "bonus", header: "To Hit", hint: "5", help: "attack: bonus za pogodak.", width: 7 },
      { key: "damage", header: "Damage", hint: "2d6+3", help: "Kocke štete sa bonusom.", width: 10 },
      { key: "damage_type", header: "Damage Type", list: DAMAGE_TYPES, hint: "Piercing", help: "Vrsta štete.", width: 12 },
      { key: "ranged", header: "Ranged", list: YES_NO, hint: "No", help: "Yes za napad iz daljine.", width: 8 },
      { key: "save", header: "Save", list: ABILITY_NAMES, hint: "", help: "save: koji atribut.", width: 7 },
      { key: "dc", header: "DC", hint: "", help: "save: DC.", width: 6 },
      { key: "half", header: "Half on Save", list: YES_NO, hint: "", help: "save: pola štete na uspeh.", width: 10 },
      { key: "targets", header: "Targets", hint: "", help: "save: koliko meta pogodi obično (dah: 2–3).", width: 8 },
      { key: "recharge", header: "Recharge", hint: "", help: "5 za Recharge 5–6, 6 za Recharge 6.", width: 9 },
      { key: "per_day", header: "Per Day", hint: "", help: "Koliko puta dnevno.", width: 8 },
      { key: "count", header: "Count", hint: "", help: "multiattack: koliko napada.", width: 7 },
      { key: "uses", header: "Uses", hint: "", help: "multiattack: imena napada koje koristi, odvojena zarezom.", width: 16 },
    ],
  },
  {
    name: "Subclasses",
    help: "Jedan red = jedna subklasa (osnovni podaci). Njene osobine idu na tab Subclass Features, izbori (manevri…) na Subclass Choices.",
    cols: [
      { key: "class", header: "Class", required: true, list: CLASS_NAMES, hint: "Fighter", help: "Klasa.", width: 12 },
      { key: "subclass", header: "Subclass", required: true, hint: "Tide Warden", help: "Ime subklase (bez \"Path of\" nije greška, ali piši kao u knjizi).", width: 22 },
      rules,
      { key: "flavor", header: "Short Description", hint: "Fight with the strength of the sea.", help: "Jedna rečenica za listu izbora.", width: 30 },
      { key: "text", header: "Overview", long: true, hint: "", help: "Uvodni tekst subklase (nije obavezan).", width: 40 },
    ],
  },
  {
    name: "Subclass Features",
    help: "Jedan red = jedna osobina subklase na jednom nivou (nivo KLASE, ne lika).",
    cols: [
      { key: "class", header: "Class", required: true, list: CLASS_NAMES, hint: "Fighter", help: "Klasa.", width: 12 },
      { key: "subclass", header: "Subclass", required: true, hint: "Tide Warden", help: "Mora postojati na tabu Subclasses.", width: 22 },
      rules,
      { key: "level", header: "Level", required: true, hint: "3", help: "Nivo klase na kom se dobija (1–20).", width: 7 },
      { key: "feature", header: "Feature", required: true, hint: "Undertow", help: "Ime osobine.", width: 22 },
      { key: "text", header: "Text", required: true, long: true, hint: "When you hit a creature…", help: "Ceo tekst osobine.", width: 60 },
    ],
  },
  {
    name: "Subclass Choices",
    help: "Nije obavezno. Za subklase koje biraju sa liste (manevri, rune…). Options: ili ime gotove liste (fighting-style, metamagic, invocations), ili svaka opcija u svom redu u ćeliji: Ime: tekst",
    cols: [
      { key: "class", header: "Class", required: true, list: CLASS_NAMES, hint: "Fighter", help: "Klasa.", width: 12 },
      { key: "subclass", header: "Subclass", required: true, hint: "Tide Warden", help: "Subklasa.", width: 22 },
      rules,
      { key: "level", header: "Level", required: true, hint: "3", help: "Nivo klase.", width: 7 },
      { key: "title", header: "Title", required: true, hint: "Tide Techniques", help: "Naslov izbora.", width: 20 },
      { key: "choose", header: "Choose", required: true, hint: "2", help: "Koliko opcija bira.", width: 8 },
      { key: "options", header: "Options", required: true, long: true, hint: "Riptide: Push the target 10 feet.\nUndertow: The target is slowed.", help: "Svaka opcija u svom redu (Alt+Enter): Ime: tekst. Ili ime liste: fighting-style.", width: 60 },
    ],
  },
  {
    name: "Feats",
    help: "Jedan red = jedan feat. 2024 kategorije: Origin, General, Fighting Style, Epic Boon.",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Tidecaller", help: "Ime.", width: 22 },
      rules,
      { key: "category", header: "Category", required: true, hint: "General", help: "Origin, General, Fighting Style, Epic Boon (2014: General).", width: 14 },
      { key: "prerequisite", header: "Prerequisite", hint: "Level 4+", help: "Uslov.", width: 18 },
      { key: "text", header: "Text", required: true, long: true, hint: "You gain the following benefits…", help: "Ceo tekst.", width: 60 },
    ],
  },
  {
    name: "Species",
    help: "Jedan red = nova rasa (species). Njene osobine idu na Species Traits. Za NOVU podrasu postojeće rase (npr. nova vilenjačka loza) ne pravi red ovde, nego samo na tabu Subspecies.",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Mirefolk", help: "Ime rase.", width: 16 },
      rules,
      { key: "size", header: "Size", required: true, list: ["Small", "Medium", "Small or Medium", "Large"], hint: "Medium", help: "Veličina.", width: 10 },
      { key: "speed", header: "Speed", required: true, hint: "30", help: "Brzina u stopama (broj).", width: 7 },
      { key: "ability_bonuses", header: "Ability Bonuses", hint: "CON +2, WIS +1", help: "2014: fiksni bonusi. 2024: prazno (bonusi dolaze od backgrounda).", width: 16 },
      { key: "ability_choice", header: "Ability Choice", hint: "", help: "2014: npr. \"2 +1\" = +1 na dva atributa po izboru.", width: 12 },
      { key: "languages", header: "Languages", hint: "Common, Aquan", help: "Jezici (tekst).", width: 18 },
      { key: "skills_given", header: "Skills Given", hint: "Survival", help: "Veštine koje rasa daje, odvojene zarezom.", width: 16 },
      { key: "skill_choice", header: "Skill Choice", hint: "", help: "Npr. \"1 from any\" ili \"1 from Insight, Perception, Survival\".", width: 22 },
      { key: "cantrips_given", header: "Cantrips Given", hint: "", help: "Cantripi koje rasa daje, odvojeni zarezom.", width: 16 },
      { key: "cantrip_from", header: "Cantrip From List", list: CLASS_NAMES, hint: "", help: "Igrač bira 1 cantrip sa liste ove klase.", width: 12 },
      { key: "origin_feat", header: "Origin Feat", list: YES_NO, hint: "", help: "Yes ako igrač bira origin feat (kao 2024 Human).", width: 10 },
      { key: "spell_ability", header: "Spell Ability Choice", list: YES_NO, hint: "", help: "Yes ako igrač bira atribut za spellove rase (INT/WIS/CHA).", width: 12 },
      { key: "hp_per_level", header: "HP per Level", hint: "", help: "Dodatni HP po nivou (kao Dwarven Toughness: 1).", width: 9 },
    ],
  },
  {
    name: "Subspecies",
    help: "Nije obavezno. Podrase/loze: za novu rasu iz ove knjige ili za postojeću rasu (Elf, Dwarf…).",
    cols: [
      { key: "species", header: "Species", required: true, hint: "Mirefolk", help: "Rasa (nova sa taba Species ili postojeća).", width: 16 },
      rules,
      { key: "subspecies", header: "Subspecies", required: true, hint: "Reedborn", help: "Ime podrase.", width: 18 },
      { key: "ability_bonuses", header: "Ability Bonuses", hint: "", help: "2014: dodatni bonusi podrase.", width: 16 },
      { key: "speed", header: "Speed", hint: "", help: "Ako menja brzinu.", width: 7 },
      { key: "skills_given", header: "Skills Given", hint: "", help: "Veštine.", width: 16 },
      { key: "cantrips_given", header: "Cantrips Given", hint: "", help: "Cantripi.", width: 16 },
      { key: "cantrip_from", header: "Cantrip From List", list: CLASS_NAMES, hint: "", help: "Bira 1 cantrip sa liste ove klase.", width: 12 },
      { key: "hp_per_level", header: "HP per Level", hint: "", help: "Dodatni HP po nivou.", width: 9 },
    ],
  },
  {
    name: "Species Traits",
    help: "Jedan red = jedna osobina rase ili podrase.",
    cols: [
      { key: "species", header: "Species", required: true, hint: "Mirefolk", help: "Rasa.", width: 16 },
      rules,
      { key: "subspecies", header: "Subspecies", hint: "", help: "Prazno = osobina cele rase. Ime podrase = samo za nju.", width: 18 },
      { key: "trait", header: "Trait", required: true, hint: "Amphibious", help: "Ime osobine.", width: 20 },
      { key: "text", header: "Text", required: true, long: true, hint: "You can breathe air and water.", help: "Tekst.", width: 60 },
    ],
  },
  {
    name: "Backgrounds",
    help: "Jedan red = jedan background. Oprema: predmeti odvojeni zarezom, količina ispred (2 Daggers), novac kao \"15 GP\".",
    cols: [
      { key: "name", header: "Name", required: true, hint: "Dockhand", help: "Ime.", width: 16 },
      rules,
      { key: "skills", header: "Skills", required: true, hint: "Athletics, Survival", help: "Dve veštine, odvojene zarezom.", width: 20 },
      { key: "tools", header: "Tools", hint: "Navigator's Tools", help: "Alati.", width: 18 },
      { key: "abilities", header: "Abilities", hint: "STR, CON, WIS", help: "2024: tri atributa za +2/+1.", width: 14 },
      { key: "feat", header: "Origin Feat", hint: "Tough", help: "2024: origin feat (iz SRD-a ili sa taba Feats).", width: 14 },
      { key: "feat_note", header: "Feat Note", hint: "", help: "Npr. \"Cleric\" za Magic Initiate (Cleric).", width: 10 },
      { key: "languages", header: "Languages", hint: "", help: "2014: koliko jezika bira (broj).", width: 10 },
      { key: "equipment_a", header: "Equipment A", hint: "Navigator's Tools, Rope, Traveler's Clothes, 12 GP", help: "2024: opcija A. 2014: oprema koju dobija.", width: 34 },
      { key: "equipment_b", header: "Equipment B", hint: "50 GP", help: "2024: opcija B (obično 50 GP). 2014: prazno.", width: 12 },
      { key: "feature", header: "Feature", hint: "", help: "2014: ime osobine backgrounda.", width: 16 },
      { key: "feature_text", header: "Feature Text", long: true, hint: "", help: "2014: tekst osobine.", width: 40 },
    ],
  },
];

export const BOOK_FIELDS = [
  { key: "book", label: "Book name", help: "Puno ime knjige, npr. Xanathar's Guide to Everything ili Naš homebrew.", example: "My Homebrew" },
  { key: "code", label: "Short code", help: "Kratka oznaka, 2–8 slova/cifara, npr. XGE. Koristi se u imenu SQL fajla.", example: "HB" },
  { key: "rules", label: "Rules", help: "2014, 2024 ili both: podrazumevano za redove gde je kolona Rules prazna.", example: "2024" },
];
