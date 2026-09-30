// ===================== SCRIPT.JS (page membre) =====================
import * as Grid from "./grid.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import { computeUnavailableSlots, buildICSFromCourseSessions } from "./ics.js";

const LOGIN_KEY = "agenda-conseil:password";
const VIEW_WEEKS_KEY = "agenda-conseil:viewWeeks";
// Doit rester synchronisé avec le "@media (min-width: 900px)" de style.css
// (colonne fixe "Marquage rapide" à partir de cette largeur).
const BULK_SIDEBAR_BREAKPOINT = 900;

let state = {
  password: null,
  name: null,
  isAdmin: false,
  role: "",
  allAvailability: [],
  rolesMembers: [],
  config: null,
  events: [],
  marks: {}, // "YYYY-MM-DD|HH:MM" -> "available" | "unavailable"
  selectedCourses: [], // codes de cours choisis dans "Mes cours"
  courseMarkedKeys: [], // dernières clés de créneaux posées par "Mes cours"
  programs: [], // programme(s) renseigné(s) par l'admin sur la fiche (data/mons-programs.json)
  groupSessions: [], // groupes de TP/labo choisis à part (propres à ce membre) — "CODE|weekday|start|end"
  mode: "available",
  tasks: [],
  polls: [],
  meetings: [],
  agendaItems: [],
  agendaComments: [],
  activeTab: "calendar",
  openAgendaItemId: null,
  // Nombre de semaines affichées à la fois dans la grille (chacun choisit la
  // sienne, mémorisé dans son navigateur — n'affecte que l'affichage, pas la
  // fenêtre de données réglée par l'admin).
  // Bornée à 2 (l'option "3 semaines" a été retirée au profit de la colonne
  // "Marquage rapide" qui récupère cet espace) — un ancien réglage à 3
  // enregistré dans le navigateur d'un membre ne doit pas casser l'affichage.
  viewWeeks: Math.min(2, Number(localStorage.getItem(VIEW_WEEKS_KEY)) || 2),
};

// ===================== DOM =====================
const memberControls = document.getElementById("member-controls");
const loginForm = document.getElementById("login-form");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");
const sessionConnected = document.getElementById("session-connected");
const memberNameEl = document.getElementById("member-name");
const adminLink = document.getElementById("admin-link");
const gridEl = document.getElementById("grid");
const saveStatus = document.getElementById("save-status");
const modeAvailableBtn = document.getElementById("mode-available");
const modeUnavailableBtn = document.getElementById("mode-unavailable");
const logoutBtn = document.getElementById("logout-btn");
const passwordChangeBtn = document.getElementById("password-change-btn");
const passwordChangeForm = document.getElementById("password-change-form");
const passwordChangeNewInput = document.getElementById("password-change-new-input");
const passwordChangeConfirmInput = document.getElementById("password-change-confirm-input");
const passwordChangeCancelBtn = document.getElementById("password-change-cancel-btn");
const passwordChangeStatus = document.getElementById("password-change-status");
const viewRangeToggle = document.getElementById("view-range-toggle");
const gridScrollEl = document.getElementById("grid-scroll");
const availRequestBanner = document.getElementById("avail-request-banner");
const pollBanner = document.getElementById("poll-banner");
const coursesStatus = document.getElementById("courses-status");
const coursesSummaryText = document.getElementById("courses-summary-text");
const coursesEditBtn = document.getElementById("courses-edit-btn");
const profileBtn = document.getElementById("profile-btn");
const profileModalOverlay = document.getElementById("profile-modal-overlay");
const profileBody = document.getElementById("profile-body");
const profileSaveBtn = document.getElementById("profile-save-btn");
const profileCloseBtn = document.getElementById("profile-close-btn");
const profileClearBtn = document.getElementById("profile-clear-btn");
const profileStatus = document.getElementById("profile-status");
const bulkMarkSection = document.getElementById("bulk-mark-section");
const toggleColBulkBtn = document.getElementById("toggle-col-bulk");
const toggleColGridBtn = document.getElementById("toggle-col-grid");
const memberDashboardContent = document.getElementById("member-dashboard-content");
const tasksLoginHint = document.getElementById("tasks-login-hint");
const bulkMarkToggle = document.getElementById("bulk-mark-toggle");
const bulkMarkPanel = document.getElementById("bulk-mark-panel");
const bulkDayAll = document.getElementById("bulk-day-all");
const bulkDayCheckboxes = document.getElementById("bulk-day-checkboxes");
const bulkStartTime = document.getElementById("bulk-start-time");
const bulkEndTime = document.getElementById("bulk-end-time");
const bulkStartDate = document.getElementById("bulk-start-date");
const bulkEndDate = document.getElementById("bulk-end-date");
const bulkModeAvailableBtn = document.getElementById("bulk-mode-available");
const bulkModeUnavailableBtn = document.getElementById("bulk-mode-unavailable");
const bulkModeClearBtn = document.getElementById("bulk-mode-clear");
const bulkApplyBtn = document.getElementById("bulk-apply-btn");
const bulkMarkResult = document.getElementById("bulk-mark-result");

// ---- Onglet "Ordre du jour" (public, activable depuis l'admin) ----
const publicTabs = document.getElementById("public-tabs");
const agendaTabBtn = document.getElementById("agenda-tab-btn");
const tasksTabBtn = document.getElementById("tasks-tab-btn");
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

// ---- Onglet "Disponibilités" (réservé aux postes présidente/vice-présidente) ----
const rolesTabBtn = document.getElementById("roles-tab-btn");
const rolesEventSelect = document.getElementById("roles-event-select");
const rolesEventResult = document.getElementById("roles-event-result");
const rolesPollingSlotGridEl = document.getElementById("roles-polling-slot-grid");
const rolesPollingSlotSaveBtn = document.getElementById("roles-polling-slot-save-btn");
const rolesPollingSlotClearBtn = document.getElementById("roles-polling-slot-clear-btn");
const rolesPollingSlotResult = document.getElementById("roles-polling-slot-result");
const rolesPollingSlotDayCheckboxes = document.getElementById("roles-polling-slot-day-checkboxes");
const rolesPollingSlotStartTime = document.getElementById("roles-polling-slot-start-time");
const rolesPollingSlotEndTime = document.getElementById("roles-polling-slot-end-time");
const rolesPollingSlotStartDate = document.getElementById("roles-polling-slot-start-date");
const rolesPollingSlotEndDate = document.getElementById("roles-polling-slot-end-date");
const rolesPollingSlotQuickselectBtn = document.getElementById("roles-polling-slot-quickselect-btn");
const rolesPollingSlotQuickselectResult = document.getElementById("roles-polling-slot-quickselect-result");
const rolesBestSlotForm = document.getElementById("roles-bestslot-form");
const rolesBestSlotEventSelect = document.getElementById("roles-bestslot-event-select");
const rolesBestSlotStartInput = document.getElementById("roles-bestslot-start-input");
const rolesBestSlotEndInput = document.getElementById("roles-bestslot-end-input");
const rolesBestSlotDurationInput = document.getElementById("roles-bestslot-duration-input");
const rolesBestSlotThresholdInput = document.getElementById("roles-bestslot-threshold-input");
const rolesBestSlotWeekendsInput = document.getElementById("roles-bestslot-weekends-input");
const rolesBestSlotResult = document.getElementById("roles-bestslot-result");
const rolesBestSlotHeatmapEl = document.getElementById("roles-bestslot-heatmap");
const ROLES_WITH_AVAILABILITY_ACCESS = ["presidente", "vice-presidente"];
const agendaMeetingInfo = document.getElementById("agenda-meeting-info");
const agendaItemListEl = document.getElementById("agenda-item-list");
const agendaProposalForm = document.getElementById("agenda-proposal-form");
const agendaProposalLabelInput = document.getElementById("agenda-proposal-label-input");
const agendaProposalTextInput = document.getElementById("agenda-proposal-text-input");
const agendaProposalLoginHint = document.getElementById("agenda-proposal-login-hint");
const agendaProposalStatus = document.getElementById("agenda-proposal-status");
const agendaModalOverlay = document.getElementById("agenda-modal-overlay");
const agendaModalClose = document.getElementById("agenda-modal-close");
const agendaModalTitle = document.getElementById("agenda-modal-title");
const agendaModalText = document.getElementById("agenda-modal-text");
const agendaModalComments = document.getElementById("agenda-modal-comments");
const agendaCommentForm = document.getElementById("agenda-comment-form");
const agendaCommentInput = document.getElementById("agenda-comment-input");
const agendaCommentLoginHint = document.getElementById("agenda-comment-login-hint");

// ===================== LARGEUR DE VUE (1 / 2 / 3 semaines) =====================
// La grille contient TOUJOURS tous les jours de la période (on ne cache plus
// rien) — on peut toujours scroller jusqu'au bout pour aller cocher ses
// dispos. Ce réglage ne fait que limiter la largeur visible de #grid-scroll
// à N semaines de colonnes, façon "zoom" : au-delà, ça scrolle au lieu de
// s'afficher directement. N'affecte ni les données ni la position de départ.
function syncViewRangeButtons() {
  viewRangeToggle.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.weeks) === state.viewWeeks);
  });
}
function applyViewWidth() {
  const perWeek = state.config && state.config.includeWeekends ? 7 : 5;
  const cols = state.viewWeeks * perWeek;
  gridScrollEl.style.maxWidth = `${Grid.LAYOUT.timeColWidth + cols * Grid.LAYOUT.dayColWidth}px`;
}
viewRangeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  state.viewWeeks = Number(btn.dataset.weeks);
  localStorage.setItem(VIEW_WEEKS_KEY, String(state.viewWeeks));
  syncViewRangeButtons();
  applyViewWidth();
});
syncViewRangeButtons();

// ===================== COLONNES MASQUABLES (marquage / calendrier / tâches) =====================
// Permet de se concentrer sur une seule colonne à la fois (ex: juste les
// tâches, ou juste le calendrier) en masquant complètement les autres —
// mémorisé dans le navigateur de chacun, indépendamment de la connexion.
const COLUMN_VISIBILITY_KEY = "agenda-conseil:visibleColumns";
// Le tableau de bord ("Tâches") est maintenant son propre onglet public (voir
// plus bas), plus une colonne du calendrier — il ne reste que 2 colonnes à
// afficher/masquer dans la vue calendrier.
const columnEls = { bulk: bulkMarkSection, grid: gridScrollEl };
const columnToggleBtns = { bulk: toggleColBulkBtn, grid: toggleColGridBtn };
let visibleColumns = { bulk: true, grid: true };
try {
  const saved = JSON.parse(localStorage.getItem(COLUMN_VISIBILITY_KEY) || "null");
  if (saved) visibleColumns = { ...visibleColumns, ...saved };
} catch (err) {
  // valeur corrompue dans le localStorage : on garde les valeurs par défaut
}

function applyColumnVisibility() {
  Object.keys(columnEls).forEach((key) => {
    const visible = visibleColumns[key] !== false;
    columnEls[key].classList.toggle("column-hidden", !visible);
    columnToggleBtns[key].classList.toggle("active", visible);
  });
  // Le tableau de bord ne construit son contenu que s'il est visible (voir
  // renderMemberDashboard) — donc le remplir dès qu'on l'active, pas
  // seulement au prochain changement de données.
  if (typeof renderMemberDashboard === "function") renderMemberDashboard();
}

Object.keys(columnToggleBtns).forEach((key) => {
  columnToggleBtns[key].addEventListener("click", () => {
    const next = { ...visibleColumns, [key]: !visibleColumns[key] };
    // Toujours garder au moins une colonne visible — sinon plus rien à l'écran.
    if (Object.values(next).every((v) => v === false)) return;
    visibleColumns = next;
    localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(visibleColumns));
    applyColumnVisibility();
  });
});
applyColumnVisibility();

// ===================== CONNEXION =====================
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = passwordInput.value.trim();
  if (!password) return;
  loginError.classList.add("hidden");
  const member = await db.findMemberByPassword(password);
  if (!member) {
    loginError.textContent = "Mot de passe incorrect.";
    loginError.classList.remove("hidden");
    return;
  }
  localStorage.setItem(LOGIN_KEY, password);
  await enterAsMember(member);
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem(LOGIN_KEY);
  state.password = null;
  state.name = null;
  state.isAdmin = false;
  state.role = "";
  state.marks = {};
  loginForm.classList.remove("hidden");
  loginForm.reset();
  sessionConnected.classList.add("hidden");
  memberControls.classList.add("hidden");
  bulkMarkSection.classList.add("hidden");
  passwordChangeForm.classList.add("hidden");
  passwordChangeStatus.textContent = "";
  closeProfile();
  renderCoursesSummary();
  renderGrid();
  if (state.activeTab === "agenda") renderAgendaTab();
  if (state.openAgendaItemId) renderAgendaModal();
  renderMemberDashboard();
  applyPublicTabsVisibility();
});

async function enterAsMember(member) {
  state.password = member.password;
  state.name = member.name;
  state.isAdmin = !!member.isAdmin;
  state.role = member.role || "";
  state.selectedCourses = Array.isArray(member.courses) ? member.courses : [];
  state.courseMarkedKeys = Array.isArray(member.courseMarkedKeys) ? member.courseMarkedKeys : [];
  state.programs = Array.isArray(member.programs) ? member.programs : [];
  state.groupSessions = Array.isArray(member.groupSessions) ? member.groupSessions : [];
  // Charge le catalogue en tâche de fond dès la connexion si des cours ou des
  // groupes de TP/labo sont déjà sélectionnés, pour que le nom du cours
  // puisse s'afficher sur la grille sans attendre que le membre ouvre "Mes
  // cours" au moins une fois.
  if (state.selectedCourses.length || state.groupSessions.length) {
    loadCoursesCatalogue().then(() => renderGrid());
  }
  closeProfile();
  loadCoursesCatalogue().then(() => {
    renderCoursesSummary();
    // Première connexion (aucun programme ni cours) : le profil s'ouvre tout
    // seul, c'est la première chose à remplir.
    if (!state.programs.length && !state.selectedCourses.length) openProfile();
  });
  memberNameEl.textContent = member.name;
  adminLink.classList.toggle("hidden", !state.isAdmin);
  loginForm.classList.add("hidden");
  loginError.classList.add("hidden");
  sessionConnected.classList.remove("hidden");
  memberControls.classList.remove("hidden");
  bulkMarkSection.classList.remove("hidden");
  // Sur grand écran (colonne fixe, voir CSS), le panneau démarre ouvert par
  // défaut ; sur petit écran (panneau repliable), il démarre fermé. Le
  // bouton "⚡ Marquage rapide" reste cliquable dans les deux cas pour
  // replier/déplier à volonté — même en colonne, on peut la rétracter.
  bulkMarkPanel.classList.toggle("hidden", window.innerWidth < BULK_SIDEBAR_BREAKPOINT);

  state.marks = await db.getMarks(state.password);
  renderGrid();
  if (state.activeTab === "agenda") renderAgendaTab();
  if (state.openAgendaItemId) renderAgendaModal();
  renderMemberDashboard();
  applyPublicTabsVisibility();
}

// ===================== CHANGER SON MOT DE PASSE =====================
// Visible uniquement si l'admin a activé "passwordChangeEnabled" (voir
// applyPublicTabsVisibility). Le mot de passe étant l'id même du document en
// base, db.changeMemberPassword() s'occupe de migrer proprement toutes les
// références (tâches, réunions, commentaires, sondages...) — voir db.js.
passwordChangeBtn.addEventListener("click", () => {
  passwordChangeStatus.textContent = "";
  passwordChangeForm.classList.remove("hidden");
  passwordChangeNewInput.value = "";
  passwordChangeConfirmInput.value = "";
  passwordChangeNewInput.focus();
});

passwordChangeCancelBtn.addEventListener("click", () => {
  passwordChangeForm.classList.add("hidden");
  passwordChangeStatus.textContent = "";
});

passwordChangeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPassword = passwordChangeNewInput.value.trim();
  const confirmPassword = passwordChangeConfirmInput.value.trim();
  if (!newPassword) {
    passwordChangeStatus.textContent = "Choisis un nouveau mot de passe.";
    return;
  }
  if (newPassword !== confirmPassword) {
    passwordChangeStatus.textContent = "Les deux mots de passe ne correspondent pas.";
    return;
  }
  if (newPassword === state.password) {
    passwordChangeStatus.textContent = "C'est déjà ton mot de passe actuel.";
    return;
  }
  passwordChangeStatus.textContent = "Changement en cours…";
  const submitBtn = passwordChangeForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  try {
    await db.changeMemberPassword(state.password, newPassword);
    state.password = newPassword;
    localStorage.setItem(LOGIN_KEY, newPassword);
    state.marks = await db.getMarks(state.password);
    passwordChangeForm.classList.add("hidden");
    passwordChangeStatus.textContent = "Mot de passe changé ✓ (garde-le bien en mémoire, il n'apparaît nulle part ailleurs)";
  } catch (err) {
    console.error(err);
    passwordChangeStatus.textContent = err.message || "Échec du changement, réessaie.";
  }
  submitBtn.disabled = false;
});

async function tryAutoLogin() {
  const saved = localStorage.getItem(LOGIN_KEY);
  if (!saved) return;
  const member = await db.findMemberByPassword(saved);
  if (member) {
    await enterAsMember(member);
  } else {
    localStorage.removeItem(LOGIN_KEY);
  }
}

// ===================== MODE (dispo / pas dispo) =====================
function setMode(mode) {
  state.mode = mode;
  modeAvailableBtn.classList.toggle("active", mode === "available");
  modeUnavailableBtn.classList.toggle("active", mode === "unavailable");
}
modeAvailableBtn.addEventListener("click", () => setMode("available"));
modeUnavailableBtn.addEventListener("click", () => setMode("unavailable"));

// La colonne "Tâches" (vue liste/tableau + filtres urgence/état) a été
// retirée — tout est maintenant dans le tableau de bord. matchesTaskFilters
// est gardée en no-op (plutôt que supprimée partout) parce que
// buildTaskBoardColumnsHTML s'y attend encore ; si des filtres reviennent un
// jour dans le tableau de bord, c'est ici qu'ils se rebrancheraient.
function matchesTaskFilters() {
  return true;
}

// ===================== MARQUAGE RAPIDE (par règle) =====================
// Marque d'un coup toutes les cases qui correspondent aux critères choisis
// (jour(s) de la semaine, plage horaire, période) plutôt que de cliquer case
// par case. Fonctionne aussi sur les créneaux "bloqués" (cours) — on peut
// désormais les marquer quand même (ex: "dispo, je sèche ce cours-là").
bulkDayCheckboxes.innerHTML = "";
// Lundi(1) → Dimanche(0), ordre français plus naturel qu'en commençant par dimanche.
const BULK_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
BULK_DAY_ORDER.forEach((dow) => {
  const label = document.createElement("label");
  label.className = "checkbox-group";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "bulk-day-checkbox";
  input.value = String(dow);
  input.checked = true;
  input.disabled = true; // "Tous les jours" coché par défaut : cases individuelles désactivées tant que décoché
  label.appendChild(input);
  label.appendChild(document.createTextNode(" " + Grid.WEEKDAYS_FULL[dow].slice(0, 3)));
  bulkDayCheckboxes.appendChild(label);
});

bulkDayAll.addEventListener("change", () => {
  const allChecked = bulkDayAll.checked;
  bulkDayCheckboxes.querySelectorAll(".bulk-day-checkbox").forEach((c) => {
    c.disabled = allChecked;
    // Coché "Tous les jours" : toutes les cases repassent cochées (et
    // désactivées, on ne les modifie plus directement). Décoché : on repart
    // de zéro (aucun jour choisi) plutôt que de laisser les 7 cases cochées
    // individuellement, sinon "Tous les jours" et "chaque jour coché à la
    // main" reviendraient au même sans que ce soit voulu.
    c.checked = allChecked;
  });
});

bulkMarkToggle.addEventListener("click", () => {
  bulkMarkPanel.classList.toggle("hidden");
});

let bulkMode = "available";
function setBulkMode(mode) {
  bulkMode = mode;
  bulkModeAvailableBtn.classList.toggle("active", mode === "available");
  bulkModeUnavailableBtn.classList.toggle("active", mode === "unavailable");
  bulkModeClearBtn.classList.toggle("active", mode === "clear");
}
bulkModeAvailableBtn.addEventListener("click", () => setBulkMode("available"));
bulkModeUnavailableBtn.addEventListener("click", () => setBulkMode("unavailable"));
bulkModeClearBtn.addEventListener("click", () => setBulkMode("clear"));

bulkApplyBtn.addEventListener("click", async () => {
  if (!state.password || !state.config) return;

  const selectedDays = new Set(
    Array.from(bulkDayCheckboxes.querySelectorAll(".bulk-day-checkbox"))
      .filter((c) => bulkDayAll.checked || c.checked)
      .map((c) => Number(c.value))
  );
  const startTime = bulkStartTime.value || null; // "HH:MM" ou null = toute la journée
  const endTime = bulkEndTime.value || null;

  const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
  const times = Grid.buildTimeSlots();
  const startDateISO = bulkStartDate.value || null;
  const endDateISO = bulkEndDate.value || null;

  const newValue = bulkMode === "clear" ? null : bulkMode;
  const matches = [];
  dates.forEach((date) => {
    const dateISO = Grid.toISODate(date);
    if (startDateISO && dateISO < startDateISO) return;
    if (endDateISO && dateISO > endDateISO) return;
    if (!selectedDays.has(date.getDay())) return;
    times.forEach((timeLabel) => {
      if (startTime && timeLabel < startTime) return;
      if (endTime && timeLabel >= endTime) return;
      matches.push(Grid.slotKey(dateISO, timeLabel));
    });
  });

  if (!matches.length) {
    bulkMarkResult.textContent = "Aucun créneau ne correspond à ces critères.";
    return;
  }

  // Pas de case "seulement les cases vides" à cocher à l'avance : si des
  // créneaux ciblés sont déjà marqués (dispo ou pas dispo), on demande à la
  // volée s'il faut les garder ou les remplacer — plus simple qu'une case à
  // penser à cocher avant coup. Rien à demander en mode "Effacer" (rien à
  // "garder"), ni si aucun créneau ciblé n'est déjà marqué.
  let finalMatches = matches;
  if (newValue) {
    const alreadyMarked = matches.filter((key) => key in state.marks).length;
    if (alreadyMarked > 0) {
      const overwrite = confirm(
        `${alreadyMarked} créneau(x) sur les ${matches.length} ciblés sont déjà marqués (dispo ou pas dispo).\n\n` +
        `OK = les remplacer aussi.\nAnnuler = les garder, ne remplir que les cases encore vides.`
      );
      if (!overwrite) finalMatches = matches.filter((key) => !(key in state.marks));
    }
  }

  if (!finalMatches.length) {
    bulkMarkResult.textContent = "Tous les créneaux de cette plage sont déjà marqués — rien à remplir.";
    return;
  }

  finalMatches.forEach((key) => {
    if (newValue) state.marks[key] = newValue;
    else delete state.marks[key];
  });

  renderGrid();
  bulkMarkResult.textContent = `${finalMatches.length} créneau(x) mis à jour.`;
  await persistMarks();
});

// ===================== POSITION DE DÉPART (scroll, pas un filtre) =====================
// La grille affiche toujours TOUS les jours de la période — ceci ne fait que
// choisir où on atterrit à l'ouverture, en scrollant horizontalement jusque
// là. Deux sources, l'admin étant prioritaire :
//  1. "Vue ciblée" réglée par l'admin (config.focusDate) → on atterrit là.
//  2. Sinon, calcul auto : si le prochain événement/deadline de tâche tombe
//     dans les 6 prochains jours (même semaine), on reste sur aujourd'hui ;
//     sinon on atterrit 3 jours avant lui, pour donner un peu de contexte.
// Recalculé une fois au chargement, puis à chaque fois que focusDate change
// (pour ne pas re-scroller sous les pieds de quelqu'un qui a déjà scrollé).
let lastAppliedFocus = undefined;
// Le calcul auto a besoin des événements ET des tâches pour choisir la bonne
// cible — on attend que les deux flux Firestore aient livré au moins une
// fois avant de figer "auto-done", sinon on risque de calculer avec une
// liste d'événements encore vide (premier rendu, avant que listenEvents
// n'ait répondu) et de scroller sur "aujourd'hui" par erreur.
let eventsLoaded = false;
let tasksLoaded = false;

function snapToRenderedDate(dates, targetISO) {
  const iso = dates.map((d) => Grid.toISODate(d));
  return iso.find((d) => d >= targetISO) || iso[iso.length - 1] || iso[0];
}

function computeDefaultTargetDate(dates) {
  if (!dates.length) return null;
  const todayISO = Grid.toISODate(dates[0]);
  const candidates = [];
  (state.events || []).forEach((e) => {
    if (e.date && e.date >= todayISO) candidates.push(e.date);
  });
  (state.tasks || []).forEach((t) => {
    if (t.deadline && t.deadline >= todayISO) candidates.push(t.deadline);
  });
  if (!candidates.length) return todayISO;
  candidates.sort();
  const nearest = candidates[0];
  const daysAway = (new Date(`${nearest}T00:00:00`) - new Date(`${todayISO}T00:00:00`)) / 86400000;
  if (daysAway <= 6) return todayISO;
  const earlier = Grid.toISODate(Grid.addDays(new Date(`${nearest}T00:00:00`), -3));
  return earlier < todayISO ? todayISO : earlier;
}

function scrollGridToDate(dates, targetISO) {
  const snapped = snapToRenderedDate(dates, targetISO);
  const headerCell = gridEl.querySelector(`.cell.day-header[data-date-iso="${snapped}"]`);
  if (!headerCell) return;
  const left = headerCell.offsetLeft - Grid.LAYOUT.timeColWidth - 12;
  gridScrollEl.scrollLeft = Math.max(0, left);
}

function maybeApplyStartPosition(dates) {
  const focusDate = state.config && state.config.focusDate;
  if (focusDate) {
    if (focusDate !== lastAppliedFocus) {
      lastAppliedFocus = focusDate;
      scrollGridToDate(dates, focusDate);
    }
    return;
  }
  if (!eventsLoaded || !tasksLoaded) return; // pas encore assez de données pour calculer la cible
  if (lastAppliedFocus !== "auto-done") {
    lastAppliedFocus = "auto-done";
    const target = computeDefaultTargetDate(dates);
    if (target) scrollGridToDate(dates, target);
  }
}

// ===================== TÂCHES =====================
// Visible seulement connecté. On montre : les tâches libres où il reste de
// la place (n'importe qui peut cliquer "je m'en occupe"), et celles où l'on
// est soi-même dessus (libre ou assignée directement) — les tâches
// assignées directement à quelqu'un d'autre, ou libres mais déjà complètes,
// disparaissent.
function formatDeadline(task) {
  if (!task.deadline) return null;
  return task.deadlineTime ? `${task.deadline} à ${task.deadlineTime}` : task.deadline;
}

const TASK_PRIORITY_LABELS = { urgent: "🔴", important: "🟠", normal: "" };
const TASK_STATUS_LABELS_PUBLIC = {
  a_valider: "🕓 En attente de validation par l'admin",
};

function isTaskLate(task) {
  if (!task.deadline || task.status === "done" || task.status === "a_valider") return false;
  const deadlineDate = new Date(`${task.deadline}T${task.deadlineTime || "23:59"}:00`);
  return deadlineDate < new Date();
}

// Construit le <li> d'une tâche avec ses actions (prendre/lâcher, terminé,
// accepter/refuser une proposition) — utilisé par la liste de la colonne
// Tâches ET par le tableau de bord (mêmes actions, même logique, pour ne pas
// dupliquer/diverger entre les deux endroits).
function buildTaskListItem(task) {
  const assignedTo = task.assignedTo || [];
  const requiredCount = task.requiredCount || 1;
  const proposedTo = task.proposedTo || [];
  const isOnIt = assignedTo.some((a) => a.password === state.password);
  const isProposedToMe = !isOnIt && proposedTo.some((p) => p.password === state.password);

  const li = document.createElement("li");
  const priorityMark = TASK_PRIORITY_LABELS[task.priority] || "";
  const parts = [`📋 ${priorityMark ? priorityMark + " " : ""}${task.label}`];
  const deadline = formatDeadline(task);
  if (deadline) parts.push(`échéance ${deadline}`);
  if (requiredCount > 1) parts.push(`${assignedTo.length}/${requiredCount} personnes`);
  if (task.description) parts.push(task.description);
  if (isProposedToMe) parts.push("🎯 Proposée — à toi de répondre");
  if (task.status && TASK_STATUS_LABELS_PUBLIC[task.status]) parts.push(TASK_STATUS_LABELS_PUBLIC[task.status]);
  if (isTaskLate(task)) parts.push("🔴 EN RETARD");
  li.innerHTML = `<span>${parts.join(" — ")}</span>`;

  const actions = document.createElement("span");
  actions.className = "item-actions";

  if (isProposedToMe) {
    const acceptBtn = document.createElement("button");
    acceptBtn.type = "button";
    acceptBtn.className = "btn btn-sm btn-primary";
    acceptBtn.textContent = "Accepter";
    acceptBtn.addEventListener("click", async () => {
      acceptBtn.disabled = true;
      try {
        await db.acceptTaskProposal(task.id, state.password, state.name);
      } catch (err) {
        alert(err.message || "Action impossible, réessaie.");
      }
      acceptBtn.disabled = false;
    });
    actions.appendChild(acceptBtn);

    const declineBtn = document.createElement("button");
    declineBtn.type = "button";
    declineBtn.className = "btn btn-sm btn-ghost";
    declineBtn.textContent = "Refuser";
    declineBtn.addEventListener("click", async () => {
      declineBtn.disabled = true;
      try {
        await db.declineTaskProposal(task.id, state.password);
      } catch (err) {
        alert(err.message || "Action impossible, réessaie.");
      }
      declineBtn.disabled = false;
    });
    actions.appendChild(declineBtn);
  } else if (isOnIt && task.status === "a_valider") {
    const info = document.createElement("span");
    info.className = "hint";
    info.textContent = "En attente de validation par l'admin";
    actions.appendChild(info);
  } else if (isOnIt && task.fixedAssignment) {
    // Assignée directement par l'admin : pas de bouton pour se retirer,
    // juste un statut — mais on peut toujours indiquer que c'est terminé.
    const info = document.createElement("span");
    info.className = "hint";
    info.textContent = "Assignée par l'admin";
    actions.appendChild(info);
    actions.appendChild(buildMarkDoneButton(task));
  } else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm " + (isOnIt ? "btn-ghost" : "btn-primary");
    btn.textContent = isOnIt ? "Abandonner" : "Je m'en occupe";
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        if (isOnIt) {
          await db.unclaimTask(task.id, state.password);
        } else {
          await db.claimTask(task.id, state.password, state.name);
        }
      } catch (err) {
        alert(err.message || "Action impossible, réessaie.");
      }
      btn.disabled = false;
    });
    actions.appendChild(btn);
    if (isOnIt) actions.appendChild(buildMarkDoneButton(task));
  }

  li.appendChild(actions);
  return li;
}

// Bouton "J'ai terminé" — ne marque jamais "done" directement, seulement
// "a_valider" : c'est toujours l'admin qui valide réellement (voir son
// tableau de bord "Tâches à valider").
function buildMarkDoneButton(task) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-sm btn-ghost";
  btn.textContent = "✅ J'ai terminé";
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await db.markTaskAwaitingValidation(task.id, state.password);
    } catch (err) {
      alert(err.message || "Action impossible, réessaie.");
    }
    btn.disabled = false;
  });
  return btn;
}

// ===================== TABLEAU DES TÂCHES (vue par colonnes) =====================
// Vue d'ensemble visible par tout le monde (pas juste l'admin), qui regroupe
// TOUTES les tâches du site par colonne — pas seulement les siennes, contrairement
// à la liste ci-dessus. Une tâche n'apparaît que dans une seule colonne.
// L'admin voit tout (utile pour piloter) ; un conseiller normal ne voit que
// ce qui le concerne activement — voir "à assigner", "à valider" ou
// "terminées" pour des tâches d'autres personnes n'a pas d'intérêt pour lui.
const TASK_BOARD_COLUMNS_ADMIN = [
  { key: "unassigned", label: "🔓 À assigner" },
  { key: "active", label: "🔵 En cours" },
  { key: "tovalidate", label: "🕓 À valider" },
  { key: "blocked", label: "🔴 Bloquées" },
  { key: "done", label: "✅ Terminées" },
];
const TASK_BOARD_COLUMNS_MEMBER = [
  { key: "active", label: "🔵 En cours" },
  { key: "blocked", label: "🔴 Bloquées" },
];

function taskBoardColumn(t) {
  const status = t.status || "todo";
  if (status === "done") return "done";
  if (status === "a_valider") return "tovalidate";
  if (status === "blocked") return "blocked";
  if (status === "annulee" || status === "proposition") return null; // pas encore assez concret pour un tableau de suivi
  const assignedTo = t.assignedTo || [];
  const requiredCount = t.requiredCount || 1;
  if (!t.fixedAssignment && assignedTo.length < requiredCount) return "unassigned";
  return "active";
}

// Construit le HTML des colonnes (En cours / Bloquées / etc, selon le rôle)
// — utilisé par la colonne "Tâches" (#task-board) ET par le tableau de bord
// (même vue "toute l'équipe", pour ne pas la construire deux fois).
function buildTaskBoardColumnsHTML() {
  const columns = state.isAdmin ? TASK_BOARD_COLUMNS_ADMIN : TASK_BOARD_COLUMNS_MEMBER;
  const byColumn = {};
  columns.forEach((c) => (byColumn[c.key] = []));
  state.tasks.forEach((t) => {
    if (!matchesTaskFilters(t)) return;
    const col = taskBoardColumn(t);
    if (col && byColumn[col]) byColumn[col].push(t);
  });

  return columns.map((col) => {
    // Priorité d'affichage : mes propres tâches en premier dans chaque
    // colonne, avant celles des autres — c'est ce qui m'intéresse en premier.
    const items = byColumn[col.key]
      .slice()
      .sort((a, b) => {
        const aMine = (a.assignedTo || []).some((x) => x.password === state.password) ? 0 : 1;
        const bMine = (b.assignedTo || []).some((x) => x.password === state.password) ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      });
    const cards = items
      .map((t) => {
        const assignedTo = t.assignedTo || [];
        const isMine = assignedTo.some((x) => x.password === state.password);
        const who = assignedTo.length ? assignedTo.map((a) => a.name).join(", ") : "personne";
        const deadline = formatDeadline(t);
        const priorityMark = TASK_PRIORITY_LABELS[t.priority] || "";
        return `<div class="task-board-card${isMine ? " mine" : ""}">${priorityMark ? priorityMark + " " : ""}${t.label}<br><span class="hint">${who}${deadline ? " — éch. " + deadline : ""}</span></div>`;
      })
      .join("");
    return `<div class="task-board-column"><h4>${col.label} (${items.length})</h4>${cards || '<span class="hint">Rien ici.</span>'}</div>`;
  }).join("");
}

// ===================== TABLEAU DE BORD (côté membre) =====================
// Colonne optionnelle (masquée par défaut, activable via "📊 Tableau de
// bord") — pense-bête + tâches actionnables au même endroit, sans avoir à
// aller regarder le calendrier ou la colonne Tâches pour savoir quoi faire.
function memberVisibleBoardColumnKeys() {
  const columns = state.isAdmin ? TASK_BOARD_COLUMNS_ADMIN : TASK_BOARD_COLUMNS_MEMBER;
  return new Set(columns.map((c) => c.key));
}

function dashboardTile(label, value, listItems) {
  const list = listItems && listItems.length ? `<ul>${listItems.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
  return `<div class="dashboard-tile"><span class="dashboard-value">${value}</span><span class="dashboard-label">${label}</span>${list}</div>`;
}

function renderMemberDashboard() {
  const loggedIn = !!state.password;
  tasksLoginHint.classList.toggle("hidden", loggedIn);
  if (!loggedIn) {
    memberDashboardContent.innerHTML = "";
    return;
  }
  const todayISO = Grid.toISODate(new Date());

  // Mêmes tâches que celles listées dans la colonne "Tâches" (assignées à
  // moi, proposées à moi, ou libres avec encore de la place) — le tableau de
  // bord est juste un autre endroit pour agir dessus, pas une liste séparée.
  // Pas de filtre priorité/état appliqué ici : ces filtres sont pour explorer
  // la colonne Tâches, pas pour ce qui m'attend concrètement.
  const myTasks = state.tasks
    .filter((t) => {
      const assignedTo = t.assignedTo || [];
      const requiredCount = t.requiredCount || 1;
      const proposedTo = t.proposedTo || [];
      const isOnIt = assignedTo.some((a) => a.password === state.password);
      const isProposedToMe = proposedTo.some((p) => p.password === state.password);
      // Une fois validée par l'admin ("done"), plus rien à faire dessus —
      // elle ne doit plus traîner dans le tableau de bord (reste visible dans
      // la colonne "Tâches" complète si besoin, comme le reste de l'historique).
      if (t.status === "done") return false;
      if (isOnIt || isProposedToMe) return true;
      if (t.fixedAssignment) return false;
      // Une tâche qu'on a déjà refusée ne revient plus encombrer le tableau
      // de bord (mais reste visible dans la colonne "Tâches" complète, pour
      // ceux qui veulent quand même tout voir — voir plus haut dans le
      // fichier, cette colonne-là ne filtre pas declinedBy).
      if ((t.declinedBy || []).includes(state.password)) return false;
      return assignedTo.length < requiredCount;
    })
    .sort((a, b) => {
      const order = { urgent: 0, important: 1, normal: 2 };
      const pa = order[a.priority] ?? 2;
      const pb = order[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.deadline || "9999").localeCompare(b.deadline || "9999");
    });

  const nextMeeting = (state.meetings || [])
    .filter((m) => m.status === "planned" && m.date >= todayISO)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0];
  const nextMeetingEvent = nextMeeting ? state.events.find((e) => e.id === nextMeeting.eventId) : null;

  const upcomingEvents = state.events
    .filter((e) => (e.endDate || e.date) >= todayISO)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .slice(0, 3);

  // Tâches en retard de toute l'équipe, mais seulement celles dans les
  // colonnes que ce membre peut voir sur le tableau (pas "à assigner" ni "à
  // valider" pour un conseiller normal — même logique que le tableau lui-même).
  const visibleKeys = memberVisibleBoardColumnKeys();
  const teamLateTasks = state.tasks.filter((t) => isTaskLate(t) && visibleKeys.has(taskBoardColumn(t)));

  const tiles = [
    dashboardTile(
      "Prochaine réunion",
      nextMeeting ? nextMeeting.date : "—",
      nextMeeting
        ? [`${nextMeetingEvent ? nextMeetingEvent.label : "?"}${nextMeeting.startTime ? " à " + nextMeeting.startTime : ""}`]
        : ["Aucune réunion prévue"]
    ),
    dashboardTile("Événements à venir", upcomingEvents.length, upcomingEvents.map((e) => `${e.date} — ${e.label}`)),
    dashboardTile("Tâches en retard (équipe)", teamLateTasks.length, teamLateTasks.slice(0, 5).map((t) => t.label)),
  ];

  memberDashboardContent.innerHTML = `
    <div class="dashboard-grid">${tiles.join("")}</div>
    <h3>Mes tâches</h3>
    <ul id="dashboard-my-tasks" class="item-list"></ul>
    <h3>Toute l'équipe</h3>
    <div class="task-board">${buildTaskBoardColumnsHTML()}</div>
  `;

  const list = document.getElementById("dashboard-my-tasks");
  if (!myTasks.length) {
    list.innerHTML = "<li class=\"hint\">Rien pour toi en ce moment.</li>";
  } else {
    myTasks.forEach((t) => list.appendChild(buildTaskListItem(t)));
  }
}

// ===================== BANNIÈRE "DISPO DEMANDÉE" =====================
// Un événement peut être marqué par l'admin comme "dispo demandée" : on
// affiche un rappel explicite ici, en plus de la mise en évidence directement
// sur la grille (voir renderGrid), tant que le membre n'a pas rempli tout le
// créneau concerné (dispo OU pas dispo — on veut juste une réponse).
function eventTimeRangeMinutes(ev) {
  if (ev.allDay) return null;
  const toMin = (s) => {
    const [h, m] = (s || "00:00").split(":").map(Number);
    return h * 60 + m;
  };
  return [toMin(ev.startTime || "00:00"), toMin(ev.endTime || "23:59")];
}

function availabilityRequestStats(ev) {
  const range = eventTimeRangeMinutes(ev);
  if (!range) return null;
  const times = Grid.buildTimeSlots();
  let total = 0;
  let answered = 0;
  times.forEach((t) => {
    const [h, m] = t.split(":").map(Number);
    const minutes = h * 60 + m;
    if (minutes < range[0] || minutes >= range[1]) return;
    total++;
    if (state.marks[Grid.slotKey(ev.date, t)]) answered++;
  });
  return { total, answered };
}

function renderAvailabilityBanner() {
  if (!state.password || !state.config) {
    availRequestBanner.classList.add("hidden");
    availRequestBanner.innerHTML = "";
    return;
  }
  const todayISO = Grid.toISODate(new Date());
  const requested = (state.events || []).filter((e) => e.availabilityRequested && !e.allDay && e.date >= todayISO);
  const pollingSlots = state.config.pollingSlots || [];
  const pollingUnanswered = pollingSlots.filter((key) => !state.marks[key]);
  if (!requested.length && !pollingUnanswered.length) {
    availRequestBanner.classList.add("hidden");
    availRequestBanner.innerHTML = "";
    return;
  }
  availRequestBanner.classList.remove("hidden");
  const pollingHtml = pollingUnanswered.length
    ? `<div class="avail-request-item">🙋 <strong>${pollingUnanswered.length}</strong> créneau(x) sondé(s) en attente de ta réponse — repère-les en <span style="color:#e08a1e">orange</span> sur le calendrier et clique dessus (dispo/pas dispo).</div>`
    : "";
  availRequestBanner.innerHTML = pollingHtml + requested
    .map((ev) => {
      const stats = availabilityRequestStats(ev);
      const done = stats && stats.answered >= stats.total;
      const progress = stats ? ` — ${stats.answered}/${stats.total} créneaux répondus` : "";
      return `<div class="avail-request-item${done ? " done" : ""}">🙋 Ta dispo est demandée pour <strong>${ev.label}</strong> le ${ev.date}${ev.startTime ? " de " + ev.startTime + " à " + (ev.endTime || "") : ""}${progress}${done ? " ✅" : ""} <button type="button" class="btn btn-ghost btn-sm avail-request-jump" data-date="${ev.date}">Y aller</button></div>`;
    })
    .join("");
  availRequestBanner.querySelectorAll(".avail-request-jump").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
      scrollGridToDate(dates, btn.dataset.date);
    });
  });
}

// ===================== SONDAGES =====================
// Bannière listant les sondages ouverts auxquels le membre connecté n'a pas
// encore répondu, avec le formulaire de réponse directement dedans (pas de
// page séparée). Les résultats ne sont jamais montrés ici : seul l'admin les
// voit (côté admin.js).
function renderPollBanner() {
  if (!state.password) {
    pollBanner.classList.add("hidden");
    pollBanner.innerHTML = "";
    return;
  }
  const open = (state.polls || []).filter((p) => p.status === "open");
  const unanswered = open.filter((p) => !(p.responses || []).some((r) => r.password === state.password));
  if (!unanswered.length) {
    pollBanner.classList.add("hidden");
    pollBanner.innerHTML = "";
    return;
  }
  pollBanner.classList.remove("hidden");
  pollBanner.innerHTML = unanswered
    .map((poll) => {
      let fieldsHtml = "";
      if (poll.type === "choice") {
        const inputType = poll.multiple ? "checkbox" : "radio";
        fieldsHtml = (poll.options || [])
          .map(
            (o, i) =>
              `<label class="checkbox-group"><input type="${inputType}" name="poll-${poll.id}" value="${o}"> ${o}</label>`
          )
          .join("");
      } else if (poll.type === "yesno") {
        fieldsHtml = `<label class="checkbox-group"><input type="radio" name="poll-${poll.id}" value="Oui"> Oui</label><label class="checkbox-group"><input type="radio" name="poll-${poll.id}" value="Non"> Non</label>`;
      } else {
        fieldsHtml = `<input type="text" class="poll-text-input" data-poll="${poll.id}" placeholder="Ta réponse">`;
      }
      return `<div class="avail-request-item poll-banner-item" data-poll-id="${poll.id}">📝 <strong>${poll.question}</strong><div class="poll-banner-fields">${fieldsHtml}</div><button type="button" class="btn btn-primary btn-sm poll-submit-btn" data-poll="${poll.id}">Répondre</button></div>`;
    })
    .join("");

  pollBanner.querySelectorAll(".poll-submit-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const pollId = btn.dataset.poll;
      const poll = unanswered.find((p) => p.id === pollId);
      if (!poll) return;
      const item = pollBanner.querySelector(`[data-poll-id="${pollId}"]`);
      let answer;
      if (poll.type === "text") {
        const input = item.querySelector(".poll-text-input");
        answer = (input.value || "").trim();
        if (!answer) {
          alert("Écris une réponse avant d'envoyer.");
          return;
        }
      } else {
        const checked = Array.from(item.querySelectorAll("input:checked")).map((i) => i.value);
        if (!checked.length) {
          alert("Choisis une réponse avant d'envoyer.");
          return;
        }
        answer = poll.type === "choice" && poll.multiple ? checked : checked[0];
      }
      btn.disabled = true;
      try {
        await db.submitPollResponse(pollId, state.password, state.name, answer);
      } catch (err) {
        alert(err.message || "Échec de l'envoi, réessaie.");
        btn.disabled = false;
      }
    });
  });
}

// ===================== ONGLET "ORDRE DU JOUR" (public) =====================
// Onglet exclusif façon menu ☰ de l'admin, mais réduit à 2 boutons : cliquer
// sur l'un masque tout le reste (voir data-tab-panel dans index.html).
// N'apparaît que si l'admin l'a activé (state.config.agendaTabEnabled).
function switchTab(tab) {
  state.activeTab = tab;
  publicTabs.querySelectorAll(".public-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  tabPanels.forEach((el) => {
    el.classList.toggle("hidden", el.dataset.tabPanel !== tab);
  });
  if (tab === "agenda") renderAgendaTab();
  if (tab === "tasks") renderMemberDashboard();
  if (tab === "roles") {
    renderRolesEventSelect();
    rolesPollingSlotSelection = new Set((state.config && state.config.pollingSlots) || []);
    renderRolesPollingSlotGrid();
  }
}
publicTabs.addEventListener("click", (e) => {
  const btn = e.target.closest(".public-tab-btn");
  if (!btn || btn.classList.contains("hidden")) return;
  switchTab(btn.dataset.tab);
});

// La barre d'onglets entière (pas juste les boutons ODJ/Tâches/Disponibilités)
// ne sert à rien tant que l'admin n'a activé aucun onglet optionnel et que le
// membre connecté n'a pas un poste donnant accès à "Disponibilités" — dans ce
// cas, un seul bouton "Calendrier" cliquable n'apporterait rien.
function applyPublicTabsVisibility() {
  const agendaEnabled = !!(state.config && state.config.agendaTabEnabled);
  const tasksEnabled = !!(state.config && state.config.tasksTabEnabled);
  // L'admin voit toujours tout ce que verrait un conseiller avec un poste
  // particulier — jamais moins d'accès qu'eux.
  const rolesEnabled = state.isAdmin || ROLES_WITH_AVAILABILITY_ACCESS.includes(state.role);
  agendaTabBtn.classList.toggle("hidden", !agendaEnabled);
  tasksTabBtn.classList.toggle("hidden", !tasksEnabled);
  rolesTabBtn.classList.toggle("hidden", !rolesEnabled);
  const passwordChangeEnabled = !!(state.config && state.config.passwordChangeEnabled);
  passwordChangeBtn.classList.toggle("hidden", !state.password || !passwordChangeEnabled);
  if (!passwordChangeEnabled) {
    passwordChangeForm.classList.add("hidden");
    passwordChangeStatus.textContent = "";
  }
  if (rolesEnabled) ensureRolesDataLoaded();
  publicTabs.classList.toggle("hidden", !agendaEnabled && !tasksEnabled && !rolesEnabled);
  if (!agendaEnabled && state.activeTab === "agenda") switchTab("calendar");
  if (!tasksEnabled && state.activeTab === "tasks") switchTab("calendar");
  if (!rolesEnabled && state.activeTab === "roles") switchTab("calendar");
}

// "Prochaine réunion" au sens de cet onglet : la même règle que partout
// ailleurs sur le site (première réunion "planned" dont la date n'est pas
// passée).
function nextPlannedMeetingPublic() {
  const todayISO = Grid.toISODate(new Date());
  return (state.meetings || [])
    .filter((m) => m.status === "planned" && m.date >= todayISO)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0];
}

// ===================== ONGLET "DISPONIBILITÉS" (postes présidente/vice-présidente) =====================
// Même logique que la vue "par événement" du panneau admin (admin.js), pour
// donner ce même droit de lecture à une conseillère avec ce poste, sans lui
// donner tous les droits admin. Pas de duplication de données sensibles :
// on ne charge les disponibilités de tout le monde que si l'onglet est
// utilisable (voir listenAllAvailability plus bas).
function eventSlotKeys(ev) {
  if (ev.allDay) {
    const times = Grid.buildTimeSlots();
    const dates = Grid.buildInclusiveDateRange(ev.date, ev.endDate);
    const keys = [];
    dates.forEach((d) => times.forEach((t) => keys.push(Grid.slotKey(d, t))));
    return keys;
  }
  const times = Grid.buildTimeSlots();
  return times.filter((t) => t >= (ev.startTime || "00:00") && t < (ev.endTime || "23:59")).map((t) => Grid.slotKey(ev.date, t));
}

function classifyMembersForRoles(slotKeys, thresholdMinutes) {
  const marksByMember = new Map((state.allAvailability || []).map((r) => [r.id, r.marks || {}]));
  const available = [];
  const unavailable = [];
  const unknown = [];
  (state.rolesMembers || []).forEach((m) => {
    const marks = marksByMember.get(m.id) || {};
    let availableSlots = 0;
    let hasUnavailable = false;
    slotKeys.forEach((key) => {
      const v = marks[key];
      if (v === "available") availableSlots += 1;
      if (v === "unavailable") hasUnavailable = true;
    });
    const availableMinutes = availableSlots * CONFIG.slotMinutes;
    if (availableMinutes >= thresholdMinutes) available.push(m.name);
    else if (hasUnavailable) unavailable.push(m.name);
    else unknown.push(m.name);
  });
  return { available, unavailable, unknown };
}

function describeEventForRoles(ev) {
  if (ev.allDay) {
    return ev.endDate && ev.endDate !== ev.date ? `${ev.date} → ${ev.endDate}` : ev.date;
  }
  return `${ev.date} ${ev.startTime}-${ev.endTime}`;
}

function renderRolesEventResult() {
  const evId = rolesEventSelect.value;
  if (!evId) {
    rolesEventResult.innerHTML = "";
    return;
  }
  const ev = (state.events || []).find((e) => e.id === evId);
  if (!ev) {
    rolesEventResult.innerHTML = "";
    return;
  }
  const slotKeys = eventSlotKeys(ev);
  const thresholdMinutes = ev.minAvailableMinutes || 45;
  const { available, unavailable, unknown } = classifyMembersForRoles(slotKeys, thresholdMinutes);
  available.sort((a, b) => a.localeCompare(b));
  unavailable.sort((a, b) => a.localeCompare(b));
  unknown.sort((a, b) => a.localeCompare(b));

  let progressHtml = "";
  if (ev.requiredCount) {
    const reached = available.length >= ev.requiredCount;
    progressHtml = `<p class="response-summary"><strong style="color:${reached ? "#16a34a" : "#b42323"}">${available.length} / ${ev.requiredCount}</strong> personnes nécessaires ${reached ? "✅ atteint" : "— il en manque"}</p>`;
  }

  rolesEventResult.innerHTML = `
    <p class="hint">Compté "disponible" à partir de ${thresholdMinutes} min cumulées dispo sur ce créneau.</p>
    ${progressHtml}
    <p>✅ Disponibles (${available.length}) : ${available.join(", ") || "—"}</p>
    <p>❌ Indisponibles (${unavailable.length}) : ${unavailable.join(", ") || "—"}</p>
    <p>❔ N'ont pas répondu (${unknown.length}) : ${unknown.join(", ") || "—"}</p>
  `;
}
rolesEventSelect.addEventListener("change", renderRolesEventResult);

function renderRolesEventSelect() {
  const previous = rolesEventSelect.value;
  const sorted = (state.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  rolesEventSelect.innerHTML = '<option value="">— Choisir un événement —</option>';
  sorted.forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.label} — ${describeEventForRoles(ev)}`;
    rolesEventSelect.appendChild(opt);
  });
  if (sorted.some((ev) => ev.id === previous)) rolesEventSelect.value = previous;
  renderRolesEventResult();
  renderRolesBestSlotEventSelect();
}

// ---------- Sonder des créneaux (même fonctionnalité que côté admin) ----------
// Accessible directement depuis l'onglet Disponibilités public, sans avoir à
// aller dans le panneau admin — même mécanisme (config/current.pollingSlots).
let rolesPollingSlotSelection = new Set();
let rolesPollingSlotPainting = false;
let rolesPollingSlotPaintAction = "set";

function applyRolesPollingSlotPaint(cell, key) {
  if (rolesPollingSlotPaintAction === "clear") {
    rolesPollingSlotSelection.delete(key);
    cell.classList.remove("polling-selected");
  } else {
    rolesPollingSlotSelection.add(key);
    cell.classList.add("polling-selected");
  }
}
document.addEventListener("mouseup", () => {
  rolesPollingSlotPainting = false;
});

function renderRolesPollingSlotGrid() {
  if (!rolesPollingSlotGridEl || !state.config) return;
  const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
  const times = Grid.buildTimeSlots();

  rolesPollingSlotGridEl.innerHTML = "";
  rolesPollingSlotGridEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
  rolesPollingSlotGridEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);
  Grid.renderGridHeaders(rolesPollingSlotGridEl, dates, state.events);

  Grid.renderHourRows(rolesPollingSlotGridEl, dates, times, state.events, state.config.blockedSlots || [], (cell, { dateISO, timeLabel }) => {
    const key = Grid.slotKey(dateISO, timeLabel);
    cell.dataset.key = key;
    if (rolesPollingSlotSelection.has(key)) cell.classList.add("polling-selected");
    cell.addEventListener("mousedown", (e) => {
      e.preventDefault();
      rolesPollingSlotPainting = true;
      rolesPollingSlotPaintAction = rolesPollingSlotSelection.has(key) ? "clear" : "set";
      applyRolesPollingSlotPaint(cell, key);
    });
    cell.addEventListener("mouseenter", () => {
      if (rolesPollingSlotPainting) applyRolesPollingSlotPaint(cell, key);
    });
  });
}

if (rolesPollingSlotSaveBtn) {
  rolesPollingSlotSaveBtn.addEventListener("click", async () => {
    rolesPollingSlotResult.textContent = "Enregistrement…";
    rolesPollingSlotSaveBtn.disabled = true;
    try {
      await db.setPollingSlots(Array.from(rolesPollingSlotSelection));
      rolesPollingSlotResult.textContent = `${rolesPollingSlotSelection.size} créneau(x) sondé(s) enregistré(s) — visible en orange pour tout le monde.`;
    } catch (err) {
      console.error(err);
      rolesPollingSlotResult.textContent = "Échec de l'enregistrement, réessaie.";
    }
    rolesPollingSlotSaveBtn.disabled = false;
  });
}

if (rolesPollingSlotClearBtn) {
  rolesPollingSlotClearBtn.addEventListener("click", async () => {
    rolesPollingSlotResult.textContent = "Suppression…";
    rolesPollingSlotClearBtn.disabled = true;
    try {
      await db.clearPollingSlots();
      rolesPollingSlotSelection.clear();
      renderRolesPollingSlotGrid();
      rolesPollingSlotResult.textContent = "Créneaux sondés vidés.";
    } catch (err) {
      console.error(err);
      rolesPollingSlotResult.textContent = "Échec, réessaie.";
    }
    rolesPollingSlotClearBtn.disabled = false;
  });
}

// ---- Marquage rapide (par règle) pour le sondage de créneaux ----
const ROLES_POLLING_SLOT_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lundi → dimanche

function renderRolesPollingSlotDayCheckboxes() {
  if (!rolesPollingSlotDayCheckboxes || rolesPollingSlotDayCheckboxes.childElementCount) return; // construit une seule fois
  ROLES_POLLING_SLOT_DAY_ORDER.forEach((dow) => {
    const label = document.createElement("label");
    label.className = "checkbox-group";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "roles-polling-slot-day-checkbox";
    input.value = String(dow);
    label.appendChild(input);
    label.appendChild(document.createTextNode(" " + Grid.WEEKDAYS_FULL[dow].slice(0, 3)));
    rolesPollingSlotDayCheckboxes.appendChild(label);
  });
}
renderRolesPollingSlotDayCheckboxes();

if (rolesPollingSlotQuickselectBtn) {
  rolesPollingSlotQuickselectBtn.addEventListener("click", () => {
    const selectedDays = new Set(
      Array.from(rolesPollingSlotDayCheckboxes.querySelectorAll(".roles-polling-slot-day-checkbox:checked")).map((c) => Number(c.value))
    );
    if (!selectedDays.size) {
      rolesPollingSlotQuickselectResult.textContent = "Coche au moins un jour.";
      return;
    }
    const startTime = rolesPollingSlotStartTime.value || null;
    const endTime = rolesPollingSlotEndTime.value || null;
    const startDateISO = rolesPollingSlotStartDate.value || null;
    const endDateISO = rolesPollingSlotEndDate.value || null;

    const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
    const times = Grid.buildTimeSlots();
    let added = 0;
    dates.forEach((date) => {
      const dateISO = Grid.toISODate(date);
      if (startDateISO && dateISO < startDateISO) return;
      if (endDateISO && dateISO > endDateISO) return;
      if (!selectedDays.has(date.getDay())) return;
      times.forEach((timeLabel) => {
        if (startTime && timeLabel < startTime) return;
        if (endTime && timeLabel >= endTime) return;
        const key = Grid.slotKey(dateISO, timeLabel);
        if (!rolesPollingSlotSelection.has(key)) added++;
        rolesPollingSlotSelection.add(key);
      });
    });

    renderRolesPollingSlotGrid();
    rolesPollingSlotQuickselectResult.textContent = added
      ? `${added} créneau(x) ajouté(s) à la sélection — clique "Enregistrer les créneaux sondés" pour valider.`
      : "Aucun nouveau créneau à ajouter (déjà tous sélectionnés).";
  });
}

// Sélecteur d'événement optionnel dans "Trouver le meilleur créneau" : au lieu
// de taper les dates à la main, on choisit un événement existant et ça
// pré-remplit automatiquement Du/au (et la durée si l'événement a des heures).
function renderRolesBestSlotEventSelect() {
  if (!rolesBestSlotEventSelect) return;
  const previous = rolesBestSlotEventSelect.value;
  const sorted = (state.events || []).slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  rolesBestSlotEventSelect.innerHTML = '<option value="">— Aucun, période libre —</option>';
  sorted.forEach((ev) => {
    const opt = document.createElement("option");
    opt.value = ev.id;
    opt.textContent = `${ev.label} — ${describeEventForRoles(ev)}`;
    rolesBestSlotEventSelect.appendChild(opt);
  });
  if (sorted.some((ev) => ev.id === previous)) rolesBestSlotEventSelect.value = previous;
}

if (rolesBestSlotEventSelect) {
  rolesBestSlotEventSelect.addEventListener("change", () => {
    const evId = rolesBestSlotEventSelect.value;
    if (!evId) return;
    const ev = (state.events || []).find((e) => e.id === evId);
    if (!ev) return;
    rolesBestSlotStartInput.value = ev.date;
    rolesBestSlotEndInput.value = ev.endDate || ev.date;
    if (!ev.allDay && ev.startTime && ev.endTime) {
      const durationMinutes = rolesTimeStrToMinutes(ev.endTime) - rolesTimeStrToMinutes(ev.startTime);
      if (durationMinutes > 0) rolesBestSlotDurationInput.value = durationMinutes;
    }
  });
}

// ---------- Trouver le meilleur créneau (même logique que côté admin) ----------
// Balaie tous les créneaux de départ possibles, de la durée demandée, sur la
// période donnée, et classe les membres (via classifyMembersForRoles) pour
// chacun — puis retient les 8 meilleurs. Lecture seule ici (pas de bouton
// "utiliser ce créneau" : la création d'événement reste réservée à l'admin).
function rolesTimeStrToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function rolesMinutesToTimeStr(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function findBestSlotsForRoles({ startDate, endDate, durationMinutes, thresholdMinutes, includeWeekends }) {
  const dates = Grid.buildInclusiveDateRange(startDate, endDate).filter((d) => {
    if (includeWeekends) return true;
    const dow = new Date(`${d}T00:00:00`).getDay();
    return dow !== 0 && dow !== 6;
  });
  const times = Grid.buildTimeSlots();
  const dayEndMinutes = CONFIG.dayEndHour * 60;

  const results = [];
  dates.forEach((dateISO) => {
    times.forEach((startTime) => {
      const startMin = rolesTimeStrToMinutes(startTime);
      const endMin = startMin + durationMinutes;
      if (endMin > dayEndMinutes) return;
      const endTime = rolesMinutesToTimeStr(endMin);
      const slotKeys = times.filter((t) => t >= startTime && t < endTime).map((t) => Grid.slotKey(dateISO, t));
      const { available, unavailable, unknown } = classifyMembersForRoles(slotKeys, thresholdMinutes);
      results.push({ dateISO, startTime, endTime, available, unavailable, unknown });
    });
  });

  results.sort((a, b) => {
    if (b.available.length !== a.available.length) return b.available.length - a.available.length;
    if (a.unavailable.length !== b.unavailable.length) return a.unavailable.length - b.unavailable.length;
    const dcmp = a.dateISO.localeCompare(b.dateISO);
    if (dcmp !== 0) return dcmp;
    return a.startTime.localeCompare(b.startTime);
  });
  return { all: results, top: results.slice(0, 8), dates };
}

// ---------- Heatmap de la recherche "Trouver le meilleur créneau" (public) ----------
// Même logique que côté admin (voir admin.js) : un cellule par créneau de
// départ candidat, coloré par nombre de dispo, pour voir en un coup d'œil
// l'effet d'un changement de durée sur le classement.
function renderRolesBestSlotHeatmap(allResults, topResults, dateStrings) {
  if (!rolesBestSlotHeatmapEl) return;
  // dateStrings vient de buildInclusiveDateRange (chaînes "YYYY-MM-DD") —
  // renderGridHeaders/renderHourRows attendent des objets Date (comme
  // buildDateList), d'où la conversion ici.
  const dates = dateStrings.map((d) => new Date(`${d}T00:00:00`));
  const times = Grid.buildTimeSlots();
  const counts = new Map();
  allResults.forEach((r) => {
    counts.set(Grid.slotKey(r.dateISO, r.startTime), { availCount: r.available.length, names: r.available });
  });
  const topKeys = new Set(topResults.map((r) => Grid.slotKey(r.dateISO, r.startTime)));
  const rankByKey = new Map(topResults.map((r, i) => [Grid.slotKey(r.dateISO, r.startTime), i + 1]));

  rolesBestSlotHeatmapEl.innerHTML = "";
  rolesBestSlotHeatmapEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
  rolesBestSlotHeatmapEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);
  Grid.renderGridHeaders(rolesBestSlotHeatmapEl, dates, state.events);

  const maxCount = (state.rolesMembers || []).length || 1;
  Grid.renderHourRows(rolesBestSlotHeatmapEl, dates, times, state.events, (state.config && state.config.blockedSlots) || [], (cell, { dateISO, timeLabel, blocked }) => {
    const key = Grid.slotKey(dateISO, timeLabel);
    cell.dataset.key = key;
    if (blocked) return;
    const entry = counts.get(key);
    if (!entry) return;
    if (entry.availCount > 0) {
      const ratio = entry.availCount / maxCount;
      cell.style.background = `rgba(34, 197, 94, ${(0.15 + ratio * 0.75).toFixed(2)})`;
      cell.textContent = String(entry.availCount);
    }
    if (topKeys.has(key)) {
      cell.style.boxShadow = "inset 0 0 0 2px #d97706";
      cell.title = `#${rankByKey.get(key)} meilleur créneau — ${entry.availCount} dispo : ${entry.names.join(", ") || "—"}`;
    } else {
      cell.title = `${entry.availCount} dispo : ${entry.names.join(", ") || "—"}`;
    }
  });
}

// "Lun 01/10" plutôt que "2026-10-01" — plus lisible en un coup d'œil dans
// une liste de résultats, tout en restant compact (abrégé volontairement).
function formatDateShortWithDay(dateISO) {
  const [y, m, d] = dateISO.split("-");
  const dow = new Date(`${dateISO}T12:00:00`).getDay();
  return `${Grid.WEEKDAYS_FULL[dow].slice(0, 3)} ${d}/${m}`;
}

function renderRolesBestSlotResults(results) {
  if (!results.length) {
    rolesBestSlotResult.innerHTML = "<p>Aucun créneau trouvé (vérifie la période et la durée par rapport aux heures de la grille).</p>";
    return;
  }
  rolesBestSlotResult.innerHTML = results
    .map((r, i) => {
      return `<p><strong>${i + 1}.</strong> ${formatDateShortWithDay(r.dateISO)} ${r.startTime}-${r.endTime} — ${r.available.length} dispo (${r.available.join(", ") || "—"}), ${r.unknown.length} pas répondu (${r.unknown.join(", ") || "—"}), ${r.unavailable.length} indispo (${r.unavailable.join(", ") || "—"})</p>`;
    })
    .join("");
}

if (rolesBestSlotForm) {
  rolesBestSlotForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const startDate = rolesBestSlotStartInput.value;
    const endDate = rolesBestSlotEndInput.value;
    if (!startDate || !endDate) return;
    const durationMinutes = Number(rolesBestSlotDurationInput.value) || 60;
    const thresholdMinutes = Number(rolesBestSlotThresholdInput.value) || 45;
    const includeWeekends = !!(rolesBestSlotWeekendsInput && rolesBestSlotWeekendsInput.checked);
    const { all, top, dates } = findBestSlotsForRoles({ startDate, endDate, durationMinutes, thresholdMinutes, includeWeekends });
    renderRolesBestSlotResults(top);
    renderRolesBestSlotHeatmap(all, top, dates);
  });
}

// Les disponibilités de tout le monde (et la liste des membres, pour avoir
// les noms) ne sont chargées côté public QUE pour un membre dont le poste
// donne accès à cet onglet — pas pour tout visiteur du site.
let rolesDataUnsubscribes = [];
function ensureRolesDataLoaded() {
  if (rolesDataUnsubscribes.length) return;
  rolesDataUnsubscribes.push(
    db.listenAllAvailability((rows) => {
      state.allAvailability = rows;
      if (state.activeTab === "roles") renderRolesEventResult();
    }),
    db.listenMembers((members) => {
      state.rolesMembers = members;
      if (state.activeTab === "roles") renderRolesEventResult();
    })
  );
}

function renderAgendaTab() {
  const meeting = nextPlannedMeetingPublic();
  const canWrite = !!state.password;
  agendaProposalLoginHint.classList.toggle("hidden", canWrite);
  agendaProposalForm.classList.toggle("hidden", !canWrite);

  if (!meeting) {
    agendaMeetingInfo.textContent = "Aucune réunion prévue pour l'instant.";
    agendaItemListEl.innerHTML = "";
    return;
  }
  const ev = state.events.find((e) => e.id === meeting.eventId);
  agendaMeetingInfo.textContent = `${ev ? ev.label : "Réunion"} — ${meeting.date}${meeting.startTime ? " à " + meeting.startTime : ""}`;

  const allItems = (state.agendaItems || []).filter((it) => it.meetingId === meeting.id);
  // Un seul niveau d'imbrication : les points principaux (sans parentId),
  // chacun suivi de ses éventuels sous-points (parentId === son id), les uns
  // et les autres triés par "order".
  const topItems = allItems.filter((it) => !it.parentId).sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!topItems.length) {
    agendaItemListEl.innerHTML = `<li class="hint">Aucun point encore ajouté pour cette réunion.</li>`;
    return;
  }
  agendaItemListEl.innerHTML = "";

  function buildItemRow(item, isSubItem) {
    const count = (state.agendaComments || []).filter((c) => c.agendaItemId === item.id).length;
    const li = document.createElement("li");
    if (isSubItem) li.classList.add("agenda-subitem");
    li.innerHTML = `<span>${isSubItem ? "↳ " : ""}${item.done ? "✅" : "🟡"} <strong>${item.label}</strong></span><span class="hint" style="padding:0">💬 ${count} — clique pour voir/commenter</span>`;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => openAgendaModal(item.id));
    return li;
  }

  topItems.forEach((item) => {
    agendaItemListEl.appendChild(buildItemRow(item, false));
    const subItems = allItems.filter((it) => it.parentId === item.id).sort((a, b) => (a.order || 0) - (b.order || 0));
    subItems.forEach((sub) => agendaItemListEl.appendChild(buildItemRow(sub, true)));
  });
}

// ---- Fenêtre contextuelle d'un point ----
function openAgendaModal(itemId) {
  state.openAgendaItemId = itemId;
  agendaModalOverlay.classList.remove("hidden");
  renderAgendaModal();
}
function closeAgendaModal() {
  state.openAgendaItemId = null;
  agendaModalOverlay.classList.add("hidden");
}
agendaModalClose.addEventListener("click", closeAgendaModal);
agendaModalOverlay.addEventListener("click", (e) => {
  if (e.target === agendaModalOverlay) closeAgendaModal();
});

function renderAgendaModal() {
  const item = (state.agendaItems || []).find((it) => it.id === state.openAgendaItemId);
  if (!item) {
    closeAgendaModal();
    return;
  }
  // Les points d'ODJ n'ont aujourd'hui qu'un seul champ de texte (label,
  // rempli par l'admin ou l'import CSV) — c'est lui qu'on affiche en grand
  // dans la modale, pas de titre + texte séparés.
  agendaModalTitle.textContent = item.done ? "✅ Point traité" : "🟡 Point à traiter";
  agendaModalText.textContent = item.label;
  agendaModalText.classList.remove("hidden");

  const comments = (state.agendaComments || [])
    .filter((c) => c.agendaItemId === item.id)
    .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

  agendaModalComments.innerHTML = "";
  if (!comments.length) {
    agendaModalComments.innerHTML = `<li class="hint">Aucun avis pour l'instant — sois le premier à réagir.</li>`;
  } else {
    comments.forEach((c) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.innerHTML = `<strong>${c.name}</strong> : ${c.text}`;
      li.appendChild(span);
      if (c.password === state.password) {
        const actions = document.createElement("div");
        actions.className = "item-list-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-sm";
        editBtn.textContent = "✏️ Modifier";
        editBtn.addEventListener("click", async () => {
          const next = prompt("Modifier ton avis :", c.text);
          if (next === null) return;
          const trimmed = next.trim();
          if (!trimmed) return;
          try {
            await db.updateAgendaComment(c.id, { text: trimmed });
          } catch (err) {
            alert("Échec de la modification, réessaie.");
          }
        });
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "btn btn-ghost btn-sm";
        delBtn.textContent = "🗑️ Supprimer";
        delBtn.addEventListener("click", async () => {
          if (!confirm("Supprimer ton avis ?")) return;
          try {
            await db.removeAgendaComment(c.id);
          } catch (err) {
            alert("Échec de la suppression, réessaie.");
          }
        });
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        li.appendChild(actions);
      }
      agendaModalComments.appendChild(li);
    });
  }

  const canWrite = !!state.password;
  agendaCommentLoginHint.classList.toggle("hidden", canWrite);
  agendaCommentForm.classList.toggle("hidden", !canWrite);
}

agendaCommentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const item = (state.agendaItems || []).find((it) => it.id === state.openAgendaItemId);
  if (!item || !state.password) return;
  const text = agendaCommentInput.value.trim();
  if (!text) return;
  const submitBtn = agendaCommentForm.querySelector("button");
  submitBtn.disabled = true;
  try {
    await db.addAgendaComment({ agendaItemId: item.id, password: state.password, name: state.name, text });
    agendaCommentInput.value = "";
  } catch (err) {
    alert("Échec de l'envoi, réessaie.");
  }
  submitBtn.disabled = false;
});

agendaProposalForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.password) return;
  const label = agendaProposalLabelInput.value.trim();
  if (!label) {
    alert("Donne au moins un titre au point.");
    return;
  }
  const text = agendaProposalTextInput.value.trim();
  agendaProposalStatus.textContent = "Envoi…";
  try {
    await db.addAgendaProposal({ label, text, password: state.password, name: state.name });
    agendaProposalLabelInput.value = "";
    agendaProposalTextInput.value = "";
    agendaProposalStatus.textContent = "Suggestion envoyée — l'admin doit encore la valider ✓";
  } catch (err) {
    agendaProposalStatus.textContent = "Échec de l'envoi, réessaie.";
  }
});

// ===================== "MES COURS" (catalogue LSM/ESPO FUCaM Mons) =====================
// Catalogue statique construit une fois pour toutes à partir des horaires
// publiés (monhoraire.uclouvain.be) pour les programmes LSM et ESPO de la
// bac1 au master. Chaque cours a ses séances hebdomadaires (jour + heure).
// Le membre coche ses cours ; on génère un .ics synthétique (buildICSFromCourseSessions)
// et on le fait passer par le même calcul que l'import .ics classique
// (computeUnavailableSlots), pour ne jamais dupliquer cette logique.
let coursesCatalogue = null; // chargé à la demande (fetch), une seule fois
let coursesCatalogueLoading = null;
let coursesPrograms = null; // data/mons-programs.json : [{prog, faculte, niveau, label}]

function toMinutesLocal(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Identifie une séance précise d'un cours (jour+horaire) — clé stable pour
// les groupes de TP/labo choisis à part (state.groupSessions /
// member.groupSessions), indépendante de sa position dans le tableau "sessions".
function sessionKey(code, session) {
  return `${code}|${session.weekday}|${session.start}|${session.end}`;
}

// Une séance de TP/labo (groupe précis, propre à chaque étudiant) se
// reconnaît à son event_code : "MANGL1120-1 Labos Gr3", "MCOMU1101-TP
// GroupeA", "MAGES2304 - TP"... contrairement à un cours magistral, commun à
// tout le monde du programme ("MAGES2304 - Cours magistral"). Basé sur
// l'inspection réelle du catalogue (data/mons-courses-catalogue.json) — même
// formule que admin.js pour rester cohérent.
const GROUP_SESSION_PATTERN = /\bTP\b|labo|groupe|\bgr\.?\s*\d/i;
function isGroupSession(session) {
  return GROUP_SESSION_PATTERN.test((session && session.event_code) || "");
}

// Nom affiché pour une séance à choisir à part (groupe de TP/labo OU séance
// spéciale par sous-groupe, voir isUnreliableWeeklySession) : son event_code
// quand il est vraiment descriptif (différent du code du cours, ex: "Labos
// Gr3"), sinon un nom générique — beaucoup de séminaires par sous-groupe
// n'ont que le code du cours en event_code, pas de vrai nom de groupe ; le
// jour/l'heure affichés à côté suffisent alors à les distinguer.
function groupSessionLabel(course, session) {
  const ec = session && session.event_code;
  if (ec && ec !== course.code) return ec;
  return "Séance";
}

// Certaines séances du catalogue ne sont PAS de vrais horaires hebdomadaires
// récurrents, alors que rien dans leur format ne les distingue des vraies
// (pas de champ "type", juste jour + heure, répété chaque semaine par
// buildICSFromCourseSessions). Deux cas trouvés dans les données réelles :
// le nom du cours est encore un espace réservé ("Horaires détaillés des
// cours disponibles ultérieurement"), ou une séance couvre une bonne partie
// de la journée (> 6h, ex: 08h30-18h). Ce deuxième cas correspond très
// souvent à un séminaire (accueil, intégration...) organisé PAR SOUS-GROUPE :
// le même séminaire apparaît plusieurs fois dans la semaine, une fois par
// jour possible, mais chaque membre n'y va qu'UNE fois (son jour à lui),
// jamais toutes les occurrences chaque semaine jusqu'en 2035 comme un cours
// classique. Dans les deux cas, on ne devine jamais automatiquement — la
// séance est proposée à part, à choisir à la main (comme un groupe de TP).
// Même formule que admin.js.
const PLACEHOLDER_COURSE_NAME = "Horaires détaillés des cours disponibles ultérieurement";
const MAX_RELIABLE_SESSION_MINUTES = 360; // 6h
function isUnreliableWeeklySession(course, session) {
  if (course.name && course.name.includes(PLACEHOLDER_COURSE_NAME)) return true;
  const startMin = toMinutesLocal(session.start);
  const endMin = toMinutesLocal(session.end);
  return endMin - startMin > MAX_RELIABLE_SESSION_MINUTES;
}
function isReliableCmSession(course, session) {
  return !isGroupSession(session) && !isUnreliableWeeklySession(course, session) && !isConflictingCmSession(course, session);
}
// Toute séance qu'on ne veut JAMAIS cocher automatiquement, mais qu'on
// propose quand même à choisir à la main (jamais silencieusement ignorée) :
// groupe de TP/labo, séance spéciale par sous-groupe / horaire pas encore
// connu (voir isUnreliableWeeklySession), ou cours à horaire qui se
// chevauche avec un autre (voir isConflictingCmSession).
function isManualChoiceSession(course, session) {
  return isGroupSession(session) || isUnreliableWeeklySession(course, session) || isConflictingCmSession(course, session);
}

// Détecte les séances "cours magistral" dont l'horaire chevauche celui
// d'une AUTRE séance du même programme — deux cas trouvés dans les données
// réelles (data/mons-courses-catalogue.json), aucun des deux distinguable
// autrement qu'en comparant les horaires : des options/filières au choix
// (plusieurs cours DIFFÉRENTS du même programme, au même horaire, alors
// qu'on n'en suit qu'un — ex: "Etudes marketing" / "Econométrie" /
// "Questions de sciences religieuses", tous les trois lundi 8h30 en LSM
// Bac3), ou des groupes parallèles du MÊME cours sans "TP"/"labo" dans le
// nom (ex: "MGEST1324-1"/"MGEST1324-2" pour "Projet entrepreneurial", au
// même horaire). Dans les deux cas : jamais coché automatiquement, mais
// toujours proposé à choisir soi-même (comme un groupe de TP/labo). Même
// formule que admin.js — calculé une fois pour tout le catalogue dès qu'il
// est chargé (voir loadCoursesCatalogue).
let conflictingSessionKeys = new Set();

// Certains codes de programme du catalogue sont rattachés à la quasi-
// totalité des cours (visiblement une erreur/artefact d'export des données —
// ex: un programme de master retrouvé sur 90%+ des cours, y compris des
// cours de bac clairement sans rapport), contrairement aux vrais codes de
// bloc précis (~5-6% des cours, cohérent avec un seul bloc/année). Un code
// aussi peu discriminant ne veut rien dire pour repérer un vrai chevauchement
// — l'ignorer pour cette détection, sinon presque tous les cours du
// catalogue se retrouveraient marqués "en conflit" entre eux par erreur.
function computeBroadProgramCodes(catalogue) {
  const nonEvt = (catalogue || []).filter((c) => !c.code.startsWith("EVT-"));
  const counts = new Map();
  nonEvt.forEach((c) => {
    new Set(c.programs || []).forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
  });
  const broad = new Set();
  const total = nonEvt.length || 1;
  counts.forEach((count, p) => {
    if (count / total > 0.3) broad.add(p);
  });
  return broad;
}

function computeConflictingSessionKeys(catalogue) {
  const broadPrograms = computeBroadProgramCodes(catalogue);
  const candidates = [];
  (catalogue || []).forEach((course) => {
    if (course.code.startsWith("EVT-")) return; // événements ponctuels, pas de vraie récurrence hebdo
    (course.sessions || []).forEach((session) => {
      if (isGroupSession(session) || isUnreliableWeeklySession(course, session)) return;
      candidates.push({ course, session, key: sessionKey(course.code, session) });
    });
  });
  const conflicting = new Set();
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];
      if (a.session.weekday !== b.session.weekday) continue;
      const sameCourse = a.course.code === b.course.code;
      if (!sameCourse) {
        const sharesProgram = (a.course.programs || []).some(
          (p) => !broadPrograms.has(p) && (b.course.programs || []).includes(p)
        );
        if (!sharesProgram) continue;
      }
      if (a.session.start < b.session.end && b.session.start < a.session.end) {
        conflicting.add(a.key);
        conflicting.add(b.key);
      }
    }
  }
  return conflicting;
}
function isConflictingCmSession(course, session) {
  return conflictingSessionKeys.has(sessionKey(course.code, session));
}

// Cours de langue (Anglais/Espagnol/Néerlandais à la LSM) : rattachés à TOUT
// le programme (les 3 langues), alors qu'on n'en choisit que 2 sur les 3 —
// impossible à deviner automatiquement, exactement comme pour un groupe de
// TP/labo. Le membre les choisit lui-même à part, en les cherchant dans "Mes
// cours" (par code ou nom), jamais via "Remplir depuis mon programme".
const LANGUAGE_COURSE_CODE_PATTERN = /^M(ANGL|ESPA|NEER)/;
function isLanguageElectiveCourse(course) {
  return LANGUAGE_COURSE_CODE_PATTERN.test((course && course.code) || "");
}

// ---- Masters : découpage M1 / M2 et nettoyage des listes de cours ----
// Dans le catalogue, les listes de cours des masters sont cumulatives
// (chaque programme de master contient tous les cours des masters
// "précédents" + tous les cours de bac) : inutilisables telles quelles.
// On reconstruit une liste plausible : uniquement les cours de cycle master
// (code "XXXX2…"), apparus d'abord dans un master de la même faculté (+ les
// langues avancées), puis on sépare 1re / 2e année d'après le 2e chiffre du
// code (21xx = M1, 22xx = M2, autres = transversaux, gardés dans les deux).
// Un Master 120 se choisit donc en deux programmes "virtuels" : "<code>@M1"
// et "<code>@M2" (enregistrés tels quels dans la fiche du membre).
function expandProgramsWithMasterYears(programs) {
  const out = [];
  (programs || []).forEach((p) => {
    if (p.niveau === "Master" && /^Master 120/.test(p.label) && !/bloc/i.test(p.label)) {
      out.push({ ...p, prog: `${p.prog}@M1`, base: p.prog, label: `${p.label} — 1re année (M1)` });
      out.push({ ...p, prog: `${p.prog}@M2`, base: p.prog, label: `${p.label} — 2e année (M2)` });
    } else {
      out.push({ ...p, base: p.prog });
    }
  });
  return out;
}

function buildProgramCourseIndex(catalogue, rawPrograms) {
  const courses = (catalogue || []).filter((c) => !c.code.startsWith("EVT-"));
  const byCode = new Map(courses.map((c) => [c.code, c]));
  const metaByProg = new Map((rawPrograms || []).map((p) => [p.prog, p]));
  const setOf = (prog) => new Set(courses.filter((c) => (c.programs || []).includes(prog)).map((c) => c.code));
  const masterProgs = (rawPrograms || []).filter((p) => p.niveau === "Master");
  const masterSets = new Map(masterProgs.map((p) => [p.prog, setOf(p.prog)]));
  const firstFaculte = new Map();
  masterProgs
    .filter((p) => masterSets.get(p.prog).size)
    .sort((a, b) => masterSets.get(a.prog).size - masterSets.get(b.prog).size)
    .forEach((p) => masterSets.get(p.prog).forEach((code) => {
      if (!firstFaculte.has(code)) firstFaculte.set(code, p.faculte);
    }));
  const cache = new Map();
  function coursesForProgram(progCode) {
    if (cache.has(progCode)) return cache.get(progCode);
    const [base, yearTag] = String(progCode).split("@");
    const meta = metaByProg.get(base);
    let result;
    if (meta && meta.niveau === "Master") {
      const year = yearTag === "M1" ? "1" : yearTag === "M2" ? "2" : null;
      result = new Set(
        Array.from(masterSets.get(base) || []).filter((code) => {
          const m = code.match(/^[A-Z]+2(\d)/);
          if (!m) return false; // cours de bac rattachés par erreur au master
          if (!isLanguageElectiveCourse(byCode.get(code)) && firstFaculte.get(code) !== meta.faculte) return false;
          if (year && (m[1] === "1" || m[1] === "2") && m[1] !== year) return false;
          return true;
        })
      );
    } else {
      result = setOf(base);
    }
    cache.set(progCode, result);
    return result;
  }
  coursesForProgram.isMaster = (progCode) => {
    const meta = metaByProg.get(String(progCode).split("@")[0]);
    return !!(meta && meta.niveau === "Master");
  };
  return coursesForProgram;
}

// Cours d'un programme (voir buildProgramCourseIndex) — vide tant que le
// catalogue n'est pas chargé.
let coursesForProgram = null;
function programCourses(progCode) {
  return coursesForProgram ? coursesForProgram(progCode) : new Set();
}
function isMasterProgram(progCode) {
  return !!(coursesForProgram && coursesForProgram.isMaster(progCode));
}

async function loadCoursesCatalogue() {
  if (coursesCatalogue) return coursesCatalogue;
  if (coursesCatalogueLoading) return coursesCatalogueLoading;
  coursesCatalogueLoading = Promise.all([
    fetch("data/mons-courses-catalogue.json").then((r) => r.json()),
    fetch("data/mons-programs.json").then((r) => r.json()),
  ])
    .then(([catalogue, programs]) => {
      coursesCatalogue = catalogue;
      coursesPrograms = expandProgramsWithMasterYears(programs);
      coursesForProgram = buildProgramCourseIndex(catalogue, programs);
      conflictingSessionKeys = computeConflictingSessionKeys(coursesCatalogue);
      return catalogue;
    })
    .catch((err) => {
      console.error("Échec du chargement du catalogue de cours :", err);
      coursesCatalogue = [];
      coursesPrograms = [];
      return coursesCatalogue;
    });
  return coursesCatalogueLoading;
}

// ===================== APPLICATION DES COURS AU CALENDRIER =====================
// Transforme la sélection du membre (state.selectedCourses = cours suivis,
// state.groupSessions = séances précises choisies : groupe de TP/labo, langue,
// option, séance ponctuelle...) en créneaux "pas dispo". Ne touche jamais un
// créneau marqué à la main, SAUF si askOverwrite est demandé et que le membre
// accepte explicitement de passer en rouge des heures de cours qu'il avait
// marquées en vert.
async function applySelectedCourses({ askOverwrite = false } = {}) {
  if (!state.password || !state.config) return;
  coursesStatus.textContent = "Application en cours…";
  try {
    const selectedSet = new Set(state.selectedCourses);
    // Cours suivis : leurs séances "cours magistral" sûres. Jamais pour une
    // langue : là, seules les séances choisies explicitement (cours + groupe
    // de labo, dans state.groupSessions) comptent — le reste (rentrée, test
    // de positionnement, monitorat...) est ponctuel ou facultatif.
    const cmSessions = (coursesCatalogue || [])
      .filter((c) => selectedSet.has(c.code) && !isLanguageElectiveCourse(c))
      .flatMap((c) => (c.sessions || []).filter((s) => isReliableCmSession(c, s)).map((s) => ({ ...s, title: c.name })));
    const groupKeySet = new Set(state.groupSessions || []);
    const manualSess = [];
    if (groupKeySet.size) {
      (coursesCatalogue || []).forEach((c) => {
        (c.sessions || []).forEach((s) => {
          if (groupKeySet.has(sessionKey(c.code, s))) {
            manualSess.push({ ...s, title: `${c.name} — ${groupSessionLabel(c, s)}` });
          }
        });
      });
    }
    const sessions = cmSessions.concat(manualSess);

    // Plafonné à 3 mois (90 jours) : largement assez pour trouver un créneau
    // de réunion, sans projeter tout un programme sur des mois.
    const coursesFillRangeDays = Math.min(state.config.rangeDays, 90);
    const dates = Grid.buildDateList(new Date(), coursesFillRangeDays, state.config.includeWeekends);
    const desiredKeys = sessions.length
      ? computeUnavailableSlots(buildICSFromCourseSessions(sessions), dates, CONFIG.slotMinutes, CONFIG.dayStartHour, CONFIG.dayEndHour)
      : new Set();
    const previousKeys = new Set(state.courseMarkedKeys || []);

    let added = 0;
    let removed = 0;
    let overwritten = 0;
    if (askOverwrite) {
      const greenCourseKeys = Array.from(desiredKeys).filter((key) => state.marks[key] === "available");
      if (greenCourseKeys.length) {
        const ok = confirm(
          `${greenCourseKeys.length} créneau(x) de tes cours sont actuellement marqués "dispo" (vert).\n\n` +
          `OK = les passer en "pas dispo" (rouge), c'est l'heure d'un cours.\nAnnuler = les garder en vert.`
        );
        if (ok) {
          greenCourseKeys.forEach((key) => {
            state.marks[key] = "unavailable";
          });
          overwritten = greenCourseKeys.length;
        }
      }
    }
    desiredKeys.forEach((key) => {
      if (!(key in state.marks)) {
        state.marks[key] = "unavailable";
        added++;
      }
    });
    previousKeys.forEach((key) => {
      if (!desiredKeys.has(key) && state.marks[key] === "unavailable") {
        delete state.marks[key];
        removed++;
      }
    });

    state.courseMarkedKeys = Array.from(desiredKeys);
    await db.updateMemberCourses(
      state.password,
      state.name,
      state.selectedCourses,
      state.courseMarkedKeys,
      state.groupSessions
    );
    await persistMarks();
    renderGrid();
    renderCoursesSummary();

    const parts = [`${added + overwritten} créneau(x) de cours ajouté(s)`, `${removed} retiré(s)`];
    coursesStatus.textContent = `Appliqué ✓ — ${parts.join(", ")}.`;
  } catch (err) {
    console.error("Échec de l'application des cours :", err);
    coursesStatus.textContent = `Échec — ${err && err.message ? err.message : "réessaie."}`;
  }
}

// ===================== MON PROFIL (programme, langues, groupes) =====================
// Un seul formulaire guidé, à base de listes déroulantes, qui remplace
// l'ancienne liste "Mes cours" à cocher un par un : le membre dit qui il est
// (programme(s), langues, groupes de TP/labo, options) et tout est appliqué
// au calendrier d'un coup. Toujours construit à partir des mêmes données
// (selectedCourses / groupSessions), donc compatible avec ce que l'admin voit.
const DAY_SHORT = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MANY_SESSIONS_THRESHOLD = 5;

// Nom de groupe lisible à partir de l'event_code d'une séance :
// "MANGL1339-1 Labos Gr3" -> "Labos Gr3", "MINFO1301-TP GroupeB" -> "TP
// GroupeB", "MGEST1324-2 (Atelier RTBF)" -> "2". Deux séances qui donnent le
// même nom appartiennent au même groupe (ex: un labo deux fois par semaine).
function sessionGroupLabel(course, session) {
  let ec = (session.event_code || "").replace(/\(.*?\)/g, "").trim();
  if (ec.startsWith(course.code)) ec = ec.slice(course.code.length);
  ec = ec.replace(/^[\s\-–]+/, "").trim();
  const m = ec.match(/^\d+\s*[-–]?\s+(.+)$/);
  if (m) ec = m[1].trim();
  return ec || "Séance";
}

function sessionShortTime(s) {
  return `${DAY_SHORT[s.weekday]} ${s.start}-${s.end}`;
}

// Regroupe des séances par nom de groupe -> [{ label, display, keys }].
function buildGroupChoices(course, sessions) {
  const byLabel = new Map();
  sessions.forEach((s) => {
    const label = sessionGroupLabel(course, s);
    const entry = byLabel.get(label) || { label, keys: [], times: [] };
    entry.keys.push(sessionKey(course.code, s));
    entry.times.push(sessionShortTime(s));
    byLabel.set(label, entry);
  });
  return Array.from(byLabel.values())
    .map((e) => ({
      ...e,
      display: `${/^\d+$/.test(e.label) ? "Groupe " + e.label : e.label} — ${Array.from(new Set(e.times)).join(", ")}`,
    }))
    .sort((a, b) => a.display.localeCompare(b.display, "fr", { numeric: true }));
}

// Analyse les cours du/des programme(s) choisis :
//  - obligatory : cours à appliquer d'office (décochables si pas suivis)
//  - options    : cours dont l'horaire chevauche celui d'un AUTRE cours du
//                 même programme -> on ne peut pas deviner, le membre coche
//  - languages  : cours de langue (2 sur 3 en général), choix du groupe
//  - choices    : pour chaque cours, groupes de TP/labo ou groupes parallèles
//  - oneOffs    : séances ponctuelles (séminaire d'une journée, horaire pas
//                 encore connu) -> proposées à part, jamais cochées d'office
// Les codes de programme "trop larges" (voir computeBroadProgramCodes) ne
// permettent pas de retrouver les cours réellement suivis : signalés à part.
function analyzeProfilePrograms(programCodes) {
  const result = {
    unreliablePrograms: programCodes.filter((p) => !programCourses(p).size),
    hasMaster: programCodes.some(isMasterProgram),
    courses: new Map(),
    obligatory: [],
    options: [],
    languages: [],
    oneOffs: [],
  };
  const bacCodes = new Set();
  const masterCodes = new Set();
  programCodes.forEach((p) => {
    const target = isMasterProgram(p) ? masterCodes : bacCodes;
    programCourses(p).forEach((code) => target.add(code));
  });
  if (!bacCodes.size && !masterCodes.size) return result;
  (coursesCatalogue || [])
    .filter((c) => bacCodes.has(c.code) || masterCodes.has(c.code))
    .forEach((c) => {
      const info = {
        course: c,
        // En master, presque tout est option/finalité : rien d'office.
        fromMaster: masterCodes.has(c.code) && !bacCodes.has(c.code),
        isLanguage: isLanguageElectiveCourse(c),
        candidates: [],
        groupSess: [],
        oneOffs: [],
        parallelKeys: new Set(),
        crossConflict: false,
      };
      (c.sessions || []).forEach((s) => {
        if (isGroupSession(s)) info.groupSess.push(s);
        else if (isUnreliableWeeklySession(c, s)) info.oneOffs.push(s);
        else info.candidates.push(s);
      });
      result.courses.set(c.code, info);
    });

  // Chevauchements entre séances "cours magistral" des cours du programme
  // (hors langues, gérées à part).
  const cands = [];
  result.courses.forEach((info) => {
    if (!info.isLanguage) info.candidates.forEach((s) => cands.push({ info, s }));
  });
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i];
      const b = cands[j];
      if (a.s.weekday !== b.s.weekday) continue;
      if (!(a.s.start < b.s.end && b.s.start < a.s.end)) continue;
      if (a.info === b.info) {
        // Même cours, deux groupes au même moment (ex: MGEST1324-1 / -2).
        if (sessionGroupLabel(a.info.course, a.s) !== sessionGroupLabel(b.info.course, b.s)) {
          a.info.parallelKeys.add(sessionKey(a.info.course.code, a.s));
          a.info.parallelKeys.add(sessionKey(b.info.course.code, b.s));
        }
      } else {
        // Un cours à très nombreuses séances hebdo (séminaire "d'actualité",
        // journée d'études...) chevauche presque tout : c'est lui qui est à
        // choisir, pas les cours normaux qu'il recoupe.
        const aMany = a.info.candidates.length >= MANY_SESSIONS_THRESHOLD;
        const bMany = b.info.candidates.length >= MANY_SESSIONS_THRESHOLD;
        if (aMany || bMany) {
          if (aMany) a.info.crossConflict = true;
          if (bMany) b.info.crossConflict = true;
        } else {
          a.info.crossConflict = true;
          b.info.crossConflict = true;
        }
      }
    }
  }

  result.courses.forEach((info) => {
    const code = info.course.code;
    info.oneOffs.forEach((s) => result.oneOffs.push({ info, s, key: sessionKey(code, s) }));
    if (info.isLanguage) {
      info.coursKeys = info.candidates
        .filter((s) => /\bCours\b/i.test(s.event_code || ""))
        .map((s) => sessionKey(code, s));
      info.choices = buildGroupChoices(info.course, info.groupSess);
      result.languages.push(info);
      return;
    }
    const parallel = info.candidates.filter((s) => info.parallelKeys.has(sessionKey(code, s)));
    info.autoSessions = info.candidates.filter((s) => !info.parallelKeys.has(sessionKey(code, s)));
    info.choices = buildGroupChoices(info.course, info.groupSess.concat(parallel));
    if (!info.autoSessions.length && !info.choices.length) return;
    if (info.crossConflict || info.fromMaster) result.options.push(info);
    else result.obligatory.push(info);
  });
  const byName = (a, b) => a.course.name.localeCompare(b.course.name, "fr");
  result.obligatory.sort(byName);
  result.options.sort(byName);
  result.languages.sort(byName);
  result.oneOffs.sort((a, b) => a.info.course.name.localeCompare(b.info.course.name, "fr"));
  return result;
}

// Brouillon du formulaire : rien n'est enregistré avant "Enregistrer".
let profileDraft = null;

function draftRemoveCourseKeys(code) {
  Array.from(profileDraft.group).forEach((key) => {
    if (String(key).split("|")[0] === code) profileDraft.group.delete(key);
  });
}

function chosenLabelFor(choices) {
  const found = choices.find((ch) => ch.keys.length && ch.keys.every((k) => profileDraft.group.has(k)));
  return found ? found.label : "";
}

function openProfile() {
  if (!state.password) return;
  profileModalOverlay.classList.remove("hidden");
  profileStatus.textContent = "";
  profileBody.innerHTML = '<p class="hint">Chargement…</p>';
  loadCoursesCatalogue().then(() => {
    const programs = (state.programs || []).slice();
    const analysis = analyzeProfilePrograms(programs);
    const contextCodes = new Set(analysis.courses.keys());
    const selected = new Set(state.selectedCourses || []);
    profileDraft = {
      programs,
      selected,
      group: new Set(state.groupSessions || []),
      extras: new Set(Array.from(selected).filter((code) => !contextCodes.has(code))),
    };
    // Programme renseigné (ex: par l'admin) mais cours jamais appliqués :
    // on pré-coche les cours obligatoires, comme pour un nouveau programme.
    if (!analysis.obligatory.concat(analysis.options, analysis.languages).some((i) => selected.has(i.course.code))) {
      analysis.obligatory.forEach((info) => profileDraft.selected.add(info.course.code));
    }
    renderProfileForm();
  });
}

function closeProfile() {
  profileModalOverlay.classList.add("hidden");
  profileDraft = null;
}

function setDraftPrograms(newPrograms) {
  const before = analyzeProfilePrograms(profileDraft.programs);
  const after = analyzeProfilePrograms(newPrograms);
  const beforeCodes = new Set(before.courses.keys());
  const afterCodes = new Set(after.courses.keys());
  // Nouveau programme : ses cours obligatoires sont cochés d'office.
  after.obligatory.forEach((info) => {
    if (!beforeCodes.has(info.course.code)) profileDraft.selected.add(info.course.code);
  });
  // Programme retiré : ses cours partent aussi (sauf s'ils font partie d'un
  // autre programme gardé, ou ont été ajoutés à la main hors programme).
  beforeCodes.forEach((code) => {
    if (afterCodes.has(code) || profileDraft.extras.has(code)) return;
    profileDraft.selected.delete(code);
    draftRemoveCourseKeys(code);
  });
  profileDraft.programs = newPrograms;
  renderProfileForm();
}

function profileSection(title, hint) {
  const section = document.createElement("section");
  section.className = "profile-section";
  const h = document.createElement("h4");
  h.textContent = title;
  section.appendChild(h);
  if (hint) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = hint;
    section.appendChild(p);
  }
  return section;
}

function profileSelect(options, value, onChange) {
  const select = document.createElement("select");
  select.className = "profile-select";
  options.forEach(([v, label]) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = label;
    select.appendChild(opt);
  });
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function profileCheckRow(checked, labelText, detail, onChange) {
  const label = document.createElement("label");
  label.className = "profile-check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = checked;
  cb.addEventListener("change", () => onChange(cb.checked));
  const text = document.createElement("span");
  text.textContent = labelText;
  if (detail) {
    const small = document.createElement("small");
    small.textContent = detail;
    text.appendChild(document.createElement("br"));
    text.appendChild(small);
  }
  label.appendChild(cb);
  label.appendChild(text);
  return label;
}

function renderProfileForm() {
  if (!profileDraft) return;
  const scrollTop = profileBody.scrollTop;
  profileBody.innerHTML = "";
  const analysis = analyzeProfilePrograms(profileDraft.programs);

  // ---- 1. Programme(s) ----
  const progSection = profileSection("🎓 Ton programme", "Un deuxième programme seulement si tu suis des cours sur deux années/blocs.");
  const sortedPrograms = (coursesPrograms || []).slice().sort((a, b) => a.label.localeCompare(b.label, "fr", { numeric: true }));
  const programOptions = sortedPrograms.map((p) => [p.prog, p.label]);
  // Ancien code encore sur la fiche (ex: Master 120 choisi avant le
  // découpage M1/M2) : gardé sélectionnable pour ne pas le perdre en silence.
  profileDraft.programs.forEach((code) => {
    if (programOptions.some(([v]) => v === code)) return;
    const base = (coursesPrograms || []).find((p) => p.base === code);
    programOptions.push([code, base ? `${base.label.replace(/ — (1re|2e) année.*$/, "")} (toutes années — choisis plutôt M1 ou M2)` : code]);
  });
  const slots = Math.max(2, profileDraft.programs.length);
  for (let i = 0; i < slots; i++) {
    const first = i === 0;
    const select = profileSelect(
      [["", first ? "— Choisis ton programme —" : "— Pas de 2e programme —"], ...programOptions],
      profileDraft.programs[i] || "",
      (value) => {
        const next = profileDraft.programs.slice();
        next[i] = value;
        setDraftPrograms(Array.from(new Set(next.filter(Boolean))));
      }
    );
    progSection.appendChild(select);
  }
  profileBody.appendChild(progSection);

  if (analysis.unreliablePrograms.length) {
    const warn = document.createElement("p");
    warn.className = "hint profile-warning";
    warn.textContent =
      "⚠️ Aucun cours trouvé pour ce programme dans le catalogue de l'université : ajoute tes cours toi-même dans \"Cours hors programme\" en bas.";
    profileBody.appendChild(warn);
  }

  if (!profileDraft.programs.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Choisis ton programme pour voir tes cours.";
    profileBody.appendChild(p);
  }

  // ---- 2. Cours appliqués d'office ----
  if (analysis.obligatory.length) {
    const count = analysis.obligatory.filter((i) => profileDraft.selected.has(i.course.code)).length;
    const section = profileSection(`📚 Tes cours (${count}/${analysis.obligatory.length})`);
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Bloqués automatiquement — ouvre pour décocher un cours que tu ne suis pas";
    details.appendChild(summary);
    analysis.obligatory.forEach((info) => {
      const code = info.course.code;
      details.appendChild(
        profileCheckRow(
          profileDraft.selected.has(code),
          info.course.name,
          info.autoSessions.map(sessionShortTime).join(", "),
          (checked) => {
            if (checked) profileDraft.selected.add(code);
            else {
              profileDraft.selected.delete(code);
              draftRemoveCourseKeys(code);
            }
            renderProfileForm();
          }
        )
      );
    });
    section.appendChild(details);
    profileBody.appendChild(section);
  }

  // ---- 3. Options (horaires qui se chevauchent) ----
  if (analysis.options.length) {
    const section = profileSection(
      analysis.hasMaster ? "🔀 Tes cours de master" : "🔀 Cours à option",
      analysis.hasMaster
        ? "En master, beaucoup de cours sont des options ou des finalités : rien n'est bloqué d'office, coche ceux que tu suis."
        : "Ils tombent à la même heure qu'un autre cours de ton programme (cours à option, ou cours d'un autre quadrimestre) : coche seulement ceux que tu suis."
    );
    analysis.options.forEach((info) => {
      const code = info.course.code;
      section.appendChild(
        profileCheckRow(
          profileDraft.selected.has(code),
          info.course.name,
          info.autoSessions.map(sessionShortTime).join(", "),
          (checked) => {
            if (checked) profileDraft.selected.add(code);
            else {
              profileDraft.selected.delete(code);
              draftRemoveCourseKeys(code);
            }
            renderProfileForm();
          }
        )
      );
    });
    profileBody.appendChild(section);
  }

  // ---- 4. Langues ----
  if (analysis.languages.length) {
    const section = profileSection("🗣️ Tes langues", "Choisis seulement les langues que tu suis, puis ton groupe de labo si tu le connais. Les groupes laissés vides ne seront pas ajoutés.");
    analysis.languages.forEach((info) => {
      const code = info.course.code;
      const followed = profileDraft.selected.has(code);
      const chosen = chosenLabelFor(info.choices);
      const value = !followed ? "" : chosen ? `g:${chosen}` : "follow";
      const row = document.createElement("div");
      row.className = "profile-row";
      const label = document.createElement("span");
      label.className = "profile-row-label";
      label.textContent = info.course.name;
      row.appendChild(label);
      row.appendChild(
        profileSelect(
          [
            ["", "Pas suivie"],
            ["follow", info.choices.length ? "Suivie — groupe pas encore connu" : "Suivie"],
            ...info.choices.map((ch) => [`g:${ch.label}`, ch.display]),
          ],
          value,
          (v) => {
            draftRemoveCourseKeys(code);
            if (!v) {
              profileDraft.selected.delete(code);
            } else {
              profileDraft.selected.add(code);
              info.coursKeys.forEach((k) => profileDraft.group.add(k));
              if (v.startsWith("g:")) {
                const ch = info.choices.find((c) => c.label === v.slice(2));
                if (ch) ch.keys.forEach((k) => profileDraft.group.add(k));
              }
            }
            renderProfileForm();
          }
        )
      );
      section.appendChild(row);
    });
    profileBody.appendChild(section);
  }

  // ---- 5. Groupes de TP / labos ----
  const withChoices = analysis.obligatory
    .concat(analysis.options)
    .filter((info) => info.choices.length && profileDraft.selected.has(info.course.code));
  if (withChoices.length) {
    const section = profileSection("👥 Tes groupes de TP / labo", "Le catalogue peut afficher plusieurs groupes : sélectionne celui qui t’a été attribué. Seul le groupe choisi sera ajouté à ton calendrier.");
    withChoices.forEach((info) => {
      const row = document.createElement("div");
      row.className = "profile-row";
      const label = document.createElement("span");
      label.className = "profile-row-label";
      label.textContent = info.course.name;
      row.appendChild(label);
      row.appendChild(
        profileSelect(
          [["", "— Pas encore connu / aucun —"], ...info.choices.map((ch) => [ch.label, ch.display])],
          chosenLabelFor(info.choices),
          (v) => {
            info.choices.forEach((ch) => ch.keys.forEach((k) => profileDraft.group.delete(k)));
            const ch = info.choices.find((c) => c.label === v);
            if (ch) ch.keys.forEach((k) => profileDraft.group.add(k));
            renderProfileForm();
          }
        )
      );
      section.appendChild(row);
    });
    profileBody.appendChild(section);
  }

  // ---- 6. Séances ponctuelles (repliées) ----
  const oneOffs = analysis.oneOffs.filter((o) => profileDraft.selected.has(o.info.course.code));
  if (oneOffs.length) {
    const details = document.createElement("details");
    details.className = "profile-section";
    const summary = document.createElement("summary");
    const n = oneOffs.filter((o) => profileDraft.group.has(o.key)).length;
    summary.textContent = `📌 Séances ponctuelles (séminaires, journées spéciales)${n ? ` — ${n} cochée(s)` : ""}`;
    details.appendChild(summary);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Pas des cours de chaque semaine : ne coche que celles où tu dois vraiment être (elles seront bloquées chaque semaine à cette heure-là).";
    details.appendChild(hint);
    oneOffs.forEach((o) => {
      details.appendChild(
        profileCheckRow(
          profileDraft.group.has(o.key),
          `${o.info.course.name} — ${sessionGroupLabel(o.info.course, o.s)}`,
          sessionShortTime(o.s),
          (checked) => {
            if (checked) profileDraft.group.add(o.key);
            else profileDraft.group.delete(o.key);
          }
        )
      );
    });
    if (n) details.open = true;
    profileBody.appendChild(details);
  }

  // ---- 7. Cours hors programme (replié) ----
  const extraDetails = document.createElement("details");
  extraDetails.className = "profile-section";
  const extraSummary = document.createElement("summary");
  extraSummary.textContent = `➕ Cours hors programme${profileDraft.extras.size ? ` (${profileDraft.extras.size})` : ""}`;
  extraDetails.appendChild(extraSummary);
  if (profileDraft.extras.size || analysis.unreliablePrograms.length) extraDetails.open = true;
  const extraList = document.createElement("div");
  Array.from(profileDraft.extras).forEach((code) => {
    const course = (coursesCatalogue || []).find((c) => c.code === code);
    const row = document.createElement("div");
    row.className = "profile-row";
    const label = document.createElement("span");
    label.className = "profile-row-label";
    label.textContent = course ? course.name : code;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-ghost btn-sm";
    remove.textContent = "Retirer";
    remove.addEventListener("click", () => {
      profileDraft.extras.delete(code);
      profileDraft.selected.delete(code);
      draftRemoveCourseKeys(code);
      renderProfileForm();
    });
    row.appendChild(label);
    row.appendChild(remove);
    extraList.appendChild(row);
  });
  extraDetails.appendChild(extraList);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "profile-search";
  search.placeholder = "Chercher un cours (code ou nom)…";
  const results = document.createElement("div");
  results.className = "profile-search-results";
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    results.innerHTML = "";
    if (q.length < 2) return;
    (coursesCatalogue || [])
      .filter(
        (c) =>
          !c.code.startsWith("EVT-") &&
          !profileDraft.selected.has(c.code) &&
          (c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      )
      .slice(0, 12)
      .forEach((c) => {
        const row = document.createElement("div");
        row.className = "profile-row";
        const label = document.createElement("span");
        label.className = "profile-row-label";
        label.textContent = `${c.name} (${c.code})`;
        const add = document.createElement("button");
        add.type = "button";
        add.className = "btn btn-ghost btn-sm";
        add.textContent = "Ajouter";
        add.addEventListener("click", () => {
          profileDraft.extras.add(c.code);
          profileDraft.selected.add(c.code);
          renderProfileForm();
        });
        row.appendChild(label);
        row.appendChild(add);
        results.appendChild(row);
      });
  });
  extraDetails.appendChild(search);
  extraDetails.appendChild(results);
  profileBody.appendChild(extraDetails);

  profileBody.scrollTop = scrollTop;
}

async function saveProfile() {
  if (!profileDraft || !state.password) return;
  if (!profileDraft.programs.length && !profileDraft.extras.size) {
    profileStatus.textContent = "Choisis au moins ton programme.";
    return;
  }
  profileSaveBtn.disabled = true;
  profileStatus.textContent = "Enregistrement…";
  try {
    const analysis = analyzeProfilePrograms(profileDraft.programs);
    // Séances "cours magistral" d'un cours suivi que la détection globale
    // mettrait de côté (ex: chevauchement avec un cours d'un AUTRE
    // programme) : ici on sait qu'elles concernent ce membre -> ajoutées
    // explicitement pour être bloquées quand même.
    analysis.courses.forEach((info) => {
      if (info.isLanguage) return;
      info.autoSessions.forEach((s) => {
        const key = sessionKey(info.course.code, s);
        profileDraft.group.delete(key);
        if (profileDraft.selected.has(info.course.code) && !isReliableCmSession(info.course, s)) {
          profileDraft.group.add(key);
        }
      });
    });
    state.programs = profileDraft.programs.slice();
    state.selectedCourses = Array.from(profileDraft.selected);
    state.groupSessions = Array.from(profileDraft.group);
    await db.updateMemberPrograms(state.password, state.programs);
    await applySelectedCourses({ askOverwrite: true });
    closeProfile();
  } catch (err) {
    console.error(err);
    profileStatus.textContent = "Échec de l'enregistrement, réessaie.";
  }
  profileSaveBtn.disabled = false;
}

async function clearAllCourses() {
  if (!state.password) return;
  if (!confirm("Retirer tous tes cours (et les créneaux \"pas dispo\" qu'ils avaient posés) ? Tes créneaux marqués à la main ne bougent pas.")) return;
  state.selectedCourses = [];
  state.groupSessions = [];
  await applySelectedCourses();
  closeProfile();
}

// Résumé affiché dans la colonne "Mon planning" (plus de liste à cocher ici :
// tout se règle dans le profil).
function renderCoursesSummary() {
  if (!coursesSummaryText) return;
  if (!state.password) {
    coursesSummaryText.textContent = "";
    return;
  }
  const labels = (state.programs || []).map((p) => {
    const meta = (coursesPrograms || []).find((x) => x.prog === p) || (coursesPrograms || []).find((x) => x.base === p);
    return meta ? meta.label : p;
  });
  const n = (state.selectedCourses || []).length;
  if (!labels.length && !n) {
    coursesSummaryText.textContent = "Pas encore de programme — ouvre ton profil pour bloquer tes cours en un clic.";
    return;
  }
  coursesSummaryText.textContent =
    `${labels.join(" + ") || "Sans programme"} · ${n} cours suivi(s)`;
}

profileBtn.addEventListener("click", openProfile);
coursesEditBtn.addEventListener("click", openProfile);
profileCloseBtn.addEventListener("click", closeProfile);
profileSaveBtn.addEventListener("click", saveProfile);
profileClearBtn.addEventListener("click", clearAllCourses);
profileModalOverlay.addEventListener("click", (e) => {
  if (e.target === profileModalOverlay) closeProfile();
});

// ===================== RENDU DE LA GRILLE =====================
// La grille (cours bloqués + événements) est visible par tout le monde, avec
// ou sans connexion. Les marques personnelles et la possibilité de cliquer ne
// s'activent qu'une fois connecté (state.password non nul).
// Pour chaque créneau "pas dispo" posé par "Mes cours", retrouve de quel(s)
// cours/groupe il s'agit (nom affiché en infobulle + petit liseré violet sur
// la case) — pratique pour comprendre d'un coup d'œil pourquoi un créneau
// est marqué sans devoir rouvrir le panneau "Mes cours". Bornée à 90 jours
// comme le remplissage lui-même, inutile de calculer plus loin.
function computeSelectedCourseLabels() {
  const overlay = new Map();
  if (!state.config || !coursesCatalogue) return overlay;
  const selectedSet = new Set(state.selectedCourses || []);
  const groupKeySet = new Set(state.groupSessions || []);
  if (!selectedSet.size && !groupKeySet.size) return overlay;

  const sessionsByDow = new Map();
  coursesCatalogue.forEach((course) => {
    (course.sessions || []).forEach((s) => {
      const key = sessionKey(course.code, s);
      let name = null;
      if (groupKeySet.has(key)) {
        name = `${course.name} — ${groupSessionLabel(course, s)}`;
      } else if (selectedSet.has(course.code) && !isLanguageElectiveCourse(course) && isReliableCmSession(course, s)) {
        name = course.name;
      }
      if (!name) return;
      const list = sessionsByDow.get(s.weekday) || [];
      list.push({ start: toMinutesLocal(s.start), end: toMinutesLocal(s.end), name });
      sessionsByDow.set(s.weekday, list);
    });
  });
  if (!sessionsByDow.size) return overlay;

  const rangeDays = Math.min(state.config.rangeDays, 90);
  const dates = Grid.buildDateList(new Date(), rangeDays, state.config.includeWeekends);
  const times = Grid.buildTimeSlots();
  dates.forEach((date) => {
    const dow = date.getDay();
    const daySessions = sessionsByDow.get(dow) || [];
    if (!daySessions.length) return;
    const dateISO = Grid.toISODate(date);
    times.forEach((timeLabel) => {
      const slotStart = toMinutesLocal(timeLabel);
      const slotEnd = slotStart + CONFIG.slotMinutes;
      const names = daySessions.filter((s) => s.start < slotEnd && s.end > slotStart).map((s) => s.name);
      if (names.length) overlay.set(Grid.slotKey(dateISO, timeLabel), Array.from(new Set(names)));
    });
  });
  return overlay;
}

function renderGrid() {
  if (!state.config) {
    gridEl.innerHTML = "";
    return;
  }

  const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
  const times = Grid.buildTimeSlots();
  const blockedSlots = state.config.blockedSlots || [];
  const pollingSlots = new Set(state.config.pollingSlots || []);
  const courseLabels = computeSelectedCourseLabels();

  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
  gridEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);

  Grid.renderGridHeaders(gridEl, dates, state.events);

  // Cliquer sur le bandeau "événements" d'un jour scrolle directement la
  // grille jusqu'à ce jour — pratique pour aller marquer sa dispo pile là où
  // se trouve un événement, sans avoir à chercher la bonne date à la main.
  gridEl.querySelectorAll(".cell.events-band.has-events").forEach((cell) => {
    cell.style.cursor = "pointer";
    cell.addEventListener("click", () => {
      scrollGridToDate(dates, cell.dataset.dateIso);
    });
  });

  Grid.renderHourRows(gridEl, dates, times, state.events, blockedSlots, (cell, { dateISO, timeLabel, blocked, events }) => {
    const key = Grid.slotKey(dateISO, timeLabel);
    cell.dataset.key = key;
    const courseNames = courseLabels.get(key);
    if (courseNames && courseNames.length) {
      cell.classList.add("course-slot");
      const courseTitle = "Cours : " + courseNames.join(", ");
      cell.title = cell.title ? cell.title + "\n" + courseTitle : courseTitle;
    }
    if (state.password) {
      const mark = state.marks[key];
      if (mark === "available") cell.classList.add("mark-available");
      if (mark === "unavailable") cell.classList.add("mark-unavailable");
      // "Dispo demandée" par l'admin sur ce créneau précis (via un événement
      // flaggé availabilityRequested) et pas encore répondu par ce membre.
      if (!mark && (events.some((e) => e.availabilityRequested) || pollingSlots.has(key))) {
        cell.classList.add("avail-requested");
      }
      // Un créneau "bloqué" (cours récurrent) reste marquable à la main : ça
      // sert par exemple à dire "je suis dispo quand même, je sèche ce
      // cours-là". Le cours reste visible en dessous (hachures grises), la
      // couleur dispo/pas dispo vient juste en anneau par-dessus (voir CSS).
      cell.addEventListener("mousedown", onCellMouseDown);
      cell.addEventListener("mouseenter", onCellMouseEnter);
      cell.addEventListener("touchstart", onCellTouchStart, { passive: true });
      cell.addEventListener("touchend", onCellTouchEnd);
    }
  });

  applyViewWidth();
  maybeApplyStartPosition(dates);
  renderAvailabilityBanner();
  renderPollBanner();
  renderMemberDashboard();
}

// ===================== SÉLECTION (clic + glisser, tri-état) =====================
let isPainting = false;
let paintAction = null; // "set" | "clear"

function applyPaint(cell) {
  const key = cell.dataset.key;
  cell.classList.remove("mark-available", "mark-unavailable");
  if (paintAction === "clear") {
    delete state.marks[key];
    // Remis en attente immédiatement si ce créneau est toujours sondé/demandé
    // (pas besoin d'attendre un rechargement complet de la grille).
    const [dateISO, timeLabel] = key.split("|");
    const stillRequested =
      (state.config.pollingSlots || []).includes(key) ||
      (state.events || []).some(
        (e) => e.availabilityRequested && !e.allDay && e.date === dateISO && timeLabel >= (e.startTime || "00:00") && timeLabel < (e.endTime || "23:59")
      );
    cell.classList.toggle("avail-requested", stillRequested);
  } else {
    state.marks[key] = state.mode;
    cell.classList.add(state.mode === "available" ? "mark-available" : "mark-unavailable");
    // Une fois répondu, le créneau n'a plus besoin d'être mis en avant.
    cell.classList.remove("avail-requested");
  }
  renderAvailabilityBanner();
}

function beginPaint(cell) {
  const key = cell.dataset.key;
  paintAction = state.marks[key] === state.mode ? "clear" : "set";
  isPainting = true;
  applyPaint(cell);
}

function onCellMouseDown(e) {
  e.preventDefault();
  beginPaint(e.currentTarget);
}
function onCellMouseEnter(e) {
  if (!isPainting) return;
  applyPaint(e.currentTarget);
}

// ---- Tactile : distinguer "taper" (marquer une case) de "glisser pour
// scroller" (option B) ----
// Au contact, on n'empêche rien (le listener touchstart est "passive" :
// le navigateur peut scroller librement dès le départ). Si le doigt reste
// quasi immobile pendant TOUCH_LONG_PRESS_MS, on démarre le mode "peindre"
// plusieurs cases d'un coup (comme un glisser souris) — sinon, dès que le
// doigt bouge de plus de TOUCH_MOVE_CANCEL_PX avant ce délai, on annule et
// on laisse le scroll natif du navigateur prendre le relais. Un tap simple
// (relâché avant le délai, sans bouger) bascule juste la case touchée.
const TOUCH_LONG_PRESS_MS = 300;
const TOUCH_MOVE_CANCEL_PX = 10;
let touchGesture = null; // { cell, startX, startY, timer, longPressStarted, moved }

function clearTouchGesture() {
  if (touchGesture && touchGesture.timer) clearTimeout(touchGesture.timer);
  touchGesture = null;
}

function onCellTouchStart(e) {
  const touch = e.touches[0];
  if (!touch) return;
  clearTouchGesture();
  const cell = e.currentTarget;
  touchGesture = { cell, startX: touch.clientX, startY: touch.clientY, longPressStarted: false, moved: false };
  touchGesture.timer = setTimeout(() => {
    if (!touchGesture || touchGesture.moved) return;
    touchGesture.longPressStarted = true;
    beginPaint(touchGesture.cell);
  }, TOUCH_LONG_PRESS_MS);
}

function onCellTouchEnd(e) {
  if (!touchGesture || touchGesture.cell !== e.currentTarget) return;
  const wasTap = !touchGesture.longPressStarted && !touchGesture.moved;
  clearTouchGesture();
  if (wasTap) {
    // Tap simple (pas de glisser, relâché avant le délai d'appui long) :
    // bascule juste cette case, sans bloquer le scroll qui a pu avoir lieu.
    beginPaint(e.currentTarget);
    stopPainting();
  }
}

function onTouchMove(e) {
  if (touchGesture && !touchGesture.longPressStarted) {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - touchGesture.startX;
    const dy = touch.clientY - touchGesture.startY;
    if (Math.abs(dx) > TOUCH_MOVE_CANCEL_PX || Math.abs(dy) > TOUCH_MOVE_CANCEL_PX) {
      // Le doigt a assez bougé avant l'appui long : c'est un scroll, pas un
      // geste de peinture. On annule le minuteur et on laisse le navigateur
      // scroller normalement (pas de preventDefault ici).
      touchGesture.moved = true;
      if (touchGesture.timer) clearTimeout(touchGesture.timer);
    }
    return;
  }
  if (!isPainting) return;
  // Appui long confirmé : on peint en glissant, et là seulement on bloque
  // le scroll natif pour que le doigt ne fasse pas défiler la page pendant
  // qu'on marque plusieurs cases.
  e.preventDefault();
  const touch = e.touches[0];
  const el = document.elementFromPoint(touch.clientX, touch.clientY);
  if (el && el.classList.contains("slot") && !el.classList.contains("blocked")) {
    applyPaint(el);
  }
}

async function persistMarks() {
  saveStatus.textContent = "Enregistrement…";
  saveStatus.className = "save-status saving";
  try {
    await db.saveMarks(state.password, state.name, state.marks);
    saveStatus.textContent = "Enregistré ✓";
    saveStatus.className = "save-status saved";
    renderAvailabilityBanner();
  } catch (err) {
    console.error("Échec de la sauvegarde :", err);
    saveStatus.textContent = "Échec de l'enregistrement, réessaie";
    saveStatus.className = "save-status error";
  }
}

function stopPainting() {
  if (isPainting) {
    isPainting = false;
    persistMarks();
  }
}

document.addEventListener("mouseup", stopPainting);
document.addEventListener("touchend", stopPainting);
document.addEventListener("touchcancel", () => {
  clearTouchGesture();
  stopPainting();
});
gridEl.addEventListener("touchmove", onTouchMove, { passive: false });

// ===================== INITIALISATION =====================
// Le calendrier (cours bloqués + événements admin) se charge et s'affiche
// tout de suite, sans attendre de connexion.
let bestSlotWeekendsDefaulted = false;
db.listenConfig((config) => {
  state.config = config;
  renderGrid();
  applyPublicTabsVisibility();
  rolesPollingSlotSelection = new Set((state.config && state.config.pollingSlots) || []);
  if (state.activeTab === "roles") renderRolesPollingSlotGrid();
  // Pré-coche "Inclure les weekends" dans "Trouver le meilleur créneau"
  // d'après le réglage global, une seule fois au chargement — comme point de
  // départ, sans écraser un choix que la personne aurait fait entre-temps
  // pour cette recherche précise.
  if (!bestSlotWeekendsDefaulted && rolesBestSlotWeekendsInput) {
    rolesBestSlotWeekendsInput.checked = !!(config && config.includeWeekends);
    bestSlotWeekendsDefaulted = true;
  }
});
db.listenEvents((events) => {
  state.events = events;
  eventsLoaded = true;
  renderGrid();
  renderMemberDashboard();
  if (state.activeTab === "roles") renderRolesPollingSlotGrid();
});
db.listenTasks((tasks) => {
  state.tasks = tasks;
  tasksLoaded = true;
  renderGrid();
  renderMemberDashboard();
});
db.listenPolls((polls) => {
  state.polls = polls;
  renderPollBanner();
});
// Lecture seule côté membre — juste pour afficher "prochaine réunion" dans
// le tableau de bord, aucune action possible dessus ici (ça reste réservé à
// l'admin).
db.listenMeetings((meetings) => {
  state.meetings = meetings;
  renderMemberDashboard();
  if (state.activeTab === "agenda") renderAgendaTab();
});
db.listenAgendaItems((items) => {
  state.agendaItems = items;
  if (state.activeTab === "agenda") renderAgendaTab();
  if (state.openAgendaItemId) renderAgendaModal();
});
db.listenAgendaComments((comments) => {
  state.agendaComments = comments;
  if (state.activeTab === "agenda") renderAgendaTab();
  if (state.openAgendaItemId) renderAgendaModal();
});
tryAutoLogin();
