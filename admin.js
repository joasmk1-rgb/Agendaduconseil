// ===================== ADMIN.JS =====================
import { ADMIN_PASSPHRASE } from "./config.js";
import * as Grid from "./grid.js";
import * as db from "./db.js";

// ---------- Verrou d'accès (protection légère, pas une vraie sécurité) ----------
// L'accès admin se fait avec le mot de passe personnel d'un membre coché
// "Admin". Le mot de passe fixe ADMIN_PASSPHRASE ne sert qu'à débloquer le
// tout premier accès, avant qu'aucun membre ne soit encore admin ; dès qu'un
// membre est coché Admin, ce mot de passe fixe ne fonctionne plus jamais.
async function checkAccess() {
  if (sessionStorage.getItem("agenda-admin-auth") === "ok") return true;
  for (let attempt = 0; attempt < 3; attempt++) {
    const entered = prompt("Ton mot de passe (si tu es administrateur) :");
    if (entered === null) break;
    const trimmed = entered.trim();
    const member = await db.findMemberByPassword(trimmed);
    if (member && member.isAdmin) {
      sessionStorage.setItem("agenda-admin-auth", "ok");
      return true;
    }
    if (trimmed === ADMIN_PASSPHRASE && !(await db.hasAnyAdmin())) {
      sessionStorage.setItem("agenda-admin-auth", "ok");
      alert(
        "Accès accordé avec le mot de passe temporaire.\n\n" +
        "Pense à cocher \"Admin\" sur ta propre fiche dans la liste des membres ci-dessous : " +
        "une fois que c'est fait, ce mot de passe temporaire arrête définitivement de fonctionner, " +
        "même pour quelqu'un qui le retrouverait dans le code."
      );
      return true;
    }
  }
  return false;
}

checkAccess().then((ok) => {
  if (!ok) {
    document.getElementById("admin-app").classList.add("hidden");
    document.getElementById("access-denied").classList.remove("hidden");
  } else {
    document.getElementById("admin-app").classList.remove("hidden");
    runAdmin();
  }
});

function runAdmin() {
  // ---------- DOM ----------
  const configForm = document.getElementById("config-form");
  const rangeSelect = document.getElementById("config-range");
  const weekendToggle = document.getElementById("config-weekend");
  const configStatus = document.getElementById("config-status");
  const resetBtn = document.getElementById("reset-btn");

  const memberForm = document.getElementById("member-form");
  const memberNameInput = document.getElementById("member-name-input");
  const memberPasswordInput = document.getElementById("member-password-input");
  const memberAdminInput = document.getElementById("member-admin-input");
  const memberList = document.getElementById("member-list");

  const eventForm = document.getElementById("event-form");
  const eventLabelInput = document.getElementById("event-label-input");
  const eventAllDayInput = document.getElementById("event-allday-input");
  const eventDateInput = document.getElementById("event-date-input");
  const eventEndDateInput = document.getElementById("event-enddate-input");
  const eventStartInput = document.getElementById("event-start-input");
  const eventEndInput = document.getElementById("event-end-input");
  const eventList = document.getElementById("event-list");

  const responseCountEl = document.getElementById("response-count");
  const memberCountEl = document.getElementById("member-count");
  const rankingEl = document.getElementById("ranking");
  const heatmapGridEl = document.getElementById("heatmap-grid");

  let currentConfig = { rangeDays: 90, includeWeekends: false };
  let currentMembers = [];
  let currentEvents = [];
  let currentAvailability = [];

  // ---------- Fenêtre glissante ----------
  function fillConfigForm(config) {
    rangeSelect.value = String((config && config.rangeDays) || 90);
    weekendToggle.checked = !!(config && config.includeWeekends);
  }

  configForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    configStatus.textContent = "Enregistrement…";
    try {
      await db.saveConfig({
        rangeDays: Number(rangeSelect.value),
        includeWeekends: weekendToggle.checked,
      });
      configStatus.textContent = "Enregistré ✓";
    } catch (err) {
      console.error(err);
      configStatus.textContent = "Échec de l'enregistrement.";
    }
  });

  resetBtn.addEventListener("click", async () => {
    const ok = confirm("Réinitialiser les disponibilités de tout le monde ? (archivées avant d'être effacées)");
    if (!ok) return;
    configStatus.textContent = "Réinitialisation…";
    try {
      await db.resetAvailability();
      configStatus.textContent = "Disponibilités réinitialisées ✓";
    } catch (err) {
      console.error(err);
      configStatus.textContent = "Échec de la réinitialisation.";
    }
  });

  // ---------- Membres ----------
  memberForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = memberNameInput.value.trim();
    const password = memberPasswordInput.value.trim();
    if (!name || !password) return;
    await db.addMember(name, password, memberAdminInput.checked);
    memberNameInput.value = "";
    memberPasswordInput.value = "";
    memberAdminInput.checked = false;
  });

  function renderMembers() {
    memberList.innerHTML = "";
    currentMembers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const li = document.createElement("li");
        li.innerHTML = `<span>${m.name} <code>${m.id}</code>${m.isAdmin ? ' <span class="admin-badge">admin</span>' : ""}</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          if (confirm(`Retirer ${m.name} ?`)) await db.removeMember(m.id);
        });
        li.appendChild(removeBtn);
        memberList.appendChild(li);
      });
    memberCountEl.textContent = String(currentMembers.length);
  }

  // ---------- Événements ----------
  eventAllDayInput.addEventListener("change", () => {
    const allDay = eventAllDayInput.checked;
    eventEndDateInput.classList.toggle("hidden", !allDay);
    eventStartInput.classList.toggle("hidden", allDay);
    eventEndInput.classList.toggle("hidden", allDay);
  });

  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = eventLabelInput.value.trim();
    const date = eventDateInput.value;
    if (!label || !date) return;
    const allDay = eventAllDayInput.checked;
    const payload = { label, allDay, date };
    if (allDay) {
      if (eventEndDateInput.value) payload.endDate = eventEndDateInput.value;
    } else {
      payload.startTime = eventStartInput.value || "00:00";
      payload.endTime = eventEndInput.value || "23:59";
    }
    await db.addEvent(payload);
    eventForm.reset();
    eventAllDayInput.checked = true;
    eventEndDateInput.classList.remove("hidden");
    eventStartInput.classList.add("hidden");
    eventEndInput.classList.add("hidden");
  });

  function describeEvent(ev) {
    if (ev.allDay) {
      return ev.endDate && ev.endDate !== ev.date ? `${ev.date} → ${ev.endDate}` : ev.date;
    }
    return `${ev.date} ${ev.startTime}-${ev.endTime}`;
  }

  function renderEvents() {
    eventList.innerHTML = "";
    currentEvents
      .slice()
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .forEach((ev) => {
        const li = document.createElement("li");
        li.innerHTML = `<span><strong>${ev.label}</strong> — ${describeEvent(ev)}</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          await db.removeEvent(ev.id);
        });
        li.appendChild(removeBtn);
        eventList.appendChild(li);
      });
  }

  // ---------- Heatmap + classement ----------
  function renderHeatmap() {
    const dates = Grid.buildDateList(new Date(), currentConfig.rangeDays, currentConfig.includeWeekends);
    const times = Grid.buildTimeSlots();

    const counts = new Map(); // key -> { available: [], unavailable: [] }
    currentAvailability.forEach((r) => {
      Object.entries(r.marks || {}).forEach(([key, value]) => {
        const entry = counts.get(key) || { available: [], unavailable: [] };
        entry[value === "available" ? "available" : "unavailable"].push(r.name || "?");
        counts.set(key, entry);
      });
    });

    heatmapGridEl.innerHTML = "";
    heatmapGridEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
    heatmapGridEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);
    Grid.renderGridHeaders(heatmapGridEl, dates, currentEvents);

    const maxCount = currentMembers.length || 1;

    Grid.renderHourRows(heatmapGridEl, dates, times, currentEvents, (cell, { dateISO, timeLabel, blocked }) => {
      const key = Grid.slotKey(dateISO, timeLabel);
      cell.dataset.key = key;
      if (blocked) return;
      const entry = counts.get(key);
      if (!entry) return;
      const availCount = entry.available.length;
      const unavailCount = entry.unavailable.length;
      if (availCount > 0) {
        const ratio = availCount / maxCount;
        cell.style.background = `rgba(34, 197, 94, ${(0.15 + ratio * 0.75).toFixed(2)})`;
        cell.textContent = String(availCount);
      }
      if (unavailCount > 0) {
        cell.classList.add("has-unavailable");
      }
      const titleParts = [];
      if (availCount) titleParts.push(`Dispo : ${entry.available.join(", ")}`);
      if (unavailCount) titleParts.push(`Pas dispo : ${entry.unavailable.join(", ")}`);
      if (titleParts.length) cell.title = titleParts.join("\n");
    });

    renderRanking(counts);
  }

  function renderRanking(counts) {
    const best = [...counts.entries()]
      .filter(([, v]) => v.available.length > 0)
      .sort((a, b) => b[1].available.length - a[1].available.length)
      .slice(0, 5);
    const worst = [...counts.entries()]
      .filter(([, v]) => v.unavailable.length > 0)
      .sort((a, b) => b[1].unavailable.length - a[1].unavailable.length)
      .slice(0, 3);

    function formatKey(key) {
      const [dateISO, timeLabel] = key.split("|");
      const [, m, d] = dateISO.split("-");
      return `${d}/${m} à ${timeLabel}`;
    }

    let html = "";
    if (best.length) {
      html += "<p>Meilleurs créneaux :</p><ol>";
      html += best.map(([key, v]) => `<li><strong>${formatKey(key)}</strong> — ${v.available.length} dispo (${v.available.join(", ")})</li>`).join("");
      html += "</ol>";
    } else {
      html += "<p>Aucune disponibilité enregistrée pour le moment.</p>";
    }
    if (worst.length) {
      html += "<p>À éviter :</p><ol>";
      html += worst.map(([key, v]) => `<li><strong>${formatKey(key)}</strong> — ${v.unavailable.length} indisponible(s) (${v.unavailable.join(", ")})</li>`).join("");
      html += "</ol>";
    }
    rankingEl.innerHTML = html;
  }

  // ---------- Abonnements en direct ----------
  db.listenConfig((config) => {
    currentConfig = config || { rangeDays: 30, includeWeekends: false };
    fillConfigForm(currentConfig);
    renderHeatmap();
  });

  db.listenMembers((members) => {
    currentMembers = members;
    renderMembers();
    renderHeatmap();
  });

  db.listenEvents((events) => {
    currentEvents = events;
    renderEvents();
    renderHeatmap();
  });

  db.listenAllAvailability((responses) => {
    currentAvailability = responses;
    responseCountEl.textContent = String(responses.length);
    renderHeatmap();
  });
}
