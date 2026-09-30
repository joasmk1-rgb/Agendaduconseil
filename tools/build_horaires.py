"""Construit data/mons-horaires.json à partir de deux extractions brutes :
- programmes-mons.json : pages "programme détaillé" de uclouvain.be (Mons)
- horaires-mons.json   : séances datées de monhoraire.uclouvain.be (ADE)
Relancer après une nouvelle extraction (même format)."""
import json, re, sys, collections

SRC_PROG, SRC_EV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
P = json.load(open(SRC_PROG, encoding="utf-8"))
E = json.load(open(SRC_EV, encoding="utf-8"))

LABELS = {
 "gesm1ba": "Bachelier en sciences de gestion", "ingm1ba": "Bachelier : ingénieur de gestion",
 "comm1ba": "Bachelier en information et communication", "husm1ba": "Bachelier en sciences humaines et sociales",
 "spom1ba": "Bachelier en sciences politiques",
 "gesm2m": "Master [120] en sciences de gestion", "ingm2m": "Master [120] : ingénieur de gestion",
 "gesa2m": "Master [120] en sciences de gestion (alternance)", "gehm2m1": "Master [60] en sciences de gestion (horaire décalé)",
 "adpm2m": "Master [120] en administration publique", "aphm2m": "Master [120] en administration publique (horaire décalé)",
 "comm2m": "Master [120] en communication", "cohm2m": "Master [120] en communication (horaire décalé)",
 "coam2m": "Master [120] en communication stratégique (alternance)", "sphm2m": "Master [120] en sciences politiques (horaire décalé)",
 "prim2m": "Master [120] en sciences politiques, relations internationales", "comm2m1": "Master [60] en information et communication",
 "spom2m1": "Master [60] en sciences politiques", "sphm2m1": "Master [60] en sciences politiques (horaire décalé)",
 "ecom2m4": "Master [120] en enseignement : sciences économiques", "ssom2m4": "Master [120] en enseignement : sciences sociales",
 "ecom2m5": "Master [60] en enseignement : sciences économiques", "ssom2m5": "Master [60] en enseignement : sciences sociales",
}

def clean_path(p):
    return [re.sub(r"\s*\[\d+(\.\d+)?\]\s*$", "", x).strip() for x in p]

def norm_label(code, ev):
    s = re.sub(r"\(.*?\)", "", ev or "").strip()
    if s.startswith(code): s = s[len(code):]
    s = re.sub(r"^[\s\-–]+", "", s).strip()
    m = re.match(r"^\d+\s*[-–]?\s+(.+)$", s)
    if m: s = m.group(1).strip()
    s = re.sub(r"\s+S\d{1,2}$", "", s)
    return s or "Séance"

def group_ids(label):
    # "Labos Gr3" -> [3], "TP GroupeA&B" / "TP Groupe A-B" / "TP-A&B" / "TP C-D" -> [A,B]/[C,D],
    # "TP - GroupB-1" -> [B], "TP GroupeMC" -> [MC]
    m = (re.search(r"(?:groupe?|gr)\.?\s*([A-Z]{1,2}|\d{1,2})((?:\s*[&/]\s*(?:[A-Z]|\d{1,2})|\s*-\s*[A-Z](?![a-z0-9]))*)", label, re.I)
         or re.search(r"\bTP\s*-?\s*([A-Z])((?:\s*[-&]\s*[A-Z])*)\s*$", label))
    if not m: return []
    ids = [m.group(1)] + [x for x in re.split(r"\s*[-&/]\s*", m.group(2) or "") if x]
    return sorted(set(x.upper() for x in ids))

programs = {}
used = set()
for pid, v in P.items():
    rows, seen = [], set()
    for r in v["rows"]:
        code = r["code"]
        if not code.startswith("M"): continue          # uniquement les cours donnés à Mons
        path = clean_path(r["path"])
        if path and path[0].startswith("Programmes particuliers"): continue
        key = (code, tuple(path))
        if key in seen: continue
        seen.add(key)
        rows.append({"c": code, "n": r["name"], "s": "O" if r["status"].startswith("Obli") else "F",
                     "y": r["blocs"], "q": r["q"], "p": path})
        used.add(code)
    module = any(r["p"] and r["p"][0].startswith("Module complémentaire") for r in rows)
    blocs = sorted({b for r in rows for b in r["y"]})
    if pid.endswith("1ba"):
        kind, years = "bac", [{"id": b, "label": f"Bloc {b}"} for b in blocs]
    elif "2" in blocs:
        kind, years = "m120", [{"id": "1", "label": "1re année (M1)"}, {"id": "2", "label": "2e année (M2)"}]
    else:
        kind, years = "m60", [{"id": "U", "label": "Année unique"}]
    if module: years.append({"id": "P", "label": "Passerelle (module complémentaire)"})
    programs[pid] = {"label": LABELS.get(pid, pid), "fac": v["fac"], "kind": kind, "years": years, "rows": rows}

courses = {}
for code in sorted(used):
    c = E.get(code)
    if not c: continue
    sessions = []
    for s in c["sessions"]:
        label = norm_label(code, s["ev"])
        sess = {"l": label, "t": s["type"], "s": s["start"], "e": s["end"], "loc": s["loc"], "d": s["dates"]}
        if s["type"] in ("TP", "LABO"):
            g = group_ids(label)
            if g: sess["g"] = g
        sessions.append(sess)
    courses[code] = {"n": c["name"], "ss": sessions}

out = {"generated": "2026-09-30", "source": "uclouvain.be (programmes) + monhoraire.uclouvain.be (ADE)",
       "programs": programs, "courses": courses}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(programs), "programmes,", len(courses), "cours,", sum(len(c["ss"]) for c in courses.values()), "groupes de séances")
