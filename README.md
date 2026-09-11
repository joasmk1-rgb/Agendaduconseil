# Agenda Conseil Étudiant

Calendrier toujours ouvert, visible par tout le monde dès l'ouverture du lien, où chaque membre du Conseil peut en plus indiquer ses disponibilités (créneau par créneau, en vert "dispo" ou en rouge "pas dispo"), pour repérer facilement quand organiser une réunion. Tout se synchronise automatiquement — pas d'upload, pas de fichier à échanger.

## Structure du projet

- `index.html` / `script.js` — page publique : le calendrier (cours bloqués + événements) est visible par tout le monde ; un petit widget en haut à droite permet à un membre de se connecter avec son mot de passe personnel pour indiquer ses propres disponibilités
- `admin.html` / `admin.js` — page admin (à NE PAS partager) : gestion des membres, de la fenêtre glissante, des événements, et vue en direct des disponibilités
- `config.js` — le fichier à modifier pour les horaires de cours bloqués (`CONFIG.blockedSlots`), la granularité des créneaux (`CONFIG.slotMinutes`) et le mot de passe de démarrage admin (`ADMIN_PASSPHRASE`, voir plus bas)
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
5. **Paramètres du projet** (⚙️) → **Général** → "Vos applications" → icône `</>` (Web) → surnom (ex: `site`) → "Enregistrer l'application". Recopie les 6 valeurs affichées (`apiKey`, `authDomain`, etc. — peu importe l'onglet npm ou script tag, ce sont les mêmes) dans `firebase-config.js`, à la place de `"REMPLACE_MOI"`.

Pas de carte bancaire nécessaire, pas de ligne de commande.

## 2. Ajouter les membres et te donner l'accès admin

Ouvre `admin.html`. La toute première fois, il n'y a encore aucun administrateur défini : tape le mot de passe temporaire `conseil2026` (celui de `config.js`) pour débloquer l'accès une seule fois.

Dans le bloc "Membres", ajoute chaque personne avec son nom et son mot de passe personnel (un par un). Le mot de passe EST l'identifiant : la personne le tape sur la page publique et peut directement marquer ses dispos, sans rien taper d'autre.

**Coche la case "Admin"** sur ta propre fiche (ou celle de toute autre personne qui doit avoir accès à cette page). Dès qu'au moins un membre est coché Admin, le mot de passe temporaire `conseil2026` arrête définitivement de fonctionner — même quelqu'un qui lirait le code du site ne pourrait plus s'en servir. À partir de là, l'accès admin se fait uniquement avec le mot de passe personnel du ou des membres cochés Admin.

Tu peux ajouter, retirer ou changer le statut admin de n'importe qui à tout moment depuis cette page, sans toucher au code.

## 3. Utiliser le site

### N'importe qui avec le lien

Le calendrier (cours bloqués et événements posés par l'admin) est visible directement, sans rien taper — la fenêtre affiche les 1, 2 ou 3 prochains mois selon ce que l'admin a choisi, et on peut faire défiler horizontalement pour voir plus loin.

### Un membre du Conseil

En haut à droite, "Se connecter" + son mot de passe personnel fait apparaître deux boutons "✅ Dispo" / "❌ Pas dispo" pour choisir ce qu'un clic va marquer, puis il clique ou clique-glisse sur la grille (créneaux de 15 minutes, avec un trait plus marqué à chaque heure pile pour garder le repère). Chaque créneau garde son état jusqu'à ce qu'il soit recliqué avec le même mode (ce qui l'efface) ou remarqué dans l'autre mode. Tout s'enregistre automatiquement ("Enregistré ✓"). En revenant sur le lien, sa connexion et sa sélection précédente sont rechargées automatiquement.

### Toi (admin)

Sur `admin.html`, en direct :
- **Fenêtre glissante** : 1, 2 ou 3 mois, et inclusion des week-ends — la grille part toujours d'aujourd'hui, il n'y a pas de date de fin.
- **Membres** : ajout / retrait / statut admin.
- **Événements** : ajoute un repère sur le calendrier — toute la journée (ex: "Blocus", avec une date de fin optionnelle pour une période) ou à heure précise (ex: "Réunion bureau, 18h-20h"). Les événements s'affichent pour tout le monde sur la grille, mais ne bloquent jamais le clic : quelqu'un peut se marquer dispo ou pas dispo même sur un créneau où un événement est déjà prévu.
- **Disponibilités en direct** : nombre de membres ayant répondu, heatmap (plus c'est vert foncé, plus il y a de monde dispo ; un liseré rouge en bas d'une case signale qu'au moins une personne s'y est mise "pas dispo"), classement des meilleurs créneaux et de ceux à éviter.
- **Réinitialiser les disponibilités** : archive toutes les réponses actuelles puis repart d'une grille vierge (les membres, la fenêtre et les événements restent inchangés).

⚠️ Ce n'est toujours pas une vraie sécurité cryptographique : une fois le bootstrap fait, il n'y a plus de mot de passe admin écrit en clair dans le code (c'est l'amélioration principale), mais quelqu'un de suffisamment déterminé et un peu technique pourrait tout de même interroger directement la base Firestore et récupérer la liste des mots de passe des membres (il n'y a pas de vrai compte utilisateur derrière). Largement suffisant pour un usage interne au Conseil — l'enjeu, ce sont des disponibilités de réunion, pas des données sensibles — mais ne réutilise pas ces mots de passe ailleurs.

## 4. Personnaliser les horaires de cours et la granularité

Dans `config.js` :
- `CONFIG.blockedSlots` contient des exemples. Remplace-les par les vrais horaires du Master 60 horaire décalé : ces créneaux restent grisés et non cliquables pour tout le monde, en plus des événements.
- `CONFIG.slotMinutes` (15 par défaut) contrôle la finesse des créneaux ; tu peux remettre 30 ou 60 si 15 minutes fait trop de lignes à ton goût.

## 5. Héberger sur GitHub Pages

1. Crée un dépôt GitHub, pousse tous les fichiers de ce dossier (y compris `firebase-config.js` rempli — ces clés sont faites pour être publiques, ce n'est pas un souci de sécurité de les publier).
2. Paramètres du dépôt → **Pages** → branche `main`, dossier `/ (root)`.
3. Site public : `https://<ton-pseudo>.github.io/agenda-conseil/` — page admin : `.../admin.html` (à ne pas partager, même si techniquement quelqu'un qui devine l'adresse peut l'ouvrir — seul le mot de passe protège l'accès).

## Prochaine étape possible (pas encore construite)

Permettre à un membre de proposer un événement, que tu valides avant qu'il devienne visible de tous — pour l'instant seul un admin peut ajouter des événements. Dis-le si tu veux qu'on l'ajoute.
