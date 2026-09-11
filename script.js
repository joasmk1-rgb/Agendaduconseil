// ===================== SCRIPT.JS (page membre) =====================
import * as Grid from "./grid.js";
import * as db from "./db.js";
import { CONFIG } from "./config.js";
import { computeUnavailableSlots } from "./ics.js";

const LOGIN_KEY = "agenda-conseil:password";
const VIEW_WEEKS_KEY = "agenda-conseil:viewWeeks";

let state = {
  password: null,
  name: null,
  isAdmin: false,
  config: null,
  events: [],
  marks: {}, // "YYYY-MM-DD|HH:MM" -> "available" | "unavailable"
  mode: "available",
  tasks: [],
  // Nombre de semaines affichées à la fois dans la grille (chacun choisit la
  // sienne, mémorisé dans son navigateur — n'affecte que l'affichage, pas la
  // fenêtre de données réglée par l'admin).
  viewWeeks: Number(localStorage.getItem(VIEW_WEEKS_KEY)) || 2,
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
const tasksSection = document.getElementById("tasks-section");
const taskListPublic = document.getElementById("task-list-public");
const icsImportBtn = document.getElementById("ics-import-btn");
const icsFileInput = document.getElementById("ics-file-input");
const icsStatus = document.getElementById("ics-status");

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
  state.marks = {};
  loginForm.classList.remove("hidden");
  loginForm.reset();
  sessionConnected.classList.add("hidden");
  memberControls.classList.add("hidden");
  renderGrid();
  renderTasks();
});

async function enterAsMember(member) {
  state.password = member.password;
  state.name = member.name;
  state.isAdmin = !!member.isAdmin;
  memberNameEl.textContent = member.name;
  adminLink.classList.toggle("hidden", !state.isAdmin);
  loginForm.classList.add("hidden");
  loginError.classList.add("hidden");
  sessionConnected.classList.remove("hidden");
  memberControls.classList.remove("hidden");

  state.marks = await db.getMarks(state.password);
  renderGrid();
  renderTasks();
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

function isTaskLate(task) {
  if (!task.deadline || task.status === "done") return false;
  const deadlineDate = new Date(`${task.deadline}T${task.deadlineTime || "23:59"}:00`);
  return deadlineDate < new Date();
}

function renderTasks() {
  if (!state.password) {
    tasksSection.classList.add("hidden");
    taskListPublic.innerHTML = "";
    return;
  }
  const visible = state.tasks.filter((t) => {
    const assignedTo = t.assignedTo || [];
    const requiredCount = t.requiredCount || 1;
    const isOnIt = assignedTo.some((a) => a.password === state.password);
    if (isOnIt) return true;
    if (t.fixedAssignment) return false; // assignée à quelqu'un d'autre
    return assignedTo.length < requiredCount; // libre, encore de la place
  });
  if (!visible.length) {
    tasksSection.classList.add("hidden");
    taskListPublic.innerHTML = "";
    return;
  }
  tasksSection.classList.remove("hidden");
  taskListPublic.innerHTML = "";
  visible
    .slice()
    .sort((a, b) => {
      const order = { urgent: 0, important: 1, normal: 2 };
      const pa = order[a.priority] ?? 2;
      const pb = order[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.deadline || "9999").localeCompare(b.deadline || "9999");
    })
    .forEach((task) => {
      const assignedTo = task.assignedTo || [];
      const requiredCount = task.requiredCount || 1;
      const isOnIt = assignedTo.some((a) => a.password === state.password);

      const li = document.createElement("li");
      const priorityMark = TASK_PRIORITY_LABELS[task.priority] || "";
      const parts = [`📋 ${priorityMark ? priorityMark + " " : ""}${task.label}`];
      const deadline = formatDeadline(task);
      if (deadline) parts.push(`échéance ${deadline}`);
      if (requiredCount > 1) parts.push(`${assignedTo.length}/${requiredCount} personnes`);
      if (task.description) parts.push(task.description);
      if (isTaskLate(task)) parts.push("🔴 EN RETARD");
      li.innerHTML = `<span>${parts.join(" — ")}</span>`;

      const actions = document.createElement("span");
      actions.className = "item-actions";

      if (isOnIt && task.fixedAssignment) {
        // Assignée directement par l'admin : pas de bouton, juste un statut.
        const info = document.createElement("span");
        info.className = "hint";
        info.textContent = "Assignée par l'admin";
        actions.appendChild(info);
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
      }

      li.appendChild(actions);
      taskListPublic.appendChild(li);
    });
}

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

  Grid.renderHourRows(gridEl, dates, times, state.events, blockedSlots, (cell, { dateISO, timeLabel, blocked }) => {
    const key = Grid.slotKey(dateISO, timeLabel);
    cell.dataset.key = key;
    if (state.password) {
      const mark = state.marks[key];
      if (mark === "available") cell.classList.add("mark-available");
      if (mark === "unavailable") cell.classList.add("mark-unavailable");
      if (!blocked) {
        cell.addEventListener("mousedown", onCellMouseDown);
        cell.addEventListener("mouseenter", onCellMouseEnter);
        cell.addEventListener("touchstart", onCellTouchStart, { passive: false });
      }
    }
  });

  applyViewWidth();
  maybeApplyStartPosition(dates);
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
function onCellTouchStart(e) {
  e.preventDefault();
  beginPaint(e.currentTarget);
}
function onTouchMove(e) {
  if (!isPainting) return;
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
gridEl.addEventListener("touchmove", onTouchMove, { passive: false });

// ===================== INITIALISATION =====================
// Le calendrier (cours bloqués + événements admin) se charge et s'affiche
// tout de suite, sans attendre de connexion.
db.listenConfig((config) => {
  state.config = config;
  renderGrid();
});
db.listenEvents((events) => {
  state.events = events;
  eventsLoaded = true;
  renderGrid();
});
db.listenTasks((tasks) => {
  state.tasks = tasks;
  tasksLoaded = true;
  renderTasks();
  renderGrid();
});
tryAutoLogin();
