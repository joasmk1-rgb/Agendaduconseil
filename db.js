// ===================== DB.JS =====================
// Toute la communication avec Firestore passe par ce fichier : script.js
// (page membre) et admin.js (page admin) n'appellent que les fonctions
// ci-dessous, sans jamais toucher directement au SDK Firebase.
//
// Modèle de données :
//   members/{motDePasse}          -> un membre du Conseil (doc id = son mot de passe = son identifiant)
//                                     { name, isAdmin, addedAt }
//   config/current                -> réglages de la fenêtre glissante (rangeDays, includeWeekends)
//   availability/{motDePasse}     -> les marques dispo/pas dispo d'un membre (même doc id que members)
//                                     { name, marks: { "2026-09-15|09:00": "available" | "unavailable" } }
//   events/{id}                    -> un événement (ponctuel ou toute la journée)
//   tasks/{id}                     -> une tâche (libre ou assignée directement, voir plus bas)
//   meetings/{id}                  -> une réunion (liée à un event, présences/procurations, voir plus bas)
//   projects/{id}                  -> un dossier (affaire qui dure, relie réunions/décisions/tâches/events)
//   decisions/{id}                 -> une décision (liée à une réunion et/ou un dossier)
//   archive/{timestamp}            -> copie des disponibilités au moment d'une réinitialisation

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  collection,
  getDocs,
  writeBatch,
  runTransaction,
  deleteField,
  serverTimestamp,
  query,
  where,
  limit,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

function toDocs(snap) {
  const out = [];
  snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  return out;
}

// ---------------------- Membres ----------------------
// doc id = le mot de passe du membre (= son identifiant). "name" est son vrai
// nom, affiché seulement dans l'admin — jamais montré à quelqu'un d'autre.
export function listenMembers(callback) {
  return onSnapshot(collection(firestore, "members"), (snap) => callback(toDocs(snap)));
}

export async function addMember(name, password, isAdmin = false) {
  const trimmedName = name.trim();
  const trimmedPassword = password.trim();
  if (!trimmedName || !trimmedPassword) return;
  await setDoc(doc(firestore, "members", trimmedPassword), {
    name: trimmedName,
    isAdmin: !!isAdmin,
    addedAt: serverTimestamp(),
  });
}

// Retire le membre ET ses disponibilités d'un coup (sinon elles resteraient
// orphelines dans "availability", invisibles pour tout le monde mais encore
// présentes dans la base et dans les stats/heatmap de l'admin).
export async function removeMember(password) {
  await Promise.all([
    deleteDoc(doc(firestore, "members", password)),
    deleteDoc(doc(firestore, "availability", password)),
  ]);
}

// Vérifie un mot de passe membre et renvoie { password, name, isAdmin } ou null.
export async function findMemberByPassword(password) {
  const snap = await getDoc(doc(firestore, "members", password.trim()));
  return snap.exists() ? { password: snap.id, ...snap.data() } : null;
}

// Vrai dès qu'au moins un membre a été coché "Admin" — sert à désactiver
// définitivement le mot de passe de démarrage une fois le premier admin défini.
export async function hasAnyAdmin() {
  const q = query(collection(firestore, "members"), where("isAdmin", "==", true), limit(1));
  const snap = await getDocs(q);
  return !snap.empty;
}

// ---------------------- Config (fenêtre glissante) ----------------------
const configDocRef = () => doc(firestore, "config", "current");

export async function getConfig() {
  const snap = await getDoc(configDocRef());
  return snap.exists() ? snap.data() : null;
}

export function listenConfig(callback) {
  return onSnapshot(configDocRef(), (snap) => callback(snap.exists() ? snap.data() : null));
}

export async function saveConfig(data) {
  await setDoc(configDocRef(), { ...data, updatedAt: serverTimestamp() });
}

// ---------------------- Cours récurrents bloqués ----------------------
// Stockés dans le même document que la fenêtre glissante :
// config/current.blockedSlots = [{ id, day, start, end, label }]
// day: 0=dimanche, 1=lundi ... 6=samedi (comme Date.prototype.getDay).
export async function addBlockedSlot(slot) {
  const config = await getConfig();
  const base = config || { rangeDays: 90, includeWeekends: false };
  const current = base.blockedSlots || [];
  const id = `bs-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  await saveConfig({ ...base, blockedSlots: [...current, { ...slot, id }] });
}

export async function removeBlockedSlot(id) {
  const config = await getConfig();
  if (!config) return;
  const updated = (config.blockedSlots || []).filter((s) => s.id !== id);
  await saveConfig({ ...config, blockedSlots: updated });
}

// ---------------------- Disponibilités (tri-état) ----------------------
// doc id = mot de passe du membre (même identifiant que dans "members").
const availabilityDocRef = (password) => doc(firestore, "availability", password);

export async function getMarks(password) {
  const snap = await getDoc(availabilityDocRef(password));
  return snap.exists() ? snap.data().marks || {} : {};
}

export async function saveMarks(password, name, marks) {
  await setDoc(availabilityDocRef(password), { name, marks, updatedAt: serverTimestamp() });
}

export function listenAllAvailability(callback) {
  return onSnapshot(collection(firestore, "availability"), (snap) => callback(toDocs(snap)));
}

// ---------------------- Événements ----------------------
export function listenEvents(callback) {
  return onSnapshot(collection(firestore, "events"), (snap) => callback(toDocs(snap)));
}

export async function addEvent(event) {
  const id = `evt-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  await setDoc(doc(firestore, "events", id), { ...event, createdAt: serverTimestamp() });
}

export async function removeEvent(id) {
  await deleteDoc(doc(firestore, "events", id));
}

// ---------------------- Tâches ----------------------
// Créées à la main dans l'admin (typiquement à partir d'un PV), ou générées
// par la règle des "45 minutes" ailleurs dans le code — non, uniquement à la
// main. Deux façons de fonctionner :
//   - "libre" (fixedAssignment: false) : n'importe quel membre peut cliquer
//     "je m'en occupe" tant qu'il reste de la place (assignedTo.length <
//     requiredCount). Chacun peut se retirer lui-même ensuite.
//   - "assignée directement" (fixedAssignment: true) : l'admin choisit
//     directement qui est dessus à la création. Les membres concernés ne
//     peuvent pas se retirer eux-mêmes (seul l'admin peut modifier via
//     adminSetAssignees/adminRemoveAssignee).
// { label, description?, deadline?, deadlineTime?, requiredCount,
//   fixedAssignment, assignedTo: [{ password, name }] }
export function listenTasks(callback) {
  return onSnapshot(collection(firestore, "tasks"), (snap) => callback(toDocs(snap)));
}

// status: "todo" | "in_progress" | "done" | "blocked" (indépendant du fait
// d'être assigné ou non — une tâche peut être "en cours" sans personne
// dessus). priority: "urgent" | "important" | "normal". "En retard" n'est
// jamais stocké : calculé à l'affichage à partir de deadline + status.
export async function addTask(task) {
  const id = `task-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const payload = {
    requiredCount: 1,
    fixedAssignment: false,
    assignedTo: [],
    status: "todo",
    priority: "normal",
    ...task,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(firestore, "tasks", id), payload);
}

export async function removeTask(id) {
  await deleteDoc(doc(firestore, "tasks", id));
}

// Changement générique (status, priority...) — ne touche jamais assignedTo.
export async function updateTask(id, patch) {
  await updateDoc(doc(firestore, "tasks", id), patch);
}

// Transaction : échoue proprement si la tâche vient d'être prise/complétée
// par quelqu'un d'autre entre le moment où on l'affiche et le clic.
export async function claimTask(id, password, name) {
  const ref = doc(firestore, "tasks", id);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Cette tâche n'existe plus.");
    const data = snap.data();
    if (data.fixedAssignment) {
      throw new Error("Cette tâche est assignée directement par l'admin, tu ne peux pas te l'attribuer.");
    }
    const current = data.assignedTo || [];
    const requiredCount = data.requiredCount || 1;
    if (current.some((a) => a.password === password)) return; // déjà dessus
    if (current.length >= requiredCount) {
      throw new Error("Cette tâche vient d'être complétée par quelqu'un d'autre.");
    }
    tx.update(ref, { assignedTo: [...current, { password, name }] });
  });
}

// Un membre se retire lui-même (impossible si la tâche est assignée
// directement par l'admin — dans ce cas c'est adminRemoveAssignee qu'il faut
// utiliser, depuis l'admin).
export async function unclaimTask(id, password) {
  const ref = doc(firestore, "tasks", id);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.fixedAssignment) {
      throw new Error("Cette tâche est fixée par l'admin, seul l'admin peut la modifier.");
    }
    const current = data.assignedTo || [];
    tx.update(ref, { assignedTo: current.filter((a) => a.password !== password) });
  });
}

// ---- Actions réservées à l'admin ----
// Assigne directement une liste de membres à une tâche (à la création ou
// plus tard) — passe fixedAssignment à true : les membres concernés ne
// pourront plus se retirer eux-mêmes.
export async function adminSetAssignees(id, assignees) {
  await updateDoc(doc(firestore, "tasks", id), {
    assignedTo: assignees,
    fixedAssignment: true,
    requiredCount: Math.max(assignees.length, 1),
  });
}

// Retire une seule personne d'une tâche (marche que la tâche soit libre ou
// assignée directement) — ne repasse jamais fixedAssignment à false tout
// seul, l'admin garde la main dessus explicitement si besoin.
export async function adminRemoveAssignee(id, password) {
  const ref = doc(firestore, "tasks", id);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const current = snap.data().assignedTo || [];
    tx.update(ref, { assignedTo: current.filter((a) => a.password !== password) });
  });
}

// Repasse une tâche assignée directement en mode "libre" (les places
// laissées vacantes redeviennent prenables par n'importe qui).
export async function adminMakeTaskFree(id) {
  await updateDoc(doc(firestore, "tasks", id), { fixedAssignment: false });
}

// ---------------------- Réunions ----------------------
// Une réunion est toujours liée à un event existant (pas de doublon avec le
// calendrier public) : { eventId, date, startTime?, endTime?, location?,
// type?, status: "planned" | "done",
// attendance: { [password]: "present" | "absent" | "proxy" },
// proxies: { [password]: password du membre qui porte la procuration } }
// À la création, l'admin pré-remplit "attendance" à partir des disponibilités
// déjà marquées sur le créneau de l'événement (voir classifyMembers côté
// admin.js) — ensuite c'est un champ normal, modifiable librement.
export function listenMeetings(callback) {
  return onSnapshot(collection(firestore, "meetings"), (snap) => callback(toDocs(snap)));
}

export async function addMeeting(meeting) {
  const id = `meeting-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const payload = {
    status: "planned",
    attendance: {},
    proxies: {},
    ...meeting,
    createdAt: serverTimestamp(),
  };
  await setDoc(doc(firestore, "meetings", id), payload);
}

export async function updateMeeting(id, patch) {
  await updateDoc(doc(firestore, "meetings", id), patch);
}

export async function removeMeeting(id) {
  await deleteDoc(doc(firestore, "meetings", id));
}

// ---------------------- Dossiers (projets) ----------------------
// Un dossier représente une affaire qui dure (ex: "Transition écologique",
// "Bac 3") — l'objet central autour duquel se relient réunions, décisions,
// tâches et événements (via projectId / projectIds sur ces objets).
// { name, status: "todo"|"in_progress"|"paused"|"done", priority?,
//   responsible?: password, description?, type?, documents?: [{ label, url }] }
export function listenProjects(callback) {
  return onSnapshot(collection(firestore, "projects"), (snap) => callback(toDocs(snap)));
}

export async function addProject(project) {
  const id = `project-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  await setDoc(doc(firestore, "projects", id), {
    status: "todo",
    documents: [],
    ...project,
    createdAt: serverTimestamp(),
  });
}

export async function updateProject(id, patch) {
  await updateDoc(doc(firestore, "projects", id), patch);
}

export async function removeProject(id) {
  await deleteDoc(doc(firestore, "projects", id));
}

// ---------------------- Décisions ----------------------
// { label, description?, meetingId?, projectId?, status: "pending"|"adopted"|"rejected",
//   date, documents?: [{ label, url }] }
// Pas de génération automatique de tâches : juste un lien manuel (decisionId
// sur une tâche) posé depuis le bouton "+ Ajouter une tâche" de l'admin.
export function listenDecisions(callback) {
  return onSnapshot(collection(firestore, "decisions"), (snap) => callback(toDocs(snap)));
}

export async function addDecision(decision) {
  const id = `decision-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  await setDoc(doc(firestore, "decisions", id), {
    status: "pending",
    documents: [],
    ...decision,
    createdAt: serverTimestamp(),
  });
}

export async function updateDecision(id, patch) {
  await updateDoc(doc(firestore, "decisions", id), patch);
}

export async function removeDecision(id) {
  await deleteDoc(doc(firestore, "decisions", id));
}

// ---------------------- Réinitialisation ----------------------
// Lecture seule de l'historique, pour le tableau de bord ("dernière
// réinitialisation le ...").
export function listenArchive(callback) {
  return onSnapshot(collection(firestore, "archive"), (snap) => callback(toDocs(snap)));
}

// Archive toutes les disponibilités actuelles puis les efface (les membres,
// la config et les événements restent inchangés).
export async function resetAvailability() {
  const snap = await getDocs(collection(firestore, "availability"));
  if (snap.empty) return;

  const batch = writeBatch(firestore);
  const archiveId = `archive-${Date.now()}`;
  batch.set(doc(firestore, "archive", archiveId), {
    availability: toDocs(snap),
    archivedAt: serverTimestamp(),
  });
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
