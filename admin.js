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
  const eventList = document.getElementById("event-list");

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
    await db.addEvent(payload);
    eventForm.reset();
    eventAllDayInput.checked = true;
    eventEndDateInput.classList.remove("hidden");
    eventStartInput.classList.add("hidden");
    eventEndInput.classList.add("hidden");
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
        li.innerHTML = `<span><strong>${ev.label}</strong> — ${describeEvent(ev)}</span>`;
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
    renderHeatmap();
    renderFillGrid();
  });

  db.listenAllAvailability((responses) => {
    currentAvailability = responses;
    renderResponseCount();
    renderHeatmap();
    renderOrphans();
  });
}
