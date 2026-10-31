# AGENTS.md — Web AI Assistant

Extension Chrome (Manifest V3, sans build) : panneau latéral de chat avec les
modèles Mistral et transcription audio (Voxtral). Fichiers principaux :
`sidepanel.js`, `sidepanel.html`, `sidepanel.css`, `background.js`,
`manifest.json`. Valider toute modification JS avec `node --check
sidepanel.js` (pas d'outil de build ni de tests automatisés dans le dépôt).

## Changelog (`CHANGELOG.md`)

- Suivre le standard [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/)
  : en-têtes de version `## [MAJEURE.MINEURE.PATCH] - AAAA-MM-JJ`, du plus
  récent au plus ancien, préambule en tête de fichier.
- Classer les changements dans les catégories standardisées : `Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Les sections narratives libres sont les bienvenues **en complément** :
  `Contexte et objectif` (le pourquoi, avant les catégories),
  `Fichiers modifiés`, `Comportement` et `Limites connues` (après).

## Versionnement (Semantic Versioning)

- **Une seule version par date.** Plusieurs changements le même jour sont
  regroupés dans l'entrée du jour ; l'incrément retenu est le plus élevé
  déclenché par l'ensemble des changements du jour.
- Incréments : `PATCH` = correctif sans changement d'usage ; `MINOR` =
  fonctionnalité rétrocompatible ; `MAJOR` = casse l'existant (fonctionnalité
  retirée, format de stockage `chrome.storage.local` incompatible, etc.).
- À chaque version datée : mettre à jour `"version"` dans `manifest.json`
  pour coïncider, et créer un tag git `vX.Y.Z` sur le commit correspondant.
- Historique 1.0.0 → 1.7.0 reconstruit rétroactivement le 2026-10-31
  (aucun tag, le manifeste était resté à `1.0.0`) : aligner le manifeste
  lors du prochain changement fonctionnel.

## Commits (Conventional Commits)

- Format : `type(scope optionnel): description courte à l'impératif, en
  français` (ex. `fix(chat): rattacher la sélection à chaque question`).
- Types : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- Le corps peut détailler le contexte et la motivation ; les footers
  (`Co-Authored-By`, etc.) sont autorisés.
- Un commit de changement fonctionnel va de pair avec son entrée du
  changelog ; les deux peuvent partager le même commit.
