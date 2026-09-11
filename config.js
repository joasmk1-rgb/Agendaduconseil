// ===================== CONFIGURATION =====================
// Le seul fichier à modifier pour personnaliser le comportement du site.

export const CONFIG = {
  dayStartHour: 8,   // heure de début de grille
  dayEndHour: 21,    // heure de fin de grille (exclue)
  slotMinutes: 15,   // granularité des créneaux, en minutes (15, 30 ou 60)

  // Créneaux de cours récurrents, automatiquement grisés et non sélectionnables.
  // day: 0=dimanche, 1=lundi ... 6=samedi (comme Date.prototype.getDay)
  // Remplace ces exemples par les vrais horaires du Master 60 horaire décalé.
  blockedSlots: [
    { day: 1, start: "08:00", end: "12:00", label: "Cours (exemple lundi matin)" },
    { day: 3, start: "13:00", end: "17:00", label: "Cours (exemple mercredi après-midi)" },
    { day: 6, start: "09:00", end: "13:00", label: "Cours horaire décalé (exemple samedi)" },
  ],
};

// Mot de passe temporaire de démarrage pour la page admin (admin.html).
// Il ne sert qu'UNE fois, au tout début : dès qu'un membre est coché "Admin"
// dans le panneau Membres, ce mot de passe fixe cesse définitivement de
// fonctionner (même si quelqu'un lit ce fichier). Après cette étape, l'accès
// admin se fait avec le mot de passe personnel du·de la membre coché·e Admin,
// il n'y a plus aucun mot de passe admin écrit en clair dans le code.
export const ADMIN_PASSPHRASE = "conseil2026";
