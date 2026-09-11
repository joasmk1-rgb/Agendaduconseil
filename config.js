// ===================== CONFIGURATION =====================
// Le seul fichier à modifier pour personnaliser le comportement du site.

export const CONFIG = {
  dayStartHour: 8.5, // heure de début de grille (8.5 = 8h30)
  dayEndHour: 21,    // heure de fin de grille (exclue)
  slotMinutes: 15,   // granularité des créneaux, en minutes (15, 30 ou 60)
};

// Les cours récurrents bloqués (grisés, non cliquables) ne se règlent plus
// ici : ils se gèrent depuis le panneau "Cours récurrents" de admin.html,
// sans toucher au code.

// Mot de passe temporaire de démarrage pour la page admin (admin.html).
// Il ne sert qu'UNE fois, au tout début : dès qu'un membre est coché "Admin"
// dans le panneau Membres, ce mot de passe fixe cesse définitivement de
// fonctionner (même si quelqu'un lit ce fichier). Après cette étape, l'accès
// admin se fait avec le mot de passe personnel du·de la membre coché·e Admin,
// il n'y a plus aucun mot de passe admin écrit en clair dans le code.
export const ADMIN_PASSPHRASE = "conseil2026";
