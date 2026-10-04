// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    deckContentKey,
    findImportMatch,
    parseDeckJson,
    readPractice,
    readStoredDecks,
    storeImportedDeck,
} from "@flashcards-data";

const fileInput = document.getElementById("fc-file");
const textInput = document.getElementById("fc-json-text");
const preview = document.getElementById("fc-import-preview");
const errorBox = document.getElementById("fc-import-error");
const status = document.getElementById("fc-import-status");
const openDeck = document.getElementById("fc-open-deck");
const nameInput = document.getElementById("fc-import-name");
const dropZone = document.getElementById("fc-drop-zone");
const MAX_BYTES = 5 * 1024 * 1024;
let pending = null;
let readGeneration = 0;

function clearPreview() {
    readGeneration++;
    pending = null;
    preview.hidden = true;
    errorBox.hidden = true;
    status.hidden = true;
    openDeck.hidden = true;
}

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function completeImport(deck, duplicate = false) {
    clearPreview();
    status.textContent = duplicate
        ? "Dit deck met deze instellingen staat al in je collectie."
        : `Deck “${deck.name}” is geïmporteerd.`;
    status.hidden = false;
    // A fragment keeps navigation on the precached URL, including offline.
    openDeck.href = `/extra/flashcards#deck=${encodeURIComponent(deck.id)}`;
    openDeck.hidden = false;
    openDeck.focus();
}

function inspectJson(text) {
    clearPreview();
    try {
        if (new Blob([text]).size > MAX_BYTES) throw new Error("Kies een JSON-bestand van maximaal 5 MB.");
        const deck = parseDeckJson(text);
        const match = findImportMatch(deck, readStoredDecks());
        if (match.exact) {
            completeImport(match.exact, true);
            return;
        }
        pending = {
            deck,
            conflictId: match.conflict?.id,
            conflictKey: match.conflict ? deckContentKey(match.conflict, readPractice(match.conflict)) : null,
        };
        renderPreview();
    } catch (error) {
        showError(error.message || "Het bestand kon niet worden gelezen. Er is niets gewijzigd.");
    }
}

function renderPreview() {
    const { deck, conflictId } = pending;
    const images = deck.cards.filter((card) => card.wikimedia).length;
    const mode =
        deck.mode === "one-sided" ? "uit het hoofd" : deck.bidirectional ? "twee richtingen" : "voorkant → antwoord";
    document.getElementById("fc-preview-name").textContent = deck.name;
    document.getElementById("fc-preview-meta").textContent =
        `${deck.cards.length} kaarten · ${mode}${images ? ` · ${images} met afbeelding` : ""}`;
    document.getElementById("fc-preview-sample").textContent = `Bijvoorbeeld: ${deck.cards
        .slice(0, 3)
        .map((card) => card.front || card.wikimedia)
        .join(" · ")}`;
    document.getElementById("fc-preview-images").hidden = images === 0;
    document.getElementById("fc-preview-incomplete").hidden =
        deck.mode !== "two-sided" || !deck.cards.some((card) => !card.wikimedia && !card.back && !card.parts);
    document.getElementById("fc-preview-conflict").hidden = !conflictId;
    document.getElementById("fc-import-name-field").hidden = !conflictId;
    document.getElementById("fc-confirm-import").hidden = !!conflictId;
    document.getElementById("fc-overwrite-import").hidden = !conflictId;
    document.getElementById("fc-saveas-import").hidden = !conflictId;
    nameInput.value = conflictId ? `${deck.name} (kopie)` : deck.name;
    preview.hidden = false;
    document.getElementById("fc-preview-name").focus();
}

function saveImport(action) {
    if (!pending) return;
    errorBox.hidden = true;
    try {
        const { deck, conflictId, conflictKey } = pending;
        const latest = readStoredDecks();
        const current = findImportMatch(deck, latest);
        if (current.exact) {
            completeImport(current.exact, true);
            return;
        }
        if (action === "replace") {
            const existing = latest.find((item) => item.id === conflictId);
            if (!existing || deckContentKey(existing, readPractice(existing)) !== conflictKey) {
                throw new Error(
                    "Het bestaande deck is intussen gewijzigd. Bekijk je JSON opnieuw voordat je het vervangt.",
                );
            }
        } else if (action === "new" && current.conflict) {
            throw new Error("Er is intussen een deck met deze naam toegevoegd. Bekijk je JSON opnieuw.");
        }
        const name = action === "copy" ? nameInput.value.trim() : deck.name;
        if (!name) throw new Error("Geef het nieuwe deck een naam.");
        const saved = storeImportedDeck(deck, { name, replaceId: action === "replace" ? conflictId : null });
        completeImport(saved);
    } catch (error) {
        showError(
            error.name === "QuotaExceededError" || error.name === "SecurityError"
                ? "Opslaan lukt niet. Er is te weinig opslagruimte of je browser blokkeert lokale opslag. Je bestaande decks zijn niet gewijzigd."
                : error.message,
        );
    }
}

async function readFile(file) {
    clearPreview();
    if (!file) return;
    const generation = readGeneration;
    if (file.size > MAX_BYTES) {
        showError("Kies een JSON-bestand van maximaal 5 MB.");
        return;
    }
    try {
        const text = await file.text();
        if (generation !== readGeneration) return;
        textInput.value = text;
        inspectJson(text);
    } catch {
        if (generation === readGeneration) showError("Het bestand kon niet worden gelezen. Kies het opnieuw.");
    }
}

fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
textInput.addEventListener("input", clearPreview);
document.getElementById("fc-check-json").addEventListener("click", () => inspectJson(textInput.value));
document.getElementById("fc-confirm-import").addEventListener("click", () => saveImport("new"));
document.getElementById("fc-overwrite-import").addEventListener("click", () => saveImport("replace"));
document.getElementById("fc-saveas-import").addEventListener("click", () => saveImport("copy"));
document.getElementById("fc-cancel-import").addEventListener("click", () => {
    clearPreview();
    fileInput.value = "";
    fileInput.focus();
});
dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("is-dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("is-dragging"));
dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("is-dragging");
    readFile(event.dataTransfer.files[0]);
});

// Token colouring uses text nodes, so examples stay copyable plain JSON.
for (const block of document.querySelectorAll(".fc-json-example code")) {
    const json = block.textContent;
    const tokens = /"(?:[^"\\]|\\.)*"\s*:|"(?:[^"\\]|\\.)*"|\b(?:true|false|\d+)\b/g;
    let end = 0;
    block.replaceChildren();
    for (const match of json.matchAll(tokens)) {
        block.append(document.createTextNode(json.slice(end, match.index)));
        const span = document.createElement("span");
        span.className = match[0].endsWith(":")
            ? "fc-json-key"
            : match[0].startsWith('"')
              ? "fc-json-string"
              : "fc-json-number";
        span.textContent = match[0];
        block.append(span);
        end = match.index + match[0].length;
    }
    block.append(document.createTextNode(json.slice(end)));
}
for (const button of document.querySelectorAll("[data-example]")) {
    button.addEventListener("click", () => {
        textInput.value = document.getElementById(button.dataset.example).textContent;
        document.getElementById("fc-paste-details").open = true;
        inspectJson(textInput.value);
        document.getElementById("fc-upload-title").scrollIntoView({ block: "start" });
    });
}
