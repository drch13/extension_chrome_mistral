# Changelog — Web AI Assistant

Tous les changements notables de ce projet sont documentés dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le
versionnement suit [Semantic Versioning](https://semver.org/lang/fr/). Les
changements s'accumulent dans la section `[Unreleased]` en tête de fichier ;
lorsqu'une version est publiée (au plus une par date), cette section est
renommée `[MAJEURE.MINEURE.PATCH] - AAAA-MM-JJ` par un commit de release
(`chore(release)`), qui tag le dépôt et aligne `manifest.json`.

Les catégories standardisées (`Added`, `Changed`, `Deprecated`, `Removed`,
`Fixed`, `Security`) décrivent les changements ; elles sont complétées par des
sections narratives libres : `Contexte et objectif` (le pourquoi, en tête
d'entrée), `Fichiers modifiés`, `Comportement` et `Limites connues`.

Historique de versions 1.0.0 → 1.7.0 reconstruit rétroactivement le
2026-10-31 à partir de l'historique git et des entrées datées ; ces versions
n'ont pas de tag git. Le champ `version` de `manifest.json` sera aligné lors
du prochain changement fonctionnel.

---

## [Unreleased]

*(Changements non encore publiés : chaque modification documentée s'accumule
ici, sans numéro ni date. La publication d'une version renomme cette section
en `[X.Y.Z] - AAAA-MM-JJ` via un commit de release, qui porte aussi le tag
git et le bump de `manifest.json`.)*

---

## [1.7.0] - 2026-10-31 — Sélection de texte rattachée à chaque question du Chat

### Contexte et objectif

La sélection de texte de la page était injectée uniquement dans le prompt
système, à un emplacement unique non rattaché à un tour de conversation. Au
premier échange le modèle percevait bien l'extrait, mais dès le deuxième tour
les références déictiques (« ce passage », « cet autre passage »)
devenaient ambiguës : l'extrait du tour précédent disparaissait du prompt et
le bloc « SÉLECTION » courant pouvait être attribué au mauvais tour, conduisant
le modèle à traduire une mauvaise section de la page.

### Added

- Champ `selection` sur chaque message utilisateur (`history.push` dans
  `send()`), capturé à l'envoi et persisté avec la conversation : une
  conversation rechargée conserve les extraits de chaque tour.
- Fonction `addUserMsg()` : la bulle utilisateur affiche un extrait tronqué
  (200 caractères) de la sélection jointe à la question. L'ancienne fonction
  générique `addMsg()`, devenue sans appelant, est supprimée.
- Style `.msg-selection` (`sidepanel.css`) pour cet extrait.
- `pollSelectionOnce()` retourne désormais un statut de fraîcheur ; si la
  vérification de la sélection échoue à l'envoi (onglet inaccessible), un
  message système avertit que l'extrait joint peut être périmé.

### Changed

- L'extrait sélectionné est envoyé au modèle dans le message utilisateur
  lui-même, entre marqueurs `===== EXTRAIT SÉLECTIONNÉ SUR LA PAGE (par
  l'utilisateur, pour cette question) =====`, ce qui rend chaque référence
  déictique non ambiguë, même quand la sélection change en cours de
  conversation.
- `buildMessages()` n'écrit plus de bloc SÉLECTION dans le prompt système ;
  il y explique en revanche le format du marqueur et la priorité à donner à
  l'extrait.
- `renderChat()` rend les messages utilisateur via
  `addUserMsg(m.content, m.selection)`.
- Restructuration de ce CHANGELOG au format Keep a Changelog (versions
  SemVer par date) et ajout d'un fichier `AGENTS.md` fixant les règles de
  contribution.

### Fixed

- Au deuxième tour d'une conversation, l'extrait nouvellement sélectionné
  n'était pas perçu comme rattaché à la nouvelle question : le modèle
  retraduisait la sélection du tour précédent ou une mauvaise section de la
  page.

### Fichiers modifiés

#### `sidepanel.js`
- `addUserMsg()` ajoutée ; `addMsg()` supprimée ;
- `buildMessages()` : consigne sur le marqueur + boucle d'historique
  enrichie par message ;
- `pollSelectionOnce()` : retour d'un statut de fraîcheur ;
- `send()` : capture du statut, `selection` sur le message poussé,
  avertissement si non vérifiable ;
- `renderChat()` : rendu via `addUserMsg(m.content, m.selection)`.

#### `sidepanel.css`
- Bloc `.msg-selection`.

### Limites connues

- Les conversations enregistrées avant cette version n'ont pas de champ
  `selection` : leurs tours passés restent sans extrait (le champ est
  optionnel, rien ne casse).
- Une sélection faite dans une `iframe` reste invisible (injection limitée
  au frame principal).

---

## [1.6.0] - 2026-10-30 — Export Markdown de la transcription et durée explicite

### Contexte et objectif

Le module Transcription ne proposait qu'un bouton « Copier » : la
transcription était copiée dans le presse-papiers, mais aucun fichier n'était
produit. Il était donc fastidieux de reprendre une transcription dans un
document externe (prise de notes, rapport, compte rendu).

Par ailleurs, les métadonnées d'une transcription (en-tête du résultat affiché
et ligne de métadonnées du fichier Markdown exporté) affichaient la durée au
format compact `MM:SS` (ex. « 06:25 »), peu explicite dans un document.

### Added

- **Bouton « Exporter en Markdown »** (`displayTranscription`,
  `sidepanel.js`) : placé à côté du bouton « Copier » dans l'en-tête du
  résultat de transcription (conteneur `.stt-result-actions`). Au clic, la
  transcription affichée est convertie en document Markdown puis téléchargée
  via un lien `<a download>` pointant sur un `Blob` (`text/markdown`), avec un
  nom de fichier horodaté (`transcription-AAAAMMJJ-HHMMSS.md`). Le bouton
  affiche « Exporté » pendant 2 s, comme « Copié » pour le bouton Copier.
- **Mise en forme Markdown** (`buildTranscriptionMarkdown`) : le document
  contient un titre `# Transcription`, une ligne de métadonnées en italique
  (durée, langue, diarisation), puis, quand la diarisation est active et que
  des segments existent, un paragraphe par groupe de locuteurs au format
  `**Locuteur N** : texte`. Sans diarisation, le verbatim brut est repris tel
  quel.
- **Factorisation** : la logique de groupement des segments consécutifs par
  locuteur est extraite dans `groupSegmentsBySpeaker()`, utilisée à la fois par
  le bouton « Copier » (format `[Locuteur N] : texte`) et par l'export
  Markdown — le comportement de « Copier » est inchangé.

### Changed

- Nouvelle fonction `formatDurationLong()` produisant une durée écrite en
  toutes lettres, avec gestion des heures (limite Voxtral : 3 h) et des
  accords au singulier/pluriel : « 06 minutes 25 secondes », « 01 heure 00
  minutes 00 secondes ». Utilisée dans les deux emplacements de
  métadonnées : en-tête du résultat (`displayTranscription`) et métadonnées
  du Markdown exporté (`buildTranscriptionMarkdown`).
- Le chronomètre d'enregistrement en direct et la liste de l'historique
  conservent le format compact `MM:SS` (`formatDuration`), plus lisible dans
  ces contextes.

### Fichiers modifiés

#### `sidepanel.js`
- Nouvelles fonctions `groupSegmentsBySpeaker()`,
  `buildTranscriptionMarkdown()` et `downloadMarkdownFile()`.
- `displayTranscription()` : ajout du bouton « Exporter en Markdown » et du
  conteneur `.stt-result-actions` ; le handler de « Copier » s'appuie
  désormais sur `groupSegmentsBySpeaker()`.
- `formatDurationLong()` ajoutée à côté de `formatDuration()` ; appelée dans
  `displayTranscription()` et `buildTranscriptionMarkdown()`.

#### `sidepanel.css`
- Nouvelle règle `.stt-result-actions` (flex, écart de 6 px) pour aligner
  « Copier » et « Exporter en Markdown » côte à côte. Le bouton d'export
  réutilise le style `.stt-copy-btn` existant.

---

## [1.5.0] - 2026-10-28 — Transcription diarisée : groupement des locuteurs et copie enrichie

### Contexte et objectif

Deux améliorations du module Transcription avec diarisation activée :

1. **Affichage** : quand un même locuteur prononçait plusieurs phrases
   consécutives, l'affichage répétait le badge « Locuteur N » à chaque
   segment (un bloc par phrase). La lecture était hachée.
2. **Copier** : le bouton « Copier » copiait le verbatim brut
   (`result.text`), sans aucune indication de locuteur — inutilisable pour
   reprendre la transcription dans un document externe.

### Changed

1. **Groupement des segments par locuteur** (`displayTranscription`) :
   les segments consécutifs appartenant au même locuteur (même
   `speaker_id`) sont désormais fusionnés en un seul bloc. Le badge
   « Locuteur N » n'apparaît qu'une fois par groupe, et les phrases sont
   concaténées dans le même paragraphe (séparées par un espace). Quand le
   locuteur change, un nouveau bloc est créé. La clé de groupement est
   `speaker_id` quand il est présent, avec repli sur le libellé textuel.
2. **Copie enrichie avec locuteurs** (bouton « Copier ») : quand la
   diarisation est active et que des segments sont présents, le texte copié
   est reconstruit à partir des segments groupés, au format
   `[Locuteur N] : texte`, les groupes étant séparés par une ligne vide
   (`\n\n`). Sans diarisation (ou sans segments), le comportement est
   inchangé : copie du texte brut.

### Fichiers modifiés

#### `sidepanel.js`
- `displayTranscription()` : boucle de rendu des segments remplacée par
  une logique de groupement par locuteur consécutif (suivi de
  `currentSpeakerKey` et `currentTextDiv`).
- `displayTranscription()`, handler du bouton « Copier » : construction
  du texte copié à partir des segments groupés au format
  `[Locuteur N] : …` quand la diarisation est active.

### Comportement

L'affichage diarisée est désormais continue par locuteur :

```
Locuteur 1   Honnêtement, c'est fou.
Locuteur 2   Oui, je vous le confirme. Est-ce qu'on a déjà dépensé…

Locuteur 1   Écoutez, en tout cas, c'est plus de deux fois plus…
```

Le texte copié dans le presse-papiers :

```
[Locuteur 1] : Honnêtement, c'est fou.

[Locuteur 2] : Oui, je vous le confirme. Est-ce qu'on a déjà dépensé…

[Locuteur 1] : Écoutez, en tout cas, c'est plus de deux fois plus…
```

### Limites connues

- Le groupement est strictement consécutif : si le locuteur 1 reprend la
  parole après le locuteur 2, un nouveau bloc « Locuteur 1 » est créé
  (pas de fusion des occurrences non adjacentes).
- Le copier-coller reflète l'état de la diarisation au moment du clic ;
  rouvrir une transcription sauvegardée avec la diarisation désactivée
  copie le texte brut.
- Syntaxe validée par `node --check` ; test manuel dans Chrome recommandé
  (enregistrement avec diarisation, vérification de l'affichage groupé
  et du contenu du presse-papiers).

---

## [1.4.0] - 2026-10-20 — GLM 5.3, Mistral Large 4 et effort de raisonnement explicite

### Contexte et objectif

Le sélecteur de modèle du mode Chat offrait trois modèles : Mistral Small 4,
Mistral Medium 3.5 et GLM 5.2 (`zai-glm-5-2`). La documentation de l'API
Mistral (docs.mistral.ai) fait désormais état de deux changements :

1. **GLM 5.3** remplace GLM 5.2. Identifiant API : `zai-glm-5-3` (également
   servi sous `zai-glm-5` et `zai-glm-latest`). Modèle tiers open weight de
   Z.ai hébergé par Mistral, fenêtre de contexte de 1M de tokens, limite de
   sortie de 128k tokens. Contrairement à GLM 5.2, il **supporte
   `reasoning_effort`**, avec les valeurs `low`, `high` et `max` (pas de
   `none`), et renvoie toujours `message.content` sous forme de liste de
   chunks typés (`thinking` + `text`), y compris sans `reasoning_effort`.
2. **Mistral Large 4** est ajouté comme quatrième modèle. Identifiant API :
   `mistral-large-4-0` (aussi `mistral-large-4`). MoE open weight (1,05T de
   paramètres dont 52B actifs), multimodal, sortie « reasoning, text »,
   supporte `reasoning_effort` (`high` / `none`).

Après l'ajout de ces deux modèles, des tests dans Chrome ont montré qu'ils
produisent une trace de réflexion même quand le toggle « Réflexion » est
décoché. Cause : `streamMistral` n'envoyait `reasoning_effort` que lorsque le
toggle était activé (`"high"`), et omettait totalement le paramètre sinon. Or
ces deux modèles sont à raisonnement natif : omettre le paramètre conserve le
comportement par défaut de l'API, qui inclut un chunk de réflexion. Pour les
couper, il faut demander explicitement `reasoning_effort: "none"` (documenté
pour les modèles Mistral). GLM 5.3 n'accepte pas `none` : `low`/`high`/`max`
sont ses seules valeurs, `low` étant le minimum.

### Added

- `MODEL_LABELS` (`sidepanel.js`) : `mistral-large-4-0` (« Mistral Large 4 »)
  est ajouté.
- `sidepanel.html` : le `<select id="modelSelect">` propose désormais quatre
  options dans l'ordre Small, Medium, Large, GLM.

### Changed

- `MODEL_LABELS` (`sidepanel.js`) : `zai-glm-5-2` est remplacé par
  `zai-glm-5-3` (« GLM 5.3 »).
- `modelSupportsReasoning()` : le toggle « Réflexion » n'est plus désactivé
  pour GLM. GLM 5.3 et Mistral Large 4 documentent tous deux
  `reasoning_effort`. Le mécanisme de désactivation
  (`syncReasoningToggleAvailability`) est conservé mais ne s'active plus
  pour aucun modèle proposé.
- `loadSettings()` : repli sur `mistral-small-latest` si l'identifiant
  persisté dans `chrome.storage.local` n'est plus proposé (typiquement
  `zai-glm-5-2` stocké avant la mise à jour), afin de ne jamais envoyer à
  l'API un identifiant retiré. Auparavant, un identifiant inconnu laissait
  `currentModel` inchangé alors que le sélecteur revenait visuellement au
  premier modèle.
- Un `reasoning_effort` explicite est désormais envoyé à chaque requête,
  calculé par la nouvelle fonction `reasoningEffortFor(model, enabled)` :
  toggle activé → `"high"` (tous les modèles) ; toggle désactivé, modèle
  Mistral (Small, Medium, Large 4) → `"none"`, valeur documentée qui
  supprime le chunk de réflexion ; toggle désactivé, GLM 5.3 → `"low"`,
  l'effort minimal supporté.
- `max_tokens` suit toujours l'état du toggle (8000 avec réflexion, 3000
  sinon). Le comportement de Mistral Small 4 et Medium 3.5 avec le toggle
  éteint passe techniquement de « paramètre omis » à `"none"` explicite :
  valeur documentée pour ces modèles, sans changement observable.
- Le parseur de streaming n'est pas modifié : il gère déjà
  `delta.content` en chaîne (phase texte) et en liste de chunks typés
  (`thinking` / `text`), format que GLM 5.3 renvoie systématiquement,
  réflexion activée ou non.

### Fixed

- Réflexion non coupée sur Mistral Large 4 et GLM 5.3 quand le toggle
  « Réflexion » était décoché : le paramètre `reasoning_effort` omis
  laissait ces modèles à raisonnement natif produire leur chunk de
  réflexion par défaut.

### Fichiers modifiés

#### `sidepanel.js`
- `MODEL_LABELS` : retrait de `zai-glm-5-2`, ajout de `zai-glm-5-3` et
  `mistral-large-4-0`.
- `loadSettings()` : repli sur le modèle par défaut pour un identifiant
  persisté inconnu.
- `modelSupportsReasoning()` : retourne `true` pour les quatre modèles ;
  commentaires mis à jour (valeurs `reasoning_effort` par modèle).
- Nouvelle fonction `reasoningEffortFor()` (après
  `modelSupportsReasoning`) : choisit l'effort selon le modèle et le
  toggle.
- `streamMistral()` : `body.reasoning_effort` est toujours positionné
  (plus jamais omis) via `reasoningEffortFor`.
- Commentaires d'État et d'en-tête mis à jour.

#### `sidepanel.html`
- `#modelSelect` : option `zai-glm-5-2` remplacée par `zai-glm-5-3`,
  option `mistral-large-4-0` ajoutée.

### Comportement

Le sélecteur propose quatre modèles. Le toggle « Réflexion » est désormais
utilisable avec tous, GLM 5.3 compris. Les conversations sauvegardées avec
GLM 5.2 s'ouvrent sans erreur : le libellé retombe sur l'identifiant brut et
le modèle du sélecteur n'est pas changé ; seule la préférence persistée
obsolète est ignorée au démarrage.

### Limites connues

- La réflexion de GLM 5.3 ne peut pas être totalement désactivée (pas de
  `"none"` côté API) : avec le toggle éteint, l'effort `low` minimise la
  trace mais un court chunk `thinking` peut subsister ; il s'affiche dans
  le bloc « Réflexion » repliable, comme prévu.
- `mistral-large-4-0` est en Public Preview côté Mistral ; son identifiant
  ou ses limites peuvent évoluer.
- Syntaxe validée par `node --check` ; à re-tester dans Chrome pour chaque
  modèle avec le toggle allumé puis éteint (sélection de chaque modèle,
  envoi avec et sans réflexion, relecture d'une conversation sauvegardée
  avec GLM 5.2).

---

## [1.3.0] - 2026-10-09 — Contexte porté à 64 000 caractères et correctif de numérotation des listes

### Contexte et objectif

Le texte extrait de l'onglet actif était plafonné à 16 000 caractères, aussi
bien pour les pages HTML (`MAX` dans `extractPageContent`) que pour les PDF
(`PDF_MAX` dans `parsePdfText`). Sur une page ou un article long, le texte
transmis au modèle s'arrêtait donc au milieu d'une phrase — le marqueur
`[…tronqué]` restait visible dans la trace de réflexion — et la fin du
document (conclusion, références) était perdue pour le modèle.

La limite est portée à 64 000 caractères après analyse du compromis
coût/fenêtre : 64 000 caractères de français représentent environ 16 000 à
20 000 tokens, soit ~15 % de la fenêtre de contexte (~128k tokens) des
modèles proposés. Un palier de 128 000 caractères a été envisagé puis écarté :
coût d'entrée multiplié par ~4 à chaque question (le contexte est renvoyé
dans le message système à chaque tour), latence de préfill nettement accrue,
dilution de l'attention du modèle sur du contenu non pertinent (navigation,
pieds de page capturés par le repli sur `document.body`), et marge réduite
pour l'historique de conversation, lui-même non borné.

Par ailleurs, les réponses du modèle contiennent fréquemment des listes
« lâches » : des points numérotés séparés par des lignes vides, chaque point
étant souvent un titre suivi d'un paragraphe. Le rendu affichait alors
« 1. Premier titre … 1. Deuxième titre » au lieu de « 1. Premier titre … 2.
Deuxième titre ». Deux causes se combinent dans `renderMarkdown` :

1. Le numéro littéral écrit par le modèle (capturé par `/^(\d+)\.\s+/` dans
   `ol[1]`) était ignoré : le rendu reposait entièrement sur
   l'auto-numérotation du navigateur, qui compte les `<li>` d'un `<ol>` à
   partir de 1.
2. Toute ligne vide déclenche `closeList()` : la liste est refermée, et le
   `N.` suivant ouvre donc un nouveau `<ol>` dont la numérotation repart à 1.

### Changed

- `extractPageContent()` : `MAX` passe de 16 000 à 64 000 caractères. Le
  marqueur `[…tronqué]` n'est inséré qu'au-delà de cette limite.
- `parsePdfText()` : `PDF_MAX` passe de 16 000 à 64 000 caractères. La boucle
  d'extraction s'arrête toujours dès que la limite est atteinte, le nombre de
  pages réellement parsées reste donc borné par la taille du texte extrait.
- `SELECTION_MAX` (sélection de texte ciblée par l'utilisateur) reste
  inchangé à 8 000 caractères.
- Commentaire d'en-tête de `extractPageContent` mis à jour en conséquence.

### Fixed

- À l'ouverture d'une nouvelle liste ordonnée, si le numéro littéral du
  premier item est supérieur à 1, il est désormais repris via l'attribut
  HTML `start` du `<ol>` (ex. `<ol class="md-ol" start="2">`),
  conformément au comportement GFM des listes lâches. Les listes commençant
  à 1 sont inchangées (aucun attribut ajouté).

### Fichiers modifiés

#### `sidepanel.js`
- `extractPageContent()` : `const MAX = 16000` → `const MAX = 64000`.
- `parsePdfText()` : `const PDF_MAX = 16000` → `const PDF_MAX = 64000`.
- `renderMarkdown()`, bloc de détection des listes ordonnées : ouverture
  conditionnelle `<ol class="md-ol" start="N">` au lieu de
  `<ol class="md-ol">` systématique ; le numéro capturé `ol[1]` n'est plus
  jeté.

### Comportement

Le chip de contexte affiché sous la question peut désormais indiquer jusqu'à
~64 (milliers de caractères capturés). Les pages et PDF courts sont
inchangés ; seuls les documents dépassant 64 000 caractères sont toujours
tronqués, avec le même marqueur explicite.

Une liste « 2. » qui suit une ligne vide ou un paragraphe s'affiche
désormais « 2. ». Une liste compacte commençant à 10 affiche bien 10, 11,
etc. Les listes consécutives sans ligne vide gardent la numérotation continue
du navigateur, comme avant.

### Limites connues

- **Coût par question multiplié par ~4** : le message système embarquant le
  contexte est reconstruit et renvoyé à chaque tour ; une session de 20
  questions sur la même page consomme ~300 à 400k tokens d'entrée rien que
  pour le contexte.
- **Latence** : préfill de ~16-20k tokens avant le premier token, plus
  sensible avec `reasoning_effort: "high"`.
- **Historique non borné** : sur de très longues conversations, c'est
  désormais l'historique (renvoyé intégralement à chaque tour) et non le
  contexte de page qui devient le principal risque de saturation de la
  fenêtre. Aucune borne de sécurité n'a été ajoutée sur l'historique.
- Une liste interrompue par une ligne vide reste visuellement un bloc
  `<ol>` distinct (pas de fusion en une liste unique, ni de gestion des
  items multi-paragraphes indentés). Seule la numérotation est corrigée.
- Les trous de numérotation au sein d'une même liste compacte (ex. « 1. »
  puis « 3. » sans ligne vide) ne sont pas gérés — l'attribut `value` sur
  `<li>` n'est pas utilisé : le navigateur continue séquentiellement.
- Validation : test isolé sous Node sur `renderMarkdown` extraite du
  fichier (liste lâche 1./2./3. avec paragraphes intercalés, liste compacte
  10./11., liste commençant à 1 inchangée), syntaxe validée par
  `node --check` ; test manuel dans Chrome recommandé (page longue, PDF
  long, vérification du chip).

---

## [1.2.0] - 2026-09-27 — Rendu des tableaux Markdown dans les réponses de l'assistant

### Contexte et objectif

Le moteur de rendu Markdown sans dépendance (`renderMarkdown` dans
`sidepanel.js`, ajouté le 2026-09-12) couvrait titres, listes, citations, code,
liens et filets, mais pas les tableaux. Or les modèles répondent fréquemment
avec des tableaux au format GFM (lignes `| Cellule | Cellule |` suivies d'une
ligne séparatrice `|---|---|`) : ces réponses s'affichaient en texte brut,
les pipes et les lignes de séparation restant visibles sans aucune mise en
forme, ce qui rendait les tableaux difficilement lisibles dans le panneau.

L'objectif est de rendre ces tableaux en `<table>` HTML stylé, sans introduire
de dépendance externe (l'alternative étudiée, `marked` + DOMPurify, a été
écartée au profit d'un parseur maison d'environ 60 lignes) et sans ouvrir de
faille XSS : le contenu des cellules doit rester échappé exactement comme le
reste de la sortie du modèle.

### Added

1. **Détection des tableaux GFM**
   Dans la boucle de blocs de `renderMarkdown`, une ligne commençant par `|`
   suivie d'une ligne séparatrice valide (cellules composées uniquement de
   tirets, avec marqueurs d'alignement optionnels `:`) déclenche le rendu en
   tableau. Les lignes suivantes commençant par `|` sont consommées comme
   lignes du corps du tableau. Une ligne `|` orpheline (sans séparateur
   suivant, typiquement en plein streaming) reste du texte de paragraphe :
   aucun bloc n'est ouvert pour rien.

2. **Parseur maison `parseMdTable`**
   Trois fonctions sont ajoutées entre `mdInline` et `renderMarkdown` :
   `splitTableRow` (découpe une ligne en cellules, pipes de bord optionnels,
   pipe échappé `\|` conservé dans sa cellule), `isSeparatorRow` (valide la
   ligne séparatrice) et `parseMdTable` (construit le HTML). Conformément à
   la spécification GFM : les marqueurs `:-` / `:-:` / `-:` produisent un
   alignement gauche / centré / droite (via attribut `style` sur `th` et
   `td`), les lignes ayant moins de cellules que l'en-tête sont complétées
   par des cellules vides, les cellules excédentaires sont ignorées, et les
   lignes entièrement vides sont sautées.

3. **Sécurité inchangée**
   Le contenu de chaque cellule passe par `mdInline`, comme tout le reste :
   le HTML y est échappé avant toute transformation, un `<img onerror=…>`
   produit par le modèle reste donc inoffensif. Le gras, l'italique, les
   liens et le code inline fonctionnent dans les cellules. Un pipe contenu
   dans un code inline (`` `a\|b` ``) ne scinde pas la cellule : le code est
   extrait en placeholder avant le découpage, et le `\|` est restitué en
   pipe nu (`&#124;`), conformément à l'extension tableaux de GFM.

4. **Compatibilité streaming**
   Le rendu étant réappliqué à chaque morceau reçu, le tableau apparaît
   progressivement : en-tête seul = texte brut (comportement précédent),
   en-tête + séparateur = table vide qui se remplit au fil des chunks. Un
   correctif de boucle infinie a été nécessaire : la première implémentation
   excluait toute ligne `|` de la boucle d'accumulation de paragraphe, si
   bien qu'une ligne `|` orpheline n'était consommée par aucune branche et
   figeait le rendu. Le paragraphe ne s'arrête désormais que devant un début
   de tableau *valide* (séparateur présent).

5. **Mise en forme CSS**
   Les styles `.md-table` (bordures `var(--border)`, fond d'en-tête
   identique aux blocs de code, marges cohérentes avec `.md-p`) sont
   ajoutés dans le bloc Markdown de `sidepanel.css`. Le tableau est en
   `display: block` avec `overflow-x: auto` et `width: max-content` plafonné
   à 100 % : les tableaux larges défilent horizontalement dans le panneau
   étroit au lieu de le déformer.

### Fichiers modifiés

#### `sidepanel.js`
- Nouvelles fonctions `splitTableRow`, `isSeparatorRow`, `parseMdTable`
  (entre `mdInline` et `renderMarkdown`).
- `renderMarkdown()` : détection d'un tableau GFM dans la boucle de blocs
  (après le filet horizontal, avant la ligne vide), fermeture de la liste ou
  de la citation en cours, consommation des lignes de corps.
- `renderMarkdown()` : la boucle d'accumulation de paragraphe s'arrête
  désormais devant un début de tableau valide (`isTableStart`) et non plus
  devant toute ligne `|`.
- `mdInline()` : le contenu d'un code inline subit `replace(/\\\|/g,
  "&#124;")` pour que le pipe échappé s'affiche nu (comportement GFM des
  tableaux).

#### `sidepanel.css`
- Ajout des styles `.md-table` (table, `th`, `td` : bordures, padding,
  alignement gauche par défaut, fond d'en-tête `rgba(127,127,127,0.16)`,
  débordement horizontal).

### Comportement

Les tableaux des réponses de l'assistant sont rendus en HTML mis en forme,
aussi bien en streaming qu'à la relecture d'une conversation depuis
l'historique (les deux chemins passent par `renderMarkdown`). Les tableaux
contenus dans des blocs de code (triple backticks) restent du texte brut,
comme avant. Aucune option utilisateur : le rendu est automatique.

### Limites connues

- Pas de fusion de cellules (`colspan` / `rowspan`), non couvert par GFM.
- Une ligne `|` sans séparateur reste du texte brut — c'est voulu (le
  séparateur est ce qui distingue un tableau d'un texte quelconque).
- Le rendu a été validé visuellement dans Chrome par l'utilisateur sur une
  réponse réelle du modèle ; le parseur a par ailleurs été testé isolément
  sous Node sur 18 assertions (tableau simple, alignements, pipes dans code
  inline, échappement HTML d'une injection `<img onerror>`, lignes courtes et
  longues, fallback sans séparateur, états partiels de streaming, contexte
  liste/titre, pipe échappé, ligne vide).

---

## [1.1.1] - 2026-09-14 — Correctif de la diarisation (différenciation des locuteurs)

### Contexte et objectif

En mode Transcription avec diarisation activée, l'affichage montrait
« Locuteur » pour tous les segments, sans jamais différencier les deux
interlocuteurs. Les segments étaient bien présents (le texte était correct),
mais l'étiquette du locuteur restait générique.

### Fixed

Dans `displayTranscription()` (`sidepanel.js`), l'étiquette du locuteur lisait
`seg.speaker`, champ inexistant dans la réponse de l'API Mistral
`/v1/audio/transcriptions`. Celle-ci renvoie en réalité `speaker_id`
(valeurs `speaker_1`, `speaker_2`, …). L'expression `undefined || "Locuteur"`
retombait donc toujours sur le fallback.

La ligne est corrigée pour lire `seg.speaker_id` et afficher directement le
numéro extrait (`speaker_1` → « Locuteur 1 », `speaker_2` → « Locuteur 2 »),
sans décalage d'indexation. Le champ `seg.speaker` est conservé comme fallback
pour les enregistrements déjà sauvegardés dans l'historique (qui ne
contiennent pas `speaker_id`).

### Fichiers modifiés

#### `sidepanel.js`
- `displayTranscription()` : `speaker.textContent = seg.speaker || "Locuteur"`
  remplacé par une expression lisant `seg.speaker_id` avec affichage direct du
  numéro et fallback `seg.speaker`.

### Comportement

Les nouveaux enregistrements diarisés affichent correctement les numéros de
locuteurs distincts. L'historique existant (segments sans `speaker_id`)
continue d'afficher « Locuteur » via le fallback, sans régression.

---

## [1.1.0] - 2026-09-12 — Rendu Markdown des réponses et mode Transcription

### Contexte et objectif

Les réponses du modèle Mistral contiennent fréquemment de la mise en forme
Markdown : passages en **gras**, `code inline`, ```blocs de code```, titres
`##` / `###`, listes à puces ou numérotées, citations, liens, etc. Or
l'extension injectait ces réponses via `textContent`, qui affiche le texte
brut sans interpréter la syntaxe. L'utilisateur voyait donc les délimiteurs
Markdown à l'écran (`**gras**`, `## Titre`, triple backticks…) au lieu d'une
mise en forme. L'objectif est de rendre le Markdown des réponses en HTML mis
en forme, sans introduire de dépendance externe et sans ouvrir de faille XSS
(le contenu provient d'un modèle dont la sortie n'est pas fiable par défaut).

Par ailleurs, l'extension permettait jusqu'à présent de poser des questions à
un modèle de langage Mistral en prenant pour contexte la page web ouverte dans
l'onglet actif. Cette version ajoute une seconde fonctionnalité : la
transcription speech-to-text de l'audio de la vidéo jouée dans l'onglet actif,
en utilisant le modèle Voxtral Mini Transcribe 2 de Mistral, avec option de
diarisation (identification des locuteurs). La clé API Mistral déjà
implémentée pour le chat (stockée dans `chrome.storage.local` sous
`mistralApiKey`) est réutilisée telle quelle pour le endpoint de
transcription — les deux API partagent la même authentification `Bearer`.

### Added

**Rendu Markdown des réponses :**

1. **Moteur de rendu Markdown sans dépendance**
   Une fonction `renderMarkdown(text)` est ajoutée à `sidepanel.js`. Elle
   convertit en HTML un sous-ensemble Markdown couvrant les cas produits
   par les modèles : titres (`#` à `######`), paragraphes, listes à puces
   (`-` / `*`), listes numérotées, citations (`>`), filets horizontaux
   (`---` / `***`), blocs de code délimités par triple backticks, code
   inline (backtick simple), gras (`**` / `__`), italique (`*` / `_`) et
   liens `[texte](https://…)`.

2. **Sécurité : échappement systématique du HTML**
   Tout le texte est passé à `escapeHtml` avant d'appliquer les
   transformations Markdown, sauf à l'intérieur des blocs de code dont le
   contenu est échappé séparément et n'est jamais reformatté. Le modèle ne
   peut donc pas injecter de balises HTML, de `<script>` ou de gestionnaires
   d'événements. Seuls les liens `http(s)` deviennent cliquables ; les
   schémas comme `javascript:` restent du texte brut (la regex des liens
   exige explicitement `https?://`).

3. **Rendu en streaming**
   La fonction `appendAnswer` du chemin de streaming remplace
   `answerEl.textContent = full` par `answerEl.innerHTML =
   renderMarkdown(full)`. Le rendu est réappliqué à chaque morceau reçu,
   de sorte que la mise en forme apparaît et se complète en direct pendant
   la génération de la réponse.

4. **Rendu à la relecture de l'historique**
   `addAssistantBubble(reasoning, answer)` utilise désormais
   `renderMarkdown(answer)` pour la réponse finale. Les conversations
   enregistrées s'affichent donc correctement formatées à la réouverture,
   y compris celles enregistrées avant cette modification (le texte brut
   stocké est rendu à la volée).

5. **Mise en forme CSS des éléments Markdown**
   Le CSS de `sidepanel.css` ajoute les styles des éléments générés :
   titres (tailles dégressives), paragraphes (marges), listes (retrait et
   puces), citations (barre verticale), filets, code inline (fond gris
   léger, police monospace) et blocs de code (fond, débordement
   horizontal, `white-space: pre` pour préserver l'indentation).

**Mode Transcription (speech-to-text avec diarisation) :**

6. **Toggle de mode (Chat / Transcription)**
   Un bouton segmenté en haut du panneau latéral permet de basculer entre
   le mode Chat (questionnement du LLM sur le contenu de la page) et le
   mode Transcription (enregistrement et transcription de l'audio de
   l'onglet). L'état est persisté dans `chrome.storage.local` (clé
   `mistralMode`) et restauré à l'ouverture.

7. **Barre d'outils contextuelle par mode**
   En mode Chat : « Nouvelle conversation », « Historique des
   conversations » et « Paramètres (clé API) ». En mode Transcription :
   « Nouvelle transcription », « Historique des transcriptions » et
   « Paramètres (clé API) ». Les boutons inactifs sont masqués via
   l'attribut `hidden`.

8. **Capture audio de l'onglet via `getDisplayMedia()`**
   L'enregistrement utilise
   `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`,
   déclenché par le clic utilisateur sur « Démarrer ». Une boîte de
   dialogue système permet à l'utilisateur de sélectionner l'onglet à
   partager et de cocher « Partager l'audio ». Les pistes vidéo sont
   immédiatement arrêtées ; seul l'audio est conservé. L'audio continue de
   jouer normalement dans l'onglet pendant l'enregistrement (pas de
   routage AudioContext nécessaire). Cette approche a été choisie après
   l'échec de `chrome.tabCapture.getMediaStreamId()`, qui exige une
   permission `activeTab` temporaire (accordée au moment du clic sur
   l'icône de l'extension, mais expirée au moment du clic sur « Démarrer »
   dans le panneau latéral). `getDisplayMedia` ne dépend que du geste
   utilisateur immédiat.

9. **Enregistrement avec `MediaRecorder`**
   L'audio capturé est enregistré au format `audio/webm;codecs=opus` (ou
   `audio/webm` en repli) par `MediaRecorder`, avec collecte des chunks
   toutes les secondes. Un timer en direct affiche la durée écoulée. La
   limite Voxtral de 3 heures est appliquée comme garde-fou. Si
   l'utilisateur arrête le partage via le contrôle natif de Chrome, le
   recording s'arrête proprement.

10. **Transcription via l'API Mistral**
    Le blob audio est envoyé en `multipart/form-data` au endpoint
    `POST /v1/audio/transcriptions` avec le modèle `voxtral-mini-latest`.
    Quand la diarisation est activée, les paramètres `diarize=true` et
    `timestamp_granularities=["segment"]` sont envoyés (la langue n'est pas
    envoyée dans ce cas, l'API ne permettant pas les deux simultanément).
    Sinon, la langue sélectionnée (si non « auto ») est envoyée via le
    paramètre `language`.

11. **Diarisation**
    Un toggle « Diarisation » (persisté dans `mistralDiarize`) active la
    séparation des locuteurs. Les segments retournés par l'API sont
    affichés avec des étiquettes de locuteur colorées. Sans diarisation,
    seul le texte brut est affiché.

12. **Sélecteur de langue**
    Un sélecteur propose 13 langues supportées par Voxtral (français,
    anglais, espagnol, allemand, italien, portugais, néerlandais, russe,
    arabe, chinois, japonais, coréen, hindi) plus une option « auto »
    (détection automatique). Le choix est persisté dans `mistralSTTLang`.

13. **Affichage des transcriptions**
    Chaque transcription affiche un en-tête avec la durée, la langue
    détectée, le mode (diarisation ou non), et un bouton « Copier ». Le
    contenu est soit une liste de segments avec locuteurs (diarisation),
    soit le texte brut.

14. **Historique des transcriptions séparé**
    Un panneau d'historique dédié (clé de stockage `transcriptions` dans
    `chrome.storage.local`) conserve les transcriptions de manière
    totalement indépendante des conversations chat (clé `conversations`).
    Chaque transcription enregistre : `{ id, title, createdAt, duration,
    language, diarized, text, segments }`. L'utilisateur peut rouvrir,
    supprimer ou tout effacer. La limite est de 200 transcriptions.

### Fixed

- **Attribut `hidden` inefficace** : une règle globale
  `[hidden] { display: none !important; }` a été ajoutée pour garantir que
  l'attribut `hidden` l'emporte sur les classes CSS utilisant
  `display: flex` (`.chat`, `.controls`, `.composer`). Sans cette
  correction, les contrôles et zones des deux modes étaient visibles
  simultanément.

### Fichiers modifiés

#### `manifest.json`
- Ajout de la permission `tabCapture` (nécessaire même si l'approche finale
  utilise `getDisplayMedia`, car le manifeste doit déclarer l'intention de
  capture).
- Mise à jour de la description pour mentionner la transcription audio.

#### `sidepanel.html`
- Ajout d'un toggle de mode segmenté (`.mode-toggle` avec deux boutons
  `data-mode="chat"` et `data-mode="stt"`).
- Séparation de la barre d'outils en deux groupes : `#chatActions`
  (Nouvelle conversation, Historique, Paramètres) et `#sttActions`
  (Nouvelle transcription, Historique des transcriptions, Paramètres).
- Section `#chatControls` (modèle + réflexion) et `#sttControls`
  (diarisation + langue) séparées et basculées par mode.
- Zone `#sttArea` pour l'affichage des transcriptions, parallèle à `#chat`.
- Footer `#sttComposer` avec boutons Démarrer/Arrêter et timer.
- Panneau `#sttHistoryPanel` dédié à l'historique des transcriptions.

#### `sidepanel.css`
- Règle globale `[hidden] { display: none !important; }` pour forcer le
  masquage.
- Styles du toggle de mode (`.mode-toggle`, `.mode-btn`), des boutons
  d'enregistrement (`.record-btn`, `.record-btn.stop`), du timer
  (`.record-timer` avec animation de pulse), du résultat de transcription
  (`.stt-result`, `.stt-result-header`, `.stt-result-meta`,
  `.stt-copy-btn`) et des segments diarisés (`.stt-segments`,
  `.stt-segment`, `.stt-speaker`, `.stt-segment-text`).
- `.answer-content` : remplacement de `white-space: pre-wrap` (hérité de
  `.msg`) par `white-space: normal`, sinon les sauts de ligne du HTML
  généré créeraient des espacements parasites. Ajout de
  `overflow-wrap: break-word`.
- Ajout des styles des éléments Markdown sous `.answer-content` : `.md-p`
  (marges), `.md-h` à `.md-h6` (titres, tailles dégressives de 1.3em à
  1em), `.md-ul` / `.md-ol` (retrait de 22px), `.md-quote` (barre gauche,
  couleur muted), `.md-hr` (filet), `.md-inline-code` (fond gris, police
  monospace), `.md-code` / `.md-code code` (bloc à fond gris, débordement
  horizontal, `white-space: pre`).
- Les styles utilisent `rgba(127,127,127,0.16)` pour les fonds de code, qui
  s'adapte au thème clair comme au thème sombre sans variable
  supplémentaire.

#### `sidepanel.js`
- Nouvelle fonction `mdInline(raw, inlineCodes)` : échappe le HTML, puis
  applique les transformations inline (code, liens, gras, italique). Le
  code inline est extrait sous forme de placeholder réinjecté en fin de
  traitement pour éviter qu'il ne soit reformatté.
- Nouvelle fonction `renderMarkdown(text)` : extrait d'abord les blocs de
  code délimités par triple backticks (contenu échappé, non reformatté),
  puis parcourt les lignes pour détecter titres, citations, listes, filets
  et paragraphes, en appelant `mdInline` pour le contenu inline de chaque
  bloc. Réinjecte enfin les blocs et codes inline stockés.
- `addAssistantBubble(reasoning, answer)` : `answerEl.textContent = answer`
  est remplacé par `if (answer) answerEl.innerHTML =
  renderMarkdown(answer)`.
- `appendAnswer(text)` (streaming) : remplace `answerEl.textContent = full`
  par `answerEl.innerHTML = renderMarkdown(full)`, et le vidage initial
  `answerEl.textContent = ""` par `answerEl.innerHTML = ""`.
- Le bloc de raisonnement (`thinkingContent`) reste en `textContent` :
  la trace de réflexion est volontairement affichée en texte brut, sans
  rendu Markdown.
- Nouvelles constantes : `STT_API_URL`, `STT_MODEL`.
- Nouvel état STT : `currentMode`, `diarizeEnabled`, `transcribeLanguage`,
  `isRecording`, `mediaRecorder`, `audioStream`, `recordedChunks`,
  `recordStartTime`, `recordTimerInterval`, `MAX_RECORD_SECONDS`.
- Nouvel état historique STT : `transcriptions`, `currentTranscriptionId`,
  `MAX_TRANSCRIPTIONS`.
- Nouvelles références DOM pour tous les éléments STT.
- `loadSettings()` étendu pour charger `mistralDiarize`, `mistralSTTLang`,
  `mistralMode`.
- Nouvelle fonction `applyMode()` : bascule la visibilité de tous les
  éléments entre les deux modes.
- Nouvelles fonctions d'enregistrement : `startRecording()`
  (getDisplayMedia + MediaRecorder), `stopRecording()`,
  `handleRecordingStop()`, `cleanupRecording()`, `updateRecordTimer()`,
  `formatDuration()`.
- Nouvelle fonction `transcribeAudio(blob)` : envoie le blob à l'API
  Mistral.
- Nouvelle fonction
  `displayTranscription(result, duration, diarizedOverride)` : affiche le
  résultat avec segments diarisés ou texte brut.
- Nouvelles fonctions d'historique STT : `loadTranscriptions()`,
  `persistTranscriptions()`, `saveTranscription()`,
  `startNewTranscription()`, `openTranscription()`,
  `deleteTranscription()`, `clearAllTranscriptions()`,
  `renderSTTHistoryList()`, `openSTTHistory()`, `closeSTTHistory()`,
  `deriveTranscriptionTitle()`.
- Nouvelles fonctions d'affichage STT : `addSTTMessage()`,
  `addSTTStatus()`, `addSTTError()`, `clearSTTStatusMessages()`.
- `init()` étendu pour appeler `loadTranscriptions()` et afficher le
  message de bienvenue STT.
- Gestion du nettoyage à la fermeture : arrêt du recording et du polling.

#### `background.js`
- Aucune modification finale (le relais de messages `get-stream-id` ajouté
  temporairement pour `tabCapture` a été retiré, l'approche
  `getDisplayMedia` ne nécessitant pas de service worker).

### Comportement

Le mode par défaut est « Chat » (comportement inchangé pour les utilisateurs
existants). Le mode « Transcription » doit être explicitement sélectionné.
Toutes les préférences STT (diarisation, langue, mode) sont persistées entre
les sessions. La clé API est partagée entre les deux modes.

Le rendu Markdown s'applique uniquement aux réponses de l'assistant
(messages `role: "assistant"`). Les messages utilisateur, les messages
système, les messages d'erreur, la trace de réflexion, l'historique des
conversations (titres et métadonnées) et la boîte de sélection restent en
texte brut — c'est volontaire. Aucune option utilisateur n'est ajoutée : la
mise en forme est automatique et transparente.

### Limites connues

- **Boîte de dialogue de partage** : `getDisplayMedia` affiche une boîte de
  dialogue système à chaque démarrage d'enregistrement. L'utilisateur doit
  sélectionner l'onglet et cocher « Partager l'audio ». C'est le prix de la
  simplicité et de la fiabilité (pas de gestion de permission `activeTab`
  temporaire).
- **Format audio** : MediaRecorder produit du `audio/webm`. L'API Mistral
  est supposée accepter ce format, mais cela n'a pas été vérifié
  empiriquement à l'époque.
- **Schéma des segments de diarisation** : le code supposait que les
  segments retournés par l'API contiennent des champs `speaker` et `text`
  (corrigé le 2026-09-14 : l'API renvoie `speaker_id`).
- Le moteur Markdown ne gère pas les tableaux (ajoutés le 2026-09-27), les
  listes de tâches `- [x]`, le surlignage syntaxique coloré des blocs de
  code ni les images `![]()`. Ces cas s'affichent en texte brut sans casser
  la mise en forme.
- Le rendu est réappliqué à chaque token en streaming : pour des réponses
  très longues, cela peut avoir un léger coût de ré-analyse du texte
  cumulé. En pratique, le seuil `max_tokens` (3000 sans réflexion, 8000
  avec) limite la longueur et le coût reste imperceptible.
- Validation de l'époque : syntaxe validée par `node --check` ; le moteur de
  rendu a été testé isolément sous Node sur des échantillons couvrant tous
  les éléments supportés (gras, italique, code inline, blocs de code,
  titres, listes, citations, liens, filets, paragraphes multilignes,
  entrées malveillantes `<script>` / `<img onerror>`, lien `javascript:`).
  Le flux complet STT (getDisplayMedia → MediaRecorder → transcription →
  affichage) n'avait pas été testé dans un navigateur réel à cette date.

---

## [1.0.0] - 2026-08-31 — Publication initiale : assistant de page, réflexion et support PDF

### Contexte et objectif

Première publication de l'extension, construite en trois étapes le même
jour : assistant conversationnel prenant la page active comme contexte, mode
« Réflexion » affichant la chaîne de pensée du modèle, et support des onglets
pointant vers un PDF.

L'extension envoie la question de l'utilisateur au modèle choisi (Mistral
Small 4, Mistral Medium 3.5 ou GLM 5.2) via le endpoint chat-completions de
Mistral. Le mode « Réflexion » donne le choix entre une réponse basique
(par défaut), plus rapide et moins gourmande en tokens, et une réponse avec
raisonnement, où le modèle expose sa réflexion avant de produire la réponse
finale. Ce mode s'appuie sur la fonctionnalité Reasoning de l'API Mistral
(https://docs.mistral.ai/capabilities/reasoning/) : les modèles
`mistral-small-latest` et `mistral-medium-3-5` acceptent un paramètre
`reasoning_effort` (`"high"` / `"none"`) ; en streaming, le flux renvoie des
chunks typés `thinking` (trace de réflexion) puis `text` (réponse finale).

Pour le PDF : quand l'onglet pointe vers un PDF, Chrome l'affiche dans sa
visionneuse intégrée (PDFium) dont le DOM ne contient pas le texte du
document — seulement un élément `<embed>`. L'extraction renvoyait donc une
chaîne vide et l'extension affichait « Aucun contenu de page détecté »,
empêchant toute question sur le contenu d'un article ou document PDF.

### Added

- **Extension de base** : panneau latéral Chrome (side panel), chat avec les
  modèles Mistral hébergés sur La Plateforme, extraction du texte de la page
  active comme contexte (prompt système), clé API stockée dans
  `chrome.storage.local` (jamais codée en dur), historique des
  conversations persisté, sélecteur de modèle (Mistral Small 4, Mistral
  Medium 3.5, GLM 5.2).
- **Toggle « Réflexion » dans l'interface** : un interrupteur on/off dans la
  barre de contrôles, à côté du sélecteur de modèle. L'état est sauvegardé
  dans `chrome.storage.local` (clé `mistralReasoning`) et restauré à
  l'ouverture.
- **Affichage du raisonnement dans un bloc repliable** : quand le mode est
  activé, la trace de réflexion du modèle est affichée en temps réel dans un
  bloc « Réflexion » repliable (élément `<details>`) placé au-dessus de la
  réponse finale.
- **Relecture du raisonnement dans l'historique** : le raisonnement est
  stocké avec la réponse dans l'historique (champ `reasoning`), et réaffiché
  à la réouverture d'une conversation.
- **Gestion de la compatibilité par modèle** : le toggle est automatiquement
  désactivé (grisé) pour `zai-glm-5-2`, qui ne documente pas
  `reasoning_effort`.
- **Détection du PDF via le Content-Type** : si la réponse HTTP de l'onglet
  actif porte `Content-Type: application/pdf`, le PDF est lu par pdf.js
  (Mozilla) et son texte extrait page par page (jusqu'à 16 000 caractères,
  tronqué au-delà). Le texte extrait est injecté dans le contexte système
  envoyé au modèle, comme pour une page HTML.
- **Fetch same-origin dans l'onglet actif (passe l'anti-bot)** : la
  détection et la récupération des octets se font en injectant un
  `fetch(location.href)` dans le contexte de la page via
  `chrome.scripting.executeScript`, plutôt qu'un `fetch` côté extension.
  C'est nécessaire pour les CDN protégés par un défi anti-bot JavaScript
  (typique de ScienceDirect) : un `fetch` émis depuis l'extension est
  cross-origin et flagué comme automatisé, donc le CDN renvoie une page HTML
  « Security verification » au lieu du PDF. En injectant le fetch dans
  l'onglet, la requête est same-origin, porte automatiquement le cookie de
  clearance posé par la navigation de premier niveau, et le CDN sert le vrai
  PDF.
- **Repli en cascade** : (a) fetch injecté dans l'onglet (passe l'anti-bot),
  (b) fetch côté extension avec `credentials: "include"` (pour les PDF non
  protégés), (c) extraction DOM classique (HTML normal). Chaque étape
  échoue silencieusement vers la suivante, les pages HTML normales restent
  donc strictement inchangées.
- **Chip de contexte avec icône SVG** : le glyphe emoji `📄` s'affichait
  comme un caractère de substitution (« _ ») faute de police emoji dans le
  side panel ; il est remplacé par un SVG inline (forme de document plié)
  qui hérite de la couleur via `currentColor`.

### Fichiers modifiés

#### `manifest.json`
- Ajout de `web_accessible_resources` déclarant `vendor/pdf.min.js` et
  `vendor/pdf.worker.min.js` accessibles sur `<all_urls>`, afin que le
  worker pdf.js soit chargeable via `chrome.runtime.getURL()`.

#### `sidepanel.html`
- Chargement de `vendor/pdf.min.js` avant `sidepanel.js` via une balise
  `<script src>`. La build UMD (pdfjs-dist 3.11.174) est utilisée car la
  version 4.x ne livre plus que des modules ES `.mjs`, incompatibles avec
  un `<script src>` classique dans le side panel.
- Ajout d'un élément `<label id="reasoningToggleWrap">` contenant une case
  à cocher `<input id="reasoningToggle">` et un libellé « Réflexion », dans
  la section `.controls`, juste après le sélecteur de modèle.

#### `vendor/` (nouveau dossier)
- `pdf.min.js` (~320 Ko) — build UMD de pdfjs-dist 3.11.174, expose
  `window.pdfjsLib`.
- `pdf.worker.min.js` (~1,1 Mo) — worker de pdf.js, chargé via
  `chrome.runtime.getURL()`.

#### `sidepanel.js`
- Nouvelles références DOM : `reasoningToggle`, `reasoningToggleWrap`.
- Nouvel état : `reasoningEnabled` (booléen), persisté dans
  `chrome.storage.local`.
- Nouvelle fonction `modelSupportsReasoning(model)` : renvoie `true` pour
  `mistral-small-latest` et `mistral-medium-latest`, `false` sinon.
- Nouvelle fonction `syncReasoningToggleAvailability()` : active ou
  désactive le toggle selon le modèle courant et force la case cochée à
  `false` pour les modèles non supportés.
- `loadSettings()` charge désormais `mistralReasoning` et synchronise le
  toggle ; le `change` du sélecteur de modèle appelle
  `syncReasoningToggleAvailability()` ; un écouteur sur le toggle persiste
  son état.
- Nouvelle fonction `addAssistantBubble(reasoning, answer)` : crée une
  bulle assistant avec un bloc `<details>` repliable pour la réflexion et
  un bloc pour la réponse. Utilisée à la fois pour le streaming en direct
  et pour la relecture depuis l'historique.
- `streamMistral(question)` : envoie `reasoning_effort: "high"` quand le
  mode est activé ; monte `max_tokens` à 8000 (au lieu de 3000) dans ce
  cas, car les tokens de raisonnement s'ajoutent au budget de complétion ;
  parse le flux en distinguant `delta.content` chaîne (phase « text »),
  liste de chunks typés (`thinking` / `text`) et fallback
  `delta.reasoning_content` ; renvoie `{ answer, reasoning }`.
- `send()` exploite ce nouvel objet de retour et stocke `reasoning` dans
  l'historique de la conversation.
- Nouvelle constante `PDF_MAX = 16000` (limite de caractères extraits).
- Nouvelle fonction `parsePdfText(arrayBuffer)` : configure le worker
  pdf.js, appelle `getDocument`, itère sur les pages, concatène les items
  de `getTextContent()`, tronque à `PDF_MAX`.
- Nouvelle fonction `fetchPdfTextViaTab(tab)` : injecte un
  `fetch(location.href, { credentials: "same-origin" })` dans l'onglet
  actif, renvoie le `Content-Type` et l'`arrayBuffer`. Si le type est
  `application/pdf`, appelle `parsePdfText` ; sinon renvoie `null`
  (repli). Logs de diagnostic préfixés `[PDF via tab]`.
- Nouvelle fonction `fetchPdfTextViaExtension(url)` : fetch côté extension
  avec `credentials: "include"` et `redirect: "follow"` (repli pour PDF
  non protégés). Renvoie `null` si ce n'est pas un PDF. Logs préfixés
  `[PDF via ext]`.
- `fetchPageContent()` modifiée : avant le chemin DOM existant, tente
  `fetchPdfTextViaTab` puis `fetchPdfTextViaExtension`, chacune dans un
  `try/catch` qui logge l'échec et passe à la suivante.
- `addContextChip(label)` modifiée : remplace l'emoji `📄` par un SVG
  inline suivi d'un `<span>` contenant le texte.

#### `sidepanel.css`
- Ajout du style du toggle (`.reason-toggle`, piste, curseur, états
  checked / disabled), cohérent avec le thème clair et sombre existant.
- Ajout du style du bloc de réflexion (`.thinking-block`,
  `.thinking-content`) et du conteneur de réponse (`.answer-content`).
- `.context-chip` : passage en `display: flex` avec `align-items: center`
  et `gap: 4px`, ajout de `line-height: 1.4` et `flex-shrink: 0`, `padding`
  porté à `4px 7px` pour éviter le rognage par la bulle suivante.
- `.context-chip svg` : `flex-shrink: 0`, `vertical-align: middle`,
  `opacity: 0.8`.
- `.context-chip span` : `overflow: hidden` + `text-overflow: ellipsis` +
  `white-space: nowrap` pour l'ellipsis du texte.

### Comportement

Le mode « Réflexion » est désactivé par défaut ; le choix est mémorisé entre
les sessions. Le modèle `zai-glm-5-2` ne supporte pas `reasoning_effort`
(non documenté à l'époque) : le toggle est désactivé pour ce modèle.

Aucun changement pour les pages HTML : la détection PDF échoue
silencieusement (le `fetch` injecté renvoie un `Content-Type` non-PDF) et
l'extension retombe sur le chemin DOM existant. Le support PDF est
automatique et transparent pour l'utilisateur.

### Limites connues

- **PDF scannés** : les PDF purement image (sans couche texte) donnent un
  texte vide côté pdf.js. Il faudrait de l'OCR, hors de portée de cette
  extension. Les PDF textuels (cas le plus courant, dont l'article
  ScienceDirect testé) sont correctement extraits.
- **Sélection de texte dans un PDF** : la visionneuse PDF interne de Chrome
  n'expose pas `window.getSelection()`, donc la sélection live (preview
  box) ne fonctionne pas pour les onglets PDF. Le `try/catch` existant dans
  `pollSelectionOnce` absorbe l'échec silencieusement.
- **URL S3 signées à courte durée** : la chaîne ne fait qu'un seul GET (pas
  de HEAD préalable) pour ne pas épuiser la validité du lien signé
  (typiquement 5 minutes). Testé et validé sur un article ScienceDirect.
- Validation de l'UI de l'époque : la syntaxe JavaScript a été validée par
  `node --check` ; le flux PDF a été validé sur un PDF réel (article
  ScienceDirect protégé par anti-bot : 9 pages, ~16k caractères extraits,
  réponse du modèle pertinente et spécifique au contenu de l'article). Un
  test manuel du mode Réflexion dans Chrome est recommandé (activation du
  toggle, streaming avec `reasoning_effort="high"`, relecture d'une
  conversation contenant une réflexion).
