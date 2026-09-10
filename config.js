// ===================== CONFIGURATION =====================
// Le seul fichier à modifier pour personnaliser le comportement du site.

export const CONFIG = {
  dayStartHour: 8,   // heure de début de grille
  dayEndHour: 21,    // heure de fin de grille (exclue)
  slotMinutes: 60,   // granularité des créneaux : 30 ou 60

  // Créneaux de cours récurrents, automatiquement grisés et non sélectionnables.
  // day: 0=dimanche, 1=lundi ... 6=samedi (comme Date.prototype.getDay)
  // Remplace ces exemples par les vrais horaires du Master 60 horaire décalé.
  blockedSlots: [
    { day: 1, start: "08:00", end: "12:00", label: "Cours (exemple lundi matin)" },
    { day: 3, start: "13:00", end: "17:00", label: "Cours (exemple mercredi après-midi)" },
    { day: 6, start: "09:00", end: "13:00", label: "Cours horaire décalé (exemple samedi)" },
  ],
};

// Mot de passe pour accéder à la page admin (admin.html).
// C'est une protection légère côté navigateur, pas une vraie sécurité :
// n'importe qui lisant le code source du site peut le retrouver. Elle sert
// juste à éviter qu'un·e étudiant·e tombe dessus par hasard. Change-le si tu veux.
export const ADMIN_PASSPHRASE = "conseil2026";
