#!/usr/bin/env python3
"""Character builder data (species, backgrounds, class proficiencies and starting equipment) for 2014 and 2024 rules.

Source: the 5e-bits database (https://github.com/5e-bits/5e-database, MIT; SRD 5.1 / 5.2.1 text, CC-BY-4.0).
Run:  python3 scripts/gen_builder_data.py <path to 5e-database> <file with srd_items ids "id|name|kind" per line>
Writes lib/builder/data-2014.json and lib/builder/data-2024.json.
The item ids file comes from:  psql ... -tAc "select id||'|'||name||'|'||kind from srd_items"
"""
import json, re, sys, os

DB, IDS = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "builder")
os.makedirs(OUT, exist_ok=True)
ITEM_IDS = {l.split("|")[0] for l in open(IDS) if "|" in l}
ALL_SKILLS = ["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight", "Intimidation", "Investigation",
              "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival"]
ABIL = {"str": "STR", "dex": "DEX", "con": "CON", "int": "INT", "wis": "WIS", "cha": "CHA"}


def load(ed, name):
    return json.load(open(os.path.join(DB, "src", ed, "en", f"5e-SRD-{name}.json")))


def text(v):
    if isinstance(v, list):
        return "\n".join(v)
    return (v or "").strip()


def skill_of(prof_name):
    m = re.match(r"Skill: (.+)", prof_name)
    return m.group(1) if m else None


def build(ed):
    classes = load(ed, "Classes")
    cats = {c["index"]: c for c in load(ed, "Equipment-Categories")}
    equip = {e["index"]: e for e in load(ed, "Equipment")}
    traits = {t["index"]: t for t in load(ed, "Traits")}
    used_cats = set()
    merged = set()

    def ref(index):
        rid = f"{ed}:{index}"
        return f"srd:{rid}" if rid in ITEM_IDS else None

    def stats(index):
        """What the builder needs to work out AC and attacks: armor class, or weapon damage."""
        e = equip.get(index) or {}
        out = {}
        if e.get("armor_class"):
            ac = e["armor_class"]
            cat = e.get("armor_category") or next((c["name"] for c in e.get("equipment_categories", []) if c["index"] in ("light-armor", "medium-armor", "heavy-armor", "shields")), "")
            out["ac"] = {"base": ac.get("base", 10), "dex": bool(ac.get("dex_bonus")), **({"max": ac["max_bonus"]} if ac.get("max_bonus") is not None and ac.get("dex_bonus") else {})}
            out["armor"] = "Shield" if "shield" in index.lower() or cat.lower().startswith("shield") else cat.split(" ")[0]
        if e.get("damage") or e.get("damage_dice"):
            d = e.get("damage") or {}
            props = [p["name"] for p in e.get("properties", [])]
            rng = e.get("range") if isinstance(e.get("range"), dict) else {}
            ranged = e.get("weapon_range") == "Ranged" or any(c["index"].endswith("ranged-weapons") for c in e.get("equipment_categories", []))
            out["w"] = {"damage": d.get("damage_dice") or e.get("damage_dice"), "type": (d.get("damage_type") or {}).get("name", ""),
                        "props": props, "ranged": bool(ranged), **({"range": f"{rng['normal']}/{rng['long']} ft"} if rng.get("long") else {})}
        return out

    def item(index, name, qty, note=None):
        r = ref(index)
        nm = equip.get(index, {}).get("name", name)
        out = {"name": nm + (f" ({note})" if note and not r else ""), "qty": qty, **stats(index)}
        if r:
            out["ref"] = r
        return out

    def category_pick(cat_index, choose, label):
        used_cats.add(cat_index)
        return {"category": cat_index, "choose": choose, "label": label or cats.get(cat_index, {}).get("name", cat_index)}

    def pack_from(opt, label):
        """One option of an equipment choice → {label, items, gp, picks}."""
        p = {"label": label, "items": [], "gp": 0, "picks": []}

        def add(o):
            t = o.get("option_type")
            if t == "counted_reference":
                of = o["of"]
                if "/equipment-categories/" in of.get("url", ""):
                    p["picks"].append(category_pick(of["index"], o.get("count", 1), of.get("name")))
                else:
                    p["items"].append(item(of["index"], of["name"], o.get("count", 1), of.get("note")))
            elif t == "multiple":
                for x in o["items"]:
                    add(x)
            elif t == "money":
                p["gp"] += o["count"] if o.get("unit", "gp") == "gp" else 0
            elif t == "choice":
                ch = o["choice"]
                frm = ch["from"]
                if frm.get("option_set_type") == "equipment_category":
                    p["picks"].append(category_pick(frm["equipment_category"]["index"], ch.get("choose", 1), ch.get("desc")))
                elif frm.get("option_set_type") == "options_array":
                    # "Artisan's Tools or Musical Instrument": one pick from the categories put together
                    subs = [pack_from(x, chr(97 + i)) for i, x in enumerate(frm["options"])]
                    if all(len(x["picks"]) == 1 and not x["items"] and "category" in x["picks"][0] for x in subs):
                        key = "+".join(x["picks"][0]["category"] for x in subs)
                        for x in subs:
                            used_cats.add(x["picks"][0]["category"])
                        merged.add(key)
                        p["picks"].append({"category": key, "choose": ch.get("choose", 1), "label": ch.get("desc") or " or ".join(x["picks"][0]["label"] for x in subs)})
                    else:
                        for x in subs[:1]:  # can't merge: take the first option as written
                            p["items"] += x["items"]; p["picks"] += x["picks"]; p["gp"] += x["gp"]
            elif t == "reference":
                it = o["item"]
                p["items"].append(item(it["index"], it["name"], 1))
        add(opt)
        return p

    def groups_from(options):
        out = []
        for g in options or []:
            frm = g["from"]
            if frm.get("option_set_type") == "equipment_category":
                out.append({"desc": g.get("desc") or f"Pick {g.get('choose', 1)}: {frm['equipment_category']['name']}",
                            "options": [{"label": "", "items": [], "gp": 0, "picks": [category_pick(frm["equipment_category"]["index"], g.get("choose", 1), frm["equipment_category"]["name"])]}]})
                continue
            opts = [pack_from(o, chr(65 + i)) for i, o in enumerate(frm.get("options", []))]
            out.append({"desc": g.get("desc", ""), "options": opts})
        return out

    cls_out = {}
    for c in classes:
        profs = [p["name"] for p in c.get("proficiencies", []) if not p["index"].startswith("saving-throw")]
        skills = None
        for pc in c.get("proficiency_choices", []):
            names = [skill_of(o["item"]["name"]) for o in pc["from"].get("options", []) if o.get("option_type") == "reference"]
            names = [n for n in names if n]
            if names:
                skills = {"choose": pc["choose"], "from": [s if s in ALL_SKILLS else s.replace(" Of ", " of ") for s in names]}
        fixed = [item(e["equipment"]["index"], e["equipment"]["name"], e.get("quantity", 1)) for e in c.get("starting_equipment", []) or []]
        cls_out[c["name"]] = {
            "primary": (c.get("primary_ability") or {}).get("desc") if ed == "2024" else None,
            "proficiencies": profs,
            "skills": skills,
            "equipmentFixed": fixed,
            "equipment": groups_from(c.get("starting_equipment_options")),
        }

    # ---- species / races
    species = []
    if ed == "2024":
        subs = load(ed, "Subspecies")
        for s in load(ed, "Species"):
            sp = {"name": s["name"], "speed": s.get("speed", 30), "size": s.get("size") or "Medium",
                  "traits": [{"name": t["name"], "text": text(traits.get(t["index"], {}).get("description"))} for t in s.get("traits", [])],
                  "asi": [], "subs": []}
            for sub in [x for x in subs if x["species"]["index"] == s["index"]]:
                sp["subs"].append({"name": sub["name"], "traits": [{"name": t["name"], "text": text(traits.get(t["index"], {}).get("description"))} for t in sub.get("traits", []) if t.get("level", 1) <= 1]})
            species.append(sp)
    else:
        subraces = {r["index"]: r for r in load(ed, "Subraces")}
        for r in load(ed, "Races"):
            sp = {"name": r["name"], "speed": r.get("speed", 30), "size": r.get("size") or "Medium",
                  "traits": [{"name": t["name"], "text": text(traits.get(t["index"], {}).get("desc"))} for t in r.get("traits", [])],
                  "asi": [{"a": ABIL[a["ability_score"]["index"]], "b": a["bonus"]} for a in r.get("ability_bonuses", [])],
                  "languages": r.get("language_desc", ""), "subs": []}
            abo = r.get("ability_bonus_options")
            if abo:
                sp["asiChoice"] = {"choose": abo["choose"], "bonus": abo["from"]["options"][0]["bonus"],
                                   "from": [ABIL[o["ability_score"]["index"]] for o in abo["from"]["options"]]}
            for sr in r.get("subraces", []):
                d = subraces[sr["index"]]
                sp["subs"].append({"name": d["name"], "asi": [{"a": ABIL[a["ability_score"]["index"]], "b": a["bonus"]} for a in d.get("ability_bonuses", [])],
                                   "traits": [{"name": t["name"], "text": text(traits.get(t["index"], {}).get("desc"))} for t in d.get("racial_traits", [])]})
            # Dragonborn: the ancestry table works like a subrace pick
            anc = traits.get("draconic-ancestry")
            if r["index"] == "dragonborn" and anc:
                for o in anc["trait_specific"]["subtrait_options"]["from"]["options"]:
                    t = traits[o["item"]["index"]]
                    dt = (t.get("trait_specific") or {}).get("damage_type", {}).get("name", "")
                    sp["subs"].append({"name": t["name"], "asi": [], "traits": [{"name": "Draconic Ancestry", "text": f"Your breath weapon and damage resistance: {dt}." if dt else text(t.get("desc"))}]})
            species.append(sp)

    # ---- backgrounds
    backgrounds = []
    for b in load(ed, "Backgrounds"):
        if ed == "2024":
            profs = [p["name"] for p in b.get("proficiencies", [])]
            backgrounds.append({
                "name": b["name"], "abilities": [ABIL[a["index"]] for a in b.get("ability_scores", [])],
                "feat": {"name": b["feat"]["name"], "note": b["feat"].get("note")} if b.get("feat") else None,
                "skills": [skill_of(p) for p in profs if skill_of(p)],
                "tools": [re.sub(r"^Tool: ", "", p) for p in profs if p.startswith("Tool")] + [o.get("desc", "") for o in b.get("proficiency_choices", []) or []],
                "equipment": groups_from(b.get("equipment_options")),
            })
        else:
            profs = [p["name"] for p in b.get("starting_proficiencies", [])]
            fixed = [item(e["equipment"]["index"], e["equipment"]["name"], e.get("quantity", 1)) for e in b.get("starting_equipment", [])]
            tables = {}
            for k in ["personality_traits", "ideals", "bonds", "flaws"]:
                v = b.get(k) or {}
                opts = v.get("from", {}).get("options", [])
                tables[k] = [o.get("string") or o.get("desc") for o in opts if (o.get("string") or o.get("desc"))]
            backgrounds.append({
                "name": b["name"], "skills": [skill_of(p) for p in profs if skill_of(p)], "tools": [p for p in profs if not skill_of(p)],
                "languages": (b.get("language_options") or {}).get("choose", 0),
                "equipmentFixed": fixed, "gp": (b.get("starting_gold") or {}).get("quantity", 0),
                "equipment": groups_from(b.get("starting_equipment_options")),
                "feature": {"name": b["feature"]["name"], "text": text(b["feature"]["desc"])} if b.get("feature") else None,
                "tables": tables,
            })

    categories = {}
    for ci in sorted(used_cats):
        cat = cats.get(ci)
        if not cat:
            continue
        lst = []
        for e in cat.get("equipment", []):
            if "/magic-items/" in e.get("url", "") or "/equipment-categories/" in e.get("url", ""):
                continue
            r = ref(e["index"])
            lst.append({"name": e["name"], **({"ref": r} if r else {}), **stats(e["index"])})
        categories[ci] = {"name": cat["name"], "items": lst}

    for key in sorted(merged):
        parts = [categories[k] for k in key.split("+") if k in categories]
        categories[key] = {"name": " or ".join(p["name"] for p in parts), "items": [i for p in parts for i in p["items"]]}

    languages = [l["name"] for l in load(ed, "Languages")]
    return {"rules": ed, "source": "5e-bits database (MIT), SRD 5.1 / 5.2.1 by Wizards of the Coast LLC (CC-BY-4.0)",
            "classes": cls_out, "species": species, "backgrounds": backgrounds, "categories": categories, "languages": languages}


for ed in ["2014", "2024"]:
    d = build(ed)
    json.dump(d, open(os.path.join(OUT, f"data-{ed}.json"), "w"), ensure_ascii=False, indent=0, separators=(",", ":"))
    print(ed, "classes", len(d["classes"]), "species", len(d["species"]), "backgrounds", len(d["backgrounds"]), "categories", len(d["categories"]),
          "unlinked items", sorted({i["name"] for c in d["classes"].values() for g in c["equipment"] for o in g["options"] for i in o["items"] if "ref" not in i})[:20])
