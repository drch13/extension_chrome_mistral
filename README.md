# Web AI Assistant

Extension Chrome (Manifest V3) qui ajoute un panneau latéral permettant de :

- **discuter avec les modèles Mistral** au sujet de la page web consultée
  (son texte est envoyé comme contexte au modèle) ;
- **transcrire l'audio de la vidéo** jouée dans l'onglet actif
  (speech-to-text Mistral Voxtral, avec séparation des locuteurs).

> Ce projet est un **projet personnel**. Il n'a **aucun lien officiel avec
> Mistral AI** : il ne s'agit ni d'un produit, ni d'un partenaire de Mistral
> AI. Les noms « Mistral », « La Plateforme », Voxtral et les noms des
> modèles sont la propriété de Mistral AI. L'extension nécessite votre
> propre clé API Mistral et consomme votre quota La Plateforme.

## Principales fonctionnalités

### Mode Chat

- Question sur le contenu de la page active : le texte de la page
  (jusqu'à 64 000 caractères, titre et URL inclus) est transmis au modèle
  dans le prompt système. Les onglets pointant vers un PDF sont
  également pris en charge (extraction via pdf.js, avec contournement des
  CDN protégés par défi anti-bot).
- **Sélection de texte rattachée à chaque question** : sélectionnez un
  passage de la page ; il est joint à la question qui l'accompagne, envoyé
  au modèle entre marqueurs, affiché dans la bulle et conservé avec la
  conversation. Le passage ciblé change d'une question à l'autre sans
  ambiguïté.
- Quatre modèles au choix : Mistral Small 4, Mistral Medium 3.5,
  Mistral Large 4, GLM 5.3.
- Toggle « Réflexion » : affiche la chaîne de pensée du modèle dans un
  bloc repliable avant sa réponse.
- Rendu Markdown des réponses : titres, listes, citations, code, liens et
  tableaux GFM.
- Historique des conversations persistant (200 conversations), avec
  réflexion conservée à la réouverture.

### Mode Transcription

- Capture de l'audio de l'onglet (vidéo YouTube, etc.) via la boîte de
  partage de Chrome, enregistrement en WebM/Opus (limite 3 h).
- Transcription par `voxtral-mini-latest`, avec diarisation optionnelle
  (segments regroupés par locuteur à l'affichage et dans le copier-coller).
- 13 langues au choix ou détection automatique.
- Copie enrichie (`[Locuteur N] : …`) et **export en fichier Markdown**
  horodaté.
- Historique des transcriptions persistant (200 transcriptions), séparé des
  conversations.

Le panneau suit le thème clair ou sombre du système d'exploitation.

## Installation (usage personnel, non publié sur le Chrome Web Store)

1. Récupérez le dossier du projet (clone du dépôt ou téléchargement).
2. Ouvrez `chrome://extensions` dans Chrome.
3. Activez le **Mode développeur** (bouton en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée** et sélectionnez le
   dossier du projet (celui qui contient `manifest.json`).
5. Ouvrez le panneau latéral via l'icône de l'extension, puis cliquez sur
   l'engrenage pour renseigner votre clé API Mistral (créée sur
   [console.mistral.ai](https://console.mistral.ai/)).

Après toute modification des fichiers, rechargez l'extension depuis
`chrome://extensions` (bouton_actualiser) et rouvrez le panneau.

## Données stockées

Toutes les données restent dans le navigateur, dans `chrome.storage.local`
(aucun stockage externe, aucun service tiers d'analytics ou de télémétrie) :

| Clé de stockage | Contenu |
|---|---|
| `mistralApiKey` | Votre clé API Mistral |
| `conversations` | Historique des conversations (questions, réponses, réflexions, sélections jointes) |
| `transcriptions` | Historique des transcriptions (texte, segments, locuteurs, durée) |
| `mistralModel`, `mistralReasoning`, `mistralMode` | Préférences du mode Chat |
| `mistralDiarize`, `mistralSTTLang` | Préférences du mode Transcription |

Désinstaller l'extension supprime toutes ces données du navigateur.

## Appels réseau entrant et sortant

L'extension n'échange qu'avec l'API Mistral, et uniquement lorsque vous
envoyez une question ou une transcription :

- **Sortant** — `POST https://api.mistral.ai/v1/chat/completions` :
  votre question, l'historique de la conversation, le texte de la page
  active et l'éventuel extrait sélectionné. Authentification par votre clé
  API (`Authorization: Bearer …`).
- **Sortant** — `POST https://api.mistral.ai/v1/audio/transcriptions` :
  l'enregistrement audio de l'onglet (multipart/form-data), avec les
  paramètres de diarisation et de langue. Même authentification.
- **Sortant** — `GET` de l'URL d'un onglet suspecté d'être un PDF, pour
  lire son Content-Type et ses octets : soit depuis la page elle-même
  (requête same-origin injectée dans l'onglet, uniquement sur les onglets
  PDF), soit depuis l'extension. Aucune autre page n'est contactée.
- **Entrant** — réponses du modèle en streaming (Server-Sent Events) et
  résultats de transcription.

Conséquences à connaître : le texte des pages consultées et l'audio de
l'onglet transitent vers Mistral AI. La capture audio et l'enregistrement
restent locaux (aucun flux audio sortant autre que le fichier final envoyé
à l'API de transcription, sur votre action).

## Limites connues

- PDF purement scannés (sans couche texte) non supportés : pas d'OCR.
- La sélection de texte ne fonctionne pas dans les pages internes de
  Chrome ni pour une sélection faite dans une iframe.
- Contexte de page tronqué au-delà de 64 000 caractères.

## Organisation du dépôt

- `sidepanel.js`, `sidepanel.html`, `sidepanel.css` — logique et interface
  du panneau latéral (chat et transcription, sans framework ni build).
- `background.js` — service worker minimaliste.
- `vendor/` — pdf.js (build UMD) pour l'extraction de texte des PDF.
- `CHANGELOG.md` — historique des versions (format Keep a Changelog).
- `AGENTS.md` — règles de contribution (changelog, versionnement, commits).
- `HANDOVER.md` — prochaines étapes de développement.
