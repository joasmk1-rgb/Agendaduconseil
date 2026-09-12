// ===================== ADMIN.JS =====================
import { ADMIN_PASSPHRASE, CONFIG } from "./config.js";
import * as Grid from "./grid.js";
import * as db from "./db.js";

// ---------- Navigation "mode application" (menu ☰ + une vue à la fois) ----------
// Pure UI, ne dépend d'aucune donnée : tourne dès le chargement du script,
// même avant que l'accès admin soit validé (les vues restent masquées derrière
// #access-denied tant qu'on n'est pas connecté, de toute façon).
(function setupNavigation() {
  const menuToggleBtn = document.getElementById("menu-toggle-btn");
  const navDrawer = document.getElementById("nav-drawer");
  const navOverlay = document.getElementById("nav-overlay");
  const currentViewTitle = document.getElementById("current-view-title");
  const navItems = Array.from(document.querySelectorAll(".nav-item"));
  const views = Array.from(document.querySelectorAll(".view"));
  if (!menuToggleBtn || !navDrawer) return;

  function openDrawer() {
    navDrawer.classList.remove("hidden");
    navOverlay.classList.remove("hidden");
  }
  function closeDrawer() {
    navDrawer.classList.add("hidden");
    navOverlay.classList.add("hidden");
  }
  menuToggleBtn.addEventListener("click", () => {
    navDrawer.classList.contains("hidden") ? openDrawer() : closeDrawer();
  });
  navOverlay.addEventListener("click", closeDrawer);

  function showView(name) {
    views.forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    navItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.view === name));
    const active = navItems.find((btn) => btn.dataset.view === name);
    if (active && currentViewTitle) currentViewTitle.textContent = active.textContent.trim();
    window.scrollTo(0, 0);
    closeDrawer();
  }

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  // Exposé pour que d'autres actions (ex: "+ Ajouter une tâche" depuis une
  // décision) puissent naviguer vers une autre vue par programme.
  window.showAdminView = showView;
})();

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

// ---------- Parseur CSV maison (pas de librairie, même esprit que ics.js) ----------
// Détecte automatiquement le séparateur (, ou ;) sur la ligne d'en-tête —
// Excel en locale FR exporte souvent en ";" — et gère les champs entre
// guillemets (pour un texte contenant des virgules/points-virgules).
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.split(";").length > firstLine.split(",").length) ? ";" : ",";
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

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
  const eventStatusInput = document.getElementById("event-status-input");
  const eventList = document.getElementById("event-list");
  const eventSubmitBtn = document.getElementById("event-submit-btn");
  const eventCancelEditBtn = document.getElementById("event-cancel-edit-btn");
  const taskLabelInput = document.getElementById("task-label-input");
  const taskDescriptionInput = document.getElementById("task-description-input");
  const taskDeadlineInput = document.getElementById("task-deadline-input");
  const taskDeadlineTimeInput = document.getElementById("task-deadline-time-input");
  const taskModeLibreBtn = document.getElementById("task-mode-libre");
  const taskModeAssigneeBtn = document.getElementById("task-mode-assignee");
  const taskLibreOptions = document.getElementById("task-libre-options");
  const taskAssigneeOptions = document.getElementById("task-assignee-options");
  const taskRequiredInput = document.getElementById("task-required-input");
  const taskAssigneeCheckboxes = document.getElementById("task-assignee-checkboxes");
  const taskSubmitBtn = document.getElementById("task-submit-btn");
  const taskCancelEditBtn = document.getElementById("task-cancel-edit-btn");
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

  const meetingForm = document.getElementById("meeting-form");
  const meetingEventSelect = document.getElementById("meeting-event-select");
  const meetingLocationInput = document.getElementById("meeting-location-input");
  const meetingTypeInput = document.getElementById("meeting-type-input");
  const meetingProjectCheckboxes = document.getElementById("meeting-project-checkboxes");
  const meetingList = document.getElementById("meeting-list");

  const projectForm = document.getElementById("project-form");
  const projectNameInput = document.getElementById("project-name-input");
  const projectStatusInput = document.getElementById("project-status-input");
  const projectResponsibleInput = document.getElementById("project-responsible-input");
  const projectDescriptionInput = document.getElementById("project-description-input");
  const projectList = document.getElementById("project-list");
  const projectViewSelect = document.getElementById("project-view-select");
  const projectViewResult = document.getElementById("project-view-result");

  const decisionForm = document.getElementById("decision-form");
  const decisionLabelInput = document.getElementById("decision-label-input");
  const decisionDateInput = document.getElementById("decision-date-input");
  const decisionStatusInput = document.getElementById("decision-status-input");
  const decisionMeetingSelect = document.getElementById("decision-meeting-select");
  const decisionProjectSelect = document.getElementById("decision-project-select");
  const decisionSubmitBtn = document.getElementById("decision-submit-btn");
  const decisionCancelEditBtn = document.getElementById("decision-cancel-edit-btn");
  const decisionList = document.getElementById("decision-list");

  const taskProjectSelect = document.getElementById("task-project-select");
  const taskDecisionSelect = document.getElementById("task-decision-select");
  const taskMeetingSelect = document.getElementById("task-meeting-select");
  const taskPrioritySelect = document.getElementById("task-priority-select");
  const taskStatusSelect = document.getElementById("task-status-select");
  const eventProjectSelect = document.getElementById("event-project-select");
  const dashboardContent = document.getElementById("dashboard-content");

  const fillMemberSelect = document.getElementById("fill-member-select");
  const fillModeAvailableBtn = document.getElementById("fill-mode-available");
  const fillModeUnavailableBtn = document.getElementById("fill-mode-unavailable");
  const fillStatus = document.getElementById("fill-status");
  const fillGridEl = document.getElementById("fill-grid");

  const importFileInput = document.getElementById("import-file-input");
  const importPreviewBtn = document.getElementById("import-preview-btn");
  const importResult = document.getElementById("import-result");
  const importPreviewEl = document.getElementById("import-preview");
  const importConfirmActions = document.getElementById("import-confirm-actions");
  const importConfirmBtn = document.getElementById("import-confirm-btn");
  const importCancelBtn = document.getElementById("import-cancel-btn");

  let currentConfig = { rangeDays: 90, includeWeekends: false };
  let currentMembers = [];
  let currentEvents = [];
  let currentAvailability = [];
  let currentTasks = [];
  let currentMeetings = [];
  let currentProjects = [];
  let currentDecisions = [];
  let currentArchive = [];
  let currentAgendaItems = [];

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

  let editingEventId = null;

  function resetEventForm() {
    editingEventId = null;
    eventSubmitBtn.textContent = "Ajouter";
    eventCancelEditBtn.classList.add("hidden");
    eventForm.reset();
    eventAllDayInput.checked = true;
    eventEndDateInput.classList.remove("hidden");
    eventStartInput.classList.add("hidden");
    eventEndInput.classList.add("hidden");
    eventStatusInput.value = "confirme";
  }

  function startEditEvent(ev) {
    if (window.showAdminView) window.showAdminView("events");
    editingEventId = ev.id;
    eventSubmitBtn.textContent = "Enregistrer les modifications";
    eventCancelEditBtn.classList.remove("hidden");
    eventLabelInput.value = ev.label || "";
    eventAllDayInput.checked = !!ev.allDay;
    eventAllDayInput.dispatchEvent(new Event("change"));
    eventDateInput.value = ev.date || "";
    eventEndDateInput.value = ev.endDate || "";
    eventStartInput.value = ev.startTime || "";
    eventEndInput.value = ev.endTime || "";
    eventRequiredInput.value = ev.requiredCount || "";
    eventThresholdInput.value = ev.minAvailableMinutes || "";
    eventProjectSelect.value = ev.projectId || "";
    eventStatusInput.value = ev.status || "confirme";
    eventLabelInput.scrollIntoView({ behavior: "smooth", block: "center" });
    eventLabelInput.focus();
  }

  eventCancelEditBtn.addEventListener("click", () => resetEventForm());

  eventForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = eventLabelInput.value.trim();
    const date = eventDateInput.value;
    if (!label || !date) return;
    const allDay = eventAllDayInput.checked;
    const payload = { label, allDay, date };
    if (allDay) {
      payload.endDate = eventEndDateInput.value || null;
      payload.startTime = null;
      payload.endTime = null;
    } else {
      payload.startTime = eventStartInput.value || "00:00";
      payload.endTime = eventEndInput.value || "23:59";
      payload.endDate = null;
    }
    const requiredCount = Number(eventRequiredInput.value);
    payload.requiredCount = requiredCount > 0 ? requiredCount : null;
    const threshold = Number(eventThresholdInput.value);
    payload.minAvailableMinutes = threshold > 0 ? threshold : null;
    payload.projectId = eventProjectSelect.value || null;
    const chosenStatus = eventStatusInput.value || "confirme";
    payload.status = chosenStatus === "confirme" ? null : chosenStatus; // "confirme" = pas de champ stocké (comportement par défaut)

    if (editingEventId) {
      await db.updateEvent(editingEventId, payload);
    } else {
      await db.addEvent(payload);
    }
    resetEventForm();
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
        const status = Grid.eventStatus(ev);
        const statusBadge = status !== "confirme" ? ` <code>${Grid.EVENT_STATUS_LABELS[status]}</code>` : "";
        const sourceBadge = ev.source ? ` <code>📌 ${ev.source}</code>` : "";
        li.innerHTML = `<span><strong>${ev.label}</strong> — ${describeEvent(ev)}${requiredBadge}${statusBadge}${sourceBadge}</span>`;
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
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-sm";
        editBtn.textContent = "✏️ Modifier";
        editBtn.addEventListener("click", () => startEditEvent(ev));
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Retirer";
        removeBtn.addEventListener("click", async () => {
          if (editingEventId === ev.id) resetEventForm();
          await db.removeEvent(ev.id);
        });
        actions.appendChild(targetBtn);
        actions.appendChild(exportBtn);
        actions.appendChild(editBtn);
        actions.appendChild(removeBtn);
        li.appendChild(actions);
        eventList.appendChild(li);
      });
  }

  // ---------- Réunions ----------
  // Toujours liée à un event existant du calendrier. À la création, les
  // présences sont pré-remplies d'après les disponibilités déjà marquées sur
  // ce créneau (réutilise exactement la même règle que "Qui est dispo pour un
  // événement" juste au-dessus : eventSlotKeys + classifyMembers) — "dispo"
  // devient "present", tout le reste "absent" par défaut. L'admin corrige
  // ensuite librement (present/absent/procuration) au cas où l'annonce de
  // dispo avant-coup ne corresponde pas à la présence réelle le jour J.
  function renderMeetingEventSelect() {
    const previous = meetingEventSelect.value;
    const sorted = currentEvents.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    meetingEventSelect.innerHTML = '<option value="">— Choisir un événement —</option>';
    sorted.forEach((ev) => {
      const opt = document.createElement("option");
      opt.value = ev.id;
      const when = ev.allDay ? ev.date : `${ev.date} ${ev.startTime || ""}`.trim();
      opt.textContent = `${ev.label} — ${when}`;
      meetingEventSelect.appendChild(opt);
    });
    if (sorted.some((e) => e.id === previous)) meetingEventSelect.value = previous;
  }

  // ---------- Tâches auto-générées "Ordre du jour" / "PV" ----------
  // Assignées par défaut au·à la premier·ère membre coché·e Admin (en général
  // Joas) — reste une tâche normale ensuite : modifiable, réassignable ou
  // supprimable comme n'importe quelle autre tâche.
  function defaultAutoAssignee() {
    const admin = currentMembers.find((m) => m.isAdmin);
    return admin ? { password: admin.id, name: admin.name } : null;
  }

  function autoTaskPayload({ meetingId, label, dateISO, meetingLabel }) {
    const assignee = defaultAutoAssignee();
    const payload = {
      label: `${label} — ${meetingLabel}`,
      deadline: dateISO,
      priority: "normal",
      meetingId,
    };
    if (assignee) {
      payload.fixedAssignment = true;
      payload.assignedTo = [assignee];
      payload.requiredCount = 1;
    }
    return payload;
  }

  meetingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const eventId = meetingEventSelect.value;
    if (!eventId) return;
    const ev = currentEvents.find((e2) => e2.id === eventId);
    if (!ev) return;

    const slotKeys = eventSlotKeys(ev);
    const thresholdMinutes = ev.minAvailableMinutes || 45;
    const { available } = classifyMembers(slotKeys, thresholdMinutes);
    const availableNames = new Set(available);
    const attendance = {};
    currentMembers.forEach((m) => {
      attendance[m.id] = availableNames.has(m.name) ? "present" : "absent";
    });

    const payload = {
      eventId,
      date: ev.date,
      status: "planned",
      attendance,
      proxies: {},
    };
    if (!ev.allDay && ev.startTime) payload.startTime = ev.startTime;
    if (!ev.allDay && ev.endTime) payload.endTime = ev.endTime;
    if (meetingLocationInput.value.trim()) payload.location = meetingLocationInput.value.trim();
    if (meetingTypeInput.value.trim()) payload.type = meetingTypeInput.value.trim();
    const checkedProjects = Array.from(meetingProjectCheckboxes.querySelectorAll("input:checked")).map((c) => c.value);
    if (checkedProjects.length) payload.projectIds = checkedProjects;

    const meetingId = await db.addMeeting(payload);
    meetingForm.reset();
    meetingProjectCheckboxes.querySelectorAll("input:checked").forEach((c) => (c.checked = false));

    // Tâche "Ordre du jour" auto-créée, échéance = veille de la réunion.
    const odjDate = Grid.toISODate(Grid.addDays(new Date(`${ev.date}T00:00:00`), -1));
    await db.addTask(
      autoTaskPayload({
        meetingId,
        label: "📋 Préparer l'ordre du jour",
        dateISO: odjDate,
        meetingLabel: `${ev.label} (${ev.date})`,
      })
    );
  });

  function renderMeetingProjectCheckboxes() {
    meetingProjectCheckboxes.innerHTML = "";
    currentProjects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const label = document.createElement("label");
        label.className = "checkbox-group";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = p.id;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + p.name));
        meetingProjectCheckboxes.appendChild(label);
      });
  }

  // (réunions disponibles pour le sélecteur "Réunion source" du formulaire tâche)
  function renderTaskMeetingSelect() {
    if (!taskMeetingSelect) return;
    const previous = taskMeetingSelect.value;
    taskMeetingSelect.innerHTML = '<option value="">Réunion source (optionnel)</option>';
    currentMeetings
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((m) => {
        const ev = currentEvents.find((e) => e.id === m.eventId);
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${ev ? ev.label : "(événement supprimé)"} — ${m.date}`;
        taskMeetingSelect.appendChild(opt);
      });
    if (currentMeetings.some((m) => m.id === previous)) taskMeetingSelect.value = previous;
  }

  async function setAttendanceStatus(meeting, password, status) {
    const attendance = { ...(meeting.attendance || {}) };
    const proxies = { ...(meeting.proxies || {}) };
    attendance[password] = status;
    if (status !== "proxy") delete proxies[password];
    await db.updateMeeting(meeting.id, { attendance, proxies });
  }

  async function setProxyHolder(meeting, password, holderPassword) {
    const proxies = { ...(meeting.proxies || {}) };
    if (holderPassword) proxies[password] = holderPassword;
    else delete proxies[password];
    await db.updateMeeting(meeting.id, { proxies });
  }

  function renderMeetings() {
    renderMeetingEventSelect();
    renderMeetingProjectCheckboxes();
    renderTaskMeetingSelect();
    meetingList.innerHTML = "";
    currentMeetings
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || "")) // plus récente d'abord
      .forEach((meeting) => {
        const ev = currentEvents.find((e) => e.id === meeting.eventId);
        const attendance = meeting.attendance || {};
        const proxies = meeting.proxies || {};

        const li = document.createElement("li");
        li.className = "meeting-item";

        const header = document.createElement("div");
        header.className = "meeting-header";
        const when = meeting.startTime ? `${meeting.date} ${meeting.startTime}` : meeting.date;
        const titleParts = [ev ? ev.label : "(événement supprimé)", when];
        if (meeting.location) titleParts.push(meeting.location);
        if (meeting.type) titleParts.push(meeting.type);
        if (meeting.projectIds && meeting.projectIds.length) {
          const names = meeting.projectIds
            .map((pid) => (currentProjects.find((p) => p.id === pid) || {}).name)
            .filter(Boolean);
          if (names.length) titleParts.push(`📁 ${names.join(", ")}`);
        }
        const title = document.createElement("strong");
        title.textContent = titleParts.join(" — ");
        header.appendChild(title);

        const statusBtn = document.createElement("button");
        statusBtn.type = "button";
        statusBtn.className = "btn btn-ghost btn-sm";
        statusBtn.textContent = meeting.status === "done" ? "✅ Terminée" : "🕒 Prévue";
        statusBtn.title = "Cliquer pour basculer prévue/terminée";
        statusBtn.addEventListener("click", async () => {
          const nowDone = meeting.status !== "done";
          await db.updateMeeting(meeting.id, { status: nowDone ? "done" : "planned" });
          // Tâche "PV" auto-créée une seule fois, au passage à "Terminée"
          // (pas à chaque bascule, ni si elle existe déjà — ex: si l'admin
          // annule puis re-marque "Terminée" par erreur de clic).
          if (nowDone) {
            const alreadyExists = currentTasks.some((t) => t.meetingId === meeting.id && t.label.startsWith("📝 Rédiger le PV"));
            if (!alreadyExists) {
              const pvDate = Grid.toISODate(Grid.addDays(new Date(`${meeting.date}T00:00:00`), 3));
              await db.addTask(
                autoTaskPayload({
                  meetingId: meeting.id,
                  label: "📝 Rédiger le PV",
                  dateISO: pvDate,
                  meetingLabel: `${ev ? ev.label : "réunion"} (${meeting.date})`,
                })
              );
            }
          }
        });
        header.appendChild(statusBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Supprimer";
        removeBtn.addEventListener("click", async () => {
          await db.removeMeeting(meeting.id);
        });
        header.appendChild(removeBtn);

        li.appendChild(header);

        const table = document.createElement("div");
        table.className = "attendance-table";
        currentMembers
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .forEach((m) => {
            const row = document.createElement("div");
            row.className = "attendance-row";
            const nameEl = document.createElement("span");
            nameEl.className = "attendance-name";
            nameEl.textContent = m.name;
            row.appendChild(nameEl);

            const status = attendance[m.id] || "absent";
            ["present", "absent", "proxy"].forEach((s) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "btn btn-sm " + (status === s ? "btn-primary" : "btn-ghost");
              btn.textContent = s === "present" ? "Présent" : s === "absent" ? "Absent" : "Procuration";
              btn.addEventListener("click", () => setAttendanceStatus(meeting, m.id, s));
              row.appendChild(btn);
            });

            if (status === "proxy") {
              const select = document.createElement("select");
              select.className = "proxy-select";
              const emptyOpt = document.createElement("option");
              emptyOpt.value = "";
              emptyOpt.textContent = "— porteur de la procuration —";
              select.appendChild(emptyOpt);
              currentMembers
                .filter((other) => other.id !== m.id)
                .forEach((other) => {
                  const opt = document.createElement("option");
                  opt.value = other.id;
                  opt.textContent = other.name;
                  if (proxies[m.id] === other.id) opt.selected = true;
                  select.appendChild(opt);
                });
              select.addEventListener("change", () => setProxyHolder(meeting, m.id, select.value));
              row.appendChild(select);
            }

            table.appendChild(row);
          });
        li.appendChild(table);
        li.appendChild(renderAgendaSection(meeting));

        meetingList.appendChild(li);
      });
  }

  // ---------- ODJ (points d'ordre du jour) d'une réunion ----------
  // `order` sert uniquement à l'affichage : les flèches ↑↓ échangent le
  // `order` du point avec celui de son voisin, pas de vrai drag-and-drop
  // (reste 100% vanilla JS, pas de librairie).
  function renderAgendaSection(meeting) {
    const wrap = document.createElement("div");
    wrap.className = "agenda-section";

    const heading = document.createElement("p");
    heading.className = "hint";
    heading.innerHTML = "<strong>ODJ</strong>";
    wrap.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "agenda-list";
    const items = currentAgendaItems
      .filter((it) => it.meetingId === meeting.id)
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "agenda-item" + (item.done ? " agenda-item-done" : "");

      const doneBtn = document.createElement("button");
      doneBtn.type = "button";
      doneBtn.className = "btn btn-ghost btn-sm";
      doneBtn.textContent = item.done ? "☑" : "☐";
      doneBtn.title = "Cliquer pour marquer traité / à traiter";
      doneBtn.addEventListener("click", async () => {
        await db.updateAgendaItem(item.id, { done: !item.done });
      });
      li.appendChild(doneBtn);

      const label = document.createElement("span");
      const project = currentProjects.find((p) => p.id === item.projectId);
      const decision = currentDecisions.find((d) => d.id === item.decisionId);
      const extras = [project ? `📁 ${project.name}` : "", decision ? `🗳️ ${decision.label}` : ""].filter(Boolean);
      label.textContent = item.label + (extras.length ? ` — ${extras.join(" — ")}` : "");
      li.appendChild(label);

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn btn-ghost btn-sm";
      upBtn.textContent = "↑";
      upBtn.disabled = index === 0;
      upBtn.addEventListener("click", () => swapAgendaOrder(items, index, index - 1));
      li.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "btn btn-ghost btn-sm";
      downBtn.textContent = "↓";
      downBtn.disabled = index === items.length - 1;
      downBtn.addEventListener("click", () => swapAgendaOrder(items, index, index + 1));
      li.appendChild(downBtn);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn btn-ghost btn-sm";
      removeBtn.textContent = "Retirer";
      removeBtn.addEventListener("click", async () => {
        await db.removeAgendaItem(item.id);
      });
      li.appendChild(removeBtn);

      list.appendChild(li);
    });
    wrap.appendChild(list);

    const addForm = document.createElement("form");
    addForm.className = "inline-form agenda-add-form";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "Nouveau point d'ODJ";
    addInput.required = true;
    addForm.appendChild(addInput);
    const addBtn = document.createElement("button");
    addBtn.type = "submit";
    addBtn.className = "btn btn-ghost btn-sm";
    addBtn.textContent = "+ Ajouter";
    addForm.appendChild(addBtn);
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const label = addInput.value.trim();
      if (!label) return;
      const maxOrder = items.reduce((max, it) => Math.max(max, it.order || 0), -1);
      await db.addAgendaItem({ meetingId: meeting.id, label, order: maxOrder + 1 });
      addInput.value = "";
    });
    wrap.appendChild(addForm);

    return wrap;
  }

  async function swapAgendaOrder(items, i, j) {
    if (j < 0 || j >= items.length) return;
    const a = items[i];
    const b = items[j];
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    await Promise.all([db.updateAgendaItem(a.id, { order: orderB }), db.updateAgendaItem(b.id, { order: orderA })]);
  }

  // ---------- Import CSV/Excel (tâches / événements / décisions en masse) ----------
  // Process pensé pour Joas : il demande à une IA externe (Claude, pas le site)
  // de remplir un fichier structuré à partir d'un PV, puis importe ce fichier
  // ici. Contrainte non négociable : des colonnes manquantes sur certaines
  // lignes ne doivent JAMAIS faire échouer tout l'import — chaque ligne est
  // traitée indépendamment, une ligne invalide est juste sautée et signalée
  // dans le rapport final. Le fichier lui-même n'est jamais stocké.
  function normalizeType(v) {
    const t = (v || "").trim().toLowerCase();
    if (t.startsWith("tache") || t.startsWith("tâche")) return "tache";
    if (t.startsWith("evenement") || t.startsWith("événement")) return "evenement";
    if (t.startsWith("decision") || t.startsWith("décision")) return "decision";
    return null;
  }
  function normalizePriority(v) {
    const t = (v || "").trim().toLowerCase();
    if (t.includes("urgent")) return "urgent";
    if (t.includes("important")) return "important";
    return "normal";
  }
  // "proposition" est reconnu en premier pour ne pas être confondu avec
  // "en cours"/"bloqué" etc. si jamais un libellé ambigu apparaît un jour.
  function normalizeTaskStatus(v) {
    const t = (v || "").trim().toLowerCase();
    if (t.includes("propos")) return "proposition";
    if (t.includes("annul")) return "annulee";
    if (t.includes("cours")) return "in_progress";
    if (t.includes("termin")) return "done";
    if (t.includes("bloq")) return "blocked";
    return "todo";
  }
  // Convertit une date écrite "JJ/MM/AAAA" (ou "JJ-MM-AAAA") en "AAAA-MM-JJ",
  // et ignore tout ce qui suit un éventuel " - " (certaines IA externes
  // annotent la date d'un libellé de dossier, ex: "06/05/2026 - Transition
  // écologique") — jamais d'exception, retourne juste la valeur telle quelle
  // si elle ne ressemble à aucun format de date connu.
  function normalizeDateGuess(v) {
    const raw = (v || "").split(" - ")[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return raw;
  }
  function normalizeDecisionStatus(v) {
    const t = (v || "").trim().toLowerCase();
    if (t.includes("propos")) return "proposition";
    if (t.includes("discussion")) return "en_discussion";
    if (t.includes("adopt")) return "adopted";
    if (t.includes("rejet")) return "rejected";
    return "pending";
  }
  // Un événement sans Statut dans le CSV reste "confirme" (comportement
  // historique, aucune ligne existante n'est affectée par cet ajout).
  // "propos" attrape "Proposition" ET "Proposé" (les deux formulations sont
  // utilisées selon les IA externes/PV) sans faux positif sur autre chose.
  function normalizeEventStatus(v) {
    const t = (v || "").trim().toLowerCase();
    if (t.includes("propos")) return "proposition";
    if (t.includes("confirmer")) return "a_confirmer";
    if (t.includes("réalis") || t.includes("realis")) return "realise";
    if (t.includes("annul")) return "annule";
    return "confirme";
  }

  // Construit le payload d'une ligne SANS rien écrire dans Firestore — juste
  // une lecture/résolution (noms → ids). Retourne soit une ligne valide (avec
  // son payload prêt à créer), soit une ligne rejetée avec la raison — jamais
  // d'exception, une ligne à problème est toujours signalée plutôt que de
  // faire planter le reste du fichier.
  function buildImportRow(row, lineNumber) {
    const type = normalizeType(row["Type"]);
    const label = (row["Libellé"] || "").trim();
    if (!type) return { ok: false, lineNumber, reason: `type manquant ou non reconnu ("${row["Type"] || ""}")` };
    if (!label) return { ok: false, lineNumber, reason: "libellé manquant" };

    const warnings = [];
    let projectId;
    let projectName = "";
    const projectRaw = (row["Dossier"] || "").trim();
    if (projectRaw) {
      const p = currentProjects.find((pp) => pp.name.toLowerCase() === projectRaw.toLowerCase());
      if (p) {
        projectId = p.id;
        projectName = p.name;
      } else {
        warnings.push(`dossier "${projectRaw}" introuvable, ignoré`);
      }
    }

    // "Réunion source" : on identifie la réunion par sa date (AAAA-MM-JJ,
    // même format que la colonne Date) — pas de libellé propre à une réunion
    // (elle porte celui de son événement), donc la date est la clé la plus
    // fiable à demander à une IA externe qui rédige le CSV depuis un PV.
    let meetingId;
    let meetingLabel = "";
    const meetingSourceRaw = (row["Réunion source"] || "").trim();
    const meetingSourceDate = normalizeDateGuess(meetingSourceRaw);
    if (meetingSourceRaw) {
      const matches = currentMeetings.filter((m) => m.date === meetingSourceDate);
      if (matches.length) {
        meetingId = matches[0].id;
        const ev = currentEvents.find((e) => e.id === matches[0].eventId);
        meetingLabel = `${ev ? ev.label : "réunion"} (${matches[0].date})`;
        if (matches.length > 1) warnings.push(`plusieurs réunions le ${meetingSourceRaw}, la première a été utilisée comme source`);
      } else {
        warnings.push(`réunion source "${meetingSourceRaw}" introuvable (aucune réunion à cette date), ignorée`);
      }
    }

    // "Source" (accepte aussi l'en-tête "Origine") : d'où vient l'info — PV,
    // calendrier académique, programme annuel, compte-rendu externe, etc.
    // Texte libre, jamais validé ni rejeté.
    const source = (row["Source"] || row["Origine"] || "").trim();

    if (type === "tache") {
      const payload = { label, priority: normalizePriority(row["Priorité"]), status: normalizeTaskStatus(row["Statut"]) };
      const description = (row["Détail/Description"] || "").trim();
      if (description) payload.description = description;
      const deadline = (row["Date"] || "").trim();
      if (deadline) payload.deadline = deadline;
      const deadlineTime = (row["Heure"] || "").trim();
      if (deadlineTime) payload.deadlineTime = deadlineTime;
      if (projectId) payload.projectId = projectId;
      let decisionLabelResolved = "";
      const decisionLabel = (row["Décision liée"] || "").trim();
      if (decisionLabel) {
        const d = currentDecisions.find((dd) => dd.label.toLowerCase() === decisionLabel.toLowerCase());
        if (d) {
          payload.decisionId = d.id;
          decisionLabelResolved = d.label;
        } else {
          warnings.push(`décision liée "${decisionLabel}" introuvable, ignorée`);
        }
      }
      let responsableName = "";
      const responsableRaw = (row["Responsable"] || "").trim();
      if (responsableRaw) {
        const m = currentMembers.find((mm) => mm.name.toLowerCase() === responsableRaw.toLowerCase());
        if (m) {
          payload.assignedTo = [{ password: m.id, name: m.name }];
          payload.fixedAssignment = true;
          payload.requiredCount = 1;
          responsableName = m.name;
        } else {
          warnings.push(`responsable "${responsableRaw}" introuvable, tâche prévue en mode libre`);
        }
      }
      if (meetingId) payload.meetingId = meetingId;
      if (source) payload.source = source;
      if (currentTasks.some((t) => t.label.toLowerCase() === label.toLowerCase() && (!deadline || t.deadline === deadline))) {
        warnings.push("tâche potentiellement déjà existante (même libellé" + (deadline ? " et même échéance" : "") + ")");
      }
      const detailParts = [deadline ? `échéance ${deadline}${deadlineTime ? " " + deadlineTime : ""}` : "", responsableName ? `resp. ${responsableName}` : "", projectName ? `📁 ${projectName}` : "", decisionLabelResolved ? `🗳️ ${decisionLabelResolved}` : "", meetingLabel ? `🗓️ ${meetingLabel}` : "", source ? `📌 ${source}` : ""].filter(Boolean);
      return { ok: true, lineNumber, type: "tache", icon: "📋", label, detail: detailParts.join(" — "), warnings, commit: () => db.addTask(payload) };
    }

    if (type === "evenement") {
      const date = (row["Date"] || "").trim();
      if (!date) return { ok: false, lineNumber, reason: "événement sans date" };
      const status = normalizeEventStatus(row["Statut"]);
      const payload = { label, date };
      if (status !== "confirme") payload.status = status; // "confirme" = comportement par défaut, rien à stocker
      const heure = (row["Heure"] || "").trim();
      if (heure) {
        payload.allDay = false;
        payload.startTime = heure;
        payload.endTime = minutesToTimeStr(timeStrToMinutes(heure) + 60);
      } else {
        payload.allDay = true;
        const dateFin = (row["Date fin"] || "").trim();
        if (dateFin) payload.endDate = dateFin;
      }
      if (projectId) payload.projectId = projectId;
      if (source) payload.source = source;
      if (currentEvents.some((e) => e.label.toLowerCase() === label.toLowerCase() && e.date === date)) {
        warnings.push("événement potentiellement déjà existant (même libellé et même date)");
      }
      const detailParts = [date + (heure ? " " + heure : ""), projectName ? `📁 ${projectName}` : "", status !== "confirme" ? Grid.EVENT_STATUS_LABELS[status] : "", source ? `📌 ${source}` : ""].filter(Boolean);
      return { ok: true, lineNumber, type: "evenement", icon: "📅", label, detail: detailParts.join(" — "), warnings, commit: () => db.addEvent(payload) };
    }

    if (type === "decision") {
      const payload = { label, status: normalizeDecisionStatus(row["Statut"]) };
      const description = (row["Détail/Description"] || "").trim();
      if (description) payload.description = description;
      const date = (row["Date"] || "").trim();
      if (date) payload.date = date;
      if (projectId) payload.projectId = projectId;
      if (meetingId) payload.meetingId = meetingId;
      if (source) payload.source = source;
      if (currentDecisions.some((d) => d.label.toLowerCase() === label.toLowerCase() && (!date || d.date === date))) {
        warnings.push("décision potentiellement déjà existante (même libellé" + (date ? " et même date" : "") + ")");
      }
      const detailParts = [date, projectName ? `📁 ${projectName}` : "", meetingLabel ? `🗓️ ${meetingLabel}` : "", source ? `📌 ${source}` : ""].filter(Boolean);
      return { ok: true, lineNumber, type: "decision", icon: "🗳️", label, detail: detailParts.join(" — "), warnings, commit: () => db.addDecision(payload) };
    }

    return { ok: false, lineNumber, reason: `type "${type}" non géré` };
  }

  let pendingImportRows = []; // lignes valides de l'aperçu en cours, cochées ou non

  function renderImportPreview() {
    if (!pendingImportRows.length) {
      importPreviewEl.innerHTML = "";
      importConfirmActions.classList.add("hidden");
      return;
    }
    importConfirmActions.classList.remove("hidden");
    const counts = {};
    pendingImportRows.forEach((r) => {
      if (r.checked) counts[r.type] = (counts[r.type] || 0) + 1;
    });
    const typeLabels = { tache: "tâche(s)", evenement: "événement(s)", decision: "décision(s)" };
    const countsLine = Object.keys(counts)
      .map((t) => `${counts[t]} ${typeLabels[t] || t}`)
      .join(", ");

    const rowsHtml = pendingImportRows
      .map(
        (r, idx) => `
      <li class="import-preview-row${r.checked ? "" : " import-row-unchecked"}">
        <label class="checkbox-group">
          <input type="checkbox" class="import-row-checkbox" data-idx="${idx}" ${r.checked ? "checked" : ""}>
          <span>${r.icon} <strong>${r.label}</strong>${r.detail ? " — " + r.detail : ""}</span>
        </label>
        ${r.warnings.length ? `<span class="hint">⚠️ ${r.warnings.join(" ; ")}</span>` : ""}
      </li>`
      )
      .join("");

    importPreviewEl.innerHTML = `<p><strong>Aperçu</strong> — ${countsLine || "0 ligne cochée"} seront créé(s) si tu confirmes.</p><ul class="item-list import-preview-list">${rowsHtml}</ul>`;

    importPreviewEl.querySelectorAll(".import-row-checkbox").forEach((cb) => {
      cb.addEventListener("change", () => {
        pendingImportRows[Number(cb.dataset.idx)].checked = cb.checked;
        renderImportPreview();
      });
    });
  }

  function resetImportUI() {
    pendingImportRows = [];
    importPreviewEl.innerHTML = "";
    importConfirmActions.classList.add("hidden");
    importFileInput.value = "";
  }

  importPreviewBtn.addEventListener("click", async () => {
    const file = importFileInput.files[0];
    if (!file) {
      importResult.innerHTML = "<p>Choisis d'abord un fichier CSV.</p>";
      return;
    }
    importResult.innerHTML = "<p>Lecture du fichier…</p>";
    importPreviewEl.innerHTML = "";
    importConfirmActions.classList.add("hidden");
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        importResult.innerHTML = "<p>Fichier vide ou sans ligne de données.</p>";
        return;
      }
      const header = rows[0].map((h) => h.trim());
      const dataRows = rows.slice(1);
      const rejected = [];
      pendingImportRows = [];
      for (let i = 0; i < dataRows.length; i++) {
        const obj = {};
        header.forEach((h, idx) => {
          obj[h] = dataRows[i][idx] || "";
        });
        const result = buildImportRow(obj, i + 2); // +2 : ligne 1 = en-têtes, lignes 1-indexées
        if (result.ok) {
          result.checked = true;
          pendingImportRows.push(result);
        } else {
          rejected.push(`Ligne ${result.lineNumber} — ${result.reason}, ligne ignorée.`);
        }
      }
      const summary = [`<p>${pendingImportRows.length} ligne(s) valide(s) sur ${dataRows.length} — relis l'aperçu ci-dessous puis confirme.</p>`];
      rejected.forEach((w) => summary.push(`<p>⚠️ ${w}</p>`));
      importResult.innerHTML = summary.join("");
      renderImportPreview();
    } catch (err) {
      console.error(err);
      importResult.innerHTML = "<p>Échec de la lecture du fichier — vérifie que c'est bien un CSV.</p>";
    }
  });

  importCancelBtn.addEventListener("click", () => {
    resetImportUI();
    importResult.innerHTML = "<p>Import annulé — rien n'a été créé.</p>";
  });

  importConfirmBtn.addEventListener("click", async () => {
    const toCommit = pendingImportRows.filter((r) => r.checked);
    if (!toCommit.length) {
      importResult.innerHTML = "<p>Aucune ligne cochée — rien à créer.</p>";
      return;
    }
    importConfirmBtn.disabled = true;
    importCancelBtn.disabled = true;
    try {
      for (const r of toCommit) {
        await r.commit();
      }
      importResult.innerHTML = `<p><strong>${toCommit.length}</strong> élément(s) créé(s) avec succès.</p>`;
      resetImportUI();
    } catch (err) {
      console.error(err);
      importResult.innerHTML = "<p>Échec pendant la création — vérifie ta connexion et réessaie (rien n'a été perdu, relance l'aperçu).</p>";
    } finally {
      importConfirmBtn.disabled = false;
      importCancelBtn.disabled = false;
    }
  });

  // ---------- Tableau de bord ----------
  // archivedAt est un Firestore Timestamp en vrai (objet avec .toDate()),
  // mais un simple number/string dans le faux db.js de test — on gère les deux.
  function formatArchiveDate(value) {
    const date = value && typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("fr-BE");
  }

  // Pure agrégation de ce qui existe déjà ailleurs — aucune nouvelle donnée
  // stockée, tout est recalculé à l'affichage à chaque changement.
  function renderDashboard() {
    const todayISO = Grid.toISODate(new Date());

    const upcomingMeetings = currentMeetings
      .filter((m) => m.status === "planned" && m.date >= todayISO)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const nextMeeting = upcomingMeetings[0];
    const nextMeetingEvent = nextMeeting ? currentEvents.find((e) => e.id === nextMeeting.eventId) : null;

    const upcomingEvents = currentEvents
      .filter((e) => (e.endDate || e.date) >= todayISO)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
      .slice(0, 3);

    const lateTasks = currentTasks.filter((t) => isTaskLate(t));
    const todoTasks = currentTasks.filter((t) => (t.status || "todo") !== "done");
    const unassignedTasks = currentTasks.filter((t) => (t.assignedTo || []).length === 0 && (t.status || "todo") !== "done");

    const pendingDecisions = currentDecisions.filter((d) => d.status === "pending");
    const projectsByStatus = {};
    currentProjects.forEach((p) => {
      projectsByStatus[p.status] = (projectsByStatus[p.status] || 0) + 1;
    });
    const inProgressProjects = currentProjects.filter((p) => p.status === "in_progress");

    function archiveTime(a) {
      const v = a.archivedAt;
      if (!v) return 0;
      const d = typeof v.toDate === "function" ? v.toDate() : new Date(v);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    const lastArchive = currentArchive.slice().sort((a, b) => archiveTime(b) - archiveTime(a))[0];

    function tile(label, value, listItems) {
      const list = listItems && listItems.length ? `<ul>${listItems.map((i) => `<li>${i}</li>`).join("")}</ul>` : "";
      return `<div class="dashboard-tile"><span class="dashboard-value">${value}</span><span class="dashboard-label">${label}</span>${list}</div>`;
    }

    dashboardContent.innerHTML = [
      tile(
        "Prochaine réunion",
        nextMeeting ? nextMeeting.date : "—",
        nextMeeting ? [`${nextMeetingEvent ? nextMeetingEvent.label : "?"}${nextMeeting.startTime ? " à " + nextMeeting.startTime : ""}`] : ["Aucune réunion prévue"]
      ),
      tile(
        "Prochains événements",
        upcomingEvents.length,
        upcomingEvents.map((e) => `${e.date} — ${e.label}`)
      ),
      tile("Tâches à faire", todoTasks.length),
      tile("Tâches en retard", lateTasks.length, lateTasks.slice(0, 5).map((t) => t.label)),
      tile("Tâches sans responsable", unassignedTasks.length, unassignedTasks.slice(0, 5).map((t) => t.label)),
      tile("Décisions à traiter", pendingDecisions.length, pendingDecisions.slice(0, 5).map((d) => d.label)),
      tile("Dossiers en cours", inProgressProjects.length, inProgressProjects.slice(0, 5).map((p) => p.name)),
      tile("Membres", currentMembers.length),
      tile("Dernière réinitialisation des dispos", lastArchive ? formatArchiveDate(lastArchive.archivedAt) : "jamais"),
    ].join("");
  }

  // ---------- Dossiers (projets) ----------
  const PROJECT_STATUS_LABELS = { todo: "🟡 À faire", in_progress: "🔵 En cours", paused: "⏸️ En pause", done: "🟢 Terminé" };

  function renderProjectResponsibleOptions() {
    const previous = projectResponsibleInput.value;
    projectResponsibleInput.innerHTML = '<option value="">Responsable (optionnel)</option>';
    currentMembers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = m.name;
        projectResponsibleInput.appendChild(opt);
      });
    if (currentMembers.some((m) => m.id === previous)) projectResponsibleInput.value = previous;
  }

  function renderProjectSelectOptions(selectEl, placeholder) {
    const previous = selectEl.value;
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    currentProjects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        selectEl.appendChild(opt);
      });
    if (currentProjects.some((p) => p.id === previous)) selectEl.value = previous;
  }

  projectForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = projectNameInput.value.trim();
    if (!name) return;
    const payload = { name, status: projectStatusInput.value };
    if (projectResponsibleInput.value) payload.responsible = projectResponsibleInput.value;
    if (projectDescriptionInput.value.trim()) payload.description = projectDescriptionInput.value.trim();
    await db.addProject(payload);
    projectForm.reset();
  });

  function renderProjects() {
    renderProjectResponsibleOptions();
    renderProjectSelectOptions(decisionProjectSelect, "Dossier (optionnel)");
    renderProjectSelectOptions(taskProjectSelect, "Dossier (optionnel)");
    renderProjectSelectOptions(eventProjectSelect, "Dossier (optionnel)");
    const prevView = projectViewSelect.value;
    projectViewSelect.innerHTML = '<option value="">— Choisir un dossier —</option>';
    currentProjects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        projectViewSelect.appendChild(opt);
      });
    if (currentProjects.some((p) => p.id === prevView)) projectViewSelect.value = prevView;

    projectList.innerHTML = "";
    currentProjects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((p) => {
        const li = document.createElement("li");
        const responsible = currentMembers.find((m) => m.id === p.responsible);
        const parts = [p.name, PROJECT_STATUS_LABELS[p.status] || p.status];
        if (responsible) parts.push(`resp. ${responsible.name}`);
        if (p.description) parts.push(p.description);
        li.innerHTML = `<span>${parts.join(" — ")}</span>`;
        const actions = document.createElement("span");
        actions.className = "item-actions";
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Supprimer";
        removeBtn.addEventListener("click", async () => {
          await db.removeProject(p.id);
        });
        actions.appendChild(removeBtn);
        li.appendChild(actions);
        projectList.appendChild(li);
      });
    renderProjectView();
  }

  // ---------- Décisions ----------
  const DECISION_STATUS_LABELS = {
    proposition: "💡 Proposition",
    en_discussion: "🗣️ En discussion",
    pending: "❔ En attente",
    adopted: "✅ Adoptée",
    rejected: "❌ Rejetée",
  };

  function renderDecisionMeetingSelect() {
    const previous = decisionMeetingSelect.value;
    decisionMeetingSelect.innerHTML = '<option value="">Réunion (optionnel)</option>';
    currentMeetings
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((m) => {
        const ev = currentEvents.find((e) => e.id === m.eventId);
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${ev ? ev.label : "?"} — ${m.date}`;
        decisionMeetingSelect.appendChild(opt);
      });
    if (currentMeetings.some((m) => m.id === previous)) decisionMeetingSelect.value = previous;
  }

  let editingDecisionId = null;

  function resetDecisionForm() {
    editingDecisionId = null;
    decisionSubmitBtn.textContent = "Créer la décision";
    decisionCancelEditBtn.classList.add("hidden");
    decisionForm.reset();
  }

  function startEditDecision(d) {
    if (window.showAdminView) window.showAdminView("decisions");
    editingDecisionId = d.id;
    decisionSubmitBtn.textContent = "Enregistrer les modifications";
    decisionCancelEditBtn.classList.remove("hidden");
    decisionLabelInput.value = d.label || "";
    decisionDateInput.value = d.date || "";
    decisionStatusInput.value = d.status || "pending";
    decisionMeetingSelect.value = d.meetingId || "";
    decisionProjectSelect.value = d.projectId || "";
    decisionLabelInput.scrollIntoView({ behavior: "smooth", block: "center" });
    decisionLabelInput.focus();
  }

  decisionCancelEditBtn.addEventListener("click", () => resetDecisionForm());

  decisionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = decisionLabelInput.value.trim();
    if (!label) return;
    const payload = { label, status: decisionStatusInput.value };
    const clearOrOmit = (value) => (editingDecisionId ? value || null : value || undefined);
    payload.date = clearOrOmit(decisionDateInput.value);
    payload.meetingId = clearOrOmit(decisionMeetingSelect.value);
    payload.projectId = clearOrOmit(decisionProjectSelect.value);
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    if (editingDecisionId) {
      await db.updateDecision(editingDecisionId, payload);
    } else {
      await db.addDecision(payload);
    }
    resetDecisionForm();
  });

  function jumpToTaskFormFor(decision) {
    if (window.showAdminView) window.showAdminView("tasks");
    setTaskMode("libre");
    taskLabelInput.value = `Suite à : ${decision.label}`;
    if (decision.projectId) taskProjectSelect.value = decision.projectId;
    taskDecisionSelect.value = decision.id;
    taskLabelInput.scrollIntoView({ behavior: "smooth", block: "center" });
    taskLabelInput.focus();
  }

  function renderDecisions() {
    renderDecisionMeetingSelect();
    renderProjectSelectOptions(decisionProjectSelect, "Dossier (optionnel)");
    // (décisions disponibles pour le sélecteur "Décision liée" du formulaire tâche)
    const prevTaskDecision = taskDecisionSelect.value;
    taskDecisionSelect.innerHTML = '<option value="">Décision liée (optionnel)</option>';
    currentDecisions
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((d) => {
        const opt = document.createElement("option");
        opt.value = d.id;
        opt.textContent = d.label;
        taskDecisionSelect.appendChild(opt);
      });
    if (currentDecisions.some((d) => d.id === prevTaskDecision)) taskDecisionSelect.value = prevTaskDecision;

    decisionList.innerHTML = "";
    currentDecisions
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .forEach((d) => {
        const project = currentProjects.find((p) => p.id === d.projectId);
        const li = document.createElement("li");
        const parts = [d.label, DECISION_STATUS_LABELS[d.status] || d.status];
        if (d.date) parts.push(d.date);
        if (project) parts.push(`📁 ${project.name}`);
        if (d.source) parts.push(`📌 ${d.source}`);
        li.innerHTML = `<span>${parts.join(" — ")}</span>`;
        const actions = document.createElement("span");
        actions.className = "item-actions";
        const addTaskBtn = document.createElement("button");
        addTaskBtn.type = "button";
        addTaskBtn.className = "btn btn-ghost btn-sm";
        addTaskBtn.textContent = "+ Ajouter une tâche";
        addTaskBtn.addEventListener("click", () => jumpToTaskFormFor(d));
        actions.appendChild(addTaskBtn);
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-sm";
        editBtn.textContent = "✏️ Modifier";
        editBtn.addEventListener("click", () => startEditDecision(d));
        actions.appendChild(editBtn);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Supprimer";
        removeBtn.addEventListener("click", async () => {
          if (editingDecisionId === d.id) resetDecisionForm();
          await db.removeDecision(d.id);
        });
        actions.appendChild(removeBtn);
        li.appendChild(actions);
        decisionList.appendChild(li);
      });
  }

  // ---------- Vue Dossier : tout ce qui est lié à un dossier donné ----------
  projectViewSelect.addEventListener("change", renderProjectView);

  function renderProjectView() {
    const projectId = projectViewSelect.value;
    if (!projectId) {
      projectViewResult.innerHTML = "";
      return;
    }
    const project = currentProjects.find((p) => p.id === projectId);
    if (!project) {
      projectViewResult.innerHTML = "";
      return;
    }
    const linkedMeetings = currentMeetings.filter((m) => (m.projectIds || []).includes(projectId));
    const linkedDecisions = currentDecisions.filter((d) => d.projectId === projectId);
    const linkedTasks = currentTasks.filter((t) => t.projectId === projectId);
    const linkedEvents = currentEvents.filter((e) => e.projectId === projectId);

    const meetingsHtml = linkedMeetings
      .slice()
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .map((m) => {
        const ev = currentEvents.find((e) => e.id === m.eventId);
        return `<li>${m.status === "done" ? "✅" : "🕒"} ${m.date} — ${ev ? ev.label : "?"}</li>`;
      })
      .join("");
    const decisionsHtml = linkedDecisions
      .map((d) => `<li>${DECISION_STATUS_LABELS[d.status] || d.status} ${d.label}</li>`)
      .join("");
    const tasksHtml = linkedTasks
      .map((t) => {
        const assignedTo = t.assignedTo || [];
        const names = assignedTo.map((a) => a.name).join(", ");
        return `<li>☐ ${t.label}${names ? " — " + names : ""}${t.deadline ? " — échéance " + t.deadline : ""}</li>`;
      })
      .join("");
    const eventsHtml = linkedEvents.map((e) => `<li>📅 ${e.label} — ${e.date}</li>`).join("");
    const documentsHtml = (project.documents || [])
      .map((doc) => `<li><a href="${doc.url}" target="_blank" rel="noopener">${doc.label || doc.url}</a></li>`)
      .join("");

    projectViewResult.innerHTML = `
      <h3>${project.name} — ${PROJECT_STATUS_LABELS[project.status] || project.status}</h3>
      ${project.description ? `<p class="hint">${project.description}</p>` : ""}
      <p><strong>Réunions</strong></p><ul class="item-list">${meetingsHtml || "<li>—</li>"}</ul>
      <p><strong>Décisions</strong></p><ul class="item-list">${decisionsHtml || "<li>—</li>"}</ul>
      <p><strong>Tâches</strong></p><ul class="item-list">${tasksHtml || "<li>—</li>"}</ul>
      <p><strong>Événements</strong></p><ul class="item-list">${eventsHtml || "<li>—</li>"}</ul>
      <p><strong>Documents</strong></p><ul class="item-list">${documentsHtml || "<li>—</li>"}</ul>
    `;
  }

  // ---------- Tâches ----------
  // Deux modes à la création : "libre" (n'importe qui prend, jusqu'à N
  // personnes) ou "assignée directement" (l'admin choisit qui, fixé).
  let taskMode = "libre";
  function setTaskMode(mode) {
    taskMode = mode;
    taskModeLibreBtn.classList.toggle("active", mode === "libre");
    taskModeAssigneeBtn.classList.toggle("active", mode === "assignee");
    taskLibreOptions.classList.toggle("hidden", mode !== "libre");
    taskAssigneeOptions.classList.toggle("hidden", mode !== "assignee");
  }
  taskModeLibreBtn.addEventListener("click", () => setTaskMode("libre"));
  taskModeAssigneeBtn.addEventListener("click", () => setTaskMode("assignee"));

  function renderTaskAssigneeCheckboxes() {
    taskAssigneeCheckboxes.innerHTML = "";
    currentMembers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((m) => {
        const label = document.createElement("label");
        label.className = "checkbox-group";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = m.id;
        input.dataset.name = m.name;
        label.appendChild(input);
        label.appendChild(document.createTextNode(" " + m.name));
        taskAssigneeCheckboxes.appendChild(label);
      });
  }

  let editingTaskId = null;

  function resetTaskForm() {
    editingTaskId = null;
    taskSubmitBtn.textContent = "Ajouter la tâche";
    taskCancelEditBtn.classList.add("hidden");
    taskLabelInput.value = "";
    taskDescriptionInput.value = "";
    taskDeadlineInput.value = "";
    taskDeadlineTimeInput.value = "";
    taskRequiredInput.value = "1";
    taskProjectSelect.value = "";
    taskDecisionSelect.value = "";
    taskMeetingSelect.value = "";
    taskPrioritySelect.value = "normal";
    taskStatusSelect.value = "todo";
    setTaskMode("libre");
    taskAssigneeCheckboxes.querySelectorAll("input:checked").forEach((c) => (c.checked = false));
  }

  function startEditTask(task) {
    if (window.showAdminView) window.showAdminView("tasks");
    editingTaskId = task.id;
    taskSubmitBtn.textContent = "Enregistrer les modifications";
    taskCancelEditBtn.classList.remove("hidden");
    taskLabelInput.value = task.label || "";
    taskDescriptionInput.value = task.description || "";
    taskDeadlineInput.value = task.deadline || "";
    taskDeadlineTimeInput.value = task.deadlineTime || "";
    taskProjectSelect.value = task.projectId || "";
    taskDecisionSelect.value = task.decisionId || "";
    taskMeetingSelect.value = task.meetingId || "";
    taskPrioritySelect.value = task.priority || "normal";
    taskStatusSelect.value = task.status || "todo";
    if (task.fixedAssignment) {
      setTaskMode("assignee");
      const assignedPasswords = new Set((task.assignedTo || []).map((a) => a.password));
      taskAssigneeCheckboxes.querySelectorAll("input").forEach((c) => {
        c.checked = assignedPasswords.has(c.value);
      });
    } else {
      setTaskMode("libre");
      taskRequiredInput.value = task.requiredCount || 1;
    }
    taskLabelInput.scrollIntoView({ behavior: "smooth", block: "center" });
    taskLabelInput.focus();
  }

  taskCancelEditBtn.addEventListener("click", () => resetTaskForm());

  taskSubmitBtn.addEventListener("click", async () => {
    const label = taskLabelInput.value.trim();
    if (!label) return;
    const payload = { label };
    const clearOrOmit = (value) => (editingTaskId ? value || null : value || undefined);
    if (taskDescriptionInput.value.trim() || editingTaskId) payload.description = clearOrOmit(taskDescriptionInput.value.trim());
    if (taskDeadlineInput.value || editingTaskId) payload.deadline = clearOrOmit(taskDeadlineInput.value);
    if (taskDeadlineTimeInput.value || editingTaskId) payload.deadlineTime = clearOrOmit(taskDeadlineTimeInput.value);
    if (taskProjectSelect.value || editingTaskId) payload.projectId = clearOrOmit(taskProjectSelect.value);
    if (taskDecisionSelect.value || editingTaskId) payload.decisionId = clearOrOmit(taskDecisionSelect.value);
    if (taskMeetingSelect.value || editingTaskId) payload.meetingId = clearOrOmit(taskMeetingSelect.value);
    payload.priority = taskPrioritySelect.value;
    payload.status = taskStatusSelect.value;
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    if (taskMode === "assignee") {
      const checked = Array.from(taskAssigneeCheckboxes.querySelectorAll("input:checked"));
      if (!checked.length) {
        alert("Choisis au moins une personne pour une tâche assignée directement.");
        return;
      }
      payload.fixedAssignment = true;
      payload.assignedTo = checked.map((c) => ({ password: c.value, name: c.dataset.name }));
      payload.requiredCount = payload.assignedTo.length;
    } else {
      payload.fixedAssignment = false;
      if (!editingTaskId) payload.assignedTo = [];
      payload.requiredCount = Math.max(1, Number(taskRequiredInput.value) || 1);
    }

    if (editingTaskId) {
      await db.updateTask(editingTaskId, payload);
    } else {
      await db.addTask(payload);
    }
    resetTaskForm();
  });

  function formatDeadline(task) {
    if (!task.deadline) return null;
    return task.deadlineTime ? `${task.deadline} à ${task.deadlineTime}` : task.deadline;
  }

  // Le cycle du bouton de statut reste volontairement limité aux 4 statuts
  // "de progression" habituels — proposition/annulée sont des points d'entrée
  // et de sortie, pas des étapes qu'on veut traverser en cliquant par erreur.
  const TASK_STATUS_CYCLE = ["todo", "in_progress", "done", "blocked"];
  const TASK_STATUS_LABELS = {
    proposition: "💡 Proposition",
    todo: "🟡 À faire",
    in_progress: "🔵 En cours",
    done: "🟢 Terminé",
    blocked: "🔴 Bloqué",
    annulee: "🚫 Annulée",
  };
  const TASK_PRIORITY_LABELS = { urgent: "🔴 Urgent", important: "🟠 Important", normal: "⚪ Normal" };
  const TASK_PRIORITY_ORDER = { urgent: 0, important: 1, normal: 2 };

  // "En retard" n'est jamais stocké : une tâche non terminée dont la deadline
  // (date + heure si présente) est déjà passée est en retard, point.
  function isTaskLate(task) {
    if (!task.deadline || task.status === "done") return false;
    const deadlineDate = new Date(`${task.deadline}T${task.deadlineTime || "23:59"}:00`);
    return deadlineDate < new Date();
  }

  function taskDeadlineSortKey(task) {
    if (!task.deadline) return "9999";
    return `${task.deadline}T${task.deadlineTime || "23:59"}`;
  }

  function renderTasks() {
    renderTaskAssigneeCheckboxes();
    taskList.innerHTML = "";
    currentTasks
      .slice()
      .sort((a, b) => {
        const pa = TASK_PRIORITY_ORDER[a.priority] ?? 2;
        const pb = TASK_PRIORITY_ORDER[b.priority] ?? 2;
        if (pa !== pb) return pa - pb;
        return taskDeadlineSortKey(a).localeCompare(taskDeadlineSortKey(b));
      })
      .forEach((task) => {
        const li = document.createElement("li");
        const assignedTo = task.assignedTo || [];
        const requiredCount = task.requiredCount || 1;
        const status = task.status || "todo";
        const priority = task.priority || "normal";
        const late = isTaskLate(task);
        const parts = [task.label];
        const deadline = formatDeadline(task);
        if (deadline) parts.push(`échéance ${deadline}`);
        if (task.description) parts.push(task.description);
        if (task.projectId) {
          const project = currentProjects.find((p) => p.id === task.projectId);
          if (project) parts.push(`📁 ${project.name}`);
        }
        if (task.meetingId) {
          const meeting = currentMeetings.find((m) => m.id === task.meetingId);
          const ev = meeting ? currentEvents.find((e) => e.id === meeting.eventId) : null;
          if (meeting) parts.push(`🗓️ ${ev ? ev.label : "réunion"} (${meeting.date})`);
        }
        if (task.source) parts.push(`📌 ${task.source}`);
        parts.push(TASK_PRIORITY_LABELS[priority] || priority);
        parts.push(late ? "🔴 EN RETARD" : TASK_STATUS_LABELS[status] || status);

        let statusText;
        if (task.fixedAssignment) {
          const names = assignedTo.map((a) => a.name).join(", ") || "personne";
          statusText = `<code>assignée à : ${names}</code>`;
        } else if (requiredCount > 1) {
          const names = assignedTo.map((a) => a.name).join(", ");
          statusText = `<code>${assignedTo.length}/${requiredCount}${names ? " — " + names : ""}</code>`;
        } else {
          statusText = assignedTo.length ? `<code>pris par ${assignedTo[0].name}</code>` : `<code>libre</code>`;
        }
        li.innerHTML = `<span>${parts.join(" — ")} ${statusText}</span>`;

        const actions = document.createElement("span");
        actions.className = "item-actions";

        const statusBtn = document.createElement("button");
        statusBtn.type = "button";
        statusBtn.className = "btn btn-ghost btn-sm task-status-btn";
        statusBtn.textContent = TASK_STATUS_LABELS[status] || status;
        statusBtn.title = "Cliquer pour passer au statut suivant";
        statusBtn.addEventListener("click", async () => {
          const idx = TASK_STATUS_CYCLE.indexOf(status);
          const next = TASK_STATUS_CYCLE[(idx + 1) % TASK_STATUS_CYCLE.length];
          await db.updateTask(task.id, { status: next });
        });
        actions.appendChild(statusBtn);

        const prioritySelect = document.createElement("select");
        prioritySelect.className = "task-priority-select";
        ["urgent", "important", "normal"].forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p;
          opt.textContent = TASK_PRIORITY_LABELS[p];
          if (p === priority) opt.selected = true;
          prioritySelect.appendChild(opt);
        });
        prioritySelect.addEventListener("change", async () => {
          await db.updateTask(task.id, { priority: prioritySelect.value });
        });
        actions.appendChild(prioritySelect);

        assignedTo.forEach((a) => {
          const removeAssigneeBtn = document.createElement("button");
          removeAssigneeBtn.type = "button";
          removeAssigneeBtn.className = "btn btn-ghost btn-sm";
          removeAssigneeBtn.textContent = `Retirer ${a.name}`;
          removeAssigneeBtn.addEventListener("click", async () => {
            await db.adminRemoveAssignee(task.id, a.password);
          });
          actions.appendChild(removeAssigneeBtn);
        });

        if (task.fixedAssignment) {
          const freeBtn = document.createElement("button");
          freeBtn.type = "button";
          freeBtn.className = "btn btn-ghost btn-sm";
          freeBtn.textContent = "Repasser en libre";
          freeBtn.title = "Les places restent attribuées mais redeviennent gérables par les membres eux-mêmes";
          freeBtn.addEventListener("click", async () => {
            await db.adminMakeTaskFree(task.id);
          });
          actions.appendChild(freeBtn);
        }

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "btn btn-ghost btn-sm";
        editBtn.textContent = "✏️ Modifier";
        editBtn.addEventListener("click", () => startEditTask(task));
        actions.appendChild(editBtn);

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-ghost btn-sm";
        removeBtn.textContent = "Supprimer la tâche";
        removeBtn.addEventListener("click", async () => {
          if (editingTaskId === task.id) resetTaskForm();
          await db.removeTask(task.id);
        });
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
    renderMeetings();
    renderProjects();
    renderDashboard();
  });

  db.listenEvents((events) => {
    currentEvents = events;
    renderEvents();
    renderEventAvailabilitySelect();
    renderMeetingEventSelect();
    renderMeetings();
    renderDecisions();
    renderProjectView();
    renderHeatmap();
    renderFillGrid();
    renderDashboard();
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
    renderProjectView();
    renderDashboard();
  });

  db.listenMeetings((meetings) => {
    currentMeetings = meetings;
    renderMeetings();
    renderDecisionMeetingSelect();
    renderProjectView();
    renderDashboard();
  });

  db.listenProjects((projects) => {
    currentProjects = projects;
    renderProjects();
    renderDecisions();
    renderDashboard();
  });

  db.listenDecisions((decisions) => {
    currentDecisions = decisions;
    renderDecisions();
    renderProjectView();
    renderDashboard();
  });

  db.listenArchive((archive) => {
    currentArchive = archive;
    renderDashboard();
  });

  db.listenAgendaItems((items) => {
    currentAgendaItems = items;
    renderMeetings();
  });
}
