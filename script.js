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
const tasksSection = document.getElementById("tasks-section");
const taskListPublic = document.getElementById("task-list-public");
const icsImportBtn = document.getElementById("ics-import-btn");
const icsFileInput = document.getElementById("ics-file-input");
const icsStatus = document.getElementById("ics-status");
const bulkMarkSection = document.getElementById("bulk-mark-section");
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
  bulkMarkSection.classList.add("hidden");
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
  bulkMarkSection.classList.remove("hidden");

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

  // Avertit seulement si on écrase un dispo <-> pas dispo déjà marqué
  // différemment — passer d'un état neutre à un état marqué (ou l'inverse,
  // "Effacer") ne déclenche jamais de confirmation, comme demandé.
  if (newValue) {
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

  matches.forEach((key) => {
    if (newValue) state.marks[key] = newValue;
    else delete state.marks[key];
  });

  renderGrid();
  bulkMarkResult.textContent = `${matches.length} créneau(x) mis à jour.`;
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
