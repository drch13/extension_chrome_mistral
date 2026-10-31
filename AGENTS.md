# AGENTS.md — Web AI Assistant

Extension Chrome (Manifest V3, sans build) : panneau latéral de chat avec les
modèles Mistral et transcription audio (Voxtral). Fichiers principaux :
`sidepanel.js`, `sidepanel.html`, `sidepanel.css`, `background.js`,
`manifest.json`. Valider toute modification JS avec `node --check
sidepanel.js` (pas d'outil de build ni de tests automatisés dans le dépôt).

## Changelog (`CHANGELOG.md`)

- Suivre le standard [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) :
  section `## [Unreleased]` en tête de fichier, puis en-têtes de version
  `## [MAJEURE.MINEURE.PATCH] - AAAA-MM-JJ`, du plus récent au plus ancien,
  préambule en tête de fichier.
- Classer les changements dans les catégories standardisées : `Added`,
  `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Les sections narratives libres sont les bienvenues **en complément** :
  `Contexte et objectif` (le pourquoi, avant les catégories),
  `Fichiers modifiés`, `Comportement` et `Limites connues` (après).

## Versionnement (Semantic Versioning)

- **Les changements s'accumulent sous `[Unreleased]`**, sans numéro ni date,
  tant que la version n'est pas publiée.
- **La publication d'une version est un choix explicite** (fin de journée ou
  jalon atteint), au plus une par date. Elle se fait dans un commit de
  release unique `chore(release): vX.Y.Z` qui :
  1. renomme `[Unreleased]` en `## [X.Y.Z] - AAAA-MM-JJ` (titre descriptif
     libre) et rouvre une section `[Unreleased]` vide en tête de fichier ;
  2. met à jour `"version"` dans `manifest.json` pour coïncider ;
  3. reçoit le tag `vX.Y.Z` juste après le commit, puis le push
     (`git push origin main vX.Y.Z`).
- **Ne jamais tagger avant la coupure** : le tag identifie l'état complet de
  la version, il vit sur le dernier commit de celle-ci.
- L'incrément de la version publiée est le plus élevé déclenché par
  l'ensemble des changements accumulés dans `[Unreleased]` : `PATCH` =
  correctif sans changement d'usage ; `MINOR` = fonctionnalité
  rétrocompatible ; `MAJOR` = casse l'existant (fonctionnalité retirée,
  format de stockage `chrome.storage.local` incompatible, etc.).
- Historique 1.0.0 → 1.7.0 reconstruit rétroactivement le 2026-10-31 (aucun
  tag, le manifeste est resté à `1.0.0`) : la prochaine version publiée doit
  aligner `manifest.json` sur son propre numéro (`1.7.1`, `1.8.0`…
  selon son incrément).

## Commits (Conventional Commits)

- Format : `type(scope optionnel): description courte à l'impératif, en
  français` (ex. `fix(chat): rattacher la sélection à chaque question`).
- Types : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `build`, `ci`, `chore`, `revert`.
- Le corps peut détailler le contexte et la motivation ; les footers
  (`Co-Authored-By`, etc.) sont autorisés.
- Un commit de changement fonctionnel va de pair avec son entrée du
  changelog, documentée sous `[Unreleased]` ; les deux peuvent partager le
  même commit. Le commit de release `chore(release)` est le seul qui ne
  documente pas de changement fonctionnel : il publie, date et tag la
  version.
