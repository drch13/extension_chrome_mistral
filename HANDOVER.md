# HANDOVER — prochaines étapes

Pistes de développement pour la suite. Les règles de contribution
(changelog, versionnement, commits) sont dans `AGENTS.md`.

## 1. Toggle thème clair / sombre

Aujourd'hui, le thème suit automatiquement le système :
`sidepanel.css` définit les couleurs claires dans `:root` et les couleurs
sombres dans un `@media (prefers-color-scheme: dark)`.

Pistes d'implémentation :

- Ajouter un bouton dans les contrôles (à côté du sélecteur de modèle et
  du toggle Réflexion), avec trois états : **auto** (comportement actuel),
  **clair**, **sombre**.
- Déplacer les variables sombres de la media query vers une règle
  `:root[data-theme="dark"]` (et inversement
  `:root[data-theme="light"]`), puis poser l'attribut `data-theme` sur
  `<html>` ou `<body>` selon le choix ; en mode auto, laisser la media
  query s'appliquer.
- Persister le choix dans `chrome.storage.local` (ex. `mistralTheme`),
  le restaurer dans `loadSettings()`, l'appliquer dans `init()`.
- Points d'attention : le panneau latéral est un document distinct de la
  page ; les icônes SVG (chip de contexte) utilisent `currentColor` et
  suivront naturellement ; penser au re-rendu des bulles Markdown (les
  couleurs sont en variables CSS, rien à recalculer).

## 2. Paramétrage de la langue de l'interface

Objectif : permettre de choisir la langue de tous les libellés de
l'extension parmi le français (langue actuelle), l'anglais, l'espagnol,
l'italien, le portugais et l'allemand.

Chaînes concernées (liste non exhaustive, à recenser via
`sidepanel.html` et `sidepanel.js`) :

- libellés des deux modes (Chat, Transcription) et boutons d'action
  (Nouvelle conversation, Historique, Paramètres) ;
- toggles « Réflexion » et « Diarisation », sélecteur de langue de
  transcription, chronomètre ;
- boutons « Copier », « Exporter en Markdown » et leurs états de
  confirmation (« Copié », « Exporté ») ;
- messages système (bienvenue, erreurs, avertissements), dialogues clé
  API, en-tête et métadonnées des transcriptions (« Locuteur N », durée),
  panneau d'historique.

Pistes d'implémentation :

- Deux approches possibles :
  1. `chrome.i18n` (dossier `_locales/` avec `messages.json` par langue,
     clé `default_locale` dans `manifest.json`) — standard Chrome, mais
     lié à la langue du navigateur sauf à passer par `getMessage()`
     explicitement partout ;
  2. dictionnaire JS centralisé (objet `UI_STRINGS` par langue dans un
     fichier dédié chargé avant `sidepanel.js`, ou en tête de
     `sidepanel.js`), avec une fonction `t(key)` — plus simple à câbler
     sur une interface qui construit ses libellés dynamiquement, et sans
     build ; recommandé pour ce dépôt.
- Persister le choix dans `chrome.storage.local` (ex. `mistralUiLang`),
  l'appliquer à l'ouverture et à chaque changement (re-rendu des zones
  statiques de `sidepanel.html` et des messages dynamiques).
- Décision à prendre : le prompt système envoyé au modèle est
  aujourd'hui rédigé en français (consigne « Réponds en français ») ;
  l'adapter à la langue d'interface choisie, ou le laisser indépendant
  (l'utilisateur peut déjà demander une autre langue au modèle).
- Le français reste la langue de référence du dépôt (commits, changelog,
  commentaires).

## Divers — candidats vus dans le CHANGELOG

Sans urgence, listés comme pistes futures si le besoin apparaît :

- Borne de sécurité sur la taille de l'historique de conversation
  (renvoyé intégralement à chaque tour ; cf. limites de la version
  1.3.0).
- Support de la sélection de texte dans les iframes.
- OCR pour les PDF scannés (probablement hors de portée).
