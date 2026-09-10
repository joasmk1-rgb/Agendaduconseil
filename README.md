# Agenda Conseil Étudiant

Calendrier toujours ouvert où chaque membre du Conseil indique ses disponibilités (créneau par créneau, en vert "dispo" ou en rouge "pas dispo"), pour repérer facilement quand organiser une réunion. Tout se synchronise automatiquement — pas d'upload, pas de fichier à échanger.

## Structure du projet

- `index.html` / `script.js` — page publique (les membres du Conseil s'y connectent avec leur mot de passe personnel)
- `admin.html` / `admin.js` — page admin (à NE PAS partager) : gestion des membres, de la fenêtre glissante, des événements, et vue en direct des disponibilités
- `config.js` — le fichier à modifier pour les horaires de cours bloqués (`CONFIG.blockedSlots`) et le mot de passe admin (`ADMIN_PASSPHRASE`)
- `grid.js` — construction de la grille, partagée entre les deux pages
- `db.js` — tous les échanges avec la base de données Firebase
- `firebase-config.js` — les identifiants de TON projet Firebase (à remplir, voir plus bas)
- `firestore.rules` — les règles de sécurité à coller dans la console Firebase
- `style.css` — mise en forme, thème bleu UCLouvain

## 1. Créer un projet Firebase gratuit (une fois, ~5 minutes)

1. Va sur [console.firebase.google.com](https://console.firebase.google.com), connecte-toi avec ton compte Google.
2. "Ajouter un projet" → un nom (ex: `agenda-conseil`) → tu peux désactiver Google Analytics → crée le projet.
3. Menu de gauche : **Build → Firestore Database** → "Créer une base de données" → région proche (ex: `eur3 (europe-west)`) → mode production.
4. Onglet **Règles** de la base → colle tout le contenu de `firestore.rules` → "Publier".
5. **Paramètres du projet** (⚙️) → **Général** → "Vos applications" → icône `</>` (Web) → surnom (ex: `site`) → "Enregistrer l'application". Recopie les valeurs affichées (`apiKey`, `authDomain`, etc.) dans `firebase-config.js`, à la place de `"REMPLACE_MOI"`.

Pas de carte bancaire nécessaire, pas de ligne de commande.

## 2. Ajouter les membres

Ouvre `admin.html` (mot de passe par défaut `conseil2026`, à changer dans `config.js`). Dans le bloc "Membres", ajoute chaque personne avec son nom et son mot de passe personnel (un par un, ~17 fois pour la liste de départ). Le mot de passe EST l'identifiant : la personne le tape sur la page publique et arrive directement sur sa propre grille, sans rien taper d'autre.

Tu peux ajouter ou retirer un membre à tout moment depuis cette page, sans toucher au code.

## 3. Utiliser le site

### Un membre du Conseil

Ouvre le lien, tape son mot de passe personnel, arrive sur sa grille (les 30 prochains jours par défaut). En haut : deux boutons "✅ Dispo" / "❌ Pas dispo" pour choisir ce qu'un clic va marquer, puis clique ou clique-glisse sur la grille. Chaque créneau garde son état jusqu'à ce qu'il soit recliqué avec le même mode (ce qui l'efface) ou remarqué dans l'autre mode. Tout s'enregistre automatiquement ("Enregistré ✓"). En revenant sur le lien, sa sélection précédente est rechargée.

### Toi (admin)

Sur `admin.html`, en direct :
- **Fenêtre glissante** : largeur de la fenêtre (2 semaines / 30 / 45 jours) et inclusion des week-ends — la grille part toujours d'aujourd'hui, il n'y a pas de date de fin de vote.
- **Membres** : ajout / retrait.
- **Événements** : ajoute un repère sur le calendrier — toute la journée (ex: "Blocus", avec une date de fin optionnelle pour une période) ou à heure précise (ex: "Réunion bureau, 18h-20h"). Les événements s'affichent pour tout le monde sur la grille, mais ne bloquent jamais le clic : quelqu'un peut se marquer dispo ou pas dispo même sur un créneau où un événement est déjà prévu.
- **Disponibilités en direct** : nombre de membres ayant répondu, heatmap (plus c'est vert foncé, plus il y a de monde dispo ; un liseré rouge en bas d'une case signale qu'au moins une personne s'y est mise "pas dispo"), classement des meilleurs créneaux et de ceux à éviter.
- **Réinitialiser les disponibilités** : archive toutes les réponses actuelles puis repart d'une grille vierge (les membres, la fenêtre et les événements restent inchangés).

⚠️ Ni le mot de passe admin ni les mots de passe des membres ne sont une vraie sécurité cryptographique — ce sont des vérifications faites par la base de données (donc pas juste "dans le navigateur"), mais sans compte réel derrière. Largement suffisant pour un usage interne au Conseil (l'enjeu, ce sont des disponibilités, pas des données sensibles), mais ne t'en sers pas pour autre chose.

## 4. Personnaliser les horaires de cours

Dans `config.js`, l'objet `CONFIG.blockedSlots` contient des exemples. Remplace-les par les vrais horaires du Master 60 horaire décalé : ces créneaux restent grisés et non cliquables pour tout le monde, en plus des événements.

## 5. Héberger sur GitHub Pages

1. Crée un dépôt GitHub, pousse tous les fichiers de ce dossier (y compris `firebase-config.js` rempli — ces clés sont faites pour être publiques, ce n'est pas un souci de sécurité de les publier).
2. Paramètres du dépôt → **Pages** → branche `main`, dossier `/ (root)`.
3. Site public : `https://<ton-pseudo>.github.io/agenda-conseil/` — page admin : `.../admin.html` (à ne pas partager).

## Prochaine étape possible (pas encore construite)

Permettre à un membre de proposer un événement, que tu valides avant qu'il devienne visible de tous — pour l'instant seul toi (admin) peux ajouter des événements. Dis-le si tu veux qu'on l'ajoute.
