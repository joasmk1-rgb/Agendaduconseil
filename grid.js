// ===================== GRID.JS =====================
// Fonctions de construction de la grille horaire, partagées entre la page
// membre (script.js) et la page admin (admin.js), pour que les deux
// affichent exactement la même chose.

import { CONFIG } from "./config.js";

export const WEEKDAYS_FULL = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
export const MONTHS_FULL = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

// Hauteurs de lignes de la grille (doivent correspondre à style.css)
export const LAYOUT = {
  timeColWidth: 70,
  monthRowHeight: 26,
  dayRowHeight: 48,
  eventsRowHeight: 24,
  hourRowHeight: 22,
};

// Les lignes horaires commencent après : bandeau mois (1) + jour (2) + événements toute la journée (3)
const HOUR_ROW_OFFSET = 4;

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function minutesToLabel(totalMinutes) {
  const h = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const m = String(totalMinutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function timeToMinutes(label) {
  const [h, m] = label.split(":").map(Number);
  return h * 60 + m;
}

export function buildTimeSlots() {
  const slots = [];
  for (let t = CONFIG.dayStartHour * 60; t < CONFIG.dayEndHour * 60; t += CONFIG.slotMinutes) {
    slots.push(minutesToLabel(t));
  }
  return slots;
}

// Toutes les dates (chaînes "YYYY-MM-DD") entre startISO et endISO inclus,
// sans filtrage week-end — utilisé pour scoper un export à la période exacte
// d'un événement (contrairement à buildDateList, qui sert à construire les
// colonnes affichées dans la grille).
export function buildInclusiveDateRange(startISO, endISO) {
  const out = [];
  let cursor = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO || startISO}T00:00:00`);
  let guard = 0;
  while (cursor <= end && guard < 400) {
    out.push(toISODate(cursor));
    cursor = addDays(cursor, 1);
    guard++;
  }
  return out;
}

// startDate: Date ; rangeDays: number ; includeWeekends: boolean
export function buildDateList(startDate, rangeDays, includeWeekends) {
  const dates = [];
  let cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  let guard = 0;
  while (dates.length < rangeDays && guard < rangeDays * 3 + 10) {
    const dow = cursor.getDay();
    if (includeWeekends || (dow !== 0 && dow !== 6)) {
      dates.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
    guard++;
  }
  return dates;
}

export function isBlocked(date, timeLabel, blockedSlots) {
  const dow = date.getDay();
  const minutes = timeToMinutes(timeLabel);
  return (blockedSlots || []).find((b) => {
    if (b.day !== dow) return false;
    return minutes >= timeToMinutes(b.start) && minutes < timeToMinutes(b.end);
  });
}

export function slotKey(dateISO, timeLabel) {
  return `${dateISO}|${timeLabel}`;
}

export function gridTemplateColumns(dateCount) {
  return `${LAYOUT.timeColWidth}px repeat(${dateCount}, minmax(72px, 1fr))`;
}

export function gridTemplateRows(timeCount) {
  return `${LAYOUT.monthRowHeight}px ${LAYOUT.dayRowHeight}px ${LAYOUT.eventsRowHeight}px repeat(${timeCount}, ${LAYOUT.hourRowHeight}px)`;
}

// ---------------------- Événements ----------------------
// event: { label, allDay: bool, date, endDate?, startTime?, endTime? }

export function allDayEventsForDate(events, dateISO) {
  return (events || []).filter((e) => {
    if (!e.allDay) return false;
    const end = e.endDate || e.date;
    return dateISO >= e.date && dateISO <= end;
  });
}

export function timedEventsAt(events, dateISO, timeLabel) {
  const minutes = timeToMinutes(timeLabel);
  return (events || []).filter((e) => {
    if (e.allDay || e.date !== dateISO) return false;
    const start = timeToMinutes(e.startTime || "00:00");
    const end = timeToMinutes(e.endTime || "23:59");
    return minutes >= start && minutes < end;
  });
}

// Regroupe les dates consécutives d'un même mois, pour afficher un bandeau
// "Septembre 2026" façon calendrier au-dessus des jours concernés.
export function buildMonthGroups(dates) {
  const groups = [];
  dates.forEach((date, i) => {
    const label = `${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      groups.push({ label, startIndex: i, span: 1 });
    }
  });
  return groups;
}

export function buildDayHeaderCell(date) {
  const dow = date.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const isToday = toISODate(date) === toISODate(new Date());
  const el = document.createElement("div");
  el.className = "cell day-header" + (isWeekend ? " weekend" : "") + (isToday ? " today" : "");
  el.dataset.dateIso = toISODate(date);
  const weekdayLabel = document.createElement("span");
  weekdayLabel.className = "weekday";
  weekdayLabel.textContent = WEEKDAYS_FULL[dow];
  const dayNumber = document.createElement("span");
  dayNumber.className = "day-number";
  dayNumber.textContent = String(date.getDate());
  el.appendChild(weekdayLabel);
  el.appendChild(dayNumber);
  return el;
}

// Ajoute le coin, le bandeau "mois", la ligne "jour de semaine + numéro" et
// la ligne "événements toute la journée" dans un conteneur de grille.
// Placement explicite en grid-row/grid-column (plus robuste que l'ordre du
// DOM dès qu'il y a des cellules fusionnées).
export function renderGridHeaders(container, dates, events) {
  const corner = document.createElement("div");
  corner.className = "cell corner";
  corner.style.gridRow = "1 / 4";
  corner.style.gridColumn = "1";
  container.appendChild(corner);

  buildMonthGroups(dates).forEach((group) => {
    const el = document.createElement("div");
    el.className = "cell month-band";
    el.textContent = group.label;
    el.style.gridRow = "1";
    el.style.gridColumn = `${group.startIndex + 2} / span ${group.span}`;
    container.appendChild(el);
  });

  dates.forEach((date, i) => {
    const el = buildDayHeaderCell(date);
    el.style.gridRow = "2";
    el.style.gridColumn = String(i + 2);
    container.appendChild(el);
  });

  dates.forEach((date, i) => {
    const dateISO = toISODate(date);
    const dayEvents = allDayEventsForDate(events, dateISO);
    const el = document.createElement("div");
    el.className = "cell events-band" + (dayEvents.length ? " has-events" : "");
    el.style.gridRow = "3";
    el.style.gridColumn = String(i + 2);
    if (dayEvents.length) {
      el.textContent = dayEvents.map((e) => e.label).join(" · ");
      el.title = dayEvents.map((e) => e.label).join("\n");
    }
    container.appendChild(el);
  });
}

// Construit les lignes horaires dans `container` (déjà dimensionné en CSS
// grid). `cellFactory(cellEl, { date, dateISO, timeLabel, blocked, events })`
// personnalise chaque cellule (sélection membre, heatmap admin...).
export function renderHourRows(container, dates, times, events, blockedSlots, cellFactory) {
  times.forEach((timeLabel, r) => {
    const isHourMark = timeLabel.endsWith(":00");
    const labelEl = document.createElement("div");
    labelEl.className = "cell time-label" + (isHourMark ? " hour-mark" : "");
    labelEl.textContent = isHourMark ? timeLabel : `:${timeLabel.split(":")[1]}`;
    labelEl.style.gridRow = String(r + HOUR_ROW_OFFSET);
    labelEl.style.gridColumn = "1";
    container.appendChild(labelEl);

    dates.forEach((date, i) => {
      const dateISO = toISODate(date);
      const blocked = isBlocked(date, timeLabel, blockedSlots);
      const cellEvents = timedEventsAt(events, dateISO, timeLabel);
      const cell = document.createElement("div");
      cell.className = "cell slot" + (isHourMark ? " hour-mark" : "") + (blocked ? " blocked" : "") + (cellEvents.length ? " has-event" : "");
      cell.style.gridRow = String(r + HOUR_ROW_OFFSET);
      cell.style.gridColumn = String(i + 2);
      if (blocked) {
        cell.title = blocked.label || "Créneau bloqué";
      }
      if (cellEvents.length) {
        const existingTitle = cell.title ? cell.title + "\n" : "";
        cell.title = existingTitle + cellEvents.map((e) => e.label).join("\n");
      }
      if (cellFactory) {
        cellFactory(cell, { date, dateISO, timeLabel, blocked, events: cellEvents });
      }
      container.appendChild(cell);
    });
  });
}
