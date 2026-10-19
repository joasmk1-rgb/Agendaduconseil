// ===================== CONFIGURATION =====================
// Le seul fichier à modifier pour personnaliser le comportement du site.

export const CONFIG = {
  dayStartHour: 8.5, // heure de début de grille (8.5 = 8h30)
  dayEndHour: 21,    // heure de fin de grille (exclue)
  slotMinutes: 15,   // granularité des créneaux, en minutes (15, 30 ou 60)
};

// Les cours récurrents bloqués (grisés, non cliquables) ne se règlent plus
// ici : ils se gèrent depuis le panneau "Cours récurrents" de admin.html,
// sans toucher au code.

// Mot de passe temporaire de démarrage pour la page admin (admin.html).
// Il ne sert qu'UNE fois, au tout début : dès qu'un membre est coché "Admin"
// dans le panneau Membres, ce mot de passe fixe cesse définitivement de
// fonctionner (même si quelqu'un lit ce fichier). Après cette étape, l'accès
// admin se fait avec le mot de passe personnel du·de la membre coché·e Admin,
// il n'y a plus aucun mot de passe admin écrit en clair dans le code.
export const ADMIN_PASSPHRASE = "conseil2026";

// Outils de l'admin accessibles depuis le site public (onglet "🛠️ Outils")
// selon le poste. Un membre coché "Admin" a tout, y compris la page admin.
// Les postes n'ont PAS accès à admin.html : seulement à ces outils, intégrés
// dans le site (admin.html?embed=<outil>).
export const TOOL_LABELS = {
  dashboard: "📊 Tableau de bord",
  "find-date": "📆 Trouver une date · qui est dispo",
  polls: "📝 Sondages",
  meetings: "🗓️ Réunions",
  "agenda-proposals": "💬 Suggestions ODJ",
  tasks: "📋 Tâches",
  projects: "📁 Dossiers",
  decisions: "🗳️ Décisions",
  events: "📅 Événements",
  availability: "✅ Disponibilités",
  members: "👥 Membres",
  import: "📥 Import",
  export: "📤 Export",
  settings: "⚙️ Paramètres",
};
const ALL_TOOLS = Object.keys(TOOL_LABELS);
export const ROLE_LABELS = {
  presidente: "Présidente",
  "vice-presidente": "Vice-présidente",
  secretaire: "Secrétaire",
  tresorier: "Trésorier",
  communication: "Communication",
};
// Valeurs par défaut tant que l'admin n'a rien réglé dans Paramètres
// (config/current.roleTools = { poste: [outils...] }). "tab:roles" = l'onglet
// public "👥 Disponibilités".
export const DEFAULT_ROLE_TOOLS = {
  presidente: ["find-date", "polls"],
  "vice-presidente": ["find-date", "polls"],
  secretaire: ["find-date", "polls", "meetings", "agenda-proposals", "availability", "import"],
  tresorier: ["projects", "export"],
  communication: ["tasks", "projects"],
};
function roleList(member, roleTools) {
  const conf = roleTools && roleTools[member.role];
  return Array.isArray(conf) ? conf : DEFAULT_ROLE_TOOLS[member.role] || [];
}
// Seul un membre coché Admin a tout ; les postes ont ce que l'admin a coché.
export function toolsFor(member, roleTools) {
  if (!member) return [];
  if (member.isAdmin) return ALL_TOOLS;
  return roleList(member, roleTools).filter((t) => ALL_TOOLS.includes(t));
}
// L'ancien onglet public "👥 Disponibilités" est remplacé par "Qui est dispo ?"
// dans l'outil Trouver une date : plus jamais affiché.
export function hasRolesTab() {
  return false;
}

// Sondages planifiés : status "planned" + openAt / closeAt (ISO "YYYY-MM-DDTHH:MM",
// heure locale). Le statut réel se calcule à la lecture (pas de serveur) :
// un sondage planifié dont l'heure d'ouverture est passée est ouvert, un
// sondage ouvert dont l'heure de fin est passée est fermé.
export function pollStatus(poll, now = new Date()) {
  const t = (iso) => (iso ? new Date(iso).getTime() : NaN);
  let st = poll.status || "open";
  if (st === "planned" && poll.openAt && now.getTime() >= t(poll.openAt)) st = "open";
  if (st === "open" && poll.closeAt && now.getTime() >= t(poll.closeAt)) st = "closed";
  return st;
}

// Lien externe sûr (http/https seulement) — pour les liens de documents / Teams.
export function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s.replace(/"/g, "%22").replace(/</g, "%3C") : "";
}
export const APPROVAL_OPTIONS = ["J'approuve", "Je n'approuve pas"];

// Destinataires d'un sondage : poll.audience = [ids membres]. Absent ou vide
// = tout le monde. Seuls les destinataires le voient et sont comptés.
export function pollIsFor(poll, memberId) {
  return !Array.isArray(poll.audience) || !poll.audience.length || poll.audience.includes(memberId);
}

// Départage par poste : à nombre de personnes égal, le créneau qui réunit
// les postes les plus importants passe devant. Ordre : présidente > (VP =
// secrétaire) > communication > trésorier > membre sans poste.
export const ROLE_TIERS = [["presidente"], ["vice-presidente", "secretaire"], ["communication"], ["tresorier"]];
export function roleVector(names, members) {
  const roleByName = new Map((members || []).map((m) => [m.name, m.role || ""]));
  return ROLE_TIERS.map((tier) => (names || []).filter((n) => tier.includes(roleByName.get(n))).length);
}
// < 0 si a a des postes plus importants que b (à trier en premier).
export function compareRoleVectors(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

// Règle de présence pour une réunion : quelqu'un compte comme "dispo" s'il est
// libre au moins 45 min sur le créneau (ou toute la durée si elle est plus
// courte). Utilisée partout : meilleurs créneaux, résultats, sondage membre.
export const MIN_PRESENCE_MINUTES = 45;
export function presenceThreshold(durationMinutes) {
  return Math.min(MIN_PRESENCE_MINUTES, durationMinutes || MIN_PRESENCE_MINUTES);
}
