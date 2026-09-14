// ===================== SCRIPT.JS (page membre) =====================
import * as Grid from "./grid.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import { computeUnavailableSlots } from "./ics.js";

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
const viewRangeToggle = document.getElementById("view-range-toggle");
const gridScrollEl = document.getElementById("grid-scroll");
const availRequestBanner = document.getElementById("avail-request-banner");
const pollBanner = document.getElementById("poll-banner");
const icsImportBtn = document.getElementById("ics-import-btn");
const icsFileInput = document.getElementById("ics-file-input");
const icsStatus = document.getElementById("ics-status");
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
const bulkOnlyEmpty = document.getElementById("bulk-only-empty");
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
const rolesBestSlotForm = document.getElementById("roles-bestslot-form");
const rolesBestSlotStartInput = document.getElementById("roles-bestslot-start-input");
const rolesBestSlotEndInput = document.getElementById("roles-bestslot-end-input");
const rolesBestSlotDurationInput = document.getElementById("roles-bestslot-duration-input");
const rolesBestSlotThresholdInput = document.getElementById("roles-bestslot-threshold-input");
const rolesBestSlotResult = document.getElementById("roles-bestslot-result");
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

  // "Seulement les cases pas encore marquées" : on retire du lot tout
  // créneau déjà en dispo OU pas dispo, pour ne remplir que le neutre —
  // pratique pour compléter d'un coup ce qui reste à répondre sans risquer
  // d'écraser des réponses déjà données ailleurs dans la même plage. N'a de
  // sens qu'en mode "Dispo"/"Pas dispo" (en mode "Effacer" tout est déjà
  // couvert par la logique normale, la case est ignorée).
  const onlyEmpty = bulkOnlyEmpty.checked && newValue;
  const finalMatches = onlyEmpty ? matches.filter((key) => !state.marks[key]) : matches;

  if (!finalMatches.length) {
    bulkMarkResult.textContent = onlyEmpty && matches.length
      ? "Tous les créneaux de cette plage sont déjà marqués — rien à remplir."
      : "Aucun créneau ne correspond à ces critères.";
    return;
  }

  // Avertit seulement si on écrase un dispo <-> pas dispo déjà marqué
  // différemment — passer d'un état neutre à un état marqué (ou l'inverse,
  // "Effacer") ne déclenche jamais de confirmation, comme demandé. Jamais
  // de conflit possible quand "Seulement les cases pas encore marquées" est
  // coché, puisque ces créneaux sont déjà exclus de finalMatches ci-dessus.
  if (newValue && !onlyEmpty) {
    const conflicts = matches.filter((key) => {
      const current = state.marks[key];
      return current && current !== newValue;
    }).length;
    if (conflicts > 0) {
      const label = newValue === "available" ? "dispo" : "pas dispo";
      const ok = confirm(
        `${conflicts} créneau(x) étaient déjà marqués différemment et vont passer en "${label}" — continuer ?`
      );
      if (!ok) return;
    }
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
  if (!requested.length) {
    availRequestBanner.classList.add("hidden");
    availRequestBanner.innerHTML = "";
    return;
  }
  availRequestBanner.classList.remove("hidden");
  availRequestBanner.innerHTML = requested
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
  if (tab === "roles") renderRolesEventSelect();
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
  const rolesEnabled = ROLES_WITH_AVAILABILITY_ACCESS.includes(state.role);
  agendaTabBtn.classList.toggle("hidden", !agendaEnabled);
  tasksTabBtn.classList.toggle("hidden", !tasksEnabled);
  rolesTabBtn.classList.toggle("hidden", !rolesEnabled);
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

function findBestSlotsForRoles({ startDate, endDate, durationMinutes, thresholdMinutes }) {
  const includeWeekends = !!(state.config && state.config.includeWeekends);
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
      const { available, unavailable } = classifyMembersForRoles(slotKeys, thresholdMinutes);
      results.push({ dateISO, startTime, endTime, available, unavailable });
    });
  });

  results.sort((a, b) => {
    if (b.available.length !== a.available.length) return b.available.length - a.available.length;
    if (a.unavailable.length !== b.unavailable.length) return a.unavailable.length - b.unavailable.length;
    const dcmp = a.dateISO.localeCompare(b.dateISO);
    if (dcmp !== 0) return dcmp;
    return a.startTime.localeCompare(b.startTime);
  });
  return results.slice(0, 8);
}

function renderRolesBestSlotResults(results) {
  if (!results.length) {
    rolesBestSlotResult.innerHTML = "<p>Aucun créneau trouvé (vérifie la période et la durée par rapport aux heures de la grille).</p>";
    return;
  }
  rolesBestSlotResult.innerHTML = results
    .map((r, i) => {
      const unavailText = r.unavailable.length ? `, ${r.unavailable.length} indispo` : "";
      return `<p><strong>${i + 1}.</strong> ${r.dateISO} ${r.startTime}-${r.endTime} — ${r.available.length} dispo${unavailText} (${r.available.join(", ") || "—"})</p>`;
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
    const results = findBestSlotsForRoles({ startDate, endDate, durationMinutes, thresholdMinutes });
    renderRolesBestSlotResults(results);
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

// ===================== IMPORT D'UN CALENDRIER .ICS =====================
// Importe un fichier .ics (ex: export de l'horaire de cours personnel) et
// marque automatiquement "pas dispo" les créneaux qui tombent dedans — sans
// jamais toucher aux créneaux déjà marqués à la main (dispo OU pas dispo),
// pour ne jamais écraser une décision déjà prise manuellement. On peut donc
// toujours re-marquer "dispo" par-dessus après coup, y compris en réimportant.
icsImportBtn.addEventListener("click", () => icsFileInput.click());

icsFileInput.addEventListener("change", async () => {
  const file = icsFileInput.files[0];
  if (!file || !state.password || !state.config) return;
  icsStatus.classList.remove("hidden");
  icsStatus.textContent = "Import en cours…";
  try {
    const text = await file.text();
    const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
    const unavailableKeys = computeUnavailableSlots(text, dates, CONFIG.slotMinutes, CONFIG.dayStartHour, CONFIG.dayEndHour);
    let added = 0;
    unavailableKeys.forEach((key) => {
      if (!(key in state.marks)) {
        state.marks[key] = "unavailable";
        added++;
      }
    });
    if (added > 0) {
      await persistMarks();
      renderGrid();
    }
    icsStatus.textContent = added > 0
      ? `Importé : ${added} créneau(x) marqué(s) "pas dispo" (les créneaux déjà marqués à la main n'ont pas été touchés).`
      : "Importé, mais rien à ajouter (soit aucun créneau reconnu dans la période affichée, soit déjà tous marqués).";
  } catch (err) {
    console.error("Échec de l'import .ics :", err);
    icsStatus.textContent = "Fichier .ics illisible, réessaie avec un autre export.";
  }
  icsFileInput.value = "";
});

// ===================== RENDU DE LA GRILLE =====================
// La grille (cours bloqués + événements) est visible par tout le monde, avec
// ou sans connexion. Les marques personnelles et la possibilité de cliquer ne
// s'activent qu'une fois connecté (state.password non nul).
function renderGrid() {
  if (!state.config) {
    gridEl.innerHTML = "";
    return;
  }

  const dates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
  const times = Grid.buildTimeSlots();
  const blockedSlots = state.config.blockedSlots || [];

  gridEl.innerHTML = "";
  gridEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
  gridEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);

  Grid.renderGridHeaders(gridEl, dates, state.events);

  Grid.renderHourRows(gridEl, dates, times, state.events, blockedSlots, (cell, { dateISO, timeLabel, blocked, events }) => {
    const key = Grid.slotKey(dateISO, timeLabel);
    cell.dataset.key = key;
    if (state.password) {
      const mark = state.marks[key];
      if (mark === "available") cell.classList.add("mark-available");
      if (mark === "unavailable") cell.classList.add("mark-unavailable");
      // "Dispo demandée" par l'admin sur ce créneau précis (via un événement
      // flaggé availabilityRequested) et pas encore répondu par ce membre.
      if (!mark && events.some((e) => e.availabilityRequested)) {
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
  } else {
    state.marks[key] = state.mode;
    cell.classList.add(state.mode === "available" ? "mark-available" : "mark-unavailable");
  }
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
db.listenConfig((config) => {
  state.config = config;
  renderGrid();
  applyPublicTabsVisibility();
});
db.listenEvents((events) => {
  state.events = events;
  eventsLoaded = true;
  renderGrid();
  renderMemberDashboard();
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
