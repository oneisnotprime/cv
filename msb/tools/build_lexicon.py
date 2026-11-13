#!/usr/bin/env python3
"""Build the word lists in ../data from WordNet + word frequencies.

usage: build_lexicon.py <wordnet dict dir>      (needs `pip install wordfreq`)

One row per (word, part of speech). Every row lands in exactly one file:
  lexicon.tsv  words with a game role          inert.tsv  no role yet
  proper.tsv   names of people/places (excluded)
"""
import sys, os, re, json, collections
from wordfreq import zipf_frequency
from wn import WordNet

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

# Nearest hypernym anchor decides a noun's archetype: (lemma, sense number) -> archetype.
ANCHORS = {
    "weapon": [("weapon", 1), ("explosive", 1), ("ammunition", 1)],
    "protection": [("armor", 1), ("protective_covering", 1)],
    "vehicle_air": [("aircraft", 1), ("spacecraft", 1)],
    "vehicle_water": [("vessel", 2)],
    "vehicle_land": [("vehicle", 1), ("conveyance", 3)],
    "building": [("building", 1), ("dwelling", 1)],
    "fortification": [("fortification", 1)],
    "structure": [("structure", 1)],
    "route": [("way", 6)],
    "clothing": [("clothing", 1), ("garment", 1)],
    "adornment": [("jewelry", 1)],
    "furniture": [("furniture", 1), ("furnishing", 2)],
    "container": [("container", 1)],
    "tool": [("tool", 1), ("implement", 1)],
    "machine": [("machine", 1)],
    "device": [("device", 1)],
    "light": [("light_source", 1), ("source_of_illumination", 1)],
    "instrument": [("musical_instrument", 1)],
    "toy": [("plaything", 1)],
    "medicine": [("drug", 1), ("medicine", 2)],
    "fabric": [("fabric", 1)],
    "document": [("document", 1), ("book", 1), ("book", 2)],
    "currency": [("money", 1), ("currency", 1)],
    "drink": [("beverage", 1)],
    "tree": [("tree", 1)], "flower": [("flower", 1)], "herb": [("herb", 1)],
    "shrub": [("shrub", 1)], "fungus": [("fungus", 1)],
    "produce": [("fruit", 1), ("vegetable", 1), ("vegetable", 2)],
    "bird": [("bird", 1)], "fish": [("fish", 1)], "insect": [("insect", 1)],
    "reptile": [("reptile", 1)], "mammal": [("mammal", 1)], "amphibian": [("amphibian", 3)],
    "invertebrate": [("invertebrate", 1)],
    "supernatural": [("spiritual_being", 1), ("imaginary_being", 1)],
    "fighter": [("warrior", 1), ("fighter", 1)],
    "leader": [("ruler", 1), ("leader", 1)],
    "criminal": [("criminal", 1)],
    "worker": [("worker", 1), ("professional", 1)],
    "water": [("body_of_water", 1)],
    "elevation": [("natural_elevation", 1)],
    "depression": [("natural_depression", 1)],
    "landform": [("geological_formation", 1), ("land", 4)],
    "celestial": [("celestial_body", 1)],
    "rock": [("rock", 1)],
    "metal": [("metal", 1), ("metal", 2)],
    "gem": [("gem", 2)],
    "mineral": [("rock", 2), ("mineral", 1)],
    "liquid": [("liquid", 1), ("liquid", 3)],
    "gas": [("gas", 2)],
    "poison": [("poison", 1)],
    "fuel": [("fuel", 1)],
    "weather": [("weather", 1), ("atmospheric_phenomenon", 1)],
    "affliction": [("illness", 1), ("disease", 1)],
    "duration": [("time_unit", 1)],
    "bodypart": [("body_part", 1)],
    "season": [("season", 2)],
}
# Fallback when no anchor matches: WordNet category -> (class, archetype). None = inert.
NOUN = {
    "animal": ("creature", "creature"), "person": ("person", "person"), "plant": ("flora", "plant"),
    "food": ("consumable", "food"), "artifact": ("artifact", "artifact"),
    "substance": ("material", "material"), "object": ("terrain", "natural_object"),
    "location": ("terrain", "place"), "body": ("bodypart", "bodypart"),
    "phenomenon": ("world_state", "phenomenon"), "event": ("world_state", "event"),
    "feeling": ("aura", "feeling"), "attribute": ("aura", "attribute"),
    "cognition": ("knowledge", "knowledge"), "group": ("institution", "group"),
    "possession": ("institution", "possession"), "quantity": ("measure", "quantity"),
}
ARCH_CLASS = {  # archetype -> class, for archetypes reached through anchors
    **{a: "artifact" for a in "weapon protection vehicle_air vehicle_water vehicle_land building "
       "fortification structure route clothing adornment furniture container tool machine device "
       "light instrument toy medicine fabric document currency".split()},
    "drink": "consumable",
    **{a: "flora" for a in "tree flower herb shrub fungus produce".split()},
    **{a: "creature" for a in "bird fish insect reptile mammal amphibian invertebrate supernatural".split()},
    **{a: "person" for a in "fighter leader criminal worker".split()},
    **{a: "terrain" for a in "water elevation depression landform celestial rock".split()},
    **{a: "material" for a in "metal gem mineral liquid gas poison fuel".split()},
    "weather": "world_state", "season": "world_state", "affliction": "affliction", "duration": "measure",
    "bodypart": "bodypart",
}
VERB = {
    "motion": "movement", "body": "body", "change": "transform", "competition": "combat",
    "contact": "contact", "consumption": "consume", "creation": "create",
    "perception": "perceive", "possession": "transfer", "weather": "weather", "social": "social",
}
ADJ = {"all": "quality", "pert": "pertaining", "ppl": "participle"}
ROLE = {"n": "noun", "v": "verb", "a": "adjective", "r": "adverb"}

def tier(z):
    return "core" if z >= 4 else "common" if z >= 3 else "uncommon" if z >= 2 else "rare" if z > 0 else "obscure"

def main(dict_dir):
    wn = WordNet(dict_dir)
    anchor = {}
    for arch, keys in ANCHORS.items():
        for lemma, n in keys:
            anchor.setdefault(wn.senses(lemma, "n")[n - 1].offset, arch)

    def noun_arch(s):
        for h in [s] + wn.closure(s):
            if h.offset in anchor:
                a = anchor[h.offset]
                return ARCH_CLASS[a], a
        return NOUN.get(s.lex.split(".")[1])

    def is_proper(s, lemma):
        forms = [w for w in s.words if w.lower() == lemma]
        return s.instance or (forms and all(w != w.lower() for w in forms))

    rows = {"lexicon": [], "inert": [], "proper": []}
    for lemma in sorted(wn.index):
        if not re.fullmatch(r"[a-z]{2,}", lemma):
            continue
        z = round(zipf_frequency(lemma, "en"), 2)
        for pos in sorted(wn.index[lemma], key=lambda p: -wn.tags.get((lemma, p), 0)):
            senses = wn.senses(lemma, pos)
            common = [s for s in senses if not (pos == "n" and is_proper(s, lemma))]
            if not common:
                rows["proper"].append((lemma, "noun", "proper", senses[0].lex.split(".")[1], z, tier(z), "n" + senses[0].offset))
                continue
            pick, hit = common[0], None
            if pos == "n":                      # first of the top 3 senses that has a role
                for s in common[:3]:
                    hit = noun_arch(s)
                    if hit:
                        pick = s
                        break
            elif pos == "v":
                for s in common[:3]:
                    c = VERB.get(s.lex.split(".")[1])
                    if c:
                        pick, hit = s, ("spell", c)
                        break
            elif pos == "a":
                hit = ("modifier", ADJ[pick.lex.split(".")[1]])
            else:
                hit = ("verb_modifier", "manner")
            cat = pick.lex.split(".")[1]
            rec = (lemma, ROLE[pos]) + (hit or ("inert", cat)) + (z, tier(z), pos + pick.offset)
            rows["lexicon" if hit else "inert"].append(rec)

    head = "word\trole\tclass\tarchetype\tzipf\ttier\tsynset\n"
    for name, rs in rows.items():
        with open(os.path.join(OUT, name + ".tsv"), "w") as f:
            f.write(head)
            for r in rs:
                f.write("\t".join(map(str, r)) + "\n")

    # Demo subset: very common, short, concrete or directly usable.
    keep = {"noun": (4.6, {"artifact", "creature", "terrain", "consumable", "flora", "person", "material", "bodypart"}),
            "adjective": (5.1, None), "verb": (5.1, None)}
    demo = [r for r in rows["lexicon"] if r[1] in keep and r[4] >= keep[r[1]][0] and len(r[0]) <= 7
            and (keep[r[1]][1] is None or r[2] in keep[r[1]][1])
            and r[3] not in ("artifact", "person", "place", "natural_object", "material", "bodypart")]
    with open(os.path.join(OUT, "demo_candidates.tsv"), "w") as f:
        f.write(head)
        for r in demo:
            f.write("\t".join(map(str, r)) + "\n")

    count = lambda rs, i: dict(collections.Counter(r[i] for r in rs).most_common())
    stats = {
        "words": len({r[0] for rs in rows.values() for r in rs}),
        "rows": {k: len(v) for k, v in rows.items()}, "demo": len(demo),
        "lexicon_by_role": count(rows["lexicon"], 1), "lexicon_by_class": count(rows["lexicon"], 2),
        "lexicon_by_tier": count(rows["lexicon"], 5),
        "noun_archetypes": count([r for r in rows["lexicon"] if r[1] == "noun"], 3),
        "inert_by_category": count(rows["inert"], 3), "demo_by_class": count(demo, 2),
    }
    with open(os.path.join(OUT, "stats.json"), "w") as f:
        json.dump(stats, f, indent=1)
    print(json.dumps(stats, indent=1))

if __name__ == "__main__":
    main(sys.argv[1])
