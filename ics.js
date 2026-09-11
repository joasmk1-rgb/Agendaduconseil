// ===================== ICS.JS =====================
// Parseur .ics minimal (pas de dépendance externe), pensé pour un cas
// d'usage simple : un export d'horaire de cours (événements ponctuels et/ou
// récurrents hebdomadaires "RRULE:FREQ=WEEKLY"). Ne gère pas tout le
// standard iCalendar (pas de RRULE mensuelle/annuelle, pas de fuseaux
// horaires exotiques) — largement suffisant pour un calendrier de cours.

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// Les lignes .ics peuvent être "repliées" : une ligne trop longue continue
// sur la ligne suivante si elle commence par un espace ou une tabulation.
function unfoldLines(text) {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function parseLineProp(line) {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return null;
  const left = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = left.split(";");
  const params = {};
  paramParts.forEach((p) => {
    const [k, v] = p.split("=");
    if (k) params[k] = v;
  });
  return { name: name.toUpperCase(), params, value };
}

// "20260915T083000Z" (UTC) / "20260915T083000" (local, on ne convertit pas
// de fuseau — un export de cours belge est déjà en heure locale dans
// l'immense majorité des cas) / "20260915" (toute la journée).
function parseICSDate(value) {
  if (!value) return null;
  const isDateOnly = /^\d{8}$/.test(value);
  if (isDateOnly) {
    const y = Number(value.slice(0, 4));
    const m = Number(value.slice(4, 6));
    const d = Number(value.slice(6, 8));
    return { allDay: true, date: new Date(y, m - 1, d) };
  }
  const utc = value.endsWith("Z");
  const clean = value.replace("Z", "");
  const y = Number(clean.slice(0, 4));
  const mo = Number(clean.slice(4, 6));
  const d = Number(clean.slice(6, 8));
  const h = Number(clean.slice(9, 11) || 0);
  const mi = Number(clean.slice(11, 13) || 0);
  const s = Number(clean.slice(13, 15) || 0);
  const date = utc ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return { allDay: false, date };
}

function parseRRule(value) {
  const out = {};
  value.split(";").forEach((part) => {
    const [k, v] = part.split("=");
    if (k) out[k] = v;
  });
  return out;
}

export function parseICS(text) {
  const lines = unfoldLines(text);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { exdates: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const prop = parseLineProp(line);
    if (!prop) continue;
    switch (prop.name) {
      case "SUMMARY":
        cur.summary = prop.value;
        break;
      case "DTSTART":
        cur.dtstart = parseICSDate(prop.value);
        break;
      case "DTEND":
        cur.dtend = parseICSDate(prop.value);
        break;
      case "RRULE":
        cur.rrule = parseRRule(prop.value);
        break;
      case "EXDATE":
        // EXDATE peut contenir plusieurs dates séparées par des virgules.
        prop.value.split(",").forEach((v) => {
          const parsed = parseICSDate(v);
          if (parsed) cur.exdates.push(parsed);
        });
        break;
      default:
        break;
    }
  }
  return events;
}

function toISODateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripTime(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function minutesToLabel(t) {
  const h = String(Math.floor(t / 60)).padStart(2, "0");
  const m = String(t % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// Calcule l'ensemble des créneaux (clés "YYYY-MM-DD|HH:MM", même format que
// Grid.slotKey) à marquer "pas dispo" d'après le contenu d'un fichier .ics,
// pour les dates fournies (Date[], celles actuellement affichées dans la
// grille) et le découpage horaire du site (slotMinutes/dayStartHour/dayEndHour).
// Ignore volontairement les événements "toute la journée" (un cours a
// toujours une heure précise) et ne gère que les récurrences hebdomadaires
// simples (largement le cas le plus courant pour un horaire de cours).
export function computeUnavailableSlots(icsText, dates, slotMinutes, dayStartHour, dayEndHour) {
  const events = parseICS(icsText);
  const keys = new Set();
  const dateByISO = new Map(dates.map((d) => [toISODateLocal(d), d]));
  const gridStart = dayStartHour * 60;
  const gridEnd = dayEndHour * 60;

  function markSlots(iso, startMin, durationMin) {
    const endMin = startMin + durationMin;
    for (let t = gridStart; t < gridEnd; t += slotMinutes) {
      const slotEnd = t + slotMinutes;
      if (t < endMin && slotEnd > startMin) {
        keys.add(`${iso}|${minutesToLabel(t)}`);
      }
    }
  }

  events.forEach((ev) => {
    if (!ev.dtstart || ev.dtstart.allDay || !ev.dtend) return;
    const durationMs = ev.dtend.date - ev.dtstart.date;
    if (durationMs <= 0) return;
    const startMinutesOfDay = ev.dtstart.date.getHours() * 60 + ev.dtstart.date.getMinutes();
    const durationMinutes = Math.round(durationMs / 60000);
    const exISOs = new Set((ev.exdates || []).map((e) => toISODateLocal(e.date)));

    if (ev.rrule && ev.rrule.FREQ === "WEEKLY") {
      const allowedDays = ev.rrule.BYDAY ? ev.rrule.BYDAY.split(",") : [DAY_CODES[ev.dtstart.date.getDay()]];
      const until = ev.rrule.UNTIL ? parseICSDate(ev.rrule.UNTIL).date : null;
      const startDay = stripTime(ev.dtstart.date);
      for (const [iso, d] of dateByISO) {
        if (d < startDay) continue;
        if (until && d > until) continue;
        if (!allowedDays.includes(DAY_CODES[d.getDay()])) continue;
        if (exISOs.has(iso)) continue;
        markSlots(iso, startMinutesOfDay, durationMinutes);
      }
    } else {
      const iso = toISODateLocal(ev.dtstart.date);
      if (dateByISO.has(iso) && !exISOs.has(iso)) {
        markSlots(iso, startMinutesOfDay, durationMinutes);
      }
    }
  });

  return keys;
}
