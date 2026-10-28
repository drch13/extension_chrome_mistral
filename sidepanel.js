// Web AI Assistant — side panel logic.
// Talks to the Mistral La Plateforme chat-completions endpoint.
// The API key lives in chrome.storage.local (never hardcoded).

const API_URL = "https://api.mistral.ai/v1/chat/completions";
const STT_API_URL = "https://api.mistral.ai/v1/audio/transcriptions";
const STT_MODEL = "voxtral-mini-latest";
const MODEL_LABELS = {
  "mistral-small-latest": "Mistral Small 4",
  "mistral-medium-latest": "Mistral Medium 3.5",
  "mistral-large-4-0": "Mistral Large 4",
  "zai-glm-5-3": "GLM 5.3",
};

// Conversation history (kept in memory, scoped to the side-panel session).
let history = []; // messages of the currently open conversation: [{role, content, reasoning?}]
let apiKey = "";
let currentModel = "mistral-small-latest";
let reasoningEnabled = false; // selects the reasoning_effort value (see reasoningEffortFor)
let inFlight = false;
let lastContext = null; // { url, title, text }
let currentSelection = ""; // live text selection from the active tab
let selectionPollTimer = null;

// Persisted conversations (mirrors chrome.storage.local "conversations").
// Array of { id, title, model, createdAt, updatedAt, messages: [{role, content}] }
let conversations = [];
let currentConvId = null; // null when the current view is a fresh, unsaved chat

const MAX_CONVERSATIONS = 200;

// ---- Speech-to-Text state ----
let currentMode = "chat"; // "chat" | "stt"
let diarizeEnabled = false;
let transcribeLanguage = ""; // "" = auto-detect
let isRecording = false;
let mediaRecorder = null;
let audioStream = null;
let audioContext = null; // routes tab audio back to the user's speakers
let recordedChunks = [];
let recordStartTime = 0;
let recordTimerInterval = null;
const MAX_RECORD_SECONDS = 3 * 3600; // Voxtral limit: 3 hours

// ---- STT history state ----
// Array of { id, title, createdAt, duration, language, diarized, text, segments }
let transcriptions = [];
let currentTranscriptionId = null;
const MAX_TRANSCRIPTIONS = 200;

// ---- DOM ----
const chatEl = document.getElementById("chat");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");
const modelSelect = document.getElementById("modelSelect");
const reasoningToggle = document.getElementById("reasoningToggle");
const reasoningToggleWrap = document.getElementById("reasoningToggleWrap");
const settingsBtn = document.getElementById("settingsBtn");
const newChatBtn = document.getElementById("newChatBtn");
const historyBtn = document.getElementById("historyBtn");

const keyDialog = document.getElementById("keyDialog");
const apiKeyInput = document.getElementById("apiKeyInput");
const keyError = document.getElementById("keyError");
const keySave = document.getElementById("keySave");
const keyCancel = document.getElementById("keyCancel");

const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyClose = document.getElementById("historyClose");
const historyClear = document.getElementById("historyClear");

const selectionBox = document.getElementById("selectionBox");
const selectionTextEl = document.getElementById("selectionText");
const selectionClear = document.getElementById("selectionClear");

// ---- STT DOM ----
const modeBtns = document.querySelectorAll(".mode-btn");
const chatActions = document.getElementById("chatActions");
const sttActions = document.getElementById("sttActions");
const chatControls = document.getElementById("chatControls");
const sttControls = document.getElementById("sttControls");
const sttArea = document.getElementById("sttArea");
const chatComposer = document.getElementById("chatComposer");
const sttComposer = document.getElementById("sttComposer");
const diarizeToggle = document.getElementById("diarizeToggle");
const diarizeToggleWrap = document.getElementById("diarizeToggleWrap");
const langSelect = document.getElementById("langSelect");
const recordBtn = document.getElementById("recordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
const recordTimer = document.getElementById("recordTimer");
const newTranscriptionBtn = document.getElementById("newTranscriptionBtn");
const sttHistoryBtn = document.getElementById("sttHistoryBtn");
const sttSettingsBtn = document.getElementById("sttSettingsBtn");
const sttHistoryPanel = document.getElementById("sttHistoryPanel");
const sttHistoryList = document.getElementById("sttHistoryList");
const sttHistoryClose = document.getElementById("sttHistoryClose");
const sttHistoryClear = document.getElementById("sttHistoryClear");

// ---- Helpers ----
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---- Markdown rendering ----
// Minimal, dependency-free Markdown -> HTML for assistant answers. HTML is
// escaped everywhere before any markup is applied, so model output cannot
// inject tags/scripts. Only http(s) links are turned into <a> (javascript:
// and other schemes stay as raw text). Inline code and fenced code blocks are
// extracted first so their contents are never reformatted.
function mdInline(raw, inlineCodes) {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`\n]+)`/g, (_, c) => {
    const idx = inlineCodes.length;
    // GFM table cells: an escaped pipe keeps its cell intact and displays bare.
    inlineCodes.push('<code class="md-inline-code">' + c.replace(/\\\|/g, "&#124;") + "</code>");
    return "\u0000I" + idx + "\u0000";
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[^\w])_([^_\n]+)_([^\w]|$)/g, "$1<em>$2</em>$3");
  return s;
}

// ---- Markdown tables ----
// Split a "|"-delimited row into trimmed cells. Leading/trailing pipes are
// optional; escaped pipes (\|) stay inside their cell.
function splitTableRow(line) {
  let s = line.trim().replace(/\\\|/g, "&#124;");
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

// Parse a GFM table: rows[0] is the header, rows[1] the separator row
// (e.g. |---|:--:|---:|), the rest are body rows. Cell content goes through
// mdInline first (which extracts inline code, so pipes inside `...` do not
// split cells) and is escaped exactly like the rest of the output. Rows with
// fewer cells than the header are padded; extra cells are ignored, per GFM.
function parseMdTable(rows, inlineCodes) {
  const aligns = splitTableRow(rows[1]).map((c) => {
    if (/^:-+:$/.test(c)) return "center";
    if (/^-+:$/.test(c)) return "right";
    if (/^:-+$/.test(c)) return "left";
    return null;
  });
  const headCells = splitTableRow(mdInline(rows[0], inlineCodes));
  const nCols = headCells.length;
  const alignAttr = (idx) =>
    aligns[idx] ? ' style="text-align: ' + aligns[idx] + ';"' : "";
  let out = '<table class="md-table"><thead><tr>';
  headCells.forEach((c, idx) => { out += "<th" + alignAttr(idx) + ">" + c + "</th>"; });
  out += "</tr></thead><tbody>";
  for (let r = 2; r < rows.length; r++) {
    const cells = splitTableRow(mdInline(rows[r], inlineCodes));
    while (cells.length < nCols) cells.push("");
    if (!cells.slice(0, nCols).some((c) => c !== "")) continue;
    out += "<tr>";
    for (let idx = 0; idx < nCols; idx++) {
      out += "<td" + alignAttr(idx) + ">" + cells[idx] + "</td>";
    }
    out += "</tr>";
  }
  return out + "</tbody></table>";
}

function renderMarkdown(text) {
  const codeBlocks = [];
  const inlineCodes = [];

  // Fenced code blocks: extract on raw text, store already-escaped HTML.
  let src = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    const langTrim = lang.trim();
    codeBlocks.push(
      '<pre class="md-code"><code' +
      (langTrim ? ' class="md-lang-' + escapeHtml(langTrim) + '"' : "") +
      ">" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>"
    );
    return "\u0000B" + idx + "\u0000";
  });

  // Block detection runs on raw lines (so '>' blockquotes aren't hidden by
  // escaping); inline content is escaped inside mdInline.
  const lines = src.split("\n");
  const html = [];
  let i = 0;
  let inList = false;
  let listType = null;
  let inQuote = false;
  const closeList = () => { if (inList) { html.push("</" + listType + ">"); inList = false; listType = null; } };
  const closeQuote = () => { if (inQuote) { html.push("</blockquote>"); inQuote = false; } };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\u0000B\d+\u0000$/.test(line.trim())) {
      closeList(); closeQuote();
      html.push(line.trim());
      i++; continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList(); closeQuote();
      const lvl = h[1].length;
      html.push('<h' + lvl + ' class="md-h md-h' + lvl + '">' + mdInline(h[2], inlineCodes) + "</h" + lvl + ">");
      i++; continue;
    }

    const q = line.match(/^>\s?(.*)$/);
    if (q) {
      closeList();
      if (!inQuote) { html.push('<blockquote class="md-quote">'); inQuote = true; }
      html.push(mdInline(q[1], inlineCodes) + "<br>");
      i++; continue;
    }
    closeQuote();

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (!inList || listType !== "ul") { closeList(); html.push('<ul class="md-ul">'); inList = true; listType = "ul"; }
      html.push("<li>" + mdInline(ul[1], inlineCodes) + "</li>");
      i++; continue;
    }

    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      // A blank line closes the list, so a "2." after a paragraph would
      // otherwise restart browser numbering at 1. Honor the model's literal
      // number via the start attribute (matches GFM loose-list behavior).
      if (!inList || listType !== "ol") {
        closeList();
        const startAttr = +ol[1] > 1 ? ` start="${+ol[1]}"` : "";
        html.push(`<ol class="md-ol"${startAttr}>`);
        inList = true; listType = "ol";
      }
      html.push("<li>" + mdInline(ol[2], inlineCodes) + "</li>");
      i++; continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList(); closeQuote();
      html.push('<hr class="md-hr">');
      i++; continue;
    }

    // GFM table: "|"-delimited header row followed by a separator row of
    // dashes (with optional ":" alignment markers).
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      closeList(); closeQuote();
      const rows = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      html.push(parseMdTable(rows, inlineCodes));
      continue;
    }

    if (line.trim() === "") { closeList(); closeQuote(); i++; continue; }

    // Paragraph: stop at any block start, but only at a *valid* table start
    // (a lone "|"-line, e.g. mid-stream, is plain text and must be consumed).
    const isTableStart = (j) =>
      /^\s*\|/.test(lines[j]) && j + 1 < lines.length && isSeparatorRow(lines[j + 1]);
    closeList(); closeQuote();
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" &&
      !/^(#{1,6})\s/.test(lines[i]) && !/^[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i]) && !/^>\s?/.test(lines[i]) &&
      !isTableStart(i) &&
      !/^\u0000B\d+\u0000$/.test(lines[i].trim()) && !/^(-{3,}|\*{3,})\s*$/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      // Soft line breaks within a paragraph become <br>.
      const joined = para.join("\u0000N\u0000");
      html.push('<p class="md-p">' + mdInline(joined, inlineCodes).replace(/\u0000N\u0000/g, "<br>") + "</p>");
    }
  }
  closeList(); closeQuote();

  let out = html.join("\n");
  out = out.replace(/\u0000I(\d+)\u0000/g, (_, n) => inlineCodes[+n]);
  out = out.replace(/\u0000B(\d+)\u0000/g, (_, n) => codeBlocks[+n]);
  return out;
}

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

// Render an assistant bubble, optionally with a collapsible reasoning trace
// shown above the final answer. Returns { root, thinkingEl, answerEl } so the
// streaming path can fill it in incrementally.
function addAssistantBubble(reasoning = "", answer = "") {
  const div = document.createElement("div");
  div.className = "msg ai";

  const thinkingEl = document.createElement("details");
  thinkingEl.className = "thinking-block";
  const summary = document.createElement("summary");
  summary.textContent = "Réflexion";
  const thinkingContent = document.createElement("div");
  thinkingContent.className = "thinking-content";
  thinkingEl.appendChild(summary);
  thinkingEl.appendChild(thinkingContent);
  if (reasoning) {
    thinkingContent.textContent = reasoning;
    thinkingEl.open = false;
  } else {
    thinkingEl.hidden = true;
  }

  const answerEl = document.createElement("div");
  answerEl.className = "answer-content";
  if (answer) answerEl.innerHTML = renderMarkdown(answer);

  div.appendChild(thinkingEl);
  div.appendChild(answerEl);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return { root: div, thinkingEl, thinkingContent, answerEl };
}

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "msg system";
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addError(text) {
  const div = document.createElement("div");
  div.className = "msg error";
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function addContextChip(label) {
  const div = document.createElement("div");
  div.className = "context-chip";
  // Inline SVG instead of the 📄 emoji, which renders as a missing-glyph box
  // ("_") in the side panel's font. The SVG is styled via .context-chip svg.
  div.innerHTML =
    '<svg class="chip-icon" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">' +
    '<path fill="currentColor" d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm7 1.5L18.5 9H13zM8 13h8v1.5H8zm0 3.5h8V18H8z"/>' +
    '</svg>';
  const span = document.createElement("span");
  span.textContent = label;
  div.appendChild(span);
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function setBusy(busy) {
  inFlight = busy;
  sendBtn.disabled = busy;
  promptInput.disabled = false;
}

// ---- Storage ----
async function loadSettings() {
  const data = await chrome.storage.local.get([
    "mistralApiKey", "mistralModel", "mistralReasoning",
    "mistralDiarize", "mistralSTTLang", "mistralMode",
  ]);
  apiKey = data.mistralApiKey || "";
  currentModel = data.mistralModel || "mistral-small-latest";
  // A stored model id may no longer be offered (e.g. zai-glm-5-2 retired)
  // after an update; fall back to the default so requests never reference
  // a model the API would reject.
  if (!MODEL_LABELS[currentModel]) currentModel = "mistral-small-latest";
  reasoningEnabled = !!data.mistralReasoning;
  modelSelect.value = currentModel;
  reasoningToggle.checked = reasoningEnabled;
  syncReasoningToggleAvailability();

  diarizeEnabled = !!data.mistralDiarize;
  diarizeToggle.checked = diarizeEnabled;
  transcribeLanguage = data.mistralSTTLang || "";
  langSelect.value = transcribeLanguage;
  currentMode = data.mistralMode || "chat";
  applyMode();
}

async function saveApiKey(key) {
  apiKey = key.trim();
  await chrome.storage.local.set({ mistralApiKey: apiKey });
}

// reasoning_effort is documented for all four exposed models:
// mistral-small-latest, mistral-medium-latest and mistral-large-4-0 accept
// "high"/"none"; zai-glm-5-3 accepts "low"/"high"/"max" (no "none") and
// always returns content as a list of thinking/text chunks, which the
// streaming parser already handles. The effort value sent for each state
// is decided by reasoningEffortFor below.
function modelSupportsReasoning(model) {
  return model === "mistral-small-latest" ||
    model === "mistral-medium-latest" ||
    model === "mistral-large-4-0" ||
    model === "zai-glm-5-3";
}

// Effort sent to the API for a given model and toggle state. Reasoning-
// native models (mistral-large-4-0, zai-glm-5-3) emit a thinking chunk
// even when reasoning_effort is omitted, so the toggle-off case must be
// explicit: "none" on Mistral models omits the thinking chunk per the
// docs; zai-glm-5-3 has no "none", "low" is the minimum it accepts.
function reasoningEffortFor(model, enabled) {
  if (!modelSupportsReasoning(model)) return null;
  if (enabled) return "high";
  return model === "zai-glm-5-3" ? "low" : "none";
}

function syncReasoningToggleAvailability() {
  const supported = modelSupportsReasoning(currentModel);
  if (!supported) {
    // Force it off visually while disabled so the next send never sends
    // reasoning_effort for an unsupported model.
    reasoningToggle.checked = false;
    reasoningToggleWrap.classList.add("disabled");
    reasoningToggleWrap.title = "Réflexion non disponible pour ce modèle";
  } else {
    reasoningToggle.checked = reasoningEnabled;
    reasoningToggleWrap.classList.remove("disabled");
    reasoningToggleWrap.title = "Afficher le raisonnement du modèle avant la réponse";
  }
}

modelSelect.addEventListener("change", async () => {
  currentModel = modelSelect.value;
  await chrome.storage.local.set({ mistralModel: currentModel });
  syncReasoningToggleAvailability();
});

reasoningToggle.addEventListener("change", async () => {
  reasoningEnabled = reasoningToggle.checked && modelSupportsReasoning(currentModel);
  reasoningToggle.checked = reasoningEnabled;
  await chrome.storage.local.set({ mistralReasoning: reasoningEnabled });
});

// ---- Mode switching (Chat / Transcription) ----
function applyMode() {
  const isSTT = currentMode === "stt";
  modeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });
  chatActions.hidden = isSTT;
  sttActions.hidden = !isSTT;
  chatControls.hidden = isSTT;
  sttControls.hidden = !isSTT;
  chatEl.hidden = isSTT;
  sttArea.hidden = !isSTT;
  chatComposer.hidden = isSTT;
  sttComposer.hidden = !isSTT;

  // Stop selection polling in STT mode (irrelevant, and avoids tab injection).
  if (isSTT) stopSelectionPolling();
  else startSelectionPolling();
}

modeBtns.forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.mode === currentMode) return;
    // Don't switch away while recording is in flight.
    if (isRecording) return;
    currentMode = btn.dataset.mode;
    await chrome.storage.local.set({ mistralMode: currentMode });
    applyMode();
  });
});

// ---- STT settings persistence ----
diarizeToggle.addEventListener("change", async () => {
  diarizeEnabled = diarizeToggle.checked;
  await chrome.storage.local.set({ mistralDiarize: diarizeEnabled });
});

langSelect.addEventListener("change", async () => {
  transcribeLanguage = langSelect.value;
  await chrome.storage.local.set({ mistralSTTLang: transcribeLanguage });
});

// ---- STT helpers ----
function addSTTMessage(text, cls) {
  const div = document.createElement("div");
  div.className = `msg ${cls}`;
  div.textContent = text;
  sttArea.appendChild(div);
  sttArea.scrollTop = sttArea.scrollHeight;
  return div;
}

function addSTTStatus(text) {
  return addSTTMessage(text, "system");
}

function addSTTError(text) {
  return addSTTMessage(text, "error");
}

function clearSTTStatusMessages() {
  sttArea.querySelectorAll(".msg.system, .msg.error").forEach((n) => n.remove());
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updateRecordTimer() {
  const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
  recordTimer.textContent = formatDuration(elapsed);
  if (elapsed >= MAX_RECORD_SECONDS) {
    stopRecording();
    addSTTError("Limite de 3 heures atteinte. Enregistrement arrêté automatiquement.");
  }
}

// ---- Tab audio capture ----
// Uses navigator.mediaDevices.getDisplayMedia() to capture the tab's audio.
// This shows a picker dialog where the user selects the tab to share. Unlike
// chrome.tabCapture.getMediaStreamId(), this works from the side panel
// because it only requires the user gesture from clicking "Démarrer" — no
// activeTab grant timing is involved. The audio continues to play normally
// in the tab while being captured, so no AudioContext routing is needed.
async function startRecording() {
  if (isRecording) return;
  if (!apiKey) {
    openKeyDialog(false);
    return;
  }

  clearSTTStatusMessages();
  addSTTStatus("Sélectionnez l'onglet contenant la vidéo et cochez « Partager l'audio ».");

  try {
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    // We only need the audio track(s).
    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((t) => t.stop());
      throw new Error("no-audio-track");
    }

    // Stop video tracks immediately — we only want audio.
    displayStream.getVideoTracks().forEach((t) => t.stop());

    // Build an audio-only stream for MediaRecorder.
    audioStream = new MediaStream(audioTracks);

    // If the user stops sharing via Chrome's native "Stop sharing" control,
    // stop the recording gracefully.
    audioTracks[0].addEventListener("ended", () => {
      if (isRecording) stopRecording();
    });

    // Set up MediaRecorder.
    recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    mediaRecorder = new MediaRecorder(audioStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = handleRecordingStop;
    mediaRecorder.start(1000); // collect chunks every second

    isRecording = true;
    recordStartTime = Date.now();
    recordTimerInterval = setInterval(updateRecordTimer, 1000);

    // Update UI.
    recordBtn.hidden = true;
    stopRecordBtn.hidden = false;
    recordTimer.hidden = false;
    recordTimer.classList.add("recording");
    recordTimer.textContent = "00:00";

    clearSTTStatusMessages();
    addSTTStatus("Enregistrement en cours… Cliquez sur Arrêter quand vous avez fini.");
  } catch (err) {
    console.error("Recording start failed:", err);
    if (err.name === "NotAllowedError") {
      addSTTError("Partage annulé. Cliquez sur « Démarrer » et choisissez l'onglet contenant la vidéo à transcrire.");
    } else if (err.message === "no-audio-track") {
      addSTTError("Aucune piste audio reçue. Cochez « Partager l'audio de l'onglet » dans la boîte de dialogue de sélection.");
    } else {
      addSTTError("Échec du démarrage de l'enregistrement : " + (err.message || err));
    }
    cleanupRecording();
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  if (recordTimerInterval) {
    clearInterval(recordTimerInterval);
    recordTimerInterval = null;
  }

  recordBtn.hidden = false;
  stopRecordBtn.hidden = true;
  recordTimer.hidden = true;
  recordTimer.classList.remove("recording");

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}

async function handleRecordingStop() {
  const duration = (Date.now() - recordStartTime) / 1000;
  cleanupRecording();

  if (recordedChunks.length === 0) {
    addSTTError("Aucun audio enregistré. Lancez la lecture de la vidéo avant de démarrer l'enregistrement.");
    return;
  }

  const blob = new Blob(recordedChunks, { type: "audio/webm" });
  const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
  console.log(`[STT] Enregistrement : ${duration.toFixed(0)}s, ${sizeMB} MB`);

  if (blob.size < 1000) {
    addSTTError("L'audio enregistré est trop court. Assurez-vous que la vidéo émet du son.");
    return;
  }

  clearSTTStatusMessages();
  addSTTStatus("Transcription en cours…");

  try {
    const result = await transcribeAudio(blob);
    clearSTTStatusMessages();
    displayTranscription(result, duration);
    await saveTranscription(result, duration);
  } catch (err) {
    clearSTTStatusMessages();
    addSTTError("Échec de la transcription : " + (err.message || err));
    console.error(err);
  }
}

function cleanupRecording() {
  if (audioStream) {
    audioStream.getTracks().forEach((t) => t.stop());
    audioStream = null;
  }
  if (audioContext) {
    try { audioContext.close(); } catch (_) {}
    audioContext = null;
  }
  mediaRecorder = null;
}

// ---- Mistral transcription API call ----
// Sends the recorded audio blob as multipart/form-data to the
// /v1/audio/transcriptions endpoint. When diarization is enabled, the
// `diarize` and `timestamp_granularities` parameters are sent; the language
// parameter is omitted in that case (the API does not allow both).
async function transcribeAudio(blob) {
  const formData = new FormData();
  formData.append("model", STT_MODEL);
  formData.append("file", blob, "audio.webm");

  if (diarizeEnabled) {
    formData.append("diarize", "true");
    formData.append("timestamp_granularities", "segment");
  } else if (transcribeLanguage) {
    formData.append("language", transcribeLanguage);
  }

  const res = await fetch(STT_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const err = await res.json();
      if (err && err.message) detail = err.message;
    } catch (_) {}
    if (res.status === 401) {
      addSTTError("Clé API invalide ou expirée. Cliquez sur l'engrenage pour la mettre à jour.");
      openKeyDialog(true);
    }
    throw new Error(detail);
  }

  return await res.json();
}

// ---- Transcription display ----
// `diarizedOverride` is used when re-opening a saved transcription from
// history (the current `diarizeEnabled` state may have changed since).
function displayTranscription(result, duration, diarizedOverride) {
  const showDiarized = diarizedOverride !== undefined ? diarizedOverride : diarizeEnabled;
  const div = document.createElement("div");
  div.className = "stt-result";

  // Header: metadata + copy button.
  const header = document.createElement("div");
  header.className = "stt-result-header";
  const meta = document.createElement("div");
  meta.className = "stt-result-meta";
  const parts = [formatDuration(duration)];
  if (result.language) parts.push(`Langue : ${result.language}`);
  if (showDiarized) parts.push("Diarisation");
  meta.textContent = parts.join(" · ");

  const copyBtn = document.createElement("button");
  copyBtn.className = "stt-copy-btn";
  copyBtn.textContent = "Copier";
  copyBtn.addEventListener("click", () => {
    let copyText = result.text || "";
    if (showDiarized && Array.isArray(result.segments) && result.segments.length > 0) {
      const lines = [];
      let currentKey = null;
      let currentLabel = "";
      let currentText = "";
      for (const seg of result.segments) {
        const label = seg.speaker_id != null
          ? `Locuteur ${parseInt(String(seg.speaker_id).replace(/\D/g, ""), 10)}`
          : (seg.speaker || "Locuteur");
        const key = seg.speaker_id != null ? String(seg.speaker_id) : label;
        const text = (seg.text || "").trim();
        if (key !== currentKey) {
          if (currentKey !== null) lines.push(`[${currentLabel}] : ${currentText}`);
          currentKey = key;
          currentLabel = label;
          currentText = text;
        } else {
          currentText += (currentText ? " " : "") + text;
        }
      }
      if (currentKey !== null) lines.push(`[${currentLabel}] : ${currentText}`);
      copyText = lines.join("\n\n");
    }
    navigator.clipboard.writeText(copyText).then(() => {
      copyBtn.textContent = "Copié";
      copyBtn.classList.add("copied");
      setTimeout(() => {
        copyBtn.textContent = "Copier";
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  });

  header.appendChild(meta);
  header.appendChild(copyBtn);
  div.appendChild(header);

  // Content: diarized segments or plain text.
  if (showDiarized && Array.isArray(result.segments) && result.segments.length > 0) {
    const segContainer = document.createElement("div");
    segContainer.className = "stt-segments";
    let currentSpeakerKey = null;
    let currentTextDiv = null;
    for (const seg of result.segments) {
      const speakerLabel = seg.speaker_id != null
        ? `Locuteur ${parseInt(String(seg.speaker_id).replace(/\D/g, ""), 10)}`
        : (seg.speaker || "Locuteur");
      const speakerKey = seg.speaker_id != null ? String(seg.speaker_id) : speakerLabel;
      const segText = (seg.text || "").trim();
      if (speakerKey !== currentSpeakerKey) {
        currentSpeakerKey = speakerKey;
        const segDiv = document.createElement("div");
        segDiv.className = "stt-segment";
        const speaker = document.createElement("div");
        speaker.className = "stt-speaker";
        speaker.textContent = speakerLabel;
        currentTextDiv = document.createElement("div");
        currentTextDiv.className = "stt-segment-text";
        currentTextDiv.textContent = segText;
        segDiv.appendChild(speaker);
        segDiv.appendChild(currentTextDiv);
        segContainer.appendChild(segDiv);
      } else {
        currentTextDiv.textContent += (currentTextDiv.textContent ? " " : "") + segText;
      }
    }
    div.appendChild(segContainer);
  } else {
    const textDiv = document.createElement("div");
    textDiv.textContent = result.text || "(transcription vide)";
    div.appendChild(textDiv);
  }

  sttArea.appendChild(div);
  sttArea.scrollTop = sttArea.scrollHeight;
}

// ---- STT event wiring ----
recordBtn.addEventListener("click", startRecording);
stopRecordBtn.addEventListener("click", stopRecording);

// ---- STT history persistence ----
function deriveTranscriptionTitle(text) {
  const t = (text || "Transcription").trim();
  return t.length > 48 ? t.slice(0, 48) + "…" : t;
}

async function loadTranscriptions() {
  const data = await chrome.storage.local.get("transcriptions");
  transcriptions = Array.isArray(data.transcriptions) ? data.transcriptions : [];
}

async function persistTranscriptions() {
  transcriptions.sort((a, b) => b.createdAt - a.createdAt);
  if (transcriptions.length > MAX_TRANSCRIPTIONS) {
    transcriptions = transcriptions.slice(0, MAX_TRANSCRIPTIONS);
  }
  await chrome.storage.local.set({ transcriptions });
}

async function saveTranscription(result, duration) {
  const record = {
    id: genId(),
    title: deriveTranscriptionTitle(result.text),
    createdAt: Date.now(),
    duration: duration,
    language: result.language || "",
    diarized: diarizeEnabled,
    text: result.text || "",
    segments: (diarizeEnabled && Array.isArray(result.segments)) ? result.segments : [],
  };
  currentTranscriptionId = record.id;
  transcriptions.unshift(record);
  await persistTranscriptions();
}

function startNewTranscription() {
  currentTranscriptionId = null;
  sttArea.innerHTML = "";
  closeSTTHistory();
  addSTTStatus(
    "Lancez la lecture de la vidéo dans l'onglet actif, puis cliquez sur « Démarrer » pour enregistrer son audio et le transcrire."
  );
}

async function openTranscription(id) {
  const t = transcriptions.find((c) => c.id === id);
  if (!t) return;
  currentTranscriptionId = id;
  sttArea.innerHTML = "";
  // Rebuild the transcription display from stored data.
  displayTranscription(
    { text: t.text, language: t.language, segments: t.segments },
    t.duration,
    t.darized
  );
  closeSTTHistory();
}

async function deleteTranscription(id) {
  transcriptions = transcriptions.filter((c) => c.id !== id);
  if (currentTranscriptionId === id) {
    startNewTranscription();
  }
  await persistTranscriptions();
  renderSTTHistoryList();
}

async function clearAllTranscriptions() {
  transcriptions = [];
  currentTranscriptionId = null;
  startNewTranscription();
  await chrome.storage.local.set({ transcriptions: [] });
  renderSTTHistoryList();
}

function renderSTTHistoryList() {
  sttHistoryList.innerHTML = "";
  if (transcriptions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Aucune transcription enregistrée.";
    sttHistoryList.appendChild(empty);
    return;
  }
  for (const t of transcriptions) {
    const item = document.createElement("div");
    item.className = "history-item" + (t.id === currentTranscriptionId ? " active" : "");
    item.dataset.id = t.id;

    const main = document.createElement("div");
    main.className = "history-item-main";
    const titleEl = document.createElement("div");
    titleEl.className = "history-item-title";
    titleEl.textContent = t.title || "Sans titre";
    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    const metaParts = [fmtDate(t.createdAt), formatDuration(t.duration || 0)];
    if (t.darized) metaParts.push("Diarisation");
    if (t.language) metaParts.push(t.language);
    meta.textContent = metaParts.join(" · ");
    main.appendChild(titleEl);
    main.appendChild(meta);

    const del = document.createElement("button");
    del.className = "history-del";
    del.title = "Supprimer";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteTranscription(t.id);
    });

    item.appendChild(main);
    item.appendChild(del);
    item.addEventListener("click", () => openTranscription(t.id));
    sttHistoryList.appendChild(item);
  }
}

function openSTTHistory() {
  renderSTTHistoryList();
  sttHistoryPanel.hidden = false;
}
function closeSTTHistory() {
  sttHistoryPanel.hidden = true;
}

newTranscriptionBtn.addEventListener("click", startNewTranscription);
sttHistoryBtn.addEventListener("click", openSTTHistory);
sttHistoryClose.addEventListener("click", closeSTTHistory);
sttHistoryClear.addEventListener("click", async () => {
  if (confirm("Supprimer toutes les transcriptions enregistrées ?")) {
    await clearAllTranscriptions();
  }
});
sttSettingsBtn.addEventListener("click", () => openKeyDialog(true));

// ---- Conversation persistence ----
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function deriveTitle(messages) {
  const firstUser = messages.find((m) => m.role === "user");
  const t = (firstUser && firstUser.content || "Nouvelle conversation").trim();
  return t.length > 48 ? t.slice(0, 48) + "…" : t;
}

async function loadConversations() {
  const data = await chrome.storage.local.get("conversations");
  conversations = Array.isArray(data.conversations) ? data.conversations : [];
}

async function persistConversations() {
  // Keep the most recent ones and cap to avoid unbounded growth.
  conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  if (conversations.length > MAX_CONVERSATIONS) {
    conversations = conversations.slice(0, MAX_CONVERSATIONS);
  }
  await chrome.storage.local.set({ conversations });
}

function currentConv() {
  return conversations.find((c) => c.id === currentConvId) || null;
}

// Persist the in-memory `history` into its conversation record (creating one
// on first message). Called after each exchange.
async function syncCurrentConversation() {
  if (history.length === 0) return;
  let conv = currentConv();
  if (!conv) {
    conv = {
      id: genId(),
      title: deriveTitle(history),
      model: currentModel,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: history,
    };
    currentConvId = conv.id;
    conversations.unshift(conv);
  } else {
    conv.messages = history;
    conv.updatedAt = Date.now();
    conv.model = currentModel;
  }
  await persistConversations();
}

// Render the chat area from a conversation's messages.
function renderChat() {
  chatEl.innerHTML = "";
  if (currentConvId === null || history.length === 0) {
    addSystem(currentConvId === null
      ? "Nouvelle conversation. Posez une question sur la page courante."
      : "Posez une question sur la page courante (Mistral répond à partir de son contenu).");
    return;
  }
  for (const m of history) {
    if (m.role === "assistant") {
      addAssistantBubble(m.reasoning || "", m.content);
    } else {
      addMsg("user", m.content);
    }
  }
}

function startNewConversation() {
  currentConvId = null;
  history = [];
  lastContext = null;
  renderChat();
  closeHistory();
  promptInput.focus();
}

async function openConversation(id) {
  const conv = conversations.find((c) => c.id === id);
  if (!conv) return;
  currentConvId = id;
  history = conv.messages.slice(); // copy so edits don't mutate stored array indirectly
  // Reflect that conversation's model in the selector.
  if (MODEL_LABELS[conv.model]) {
    currentModel = conv.model;
    modelSelect.value = conv.model;
  }
  renderChat();
  closeHistory();
  promptInput.focus();
}

async function deleteConversation(id) {
  conversations = conversations.filter((c) => c.id !== id);
  if (currentConvId === id) {
    startNewConversation();
  }
  await persistConversations();
  renderHistoryList();
}

async function clearAllConversations() {
  conversations = [];
  currentConvId = null;
  history = [];
  renderChat();
  await chrome.storage.local.set({ conversations: [] });
  renderHistoryList();
}

function renderHistoryList() {
  historyList.innerHTML = "";
  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "Aucune conversation enregistrée.";
    historyList.appendChild(empty);
    return;
  }
  // Already sorted most-recent first by persistConversations.
  for (const conv of conversations) {
    const item = document.createElement("div");
    item.className = "history-item" + (conv.id === currentConvId ? " active" : "");
    item.dataset.id = conv.id;

    const main = document.createElement("div");
    main.className = "history-item-main";
    const titleEl = document.createElement("div");
    titleEl.className = "history-item-title";
    titleEl.textContent = conv.title || "Sans titre";
    const meta = document.createElement("div");
    meta.className = "history-item-meta";
    const label = MODEL_LABELS[conv.model] || conv.model || "";
    meta.textContent = `${fmtDate(conv.updatedAt)} · ${label} · ${conv.messages.length} msg`;
    main.appendChild(titleEl);
    main.appendChild(meta);

    const del = document.createElement("button");
    del.className = "history-del";
    del.title = "Supprimer";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteConversation(conv.id);
    });

    item.appendChild(main);
    item.appendChild(del);
    item.addEventListener("click", () => openConversation(conv.id));
    historyList.appendChild(item);
  }
}

function openHistory() {
  renderHistoryList();
  historyPanel.hidden = false;
}
function closeHistory() {
  historyPanel.hidden = true;
}

newChatBtn.addEventListener("click", startNewConversation);
historyBtn.addEventListener("click", openHistory);
historyClose.addEventListener("click", closeHistory);
historyClear.addEventListener("click", async () => {
  if (confirm("Supprimer toutes les conversations enregistrées ?")) {
    await clearAllConversations();
  }
});

// ---- API key dialog ----
function openKeyDialog(prefill = true) {
  keyError.hidden = true;
  keyError.textContent = "";
  if (prefill) apiKeyInput.value = apiKey;
  else apiKeyInput.value = "";
  keyDialog.hidden = false;
  apiKeyInput.focus();
}

function closeKeyDialog() {
  keyDialog.hidden = true;
}

keySave.addEventListener("click", async () => {
  const val = apiKeyInput.value.trim();
  if (val.length < 10) {
    keyError.textContent = "La clé paraît trop courte. Vérifiez votre saisie.";
    keyError.hidden = false;
    return;
  }
  await saveApiKey(val);
  closeKeyDialog();
  if (history.length === 0) {
    addSystem("Clé enregistrée. Posez votre première question sur la page courante.");
  }
});

keyCancel.addEventListener("click", closeKeyDialog);

settingsBtn.addEventListener("click", () => openKeyDialog(true));

// ---- Page content extraction ----
// Runs in the active tab's page via chrome.scripting. Returns up to ~64k chars
// of the main readable text so the model can answer "about this page".
function extractPageContent() {
  // Executed in the page context (no access to chrome.* APIs here).
  const title = document.title || "";
  const url = location.href;

  // Work on a CLONE so we never mutate the real page DOM the user is viewing.
  function cleanText(rootEl) {
    if (!rootEl) return "";
    const clone = rootEl.cloneNode(true);
    clone.querySelectorAll(
      "script, style, noscript, iframe, svg, canvas, template"
    ).forEach((n) => n.remove());
    return (clone.innerText || clone.textContent || "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  // Try the most specific containers first, then fall back to <body>.
  let text =
    cleanText(document.querySelector("article")) ||
    cleanText(document.querySelector("main")) ||
    cleanText(document.querySelector('[role="main"]')) ||
    cleanText(document.body);

  const MAX = 64000;
  if (text.length > MAX) text = text.slice(0, MAX) + "\n[…tronqué]";
  return { title, url, text };
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- PDF support ----
// When the active tab points to a PDF (Content-Type: application/pdf), the DOM
// exposed by Chrome's built-in viewer is essentially empty, so extractPageContent
// returns nothing. We instead fetch the bytes and parse the text layer with
// pdf.js. The HTML path below stays unchanged for normal pages.
const PDF_MAX = 64000;

// Parse a PDF ArrayBuffer into up to PDF_MAX chars of text, using pdf.js loaded
// in the side panel. Shared by both fetch paths below.
async function parsePdfText(arrayBuffer) {
  const pdfjsLib = window.pdfjsLib;
  if (!pdfjsLib) throw new Error("pdf.js non chargé");
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    chrome.runtime.getURL("vendor/pdf.worker.min.js");

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log("[PDF] parsé,", pdf.numPages, "page(s)");

  let text = "";
  for (let i = 1; i <= pdf.numPages && text.length < PDF_MAX; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n\n";
  }
  if (text.length > PDF_MAX) text = text.slice(0, PDF_MAX) + "\n[…tronqué]";
  return text;
}

// Fetch the PDF bytes FROM THE ACTIVE TAB'S PAGE CONTEXT (same-origin with the
// PDF host). This is the key trick for bot-protected CDNs (e.g. ScienceDirect):
// a fetch issued by the extension is cross-origin and flagged as automated, so
// the CDN returns a "Security verification" JS challenge page instead of the
// PDF. But the browser already passed that challenge during the tab's top-level
// navigation (it executed the challenge JS, got a clearance cookie, reloaded).
// A fetch injected into the tab is same-origin, carries that clearance cookie
// automatically, and presents Sec-Fetch-Site: same-origin — so the CDN serves
// the real PDF bytes. We then parse them with pdf.js in the side panel.
//
// Returns the extracted text if the tab serves a PDF, or `null` if it's not a
// PDF (caller falls back to the DOM path). Throws on injection/parse failure.
async function fetchPdfTextViaTab(tab) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      const res = await fetch(location.href, { credentials: "same-origin" });
      const ct = res.headers.get("content-type") || "";
      const buf = await res.arrayBuffer();
      return { ct, buf };
    },
  });
  if (!result) return null;
  const ct = (result.ct || "").toLowerCase();
  console.log("[PDF via tab] HTTP", "(in-page)", "Content-Type:", ct || "(absent)", "octets:", result.buf?.byteLength);
  if (!ct.includes("application/pdf")) {
    console.log("[PDF via tab] pas un PDF -> repli");
    return null;
  }
  return await parsePdfText(result.buf);
}

// Fallback: fetch the PDF bytes from the extension's side-panel context. This
// works for plain (unprotected) PDF URLs, but bot-protected CDNs will return an
// HTML challenge page here (see fetchPdfTextViaTab for why). credentials:
// "include" sends the browser's cookies for the host; allowed because
// host_permissions includes <all_urls>. We use GET (not HEAD) because many PDF
// URLs are AWS S3 signed URLs whose SigV4 signature is bound to the HTTP method.
//
// Returns the extracted text if the URL serves a PDF, or `null` if it's not a
// PDF. Throws on network/parse failure.
async function fetchPdfTextViaExtension(url) {
  const res = await fetch(url, { redirect: "follow", credentials: "include" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  console.log("[PDF via ext] HTTP", res.status, "Content-Type:", ct || "(absent)");
  if (!ct.includes("application/pdf")) {
    let snippet = "";
    try {
      snippet = (await res.clone().text()).slice(0, 200).replace(/\s+/g, " ");
    } catch (_) {}
    console.log("[PDF via ext] pas un PDF. Extrait:", snippet);
    return null;
  }
  const data = await res.arrayBuffer();
  return await parsePdfText(data);
}

async function fetchPageContent() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return null;
  if (/^(chrome|edge|about|chrome-extension):/i.test(tab.url || "")) {
    // Cannot inject into internal pages.
    return { url: tab.url, title: tab.title, text: "" };
  }

  // PDF branch. Try the in-tab (same-origin) fetch first: it passes bot
  // protection that blocks the extension's cross-origin fetch. If injection
  // fails (e.g. the built-in PDF viewer is not injectable) or the response
  // isn't a PDF, fall back to the extension-side fetch, then to the DOM path.
  try {
    const pdfText = await fetchPdfTextViaTab(tab);
    if (pdfText !== null) {
      return { url: tab.url, title: tab.title || "Document PDF", text: pdfText };
    }
  } catch (err) {
    console.warn("[PDF via tab] échec injection:", err.message);
  }
  try {
    const pdfText = await fetchPdfTextViaExtension(tab.url);
    if (pdfText !== null) {
      return { url: tab.url, title: tab.title || "Document PDF", text: pdfText };
    }
  } catch (err) {
    console.warn("[PDF via ext] échec:", err.message);
  }

  async function run() {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContent,
    });
    return result;
  }

  // SPAs (Next.js, React…) change the URL instantly but render content async.
  // Retry a few times if the extracted text is suspiciously thin.
  try {
    let result = await run();
    const MIN = 200;
    for (let i = 0; i < 3 && (!result || result.text.length < MIN); i++) {
      await sleep(450);
      result = await run();
    }
    return result;
  } catch (err) {
    console.warn("extract failed:", err);
    return { url: tab.url, title: tab.title, text: "" };
  }
}

// ---- Live text selection from the active tab ----
// The side panel and the page are separate documents, so the panel cannot see
// window.getSelection() of the page directly. We poll the active tab's
// selection periodically (only while the panel is open) and mirror it in a
// preview box above the prompt. Polling (vs. an injected listener) follows tab
// switches and reloads automatically without re-injection bookkeeping.
const SELECTION_MAX = 8000;
const SELECTION_PREVIEW = 150;

function updateSelectionBox(text) {
  currentSelection = (text || "").slice(0, SELECTION_MAX);
  if (currentSelection) {
    const preview = currentSelection.length > SELECTION_PREVIEW
      ? currentSelection.slice(0, SELECTION_PREVIEW) + "…"
      : currentSelection;
    selectionTextEl.textContent = preview;
    selectionBox.hidden = false;
  } else {
    selectionTextEl.textContent = "";
    selectionBox.hidden = true;
  }
}

async function pollSelectionOnce() {
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  if (/^(chrome|edge|about|chrome-extension|file):/i.test(tab.url || "")) {
    updateSelectionBox("");
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection().toString(),
    });
    updateSelectionBox(result || "");
  } catch (err) {
    // No access to this tab (e.g. restricted page): leave the box as-is.
  }
}

function startSelectionPolling() {
  if (selectionPollTimer) return;
  pollSelectionOnce();
  selectionPollTimer = setInterval(pollSelectionOnce, 500);
}

function stopSelectionPolling() {
  if (selectionPollTimer) {
    clearInterval(selectionPollTimer);
    selectionPollTimer = null;
  }
}

// Clear button: remove the actual selection in the page so the next poll keeps
// the box hidden, then hide locally for immediate feedback.
selectionClear.addEventListener("click", async () => {
  updateSelectionBox("");
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;
  if (/^(chrome|edge|about|chrome-extension|file):/i.test(tab.url || "")) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { const s = window.getSelection(); if (s) s.removeAllRanges(); },
    });
  } catch (err) {
    // Ignore: box is already hidden locally.
  }
});

// ---- Mistral call (streamed) ----
// Builds the message array from the system prompt + the page context + the
// conversation history. The latest user question is already in `history`
// (pushed by send() before calling), so it must NOT be appended again here.
function buildMessages() {
  let sysContent =
    "Tu es un assistant qui aide l'utilisateur à comprendre le contenu d'une page web ou d'une page de résultats de recherche. " +
    "Réponds en français, de façon claire et concise. " +
    "Base-toi principalement sur le contenu fourni ci-dessous (page courante). " +
    "Si l'information n'est pas présente, dis-le et réponds à partir de tes connaissances générales en le précisant.";

  if (currentSelection) {
    sysContent +=
      "\n\nL'utilisateur a sélectionné une zone de texte précise sur la page. " +
      "Ta réponse doit porter prioritairement sur cette sélection ; utilise le reste du contenu de la page comme contexte pour l'expliquer ou la préciser.";
    sysContent +=
      "\n\n===== SÉLECTION DE L'UTILISATEUR (zone ciblée) =====\n" +
      "--------------------------------------\n" +
      `${currentSelection}\n` +
      "======================================";
  }

  if (lastContext && lastContext.text) {
    sysContent +=
      "\n\n" +
      `===== CONTENU DE LA PAGE COURANTE =====\n` +
      `Titre : ${lastContext.title || "(sans titre)"}\n` +
      `URL : ${lastContext.url || "(inconnue)"}\n` +
      `--------------------------------------\n` +
      `${lastContext.text}\n` +
      `======================================`;
  }

  const msgs = [{ role: "system", content: sysContent }];
  for (const m of history) msgs.push({ role: m.role, content: m.content });
  return msgs;
}

async function streamMistral(question) {
  const effort = reasoningEffortFor(currentModel, reasoningEnabled);
  const useReasoning = effort === "high";
  const body = {
    model: currentModel,
    messages: buildMessages(),
    stream: true,
    temperature: 0.3,
    // Reasoning tokens are produced before the answer and count toward the
    // completion budget, so give some headroom when enabled.
    max_tokens: useReasoning ? 8000 : 3000,
  };
  // Always send an explicit effort: reasoning-native models (mistral-large-4-0,
  // zai-glm-5-3) produce a thinking chunk even when the parameter is omitted.
  body.reasoning_effort = effort;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const err = await res.json();
      if (err && err.message) detail = err.message;
    } catch (_) {}
    if (res.status === 401) {
      addError("Clé API invalide ou expirée. Cliquez sur l'engrenage pour la mettre à jour.");
      openKeyDialog(true);
    } else {
      addError(`Erreur Mistral (${detail}). Réessayez.`);
    }
    return null;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";
  let thinking = "";
  let inThinking = false;

  // Build the bubble: a (hidden until used) reasoning block + an answer block.
  const { thinkingEl, thinkingContent, answerEl } = addAssistantBubble();
  answerEl.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';

  // End the reasoning phase: reveal the block (if any trace was produced).
  function endThinking() {
    if (!inThinking) return;
    inThinking = false;
    if (thinking) {
      thinkingEl.hidden = false;
      thinkingContent.textContent = thinking;
    }
  }

  function appendAnswer(text) {
    if (!text) return;
    if (!full) answerEl.innerHTML = "";
    full += text;
    answerEl.innerHTML = renderMarkdown(full);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function appendThinking(text) {
    if (!text) return;
    if (!inThinking) {
      inThinking = true;
      thinkingEl.hidden = false;
    }
    thinking += text;
    thinkingContent.textContent = thinking;
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload);
        const delta = json.choices?.[0]?.delta;

        // Typed reasoning chunks (reasoning_effort models, incl. GLM 5.3):
        // delta.content is either a string (answer phase) or a list of typed
        // chunks (ThinkChunk / TextChunk).
        const content = delta?.content;
        if (typeof content === "string") {
          endThinking();
          appendAnswer(content);
        } else if (Array.isArray(content)) {
          for (const chunk of content) {
            if (!chunk || typeof chunk !== "object") continue;
            if (chunk.type === "thinking" && Array.isArray(chunk.thinking)) {
              for (const inner of chunk.thinking) {
                if (inner && inner.type === "text" && inner.text) appendThinking(inner.text);
              }
            } else if (chunk.type === "text" && chunk.text) {
              endThinking();
              appendAnswer(chunk.text);
            }
          }
        }

        // Legacy fallback: some models expose the trace as reasoning_content.
        if (delta?.reasoning_content) {
          appendThinking(delta.reasoning_content);
        }
      } catch (_) {
        // ignore partial json
      }
    }
  }

  endThinking();
  if (!full) answerEl.textContent = "(réponse vide)";
  return { answer: full, reasoning: thinking };
}

// ---- Send ----
async function send() {
  if (inFlight) return;
  const question = promptInput.value.trim();
  if (!question) return;

  if (!apiKey) {
    openKeyDialog(false);
    return;
  }

  // Grab fresh page content and selection for this question.
  lastContext = await fetchPageContent();
  await pollSelectionOnce(); // refresh currentSelection so it matches the page at send time

  setBusy(true);
  // Clear the welcome placeholder on the first message of a fresh chat.
  if (history.length === 0) chatEl.innerHTML = "";
  addMsg("user", question);
  history.push({ role: "user", content: question });
  promptInput.value = "";

  try {
    if (lastContext && lastContext.text) {
      const lenK = Math.round(lastContext.text.length / 1000);
      addContextChip(`${lastContext.title || lastContext.url} · ${lenK}k car.`);
    } else {
      addContextChip(`${(lastContext && (lastContext.title || lastContext.url)) || "page inconnue"} · contenu indisponible`);
      addSystem("Aucun contenu de page détecté. Le modèle répondra sans contexte de page (page interne, ou contenu non encore chargé).");
    }
    const result = await streamMistral(question);
    if (result && result.answer) {
      history.push({
        role: "assistant",
        content: result.answer,
        reasoning: result.reasoning || "",
      });
      await syncCurrentConversation();
    } else {
      // Remove the unanswered user turn so retry is clean.
      history.pop();
    }
  } catch (err) {
    addError("Échec réseau. Vérifiez votre connexion et réessayez.");
    console.error(err);
    history.pop();
  } finally {
    setBusy(false);
    promptInput.focus();
  }
}

sendBtn.addEventListener("click", send);
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});
promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + "px";
});

// ---- Init ----
(async function init() {
  await loadSettings();
  await loadConversations();
  await loadTranscriptions();
  // Start on a fresh conversation by default (previous context may be stale).
  currentConvId = null;
  history = [];
  if (!apiKey) {
    addSystem("Bienvenue dans Web AI Assistant. Ajoutez votre clé API Mistral pour commencer.");
    openKeyDialog(false);
  } else {
    addSystem("Nouvelle conversation. Posez une question sur la page courante.");
  }
  // STT welcome message.
  addSTTStatus(
    "Lancez la lecture de la vidéo dans l'onglet actif, puis cliquez sur « Démarrer » pour enregistrer son audio et le transcrire."
  );
  // Mirror the active tab's text selection in the preview box while open
  // (only relevant in chat mode).
  if (currentMode === "chat") startSelectionPolling();
})();

// Stop polling when the side panel is closed/unloaded.
window.addEventListener("pagehide", () => {
  stopSelectionPolling();
  if (isRecording) stopRecording();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopSelectionPolling();
  } else if (currentMode === "chat") {
    startSelectionPolling();
  }
});
