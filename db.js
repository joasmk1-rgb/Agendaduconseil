// ===================== DB.JS =====================
// Toute la communication avec Firestore passe par ce fichier : script.js
// (page membre) et admin.js (page admin) n'appellent que les fonctions
// ci-dessous, sans jamais toucher directement au SDK Firebase.
//
// Modèle de données :
//   members/{motDePasse}          -> un membre du Conseil (doc id = son mot de passe = son identifiant)
//                                     { name, addedAt }
//   config/current                -> réglages de la fenêtre glissante (rangeDays, includeWeekends)
//   availability/{motDePasse}     -> les marques dispo/pas dispo d'un membre (même doc id que members)
//                                     { name, marks: { "2026-09-15|09:00": "available" | "unavailable" } }
//   events/{id}                    -> un événement (ponctuel ou toute la journée)
//   archive/{timestamp}            -> copie des disponibilités au moment d'une réinitialisation

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  collection,
  getDocs,
  writeBatch,
  serverTimestamp,
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

export async function addMember(name, password) {
  const trimmedName = name.trim();
  const trimmedPassword = password.trim();
  if (!trimmedName || !trimmedPassword) return;
  await setDoc(doc(firestore, "members", trimmedPassword), { name: trimmedName, addedAt: serverTimestamp() });
}

export async function removeMember(password) {
  await deleteDoc(doc(firestore, "members", password));
}

// Vérifie un mot de passe membre et renvoie { password, name } ou null.
export async function findMemberByPassword(password) {
  const snap = await getDoc(doc(firestore, "members", password.trim()));
  return snap.exists() ? { password: snap.id, ...snap.data() } : null;
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

// ---------------------- Réinitialisation ----------------------
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
