// ===================== SCRIPT.JS (page membre) =====================
import * as Grid from "./grid.js";
import * as db from "./db.js";

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

// ===================== FENÊTRE DE VUE (1 / 2 / 3 semaines) =====================
function syncViewRangeButtons() {
  viewRangeToggle.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.weeks) === state.viewWeeks);
  });
}
viewRangeToggle.addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  state.viewWeeks = Number(btn.dataset.weeks);
  localStorage.setItem(VIEW_WEEKS_KEY, String(state.viewWeeks));
  syncViewRangeButtons();
  renderGrid();
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

// ===================== VUE CIBLÉE (forcée par l'admin) =====================
// Si l'admin a réglé une "vue ciblée" (par ex. la date d'un événement à
// venir), la fenêtre affichée se décale pour que cette date devienne la
// première colonne visible — sans changer le nombre de semaines choisi par
// la personne (state.viewWeeks). Si la date ciblée est trop proche de la fin
// de la période chargée pour remplir une fenêtre complète, on recule juste
// assez pour garder la taille de fenêtre constante.
function computeVisibleDates(allDates) {
  const perWeek = state.config.includeWeekends ? 7 : 5;
  const windowSize = Math.max(1, Math.min(allDates.length, state.viewWeeks * perWeek));
  const focusDate = state.config && state.config.focusDate;

  let startIndex = 0;
  if (focusDate) {
    const idx = allDates.findIndex((d) => Grid.toISODate(d) === focusDate);
    if (idx !== -1) startIndex = idx;
  }
  startIndex = Math.max(0, Math.min(startIndex, allDates.length - windowSize));

  return allDates.slice(startIndex, startIndex + windowSize);
}

// ===================== RENDU DE LA GRILLE =====================
// La grille (cours bloqués + événements) est visible par tout le monde, avec
// ou sans connexion. Les marques personnelles et la possibilité de cliquer ne
// s'activent qu'une fois connecté (state.password non nul).
function renderGrid() {
  if (!state.config) {
    gridEl.innerHTML = "";
    return;
  }

  const allDates = Grid.buildDateList(new Date(), state.config.rangeDays, state.config.includeWeekends);
  const dates = computeVisibleDates(allDates);
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
  renderGrid();
});
tryAutoLogin();
