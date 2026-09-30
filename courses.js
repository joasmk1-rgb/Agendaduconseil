// ===================== COURSES.JS =====================
// Source UNIQUE pour tout ce qui touche aux cours (page membre ET admin) :
// programmes de Mons, cours par année, séances réelles datées, choix de
// groupes, calcul des créneaux "pas dispo". Données : data/mons-horaires.json,
// généré par tools/build_horaires.py à partir des pages programme officielles
// (uclouvain.be) et des horaires datés d'ADE (monhoraire.uclouvain.be).
//
// Modèle d'une fiche membre (Firestore members/{password}) :
//   programs     : ["gesm1ba:3", "gesm2m:P", ...]  (programme:année)
//   courses      : codes de cours suivis
//   groupSessions: ["MGEST1325#A", "MANGL1339#3", "MGEST1324#1", ...]
//                  groupe choisi par cours (TP/labo, groupe de langue, ou
//                  groupe parallèle de cours magistral)
//   courseSkips  : créneaux ("YYYY-MM-DD|HH:MM") qu'un cours bloquerait mais
//                  que le membre a libérés à la main (cours annulé/déplacé)
//   courseMarkedKeys : créneaux posés en dernier par les cours (pour pouvoir
//                  les retirer proprement si un cours est décoché)
import * as Grid from "./grid.js";
import { CONFIG } from "./config.js";

let data = null;
let loading = null;

export function loadSchedule() {
  if (data) return Promise.resolve(data);
  if (!loading) {
    loading = fetch("data/mons-horaires.json")
      .then((r) => r.json())
      .then((d) => {
        data = d;
        return d;
      })
      .catch((err) => {
        console.error("Échec du chargement des horaires :", err);
        data = { programs: {}, courses: {} };
        return data;
      });
  }
  return loading;
}

export function hasSessions(code) {
  return !!(data && data.courses[code] && data.courses[code].ss.length);
}

export function isLoaded() {
  return !!data;
}

export function courseName(code) {
  const c = data && data.courses[code];
  if (c) return c.n;
  const row = data && Object.values(data.programs).flatMap((p) => p.rows).find((r) => r.c === code);
  return row ? row.n : code;
}

const LANGUAGE_CODE = /^M(ANGL|ESPA|NEER)/;
export function isLanguage(code) {
  return LANGUAGE_CODE.test(code || "");
}

// ---------- Programmes ----------
export function parseKey(key) {
  const [prog, year] = String(key).split(":");
  return { prog, year };
}

// Toutes les combinaisons programme + année, pour les listes déroulantes.
export function programOptions() {
  if (!data) return [];
  return Object.entries(data.programs)
    .flatMap(([id, p]) => p.years.map((y) => ({ key: `${id}:${y.id}`, prog: id, year: y.id, label: `${p.label} — ${y.label}`, fac: p.fac, kind: p.kind, niveau: p.kind === "bac" ? "Bac" : "Master" })))
    .sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
}

export function programList() {
  if (!data) return [];
  return Object.entries(data.programs)
    .map(([id, p]) => ({ id, label: p.label, fac: p.fac, kind: p.kind, years: p.years }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

// Anciens codes enregistrés sur les fiches avant la refonte ("GESM1BA-B3"...).
export function migrateProgramKey(code) {
  if (!code) return null;
  if (code.includes(":")) return code;
  const m = String(code).match(/^([A-Z]{4})1BA-B(\d)$/i);
  if (m) return `${m[1].toLowerCase()}1ba:${m[2]}`;
  return null; // anciens codes de master : le membre les rechoisit (M1/M2/passerelle)
}

export function programLabel(key) {
  const k = migrateProgramKey(key) || key;
  const { prog, year } = parseKey(k);
  const p = data && data.programs[prog];
  if (!p) return key;
  const y = p.years.find((x) => x.id === year);
  return y ? `${p.label} — ${y.label}` : p.label;
}

// Lignes du programme qui concernent cette année-là.
function rowsForKey(key) {
  const { prog, year } = parseKey(key);
  const p = data && data.programs[prog];
  if (!p) return [];
  const isModule = (r) => r.p.length && r.p[0].startsWith("Module complémentaire");
  if (year === "P") return p.rows.filter(isModule);
  return p.rows.filter((r) => !isModule(r) && (year === "U" ? true : r.y.includes(year) || (!r.y.length && p.kind === "m60")));
}

// Structure d'un programme pour le profil, telle que la page officielle la
// présente : cours de base (obligatoires = bloqués d'office), cours au
// choix (à cocher), majeures/options/finalités (choisir une ou plusieurs
// alternatives), langues.
export function analyzePrograms(keys) {
  const result = { core: [], optional: [], choiceGroups: [], languages: [], unknownKeys: [] };
  const seen = new Set();
  const groupsByTitle = new Map();
  keys.forEach((key) => {
    const rows = rowsForKey(key);
    if (!rows.length) {
      result.unknownKeys.push(key);
      return;
    }
    // Alternatives : sections de 3e niveau ou plus, ou 2e niveau sous "Options
    // et/ou cours au choix" quand il y en a plusieurs côte à côte.
    const childrenByParent = new Map();
    rows.forEach((r) => {
      if (r.p.length < 2) return;
      const parent = r.p.slice(0, -1).join(" > ");
      const set = childrenByParent.get(parent) || new Set();
      set.add(r.p.join(" > "));
      childrenByParent.set(parent, set);
    });
    rows.forEach((r) => {
      const id = `${r.c}|${r.p.join(">")}`;
      if (seen.has(id)) return;
      seen.add(id);
      if (!data.courses[r.c] && !isLanguage(r.c)) return; // pas de séance à l'horaire (mémoire, stage...)
      if (isLanguage(r.c)) {
        if (!result.languages.some((x) => x.c === r.c)) result.languages.push(r);
        return;
      }
      const parent = r.p.length >= 2 ? r.p.slice(0, -1).join(" > ") : null;
      const underChoices = r.p[0] && /au choix|finalités|Options/i.test(r.p[0]) && r.p.length >= 2;
      if (parent && (childrenByParent.get(parent).size >= 2 || underChoices)) {
        const title = r.p[r.p.length - 2];
        const groupKey = `${key.split(":")[0]}|${parent}`;
        let group = groupsByTitle.get(groupKey);
        if (!group) {
          group = { title, alternatives: new Map() };
          groupsByTitle.set(groupKey, group);
          result.choiceGroups.push(group);
        }
        const altTitle = r.p[r.p.length - 1];
        const alt = group.alternatives.get(altTitle) || { title: altTitle, rows: [] };
        alt.rows.push(r);
        group.alternatives.set(altTitle, alt);
        return;
      }
      if (r.s === "O") {
        if (!result.core.some((x) => x.c === r.c)) result.core.push(r);
      } else if (!result.optional.some((x) => x.c === r.c)) {
        result.optional.push(r);
      }
    });
  });
  // Un cours déjà dans la base n'est pas reproposé comme option.
  const coreCodes = new Set(result.core.map((r) => r.c));
  result.optional = result.optional.filter((r) => !coreCodes.has(r.c));
  result.choiceGroups = result.choiceGroups.map((g) => ({
    title: g.title,
    alternatives: Array.from(g.alternatives.values()).map((a) => ({ ...a, rows: a.rows.filter((r) => !coreCodes.has(r.c)) })).filter((a) => a.rows.length),
  })).filter((g) => g.alternatives.length);
  const byName = (a, b) => a.n.localeCompare(b.n, "fr");
  result.core.sort(byName);
  result.optional.sort(byName);
  result.languages.sort(byName);
  return result;
}

// Tous les codes de cours d'un ensemble de programmes (pour nettoyer une
// fiche quand un programme est retiré).
export function courseCodesOf(keys) {
  const set = new Set();
  keys.forEach((k) => rowsForKey(k).forEach((r) => set.add(r.c)));
  return set;
}

// Sélection par défaut d'un programme : ses cours obligatoires (hors langues).
export function defaultCourses(keys) {
  const a = analyzePrograms(keys);
  const out = a.core.map((r) => r.c);
  // Une seule langue obligatoire (ex: Advanced English en master) : suivie
  // d'office. Plusieurs (ex: 2 langues sur 3 en bac) : c'est au membre.
  const obligatoryLangs = a.languages.filter((r) => r.s === "O");
  if (obligatoryLangs.length === 1) out.push(obligatoryLangs[0].c);
  return out;
}

// Recherche dans tous les cours de Mons (cours hors programme).
export function searchCourses(query) {
  if (!data) return [];
  const q = query.toLowerCase();
  return Object.entries(data.courses)
    .filter(([code, c]) => code.toLowerCase().includes(q) || c.n.toLowerCase().includes(q))
    .map(([code, c]) => ({ code, name: c.n }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

// ---------- Séances d'un cours ----------
const SKIP_TYPES = /EXAM|Monitorat/i;
const SKIP_LABELS = /Monitorat|Heure compl/i;

function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Choix possibles pour un cours : groupes de TP/labo (lettres ou numéros)
// et groupes parallèles de cours magistral (même cours, même moment).
export function courseChoices(code) {
  const c = data && data.courses[code];
  if (!c) return { groups: [], parallel: [] };
  const ids = new Set();
  c.ss.forEach((s) => (s.g || []).forEach((g) => ids.add(g)));
  const groups = Array.from(ids).sort((a, b) => a.localeCompare(b, "fr", { numeric: true })).map((id) => {
    const times = new Set();
    c.ss.filter((s) => (s.g || []).includes(id)).forEach((s) => times.add(dayTimeSummary(s)));
    return { id, label: `${/^\d+$/.test(id) ? "Groupe " + id : "Groupe " + id} — ${Array.from(times).slice(0, 3).join(", ")}` };
  });
  return { groups, parallel: parallelLabels(code) };
}

function dayTimeSummary(s) {
  const days = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
  const d = new Date(`${s.d[0]}T12:00:00`);
  return `${days[d.getDay()]} ${s.s}`;
}

// Labels de cours magistral qui ont lieu en même temps qu'un AUTRE label du
// même cours (ex: MGEST1324-1 et -2 le lundi à 13h45) : un seul concerne
// l'étudiant·e.
const parallelCache = new Map();
function parallelLabels(code) {
  if (parallelCache.has(code)) return parallelCache.get(code);
  const c = data && data.courses[code];
  const labels = new Set();
  if (c) {
    const cms = c.ss.filter((s) => !(s.g && s.g.length) && s.t !== "TP" && s.t !== "LABO" && !SKIP_TYPES.test(s.t));
    for (let i = 0; i < cms.length; i++) {
      for (let j = i + 1; j < cms.length; j++) {
        const a = cms[i];
        const b = cms[j];
        if (a.l === b.l) continue;
        if (!(toMin(a.s) < toMin(b.e) && toMin(b.s) < toMin(a.e))) continue;
        const bd = new Set(b.d);
        if (a.d.some((d) => bd.has(d))) {
          labels.add(a.l);
          labels.add(b.l);
        }
      }
    }
  }
  const out = Array.from(labels).sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
  parallelCache.set(code, out);
  return out;
}

// Séances réellement suivies pour un cours, compte tenu des choix du membre.
export function sessionsFor(code, chosen) {
  const c = data && data.courses[code];
  if (!c) return [];
  const choice = new Set(chosen || []);
  const parallel = new Set(parallelLabels(code));
  const lang = isLanguage(code);
  // Un seul groupe dans tout le cours : il concerne forcément tout le monde.
  const singleGroup = new Set(c.ss.flatMap((s) => s.g || [])).size === 1;
  return c.ss.filter((s) => {
    if (SKIP_TYPES.test(s.t) || SKIP_LABELS.test(s.l)) return false;
    if (s.g && s.g.length) return singleGroup || s.g.some((g) => choice.has(`${code}#${g}`));
    if (lang) return /^Cours$/i.test(s.l); // langue : cours + groupe de labo choisi uniquement
    if (s.t === "TP" || s.t === "LABO") return true; // TP commun à tout le monde
    if (parallel.has(s.l)) return choice.has(`${code}#${s.l}`);
    return true;
  });
}

// ---------- Créneaux ----------
// Map "YYYY-MM-DD|HH:MM" -> [libellés], pour les dates données (chaînes ISO).
export function computeCourseSlots(member, dateISOs) {
  const out = new Map();
  if (!data || !member) return out;
  const dateSet = new Set(dateISOs);
  const times = Grid.buildTimeSlots();
  const skips = new Set(member.courseSkips || []);
  (member.courses || []).forEach((code) => {
    const name = courseName(code);
    sessionsFor(code, member.groupSessions).forEach((s) => {
      const start = toMin(s.s);
      const end = toMin(s.e);
      const label = s.t === "CM" || !s.t ? name : `${name} — ${s.l}`;
      s.d.forEach((dateISO) => {
        if (!dateSet.has(dateISO)) return;
        times.forEach((t) => {
          const slotStart = toMin(t);
          if (!(slotStart < end && slotStart + CONFIG.slotMinutes > start)) return;
          const key = Grid.slotKey(dateISO, t);
          if (skips.has(key)) return;
          const list = out.get(key) || [];
          if (!list.includes(label)) list.push(label);
          out.set(key, list);
        });
      });
    });
  });
  return out;
}

// Dates couvertes par le calcul : d'aujourd'hui jusqu'à la fin de la
// période affichée, week-ends compris (un cours du samedi reste enregistré
// même si l'admin masque les week-ends ; il réapparaît s'il les réaffiche).
export function courseDateWindow(rangeDays) {
  return Grid.buildDateList(new Date(), rangeDays, true).map((d) => Grid.toISODate(d));
}

// Applique les cours d'un membre à ses marques. Ne remplit que les cases
// vides ; retire les anciennes cases de cours devenues inutiles si elles
// sont toujours rouges ; ne touche jamais au passé. overwriteGreen : passe
// aussi en rouge les heures de cours marquées vertes (après confirmation).
export function applyCoursesToMarks(member, marks, rangeDays, { overwriteGreen = false } = {}) {
  const dates = courseDateWindow(rangeDays);
  const todayISO = dates[0];
  const slots = computeCourseSlots(member, dates);
  const desired = new Set(slots.keys());
  let added = 0;
  let removed = 0;
  desired.forEach((key) => {
    if (!(key in marks)) {
      marks[key] = "unavailable";
      added++;
    } else if (overwriteGreen && marks[key] === "available") {
      marks[key] = "unavailable";
      added++;
    }
  });
  (member.courseMarkedKeys || []).forEach((key) => {
    if (key.slice(0, 10) < todayISO) return;
    if (!desired.has(key) && marks[key] === "unavailable") {
      delete marks[key];
      removed++;
    }
  });
  const keptPast = (member.courseMarkedKeys || []).filter((k) => k.slice(0, 10) < todayISO && k.slice(0, 10) >= isoDaysAgo(14));
  return { marks, courseMarkedKeys: keptPast.concat(Array.from(desired)), added, removed, slots };
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Grid.toISODate(d);
}

// Nombre de créneaux de cours actuellement marqués verts (à confirmer).
export function countGreenCourseSlots(member, marks, rangeDays) {
  const slots = computeCourseSlots(member, courseDateWindow(rangeDays));
  let n = 0;
  slots.forEach((_, key) => {
    if (marks[key] === "available") n++;
  });
  return n;
}
