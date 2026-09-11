// ===================== ADMIN.JS =====================
import { ADMIN_PASSPHRASE, CONFIG } from "./config.js";
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

  const focusForm = document.getElementById("focus-form");
  const focusDateInput = document.getElementById("focus-date-input");
  const focusClearBtn = document.getElementById("focus-clear-btn");
  const focusStatus = document.getElementById("focus-status");

  const memberForm = document.getElementById("member-form");
  const memberNameInput = document.getElementById("member-name-input");
  const memberPasswordInput = document.getElementById("member-password-input");
  const memberAdminInput = document.getElementById("member-admin-input");
  const memberList = document.getElementById("member-list");
  const memberBulkDeleteBtn = document.getElementById("member-bulk-delete-btn");

  const blockedForm = document.getElementById("blocked-form");
  const blockedDayInput = document.getElementById("blocked-day-input");
  const blockedStartInput = document.getElementById("blocked-start-input");
  const blockedEndInput = document.getElementById("blocked-end-input");
  const blockedLabelInput = document.getElementById("blocked-label-input");
  const blockedList = document.getElementById("blocked-list");

  const eventForm = document.getElementById("event-form");
  const eventLabelInput = document.getElementById("event-label-input");
  const eventAllDayInput = document.getElementById("event-allday-input");
  const eventDateInput = document.getElementById("event-date-input");
  const eventEndDateInput = document.getElementById("event-enddate-input");
  const eventStartInput = document.getElementById("event-start-input");
  const eventEndInput = document.getElementById("event-end-input");
  const eventRequiredInput = document.getElementById("event-required-input");
  const eventThresholdInput = document.getElementById("event-threshold-input");
  const eventList = document.getElementById("event-list");
  const taskForm = document.getElementById("task-form");
  const taskLabelInput = document.getElementById("task-label-input");
  const taskDescriptionInput = document.getElementById("task-description-input");
  const taskDeadlineInput = document.getElementById("task-deadline-input");
  const taskList = document.getElementById("task-list");
  const eventAvailabilitySelect = document.getElementById("event-availability-select");
  const eventAvailabilityResult = document.getElementById("event-availability-result");

  const bestSlotForm = document.getElementById("best-slot-form");
  const bestSlotStartInput = document.getElementById("best-slot-start-input");
  const bestSlotEndInput = document.getElementById("best-slot-end-input");
  const bestSlotDurationInput = document.getElementById("best-slot-duration-input");
  const bestSlotThresholdInput = document.getElementById("best-slot-threshold-input");
  const bestSlotResult = document.getElementById("best-slot-result");

  const responseCountEl = document.getElementById("response-count");
  const memberCountEl = document.getElementById("member-count");
  const rankingEl = document.getElementById("ranking");
  const heatmapGridEl = document.getElementById("heatmap-grid");
  const orphanSection = document.getElementById("orphan-section");
  const orphanList = document.getElementById("orphan-list");

  const fillMemberSelect = document.getElementById("fill-member-select");
  const fillModeAvailableBtn = document.getElementById("fill-mode-available");
  const fillModeUnavailableBtn = document.getElementById("fill-mode-unavailable");
  const fillStatus = document.getElementById("fill-status");
  const fillGridEl = document.getElementById("fill-grid");

  let currentConfig = { rangeDays: 90, includeWeekends: false };
  let currentMembers = [];
  let currentEvents = [];
  let currentAvailability = [];
  let currentTasks = [];

  // ---------- Fenêtre glissante ----------
  function fillConfigForm(config) {
    rangeSelect.value = String((config && config.rangeDays) || 90);
    weekendToggle.checked = !!(config && config.includeWeekends);
    focusDateInput.value = (config && config.focusDate) || "";
  }

  // ---------- Vue ciblée ----------
  async function setFocusDate(date) {
    focusStatus.textContent = "Enregistrement…";
    try {
      await db.saveConfig({ ...currentConfig, focusDate: date });
      focusDateInput.value = date;
      focusStatus.textContent = `Vue ciblée sur le ${date} ✓`;
    } catch (err) {
      console.error(err);
      focusStatus.textContent = "Échec de l'enregistrement.";
    }
  }

  focusForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = focusDateInput.value;
    if (!date) return;
    await setFocusDate(date);
  });

  focusClearBtn.addEventListener("click", async () => {
    focusStatus.textContent = "Enregistrement…";
    try {
      const { focusDate, ...rest } = currentConfig;
      await db.saveConfig(rest);
      focusDateInput.value = "";
      focusStatus.textContent = "Vue revenue sur \"aujourd'hui\" ✓";
    } catch (err) {
      console.error(err);
      focusStatus.textContent = "Échec de l'enregistrement.";
    }
  });

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

  let memberEditingId = null; // mot de passe (id) du membre en cours d'édition, ou null

  function updateBulkDeleteButton() {
    const checked = memberList.querySelectorAll(".member-select:checked");
    memberBulkDeleteBtn.textContent = `Supprimer la sélection (${checked.length})`;
    memberBulkDeleteBtn.disabled = checked.length === 0;
  }

  memberBulkDeleteBtn.addEventListener("click", async () => {
    const checked = Array.from(memberList.querySelectorAll(".member-select:checked"));
    if (checked.length === 0) return;
    const names = checked.map((cb) => {
      const m = currentMembers.find((x) => x.id === cb.dataset.password);
      return m ? m.name : cb.dataset.password;
    });
    if (!confirm(`Retirer ${checked.length} membre(s) (et leurs disponibilités) : ${names.join(", ")} ?`)) return;
    memberBulkDeleteBtn.disabled = true;
    try {
      await Promise.all(checked.map((cb) => db.removeMember(cb.dataset.password)));
    } catch (err) {
      console.error(err);
      alert("Échec de la suppression groupée, réessaie.");
    } finally {
      memberBulkDeleteBtn.disabled = false;
    }
  });

  function renderMembers() {
    memberList.innerHTML = "";
    currentMembers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const li = document.createElement("li");

        if (memberEditingId === m.id) {
          // ---- mode édition : nom + mot de passe modifiables sur place ----
          li.classList.add("editing");

          const fields = document.createElement("span");
          fields.className = "member-edit-fields";
          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.value = m.name;
          const passwordInput = document.createElement("input");
          passwordInput.type = "text";
          passwordInput.value = m.id;
          const adminLabel = document.createElement("label");
          adminLabel.className = "checkbox-group";
          const adminCheckbox = document.createElement("input");
          adminCheckbox.type = "checkbox";
          adminCheckbox.checked = !!m.isAdmin;
          adminLabel.appendChild(adminCheckbox);
          adminLabel.appendChild(document.createTextNode(" Admin"));
          fields.appendChild(nameInput);
          fields.appendChild(passwordInput);
          fields.appendChild(adminLabel);

          const actions = document.createElement("span");
          actions.className = "item-actions";
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "btn btn-primary btn-sm";
          saveBtn.textContent = "Enregistrer";
          saveBtn.addEventListener("click", async () => {
            const newName = nameInput.value.trim();
            const newPassword = passwordInput.value.trim();
            if (!newName || !newPassword) {
              alert("Le nom et le mot de passe ne peuvent pas être vides.");
              return;
            }
            if (newPassword !== m.id) {
              const existing = await db.findMemberByPassword(newPassword);
              if (existing) {
                alert(`Ce mot de passe est déjà utilisé par ${existing.name} — choisis-en un autre.`);
                return;
              }
            }
            saveBtn.disabled = true;
            try {
              if (newPassword === m.id) {
                // même mot de passe : simple mise à jour sur place
                await db.addMember(newName, m.id, adminCheckbox.checked);
              } else {
                // mot de passe changé = nouvel identifiant en base : on migre
                // le membre ET ses disponibilités déjà enregistrées vers le
                // nouveau mot de passe, puis on efface l'ancienne fiche
                // (efface aussi son ancienne entrée de dispos, cf. phase 8).
                const marks = await db.getMarks(m.id);
                await db.addMember(newName, newPassword, adminCheckbox.checked);
                if (Object.keys(marks).length > 0) {
                  await db.saveMarks(newPassword, newName, marks);
                }
                await db.removeMember(m.id);
              }
              memberEditingId = null;
              renderMembers();
            } catch (err) {
              console.error(err);
              alert("Échec de l'enregistrement, réessaie.");
              saveBtn.disabled = false;
            }
          });
          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "btn btn-ghost btn-sm";
          cancelBtn.textContent = "Annuler";
          cancelBtn.addEventListener("click", () => {
            memberEditingId = null;
            renderMembers();
          });
          actions.appendChild(saveBtn);
          actions.appendChild(cancelBtn);

          li.appendChild(fields);
          li.appendChild(actions);
        } else {
          // ---- mode normal ----
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.className = "member-select";
          checkbox.dataset.password = m.id;
          checkbox.addEventListener("change", updateBulkDeleteButton);

          const label = document.createElement("span");
          label.innerHTML = `${m.name} <code>${m.id}</code>${m.isAdmin ? ' <span class="admin-badge">admin</span>' : ""}`;

          const actions = document.createElement("span");
          actions.className = "item-actions";
          const editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.className = "btn btn-ghost btn-sm";
          editBtn.textContent = "Modifier";
          editBtn.addEventListener("click", () => {
            memberEditingId = m.id;
            renderMembers();
          });
          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "btn btn-ghost btn-sm";
          removeBtn.textContent = "Retirer";
          removeBtn.addEventListener("click", async () => {
            if (confirm(`Retirer ${m.name} ?`)) await db.removeMember(m.id);
          });
          actions.appendChild(editBtn);
          actions.appendChild(removeBtn);

          li.appendChild(checkbox);
          li.appendChild(label);
          li.appendChild(actions);
        }

        memberList.appendChild(li);
      });
    memberCountEl.textContent = String(currentMembers.length);
    updateBulkDeleteButton();
  }

  // ---------- Cours récurrents bloqués ----------
  blockedForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const start = blockedStartInput.value;
    const end = blockedEndInput.value;
    if (!start || !end) return;
    await db.addBlockedSlot({
      day: Number(blockedDayInput.value),
      start,
      end,
      label: blockedLabelInput.value.trim(),
    });
    blockedForm.reset();
  });

  function renderBlockedSlots() {
    blockedList.innerHTML = "";
    const dayName = (d) => Grid.WEEKDAYS_FULL[d];
    (currentConfig.blockedSlots || [])
      .slice()
      .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
      .forEach((slot) => {
        const li = document.createElement("li");
        li.innerHTML = `<span><strong>${dayName(slot.day)}</strong> ${slot.start}-${slot.end}${slot.label ? " — " + slot.label : ""}</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          await db.removeBlockedSlot(slot.id);
        });
        li.appendChild(removeBtn);
        blockedList.appendChild(li);
      });
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
    const requiredCount = Number(eventRequiredInput.value);
    if (requiredCount > 0) payload.requiredCount = requiredCount;
    const threshold = Number(eventThresholdInput.value);
    if (threshold > 0) payload.minAvailableMinutes = threshold;
    await db.addEvent(payload);
    eventForm.reset();
    eventAllDayInput.checked = true;
    eventEndDateInput.classList.remove("hidden");
    eventStartInput.classList.add("hidden");
    eventEndInput.classList.add("hidden");
  });

  // ---------- Qui est dispo pour un événement donné ----------
  // Un membre compte "Disponible" s'il a marqué "dispo" sur au moins
  // `minAvailableMinutes` (45 min par défaut) cumulées dans la plage de
  // l'événement — pas besoin d'être libre sur TOUTE la durée. Ça marche
  // aussi bien pour une réunion d'1h-1h30 (45 min dispo dedans = ok) que
  // pour un événement longue durée façon "Octobre Rose" sur tout un mois
  // (45 min dispo n'importe où dans le mois = ok, pour assigner une tâche).
  // Si le seuil n'est pas atteint, on regarde s'il y a un "pas dispo"
  // explicite quelque part dans la plage pour distinguer "Indisponible"
  // (a répondu non) de "Pas répondu" (n'a rien coché).
  function slotKeysForRange(dateISO, startTime, endTime) {
    const times = Grid.buildTimeSlots();
    return times.filter((t) => t >= startTime && t < endTime).map((t) => Grid.slotKey(dateISO, t));
  }

  function eventSlotKeys(ev) {
    if (ev.allDay) {
      const times = Grid.buildTimeSlots();
      const dates = Grid.buildInclusiveDateRange(ev.date, ev.endDate);
      const keys = [];
      dates.forEach((d) => times.forEach((t) => keys.push(Grid.slotKey(d, t))));
      return keys;
    }
    return slotKeysForRange(ev.date, ev.startTime || "00:00", ev.endTime || "23:59");
  }

  // Classe chaque membre actuel en "Disponible" (>= thresholdMinutes cumulées
  // dispo sur les créneaux donnés), "Indisponible" (a répondu "pas dispo" sur
  // au moins un créneau, sans atteindre le seuil) ou "Pas répondu" (rien de
  // tout ça). Partagé entre la vue "par événement" et le chercheur de créneau.
  function classifyMembers(slotKeys, thresholdMinutes) {
    const marksByMember = new Map(currentAvailability.map((r) => [r.id, r.marks || {}]));
    const available = [];
    const unavailable = [];
    const unknown = [];
    currentMembers.forEach((m) => {
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

  function renderEventAvailability() {
    const evId = eventAvailabilitySelect.value;
    if (!evId) {
      eventAvailabilityResult.innerHTML = "";
      return;
    }
    const ev = currentEvents.find((e) => e.id === evId);
    if (!ev) {
      eventAvailabilityResult.innerHTML = "";
      return;
    }
    const slotKeys = eventSlotKeys(ev);
    const thresholdMinutes = ev.minAvailableMinutes || 45;
    const { available, unavailable, unknown } = classifyMembers(slotKeys, thresholdMinutes);
    available.sort((a, b) => a.localeCompare(b));
    unavailable.sort((a, b) => a.localeCompare(b));
    unknown.sort((a, b) => a.localeCompare(b));

    let progressHtml = "";
    if (ev.requiredCount) {
      const reached = available.length >= ev.requiredCount;
      progressHtml = `<p class="response-summary"><strong style="color:${reached ? "#16a34a" : "#b42323"}">${available.length} / ${ev.requiredCount}</strong> personnes nécessaires ${reached ? "✅ atteint" : "— il en manque"}</p>`;
    }

    eventAvailabilityResult.innerHTML = `
      <p class="hint">Compté "disponible" à partir de ${thresholdMinutes} min cumulées dispo sur ce créneau.</p>
      ${progressHtml}
      <p>✅ Disponibles (${available.length}) : ${available.join(", ") || "—"}</p>
      <p>❌ Indisponibles (${unavailable.length}) : ${unavailable.join(", ") || "—"}</p>
      <p>❔ N'ont pas répondu (${unknown.length}) : ${unknown.join(", ") || "—"}</p>
    `;
  }

  eventAvailabilitySelect.addEventListener("change", renderEventAvailability);

  function renderEventAvailabilitySelect() {
    const previous = eventAvailabilitySelect.value;
    const sorted = currentEvents.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    eventAvailabilitySelect.innerHTML = '<option value="">— Choisir un événement —</option>';
    sorted.forEach((ev) => {
      const opt = document.createElement("option");
      opt.value = ev.id;
      opt.textContent = `${ev.label} — ${describeEvent(ev)}`;
      eventAvailabilitySelect.appendChild(opt);
    });
    if (sorted.some((ev) => ev.id === previous)) {
      eventAvailabilitySelect.value = previous;
    }
    renderEventAvailability();
  }

  // ---------- Trouver le meilleur créneau (réunion) ----------
  // Balaie tous les créneaux de départ possibles, de la durée demandée, sur
  // la période donnée, et classe les membres (via classifyMembers) pour
  // chacun — puis retient les 8 meilleurs (le plus de dispo, à égalité le
  // moins d'indispo, puis le plus tôt dans la période).
  function timeStrToMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }
  function minutesToTimeStr(mins) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    return `${h}:${m}`;
  }

  function findBestSlots({ startDate, endDate, durationMinutes, thresholdMinutes }) {
    const dates = Grid.buildInclusiveDateRange(startDate, endDate).filter((d) => {
      if (currentConfig.includeWeekends) return true;
      const dow = new Date(`${d}T00:00:00`).getDay();
      return dow !== 0 && dow !== 6;
    });
    const times = Grid.buildTimeSlots();
    const dayEndMinutes = CONFIG.dayEndHour * 60;

    const results = [];
    dates.forEach((dateISO) => {
      times.forEach((startTime) => {
        const startMin = timeStrToMinutes(startTime);
        const endMin = startMin + durationMinutes;
        if (endMin > dayEndMinutes) return;
        const endTime = minutesToTimeStr(endMin);
        const slotKeys = slotKeysForRange(dateISO, startTime, endTime);
        const { available, unavailable } = classifyMembers(slotKeys, thresholdMinutes);
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

  function renderBestSlotResults(results) {
    if (!results.length) {
      bestSlotResult.innerHTML = "<p>Aucun créneau trouvé (vérifie la période et la durée par rapport aux heures de la grille).</p>";
      return;
    }
    bestSlotResult.innerHTML = results
      .map((r, i) => {
        const unavailText = r.unavailable.length ? `, ${r.unavailable.length} indispo` : "";
        return `<p><strong>${i + 1}.</strong> ${r.dateISO} ${r.startTime}-${r.endTime} — ${r.available.length} dispo${unavailText} (${r.available.join(", ") || "—"}) <button type="button" class="btn btn-ghost btn-sm" data-usebest="${i}">Utiliser ce créneau</button></p>`;
      })
      .join("");
    bestSlotResult.querySelectorAll("[data-usebest]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = results[Number(btn.dataset.usebest)];
        if (eventAllDayInput.checked) {
          eventAllDayInput.checked = false;
          eventAllDayInput.dispatchEvent(new Event("change"));
        }
        eventDateInput.value = r.dateISO;
        eventStartInput.value = r.startTime;
        eventEndInput.value = r.endTime;
        eventLabelInput.focus();
      });
    });
  }

  bestSlotForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const startDate = bestSlotStartInput.value;
    const endDate = bestSlotEndInput.value;
    if (!startDate || !endDate) return;
    const durationMinutes = Number(bestSlotDurationInput.value) || 60;
    const thresholdMinutes = Number(bestSlotThresholdInput.value) || 45;
    const results = findBestSlots({ startDate, endDate, durationMinutes, thresholdMinutes });
    renderBestSlotResults(results);
  });

  // ---------- Export Excel des disponibilités pour un événement ----------
  function slugify(text) {
    return (
      (text || "evenement")
        .toString()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "evenement"
    );
  }

  function exportEventAvailability(ev) {
    if (typeof XLSX === "undefined") {
      alert("La librairie d'export Excel n'a pas pu se charger (vérifie ta connexion internet), réessaie dans quelques secondes.");
      return;
    }
    const dateList = Grid.buildInclusiveDateRange(ev.date, ev.endDate);
    const times = Grid.buildTimeSlots();
    const sortedMembers = currentMembers.slice().sort((a, b) => a.name.localeCompare(b.name));
    const marksByPassword = new Map(currentAvailability.map((r) => [r.id, r.marks || {}]));

    const workbook = XLSX.utils.book_new();

    dateList.forEach((dateISO) => {
      const rows = [["Heure", ...sortedMembers.map((m) => m.name), "Total dispo"]];
      times.forEach((timeLabel) => {
        const key = Grid.slotKey(dateISO, timeLabel);
        const blocked = Grid.isBlocked(new Date(`${dateISO}T00:00:00`), timeLabel, currentConfig.blockedSlots || []);
        let availCount = 0;
        const row = [timeLabel];
        sortedMembers.forEach((m) => {
          if (blocked) {
            row.push("Cours");
            return;
          }
          const mark = (marksByPassword.get(m.id) || {})[key];
          if (mark === "available") {
            row.push("Dispo");
            availCount++;
          } else if (mark === "unavailable") {
            row.push("Pas dispo");
          } else {
            row.push("");
          }
        });
        row.push(blocked ? "" : String(availCount));
        rows.push(row);
      });
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      sheet["!cols"] = [{ wch: 8 }, ...sortedMembers.map(() => ({ wch: 14 })), { wch: 11 }];
      XLSX.utils.book_append_sheet(workbook, sheet, dateISO.slice(0, 31));
    });

    XLSX.writeFile(workbook, `disponibilites_${slugify(ev.label)}_${ev.date}.xlsx`);
  }

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
        const requiredBadge = ev.requiredCount ? ` <code>${ev.requiredCount} requis</code>` : "";
        li.innerHTML = `<span><strong>${ev.label}</strong> — ${describeEvent(ev)}${requiredBadge}</span>`;
        const actions = document.createElement("span");
        actions.className = "item-actions";
        const targetBtn = document.createElement("button");
        targetBtn.type = "button";
        targetBtn.className = "btn btn-ghost btn-sm";
        targetBtn.textContent = "Cibler";
        targetBtn.title = "Forcer la vue de tout le monde sur la date de cet événement";
        targetBtn.addEventListener("click", async () => {
          await setFocusDate(ev.date);
        });
        const exportBtn = document.createElement("button");
        exportBtn.type = "button";
        exportBtn.className = "btn btn-ghost btn-sm";
        exportBtn.textContent = "Exporter";
        exportBtn.title = "Télécharger un Excel des disponibilités pour ce jour (ou cette période)";
        exportBtn.addEventListener("click", () => exportEventAvailability(ev));
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          await db.removeEvent(ev.id);
        });
        actions.appendChild(targetBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(removeBtn);
        li.appendChild(actions);
        eventList.appendChild(li);
      });
  }

  // ---------- Tâches ----------
  taskForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = taskLabelInput.value.trim();
    if (!label) return;
    const payload = { label };
    if (taskDescriptionInput.value.trim()) payload.description = taskDescriptionInput.value.trim();
    if (taskDeadlineInput.value) payload.deadline = taskDeadlineInput.value;
    await db.addTask(payload);
    taskForm.reset();
  });

  function renderTasks() {
    taskList.innerHTML = "";
    currentTasks
      .slice()
      .sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"))
      .forEach((task) => {
        const li = document.createElement("li");
        const parts = [task.label];
        if (task.deadline) parts.push(`échéance ${task.deadline}`);
        if (task.description) parts.push(task.description);
        const status = task.assignedTo ? `<code>pris par ${task.assignedName || "?"}</code>` : `<code>libre</code>`;
        li.innerHTML = `<span>${parts.join(" — ")} ${status}</span>`;
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          await db.removeTask(task.id);
        });
        const actions = document.createElement("span");
        actions.className = "item-actions";
        actions.appendChild(removeBtn);
        li.appendChild(actions);
        taskList.appendChild(li);
      });
  }

  // ---------- Réponses orphelines (quelqu'un a voté mais n'est plus membre) ----------
  // Peut arriver si une suppression a eu lieu avant le correctif qui efface
  // aussi les disponibilités, ou si un membre est retiré par erreur. On les
  // exclut des stats/heatmap (qui ne doivent refléter que les membres
  // actuels) et on les signale ici avec un retrait dédié, sans devoir passer
  // par "Réinitialiser les disponibilités" qui effacerait tout le monde.
  function activeResponses() {
    const memberIds = new Set(currentMembers.map((m) => m.id));
    return currentAvailability.filter((r) => memberIds.has(r.id));
  }

  function renderOrphans() {
    const memberIds = new Set(currentMembers.map((m) => m.id));
    const orphans = currentAvailability.filter((r) => !memberIds.has(r.id) && Object.keys(r.marks || {}).length > 0);
    orphanSection.classList.toggle("hidden", orphans.length === 0);
    orphanList.innerHTML = "";
    orphans.forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${r.name || "(sans nom)"} <code>${r.id}</code></span>`;
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-ghost btn-sm";
      removeBtn.textContent = "Retirer";
      removeBtn.addEventListener("click", async () => {
        if (confirm(`Effacer définitivement les disponibilités orphelines de ${r.name || r.id} ?`)) {
          // Sûr même si la fiche membre n'existe déjà plus : la suppression
          // d'un document Firestore absent ne fait rien (pas d'erreur).
          await db.removeMember(r.id);
        }
      });
      li.appendChild(removeBtn);
      orphanList.appendChild(li);
    });
  }

  function renderResponseCount() {
    const count = activeResponses().filter((r) => Object.keys(r.marks || {}).length > 0).length;
    responseCountEl.textContent = String(count);
  }

  // ---------- Heatmap + classement ----------
  function renderHeatmap() {
    const dates = Grid.buildDateList(new Date(), currentConfig.rangeDays, currentConfig.includeWeekends);
    const times = Grid.buildTimeSlots();

    const counts = new Map(); // key -> { available: [], unavailable: [] }
    activeResponses().forEach((r) => {
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

    Grid.renderHourRows(heatmapGridEl, dates, times, currentEvents, currentConfig.blockedSlots || [], (cell, { dateISO, timeLabel, blocked }) => {
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

  // ---------- Remplir les disponibilités d'un membre à sa place ----------
  let fillState = { password: "", name: "", mode: "available", marks: {} };

  function setFillMode(mode) {
    fillState.mode = mode;
    fillModeAvailableBtn.classList.toggle("active", mode === "available");
    fillModeUnavailableBtn.classList.toggle("active", mode === "unavailable");
  }
  fillModeAvailableBtn.addEventListener("click", () => setFillMode("available"));
  fillModeUnavailableBtn.addEventListener("click", () => setFillMode("unavailable"));

  function renderFillMemberOptions() {
    const previous = fillMemberSelect.value;
    fillMemberSelect.innerHTML = '<option value="">— Choisir un membre —</option>';
    currentMembers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        fillMemberSelect.appendChild(opt);
      });
    if (previous && currentMembers.some((m) => m.id === previous)) {
      fillMemberSelect.value = previous;
    } else if (fillState.password) {
      fillState = { password: "", name: "", mode: fillState.mode, marks: {} };
      fillStatus.textContent = "";
      renderFillGrid();
    }
  }

  fillMemberSelect.addEventListener("change", async () => {
    const password = fillMemberSelect.value;
    if (!password) {
      fillState = { password: "", name: "", mode: fillState.mode, marks: {} };
      fillStatus.textContent = "";
      renderFillGrid();
      return;
    }
    const member = currentMembers.find((m) => m.id === password);
    fillStatus.textContent = "Chargement…";
    const marks = await db.getMarks(password);
    fillState = { password, name: member ? member.name : "", mode: fillState.mode, marks: { ...marks } };
    fillStatus.textContent = `Modification des disponibilités de ${fillState.name}`;
    renderFillGrid();
  });

  let fillIsPainting = false;
  let fillPaintAction = null;

  function applyFillPaint(cell) {
    const key = cell.dataset.key;
    cell.classList.remove("mark-available", "mark-unavailable");
    if (fillPaintAction === "clear") {
      delete fillState.marks[key];
    } else {
      fillState.marks[key] = fillState.mode;
      cell.classList.add(fillState.mode === "available" ? "mark-available" : "mark-unavailable");
    }
  }

  function beginFillPaint(cell) {
    const key = cell.dataset.key;
    fillPaintAction = fillState.marks[key] === fillState.mode ? "clear" : "set";
    fillIsPainting = true;
    applyFillPaint(cell);
  }

  async function persistFillMarks() {
    if (!fillState.password) return;
    const password = fillState.password;
    const name = fillState.name;
    const marks = fillState.marks;
    fillStatus.textContent = "Enregistrement…";
    try {
      await db.saveMarks(password, name, marks);
      fillStatus.textContent = `Enregistré ✓ (${name})`;
    } catch (err) {
      console.error(err);
      fillStatus.textContent = "Échec de l'enregistrement.";
    }
  }

  function stopFillPainting() {
    if (fillIsPainting) {
      fillIsPainting = false;
      persistFillMarks();
    }
  }
  document.addEventListener("mouseup", stopFillPainting);
  document.addEventListener("touchend", stopFillPainting);
  fillGridEl.addEventListener(
    "touchmove",
    (e) => {
      if (!fillIsPainting) return;
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (el && el.classList.contains("slot") && !el.classList.contains("blocked")) {
        applyFillPaint(el);
      }
    },
    { passive: false }
  );

  function renderFillGrid() {
    if (!fillState.password) {
      fillGridEl.innerHTML = "";
      return;
    }
    const dates = Grid.buildDateList(new Date(), currentConfig.rangeDays, currentConfig.includeWeekends);
    const times = Grid.buildTimeSlots();

    fillGridEl.innerHTML = "";
    fillGridEl.style.gridTemplateColumns = Grid.gridTemplateColumns(dates.length);
    fillGridEl.style.gridTemplateRows = Grid.gridTemplateRows(times.length);
    Grid.renderGridHeaders(fillGridEl, dates, currentEvents);

    Grid.renderHourRows(fillGridEl, dates, times, currentEvents, currentConfig.blockedSlots || [], (cell, { dateISO, timeLabel, blocked }) => {
      const key = Grid.slotKey(dateISO, timeLabel);
      cell.dataset.key = key;
      const mark = fillState.marks[key];
      if (mark === "available") cell.classList.add("mark-available");
      if (mark === "unavailable") cell.classList.add("mark-unavailable");
      if (!blocked) {
        cell.addEventListener("mousedown", (e) => {
          e.preventDefault();
          beginFillPaint(cell);
        });
        cell.addEventListener("mouseenter", () => {
          if (fillIsPainting) applyFillPaint(cell);
        });
        cell.addEventListener(
          "touchstart",
          (e) => {
            e.preventDefault();
            beginFillPaint(cell);
          },
          { passive: false }
        );
      }
    });
  }

  // ---------- Abonnements en direct ----------
  db.listenConfig((config) => {
    currentConfig = config || { rangeDays: 90, includeWeekends: false };
    fillConfigForm(currentConfig);
    renderBlockedSlots();
    renderHeatmap();
    renderFillGrid();
  });

  db.listenMembers((members) => {
    currentMembers = members;
    renderMembers();
    renderHeatmap();
    renderFillMemberOptions();
    renderOrphans();
    renderResponseCount();
  });

  db.listenEvents((events) => {
    currentEvents = events;
    renderEvents();
    renderEventAvailabilitySelect();
    renderHeatmap();
    renderFillGrid();
  });

  db.listenAllAvailability((responses) => {
    currentAvailability = responses;
    renderResponseCount();
    renderHeatmap();
    renderOrphans();
    renderEventAvailability();
  });

  db.listenTasks((tasks) => {
    currentTasks = tasks;
    renderTasks();
  });
}
