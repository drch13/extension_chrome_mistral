# Changelog — Web AI Assistant

---

## 2026-09-12 — Ajout du mode Transcription (speech-to-text avec diarisation)

### Contexte et objectif

L'extension permettait jusqu'à présent de poser des questions à un modèle de
langage Mistral en prenant pour contexte la page web ouverte dans l'onglet
actif. L'objectif de cette modification est d'ajouter une seconde
fonctionnalité : la transcription speech-to-text de l'audio de la vidéo jouée
dans l'onglet actif, en utilisant le modèle Voxtral Mini Transcribe 2 de
Mistral, avec option de diarisation (identification des locuteurs).

La clé API Mistral déjà implémentée pour le chat (stockée dans
`chrome.storage.local` sous `mistralApiKey`) est réutilisée telle quelle pour
le endpoint de transcription — les deux API partagent la même
authentification `Bearer`.

### Fonctionnalités apportées

1. **Toggle de mode (Chat / Transcription)**
   Un bouton segmenté en haut du panneau latéral permet de basculer entre le
   mode Chat (questionnement du LLM sur le contenu de la page) et le mode
   Transcription (enregistrement et transcription de l'audio de l'onglet).
   L'état est persisté dans `chrome.storage.local` (clé `mistralMode`) et
   restauré à l'ouverture.

2. **Barre d'outils contextuelle par mode**
   En mode Chat : « Nouvelle conversation », « Historique des conversations »
   et « Paramètres (clé API) ». En mode Transcription : « Nouvelle
   transcription », « Historique des transcriptions » et « Paramètres (clé
   API) ». Les boutons inactifs sont masqués via l'attribut `hidden`.

3. **Capture audio de l'onglet via `getDisplayMedia()`**
   L'enregistrement utilise `navigator.mediaDevices.getDisplayMedia({ video:
   true, audio: true })`, déclenché par le clic utilisateur sur « Démarrer ».
   Une boîte de dialogue système permet à l'utilisateur de sélectionner
   l'onglet à partager et de cocher « Partager l'audio ». Les pistes vidéo
   sont immédiatement arrêtées ; seul l'audio est conservé. L'audio continue
   de jouer normalement dans l'onglet pendant l'enregistrement (pas de
   routage AudioContext nécessaire).

   Cette approche a été choisie après l'échec de `chrome.tabCapture.getMediaStreamId()`,
   qui exige une permission `activeTab` temporaire (accordée au moment du clic
   sur l'icône de l'extension, mais expirée au moment du clic sur « Démarrer »
   dans le panneau latéral). `getDisplayMedia` ne dépend que du geste
   utilisateur immédiat.

4. **Enregistrement avec `MediaRecorder`**
   L'audio capturé est enregistré au format `audio/webm;codecs=opus` (ou
   `audio/webm` en repli) par `MediaRecorder`, avec collecte des chunks
   toutes les secondes. Un timer en direct affiche la durée écoulée. La
   limite Voxtral de 3 heures est appliquée comme garde-fou. Si
   l'utilisateur arrête le partage via le contrôle natif de Chrome, le
   recording s'arrête proprement.

5. **Transcription via l'API Mistral**
   Le blob audio est envoyé en `multipart/form-data` au endpoint
   `POST /v1/audio/transcriptions` avec le modèle `voxtral-mini-latest`.
   Quand la diarisation est activée, les paramètres `diarize=true` et
   `timestamp_granularities=["segment"]` sont envoyés (la langue n'est pas
   envoyée dans ce cas, l'API ne permettant pas les deux simultanément).
   Sinon, la langue sélectionnée (si non « auto ») est envoyée via le
   paramètre `language`.

6. **Diarisation**
   Un toggle « Diarisation » (persisté dans `mistralDiarize`) active la
   séparation des locuteurs. Les segments retournés par l'API (champs
   `speaker` et `text`) sont affichés avec des étiquettes de locuteur
   colorées. Sans diarisation, seul le texte brut est affiché.

7. **Sélecteur de langue**
   Un sélecteur propose 13 langues supportées par Voxtral (français, anglais,
   espagnol, allemand, italien, portugais, néerlandais, russe, arabe, chinois,
   japonais, coréen, hindi) plus une option « auto » (détection automatique).
   Le choix est persisté dans `mistralSTTLang`.

8. **Affichage des transcriptions**
   Chaque transcription affiche un en-tête avec la durée, la langue détectée,
   le mode (diarisation ou non), et un bouton « Copier ». Le contenu est soit
   une liste de segments avec locuteurs (diarisation), soit le texte brut.

9. **Historique des transcriptions séparé**
   Un panneau d'historique dédié (clé de stockage `transcriptions` dans
   `chrome.storage.local`) conserve les transcriptions de manière totalement
   indépendante des conversations chat (clé `conversations`). Chaque
   transcription enregistre : `{ id, title, createdAt, duration, language,
   diarized, text, segments }`. L'utilisateur peut rouvrir, supprimer ou
   tout effacer. La limite est de 200 transcriptions.

10. **Correction CSS de l'attribut `hidden`**
    Une règle globale `[hidden] { display: none !important; }` a été ajoutée
    pour garantir que l'attribut `hidden` l'emporte sur les classes CSS
    utilisant `display: flex` (`.chat`, `.controls`, `.composer`). Sans cette
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
- Séparation de la barre d'outils en deux groupes : `#chatActions` (Nouvelle
  conversation, Historique, Paramètres) et `#sttActions` (Nouvelle
  transcription, Historique des transcriptions, Paramètres).
- Section `#chatControls` (modèle + réflexion) et `#sttControls` (diarisation
  + langue) séparées et basculées par mode.
- Zone `#sttArea` pour l'affichage des transcriptions, parallèle à `#chat`.
- Footer `#sttComposer` avec boutons Démarrer/Arrêter et timer.
- Panneau `#sttHistoryPanel` dédié à l'historique des transcriptions.

#### `sidepanel.css`
- Règle globale `[hidden] { display: none !important; }` pour forcer le masquage.
- Styles du toggle de mode (`.mode-toggle`, `.mode-btn`).
- Styles des boutons d'enregistrement (`.record-btn`, `.record-btn.stop`).
- Styles du timer d'enregistrement (`.record-timer` avec animation de pulse).
- Styles du résultat de transcription (`.stt-result`, `.stt-result-header`,
  `.stt-result-meta`, `.stt-copy-btn`).
- Styles des segments diarisés (`.stt-segments`, `.stt-segment`, `.stt-speaker`,
  `.stt-segment-text`).

#### `sidepanel.js`
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
- Nouvelles fonctions d'enregistrement : `startRecording()` (getDisplayMedia +
  MediaRecorder), `stopRecording()`, `handleRecordingStop()`,
  `cleanupRecording()`, `updateRecordTimer()`, `formatDuration()`.
- Nouvelle fonction `transcribeAudio(blob)` : envoie le blob à l'API Mistral.
- Nouvelle fonction `displayTranscription(result, duration, diarizedOverride)`
  : affiche le résultat avec segments diarisés ou texte brut.
- Nouvelles fonctions d'historique STT : `loadTranscriptions()`,
  `persistTranscriptions()`, `saveTranscription()`,
  `startNewTranscription()`, `openTranscription()`,
  `deleteTranscription()`, `clearAllTranscriptions()`,
  `renderSTTHistoryList()`, `openSTTHistory()`, `closeSTTHistory()`,
  `deriveTranscriptionTitle()`.
- Nouvelles fonctions d'affichage STT : `addSTTMessage()`, `addSTTStatus()`,
  `addSTTError()`, `clearSTTStatusMessages()`.
- `init()` étendu pour appeler `loadTranscriptions()` et afficher le message
  de bienvenue STT.
- Gestion du nettoyage à la fermeture : arrêt du recording et du polling.

#### `background.js`
- Aucune modification finale (le relais de messages `get-stream-id` ajouté
  temporairement pour `tabCapture` a été retiré, l'approche `getDisplayMedia`
  ne nécessitant pas de service worker).

### Comportement par défaut

Le mode par défaut est « Chat » (comportement inchangé pour les utilisateurs
existants). Le mode « Transcription » doit être explicitement sélectionné.
Tous les préférences STT (diarisation, langue, mode) sont persistées entre
les sessions. La clé API est partagée entre les deux modes.

### Limites connues

- **Boîte de dialogue de partage** : `getDisplayMedia` affiche une boîte de
  dialogue système à chaque démarrage d'enregistrement. L'utilisateur doit
  sélectionner l'onglet et cocher « Partager l'audio ». C'est le prix de la
  simplicité et de la fiabilité (pas de gestion de permission `activeTab`
  temporaire).
- **Validation non effectuée dans Chrome réel** : la syntaxe JavaScript a été
  validée par `node --check`, mais le flux complet (getDisplayMedia →
  MediaRecorder → transcription → affichage) n'a pas été testé dans un
  navigateur. Un test manuel est nécessaire.
- **Format audio** : MediaRecorder produit du `audio/webm`. L'API Mistral est
  supposée accepter ce format, mais cela n'a pas été vérifié empiriquement.
- **Schéma des segments de diarisation** : le code suppose que les segments
  retournés par l'API contiennent des champs `speaker` et `text`. Si le
  schéma réel diffère (par ex. `speaker_id`), un ajustement sera nécessaire
  dans `displayTranscription`.
- **Historique non testé** : la persistance et la réouverture des
  transcriptions depuis l'historique n'ont pas été validées dans Chrome.

---

## 2026-09-12 — Rendu Markdown des réponses de l'assistant

### Contexte et objectif

Les réponses du modèle Mistral contiennent fréquemment de la mise en forme
Markdown : passages en **gras**, `code inline`, ```blocs de code```, titres
`##` / `###`, listes à puces ou numérotées, citations, liens, etc. Or
l'extension injectait ces réponses via `textContent`, qui affiche le texte brut
sans interpréter la syntaxe. L'utilisateur voyait donc les délimiteurs
Markdown à l'écran (`**gras**`, `## Titre`, triple backticks…) au lieu d'une
mise en forme.

L'objectif est de rendre le Markdown des réponses de l'assistant en HTML
mis en forme, sans introduire de dépendance externe et sans ouvrir de faille
XSS (le contenu provient d'un modèle dont la sortie n'est pas fiable par
défaut).

### Fonctionnalités apportées

1. **Moteur de rendu Markdown sans dépendance**
   Une fonction `renderMarkdown(text)` est ajoutée à `sidepanel.js`. Elle
   convertit en HTML un sous-ensemble Markdown couvrant les cas produits
   par les modèles : titres (`#` à `######`), paragraphes, listes à puces
   (`-` / `*`), listes numérotées, citations (`>`), filets horizontaux
   (`---` / `***`), blocs de code délimités par triple backticks, code
   inline (backtick simple), gras (`**` / `__`), italique (`*` / `_`),
   et liens `[texte](https://…)`.

2. **Sécurité : échappement systématique du HTML**
   Tout le texte est passé à `escapeHtml` avant d'appliquer les
   transformations Markdown, sauf à l'intérieur des blocs de code dont
   le contenu est échappé séparément et n'est jamais reformatté. Le
   modèle ne peut donc pas injecter de balises HTML, de `<script>` ou de
   gestionnaires d'événements. Seuls les liens `http(s)` deviennent
   cliquables ; les schémas comme `javascript:` restent du texte brut
   (la regex des liens exige explicitement `https?://`).

3. **Rendu en streaming**
   La fonction `appendAnswer` du chemin de streaming remplace
   `answerEl.textContent = full` par `answerEl.innerHTML =
   renderMarkdown(full)`. Le rendu est réappliqué à chaque morceau reçu,
   de sorte que la mise en forme apparaît et se complète en direct
   pendant la génération de la réponse.

4. **Rendu à la relecture de l'historique**
   `addAssistantBubble(reasoning, answer)` utilise désormais
   `renderMarkdown(answer)` pour la réponse finale. Les conversations
   enregistrées s'affichent donc correctement formatées à la réouverture,
   y compris celles enregistrées avant cette modification (le texte brut
   stocké est rendu à la volée).

5. **Mise en forme CSS des éléments Markdown**
   Le CSS de `sidepanel.css` ajoute les styles des éléments générés :
   titres (tailles dégressives), paragraphes (marges), listes
   (retrait et puces), citations (barre verticale), filets, code inline
   (fond gris léger, police monospace) et blocs de code (fond, débordement
   horizontal, `white-space: pre` pour préserver l'indentation).

### Fichiers modifiés

#### `sidepanel.js`
- Nouvelle fonction `mdInline(raw, inlineCodes)` : échappe le HTML, puis
  applique les transformations inline (code, liens, gras, italique). Le
  code inline est extrait sous forme de placeholder réinjecté en fin de
  traitement pour éviter qu'il ne soit reformatté.
- Nouvelle fonction `renderMarkdown(text)` : extrait d'abord les blocs
  de code délimités par triple backticks (contenu échappé, non
  reformatté), puis parcourt les lignes pour détecter titres, citations,
  listes, filets et paragraphes, en appelant `mdInline` pour le contenu
  inline de chaque bloc. Réinjecte enfin les blocs et codes inline
  stockés.
- `addAssistantBubble(reasoning, answer)` : `answerEl.textContent =
  answer` est remplacé par `if (answer) answerEl.innerHTML =
  renderMarkdown(answer)`.
- `appendAnswer(text)` (streaming) : remplace `answerEl.textContent =
  full` par `answerEl.innerHTML = renderMarkdown(full)`, et le vidage
  initial `answerEl.textContent = ""` par `answerEl.innerHTML = ""`.
- Le bloc de raisonnement (`thinkingContent`) reste en `textContent` :
  la trace de réflexion est volontairement affichée en texte brut, sans
  rendu Markdown.

#### `sidepanel.css`
- `.answer-content` : remplacement de `white-space: pre-wrap` (hérité de
  `.msg`) par `white-space: normal`, sinon les sauts de ligne du HTML
  généré créeraient des espacements parasites. Ajout de
  `overflow-wrap: break-word`.
- Ajout des styles des éléments Markdown sous `.answer-content` :
  `.md-p` (marges), `.md-h` à `.md-h6` (titres, tailles dégressives de
  1.3em à 1em), `.md-ul` / `.md-ol` (retrait de 22px), `.md-quote`
  (barre gauche, couleur muted), `.md-hr` (filet), `.md-inline-code`
  (fond gris, police monospace), `.md-code` / `.md-code code` (bloc à
  fond gris, débordement horizontal, `white-space: pre`).
- Les styles utilisent `rgba(127,127,127,0.16)` pour les fonds de code,
  qui s'adapte au thème clair comme au thème sombre sans variable
  supplémentaire.

### Comportement par défaut

Le rendu Markdown s'applique uniquement aux réponses de l'assistant
(messages `role: "assistant"`). Les messages utilisateur, les messages
système, les messages d'erreur, la trace de réflexion, l'historique des
conversations (titres et métadonnées) et la boîte de sélection restent en
texte brut — c'est volontaire. Aucune option utilisateur n'est ajoutée : la
mise en forme est automatique et transparente.

### Limites connues

- Le moteur ne gère pas les tableaux Markdown, les listes de tâches
  `- [x]`, le surlignage syntaxique coloré des blocs de code ni les
  images `![]()`. Ces cas sont rares dans les réponses de cette
  extension ; ils s'affichent en texte brut sans casser la mise en forme.
- Le rendu est réappliqué à chaque token en streaming : pour des
  réponses très longues, cela peut avoir un léger coût de
  ré-analyse du texte cumulé. En pratique, le seuil `max_tokens` (3000
  sans réflexion, 8000 avec) limite la longueur et le coût reste
  imperceptible.
- La validation n'a pas pu être effectuée dans un Chrome réel ici. La
  syntaxe JavaScript a été validée par `node --check`, et le moteur de
  rendu a été testé isolément sur des échantillons couvrant tous les
  éléments supportés (gras, italique, code inline, blocs de code, titres,
  listes, citations, liens, filets, paragraphes multilignes, entrées
  malveillantes `<script>` / `<img onerror>`, lien `javascript:`). Un
  test manuel est recommandé dans le side panel.

---

## 2026-08-31 23:40 — Support des onglets pointant vers un PDF

### Contexte et objectif

Jusqu'à présent, l'extension n'extrait le contenu que des pages HTML classiques :
`extractPageContent` est injecté dans l'onglet actif et lit le texte du DOM
(`document.body.innerText`). Or, quand l'onglet pointe vers un PDF, Chrome
l'affiche dans sa visionneuse intégrée (PDFium) dont le DOM ne contient pas le
texte du document — seulement un élément `<embed>`. L'extraction renvoyait donc
une chaîne vide et l'extension affichait « Aucun contenu de page détecté »,
empêchant toute question sur le contenu d'un article ou document PDF.

L'objectif est de permettre à l'utilisateur de poser une question sur le
contenu d'un PDF affiché dans l'onglet actif, tout en conservant le
comportement actuel pour les pages HTML classiques.

### Fonctionnalités apportées

1. **Détection du PDF via le Content-Type**
   L'extension tente d'abord de récupérer le contenu de l'onglet actif. Si la
   réponse HTTP porte `Content-Type: application/pdf`, le PDF est lu par
   pdf.js (Mozilla) et son texte est extrait page par page (jusqu'à 16 000
   caractères, tronqué au-delà). Le texte extrait est injecté dans le contexte
   système envoyé au modèle, comme pour une page HTML.

2. **Fetch same-origin dans l'onglet actif (passe l'anti-bot)**
   La détection et la récupération des octets se font en injectant un
   `fetch(location.href)` dans le contexte de la page de l'onglet actif via
   `chrome.scripting.executeScript`, plutôt qu'un `fetch` côté extension.
   C'est nécessaire pour les CDN protégés par un défi anti-bot JavaScript
   (typique de ScienceDirect) : un `fetch` émis depuis l'extension
   (origine `chrome-extension://`) est cross-origin et flagué comme
   automatisé, donc le CDN renvoie une page HTML « Security verification »
   au lieu du PDF. En injectant le fetch dans l'onglet, la requête est
   same-origin, porte automatiquement le cookie de clearance posé par la
   navigation de premier niveau, et le CDN sert le vrai PDF. L'`arrayBuffer`
   remonte dans le side panel via le clonage structuré de Chrome.

3. **Repli en cascade**
   La chaîne de récupération est : (a) fetch injecté dans l'onglet (passe
   l'anti-bot), (b) fetch côté extension avec `credentials: "include"`
   (pour les PDF non protégés), (c) extraction DOM classique (HTML normal).
   Chaque étape échoue silencieusement vers la suivante, les pages HTML
   normales restent donc strictement inchangées.

4. **Correction du rendu du chip de contexte**
   Le glyphe emoji `📄` précédemment utilisé dans le chip de contexte
   (« 📄 Titre · N k car. ») s'affichait comme un caractère de substitution
   (« _ ») faute de police emoji dans le side panel. Il est remplacé par un
   SVG inline (forme de document plié) qui hérite de la couleur via
   `currentColor`. Le CSS du chip passe en `display: flex` avec
   `line-height: 1.4` et `flex-shrink: 0` pour éviter que la bulle de
   réponse en dessous ne rogne le chip.

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

#### `vendor/` (nouveau dossier)
- `pdf.min.js` (~320 Ko) — build UMD de pdfjs-dist 3.11.174, expose
  `window.pdfjsLib`.
- `pdf.worker.min.js` (~1,1 Mo) — worker de pdf.js, chargé via
  `chrome.runtime.getURL()`.

#### `sidepanel.js`
- Nouvelle constante `PDF_MAX = 16000` (limite de caractères extraits).
- Nouvelle fonction `parsePdfText(arrayBuffer)` : configure le worker
  pdf.js, appelle `getDocument`, itère sur les pages, concatène les items
  de `getTextContent()`, tronque à `PDF_MAX`.
- Nouvelle fonction `fetchPdfTextViaTab(tab)` : injecte un
  `fetch(location.href, { credentials: "same-origin" })` dans l'onglet
  actif via `chrome.scripting.executeScript`, renvoie le `Content-Type`
  et l'`arrayBuffer`. Si le type est `application/pdf`, appelle
  `parsePdfText` ; sinon renvoie `null` (repli). Logs de diagnostic
  préfixés `[PDF via tab]`.
- Nouvelle fonction `fetchPdfTextViaExtension(url)` : fetch côté
  extension avec `credentials: "include"` et `redirect: "follow"` (repli
  pour PDF non protégés). Renvoie `null` si ce n'est pas un PDF. Logs
  préfixés `[PDF via ext]`.
- `fetchPageContent()` modifiée : avant le chemin DOM existant, tente
  `fetchPdfTextViaTab` puis `fetchPdfTextViaExtension`. Chacune est
  encapsulée dans un `try/catch` qui logge l'échec (`console.warn`) et
  passe à la suivante. Le chemin DOM original est préservé intégralement
  pour les pages HTML.
- `addContextChip(label)` modifiée : remplace l'emoji `📄` par un SVG
  inline (icône de document) suivi d'un `<span>` contenant le texte.

#### `sidepanel.css`
- `.context-chip` : passage en `display: flex` avec `align-items: center`
  et `gap: 4px`, ajout de `line-height: 1.4` et `flex-shrink: 0`,
  `padding` porté à `4px 7px` pour éviter le rognage par la bulle
  suivante.
- `.context-chip svg` : `flex-shrink: 0`, `vertical-align: middle`,
  `opacity: 0.8`.
- `.context-chip span` : `overflow: hidden` + `text-overflow: ellipsis`
  + `white-space: nowrap` pour l'ellipsis du texte.

### Comportement par défaut

Aucun changement utilisateur pour les pages HTML : la détection PDF
échoue silencieusement (le `fetch` injecté renvoie un `Content-Type`
non-PDF) et l'extension retombe sur le chemin DOM existant. Le support
PDF est automatique et transparent pour l'utilisateur.

### Limites connues

- **PDF scannés** : les PDF purement image (sans couche texte) donnent un
  texte vide côté pdf.js. Il faudrait de l'OCR, hors de portée de cette
  extension. Les PDF textuels (cas le plus courant, dont l'article
  ScienceDirect testé) sont correctement extraits.
- **Sélection de texte dans un PDF** : la visionneuse PDF interne de
  Chrome n'expose pas `window.getSelection()`, donc la sélection live
  (preview box) ne fonctionne pas pour les onglets PDF. Le `try/catch`
  existant dans `pollSelectionOnce` absorbe déjà l'échec silencieusement.
- **URL S3 signées à courte durée** : la chaîne ne fait qu'un seul GET
  (pas de HEAD préalable) pour ne pas épuiser la validité du lien signé
  (typiquement 5 minutes). Testé et validé sur un article ScienceDirect.
- La validation a été effectuée sur un PDF réel (article ScienceDirect
  protégé par anti-bot) : 9 pages, ~16k caractères extraits, réponse du
  modèle pertinente et spécifique au contenu de l'article.

---

## 2026-08-31 19:41 — Ajout du mode « Réflexion » (raisonnement du modèle)

### Contexte et objectif

Jusqu'à présent, l'extension envoyait la question de l'utilisateur au modèle
choisi (Mistral Small 4, Mistral Medium 3.5 ou GLM 5.2) via le endpoint
chat-completions de Mistral, sans solliciter le raisonnement du modèle. La
réponse était donc « basique » : pas de trace de réflexion, pas de chaîne de
pensée avant la réponse finale.

L'objectif de cette modification est de donner à l'utilisateur le choix entre :
- une réponse **basique** (comportement actuel, par défaut), plus rapide et
  moins gourmande en tokens ;
- une réponse **avec raisonnement**, où le modèle expose sa réflexion
  (chaîne de pensée) avant de produire la réponse finale. C'est utile pour les
  questions complexes, les calculs, le raisonnement logique ou le code.

Ce mode s'appuie sur la fonctionnalité **Reasoning** de l'API Mistral, décrite
dans la documentation à l'adresse
https://docs.mistral.ai/capabilities/reasoning/. Cette documentation indique
que les modèles `mistral-small-latest` et `mistral-medium-3-5` acceptent un
paramètre `reasoning_effort` (`"high"` / `"none"`) sur le endpoint
chat-completions. En streaming, le flux renvoie des chunks typés :
`thinking` (la trace de réflexion) puis `text` (la réponse finale).

### Fonctionnalités apportées

1. **Toggle « Réflexion » dans l'interface**
   Un interrupteur on/off est ajouté dans la barre de contrôles, à côté du
   sélecteur de modèle. Activé, il demande au modèle de raisonner avant de
   répondre. Désactivé (état par défaut), le comportement reste inchangé.

2. **Persistance du choix**
   L'état du toggle est sauvegardé dans `chrome.storage.local` (clé
   `mistralReasoning`) et restauré à l'ouverture de l'extension.

3. **Affichage du raisonnement dans un bloc repliable**
   Lorsque le mode est activé, la trace de réflexion du modèle est affichée
   en temps réel dans un bloc « Réflexion » repliable (élément `<details>`)
   placé au-dessus de la réponse finale. L'utilisateur peut l'ouvrir ou le
   refermer à volonté. La réponse finale reste affichée en dessous.

4. **Relecture du raisonnement dans l'historique**
   Le raisonnement est stocké avec la réponse dans l'historique des
   conversations (champ `reasoning`). Lorsqu'on rouvre une conversation
   enregistrée, le bloc de réflexion est réaffiché tel quel.

5. **Gestion de la compatibilité par modèle**
   Le paramètre `reasoning_effort` n'est pas documenté pour le modèle
   tiers `zai-glm-5-2`. Le toggle est donc automatiquement désactivé
   (grisé) quand ce modèle est sélectionné, afin d'éviter une erreur de
   l'API. Il est réactivé pour les modèles Mistral qui le supportent.

### Fichiers modifiés

#### `sidepanel.html`
- Ajout d'un élément `<label id="reasoningToggleWrap">` contenant une
  case à cocher `<input id="reasoningToggle">` et un libellé « Réflexion »,
  dans la section `.controls`, juste après le sélecteur de modèle.

#### `sidepanel.css`
- Ajout du style du toggle (`.reason-toggle`, piste, curseur, états
  checked / disabled), cohérent avec le thème clair et sombre existant.
- Ajout du style du bloc de réflexion (`.thinking-block`,
  `.thinking-content`) et du conteneur de réponse (`.answer-content`).

#### `sidepanel.js`
- Nouvelles références DOM : `reasoningToggle`,
  `reasoningToggleWrap`.
- Nouvel état : `reasoningEnabled` (booléen), persisté dans
  `chrome.storage.local`.
- Nouvelle fonction `modelSupportsReasoning(model)` : renvoie `true` pour
  `mistral-small-latest` et `mistral-medium-latest`, `false` sinon.
- Nouvelle fonction `syncReasoningToggleAvailability()` : active ou
  désactive le toggle selon le modèle courant et force la case cochée à
  `false` pour les modèles non supportés.
- `loadSettings()` charge désormais `mistralReasoning` et synchronise le
  toggle.
- Le `change` du sélecteur de modèle appelle
  `syncReasoningToggleAvailability()`.
- Un écouteur sur le toggle persiste son état dans `chrome.storage.local`.
- Nouvelle fonction `addAssistantBubble(reasoning, answer)` : crée une
  bulle assistant avec un bloc `<details>` repliable pour la réflexion et
  un bloc pour la réponse. Utilisée à la fois pour le streaming en direct
  et pour la relecture depuis l'historique.
- `renderChat()` utilise `addAssistantBubble` pour les messages assistant
  (en passant `m.reasoning`), et `addMsg("user", ...)` pour l'utilisateur.
- `streamMistral(question)` a été refondu :
  - envoie `reasoning_effort: "high"` quand le mode est activé ;
  - monte `max_tokens` à 8000 (au lieu de 3000) quand le mode est activé,
    car les tokens de raisonnement s'ajoutent au budget de complétion ;
  - parse le flux streamé en distinguant :
    - `delta.content` de type chaîne → réponse finale (phase « text »),
    - `delta.content` de type liste de chunks → chunks `thinking`
      (trace de réflexion) et chunks `text` (réponse finale),
    - fallback `delta.reasoning_content` pour d'éventuels modèles legacy ;
  - affiche la réflexion en direct dans le bloc repliable, puis la
    réponse finale en dessous ;
  - renvoie désormais `{ answer, reasoning }` au lieu d'une simple chaîne.
- `send()` exploite ce nouvel objet de retour et stocke `reasoning` dans
  l'historique de la conversation.

### Comportement par défaut

Le mode « Réflexion » est **désactivé par défaut**. L'utilisateur retrouve le
comportement précédent (réponse basique sans trace de réflexion) tant qu'il
n'active pas le toggle. Le choix est mémorisé entre les sessions.

### Limite connue

- Le modèle `zai-glm-5-2` ne supporte pas `reasoning_effort` (non documenté).
  Le toggle est désactivé pour ce modèle. Si l'utilisateur veut une réponse
  avec raisonnement, il doit sélectionner Mistral Small 4 ou Mistral Medium 3.5.
- La validation de l'UI n'a pas pu être effectuée dans un Chrome réel ici ;
  la syntaxe JavaScript a été validée par `node --check`. Un test manuel est
  recommandé (activation du toggle, streaming avec `reasoning_effort="high"`,
  relecture d'une conversation contenant une réflexion).
