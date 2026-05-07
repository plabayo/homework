import { runExercise, shuffle, escapeHtml } from "/homework.js";

// ---------- Fuzzy matching ----------

function normalize(s) {
    return String(s || "")
        .trim()
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\p{Extended_Pictographic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();
}

// Optimised O(n) space Levenshtein distance.
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const row = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= n; j++) {
            const temp = row[j];
            row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
            prev = temp;
        }
    }
    return row[n];
}

// Accept answers that are "close enough": 1 typo for short words, 2 for medium, 3 for long.
// Very short words (≤2 chars) require exact match to avoid false positives.
function fuzzyEqual(given, expected) {
    const a = normalize(given);
    const b = normalize(expected);
    if (a === b) return true;
    const maxLen = Math.max(a.length, b.length);
    if (maxLen <= 2) return false;
    const tolerance = maxLen <= 5 ? 1 : maxLen <= 9 ? 2 : 3;
    return levenshtein(a, b) <= tolerance;
}

// ---------- Storage ----------

const STORAGE_KEY = "homework_flashcard_decks";
const FC_LAST_DECK_KEY = "homework_fc_last_deck";

function loadDecks() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveDecks(decks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    } catch (e) {
        console.warn("Could not save decks", e);
    }
}

function getDeck(id) {
    return loadDecks().find((d) => d.id === id) || null;
}

// Resolve the deck mode: new decks carry an explicit field; legacy decks are
// inferred from whether any card has a back.
function deckMode(deck) {
    if (deck.mode === "one-sided" || deck.mode === "two-sided") return deck.mode;
    return deck.cards.some((c) => c.back) ? "two-sided" : "one-sided";
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Compression for sharing ----------

async function compress(text) {
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(text));
    writer.close();
    return new Response(cs.readable).arrayBuffer();
}

async function decompress(bytes) {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    writer.close();
    return new Response(ds.readable).text();
}

async function encodeDeck(deck) {
    const json = JSON.stringify({ name: deck.name, cards: deck.cards });
    const buf = await compress(json);
    let bin = "";
    for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function decodeDeckParam(param) {
    const bin = atob(param.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = await decompress(bytes);
    return JSON.parse(json);
}

// ---------- Example decks ----------

const EXAMPLE_DECKS = [
    {
        id: "__example_seasons__",
        name: "De seizoenen 🌸",
        mode: "one-sided",
        cards: [
            { front: "lente 🌸" },
            { front: "zomer ☀️" },
            { front: "herfst 🍂" },
            { front: "winter ❄️" },
        ],
        createdAt: 0,
    },
    {
        id: "__example_french__",
        name: "Franse woordjes 🇫🇷",
        mode: "two-sided",
        cards: [
            { front: "chat", back: "kat" },
            { front: "chien", back: "hond" },
            { front: "maison", back: "huis" },
            { front: "école", back: "school" },
            { front: "livre", back: "boek" },
            { front: "ami", back: "vriend" },
            { front: "eau", back: "water" },
            { front: "rouge", back: "rood" },
        ],
        createdAt: 0,
    },
];

const RETIRED_EXAMPLE_IDS = new Set(["__example_animals__", "__example_numbers__"]);

function ensureExamples() {
    let decks = loadDecks().filter((d) => !RETIRED_EXAMPLE_IDS.has(d.id));
    for (let i = EXAMPLE_DECKS.length - 1; i >= 0; i--) {
        const ex = EXAMPLE_DECKS[i];
        if (!decks.some((d) => d.id === ex.id)) decks.unshift(ex);
    }
    saveDecks(decks);
}

// ---------- Manager state ----------

let managerRoot = null;
let hiddenDeckInput = null;
let selectedDeckId = null;
let editorState = null; // null | { mode: 'new' } | { mode: 'edit', id: string }
let importPending = null; // { name, cards } | null

function renderManager() {
    if (!managerRoot) return;
    if (importPending) {
        renderImport();
    } else if (editorState) {
        renderEditor();
    } else {
        renderList();
    }
}

// ---------- Deck list view ----------

function renderList() {
    const decks = loadDecks();

    let html = `<div class="deck-list-header">
        <button type="button" class="fc-btn-new" id="fc-new-deck">＋ Nieuw deck</button>
    </div>`;

    if (decks.length === 0) {
        html += `<p class="fc-empty">Nog geen decks — maak een nieuw deck aan!</p>`;
    } else {
        html += `<ul class="deck-list" role="list">`;
        for (const deck of decks) {
            const modeLabel = deckMode(deck) === "two-sided" ? "voor-achterkant" : "uit het hoofd";
            const count = deck.cards.length;
            const sel = deck.id === selectedDeckId;
            html += `<li class="deck-item${sel ? " selected" : ""}" data-deck-id="${escapeHtml(deck.id)}">
                <button type="button" class="deck-select-btn" data-action="select" data-deck-id="${escapeHtml(deck.id)}" aria-pressed="${sel}">
                    <span class="deck-name">${escapeHtml(deck.name)}</span>
                    <span class="deck-meta">${count} kaart${count === 1 ? "" : "en"} · ${modeLabel}</span>
                </button>
                <div class="deck-actions">
                    <button type="button" class="fc-btn-sm" data-action="edit" data-deck-id="${escapeHtml(deck.id)}" title="Bewerk" aria-label="Bewerk ${escapeHtml(deck.name)}">✏️</button>
                    <button type="button" class="fc-btn-sm" data-action="share" data-deck-id="${escapeHtml(deck.id)}" title="Deel" aria-label="Deel ${escapeHtml(deck.name)}">🔗</button>
                    <button type="button" class="fc-btn-sm fc-btn-delete" data-action="delete" data-deck-id="${escapeHtml(deck.id)}" title="Verwijder" aria-label="Verwijder ${escapeHtml(deck.name)}">🗑️</button>
                </div>
            </li>`;
        }
        html += `</ul>`;
    }

    // For a selected one-sided deck, show fill-in mode options.
    if (selectedDeckId) {
        const sel = getDeck(selectedDeckId);
        if (sel && sel.cards.length > 0 && deckMode(sel) === "one-sided") {
            html += renderModeOptionsHtml(sel);
        }
    }

    // Sync history section so it shows the selected deck's sessions.
    const histEl = document.getElementById("history");
    if (histEl) {
        histEl.dataset.exerciseId = selectedDeckId
            ? `flashcards-${selectedDeckId}`
            : "flashcards";
    }

    // Leave editing mode — show the start button, time-mode fieldset, and history.
    document.getElementById("page-setup")?.removeAttribute("data-editing");

    managerRoot.innerHTML = html;
    managerRoot.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", handleDeckAction);
    });
    managerRoot.querySelector("#fc-new-deck")?.addEventListener("click", () => {
        editorState = { mode: "new" };
        renderManager();
    });

    // Wire up the count input enable/disable based on which radio is selected.
    wireModeOptions();

    // Tell homework.js to refresh the history panel for the newly-selected deck.
    document.dispatchEvent(new CustomEvent("homework:refresh-history"));
}

function renderModeOptionsHtml(deck) {
    const n = deck.cards.length;
    const defaultCount = Math.max(1, Math.ceil(n / 2));
    return `
        <div class="fc-mode-options">
            <p class="fc-mode-label">Hoe wil je oefenen?</p>
            <label class="fc-mode-radio">
                <input type="radio" name="fc-mode" value="all" checked>
                vul alles in uit het hoofd (${n} lege vakjes)
            </label>
            <label class="fc-mode-radio">
                <input type="radio" name="fc-mode" value="partial">
                vul ontbrekende in:
                <input type="number" name="fc-count" id="fc-count" min="1" max="${n - 1}" value="${defaultCount}" disabled>
                van ${n} lege vakjes — de rest zie je als hint
            </label>
        </div>`;
}

function wireModeOptions() {
    const allRadio = managerRoot.querySelector("input[name='fc-mode'][value='all']");
    const partialRadio = managerRoot.querySelector("input[name='fc-mode'][value='partial']");
    const countInput = managerRoot.querySelector("input[name='fc-count']");
    if (!partialRadio || !countInput) return;
    const sync = () => { countInput.disabled = !partialRadio.checked; };
    allRadio?.addEventListener("change", sync);
    partialRadio.addEventListener("change", sync);
}

function handleDeckAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const deckId = btn.dataset.deckId;

    switch (action) {
        case "select":
            selectedDeckId = deckId;
            if (hiddenDeckInput) hiddenDeckInput.value = deckId;
            try { localStorage.setItem(FC_LAST_DECK_KEY, deckId); } catch {}
            renderList();
            break;
        case "edit":
            editorState = { mode: "edit", id: deckId };
            renderManager();
            break;
        case "share":
            shareDeck(deckId);
            break;
        case "delete": {
            const deck = getDeck(deckId);
            if (deck && confirm(`Wil je het deck "${deck.name}" verwijderen?`)) {
                deleteDeck(deckId);
            }
            break;
        }
    }
}

// ---------- Deck editor view ----------

function cardRowHtml(card, i, isTwoSided) {
    return `
        <div class="card-row" data-index="${i}">
            <div class="card-fields${isTwoSided ? "" : " one-sided"}">
                <div class="card-field">
                    <label for="card-front-${i}">Voorkant</label>
                    <input type="text" id="card-front-${i}" class="card-front"
                        value="${escapeHtml(card?.front || "")}" placeholder="Tekst op de voorkant" autocomplete="off">
                </div>
                <div class="card-field card-back-field">
                    <label for="card-back-${i}">Achterkant</label>
                    <input type="text" id="card-back-${i}" class="card-back"
                        value="${escapeHtml(card?.back || "")}" placeholder="Tekst op de achterkant" autocomplete="off">
                </div>
            </div>
            <button type="button" class="fc-btn-sm fc-btn-delete" data-action="remove-card"
                data-index="${i}" aria-label="Verwijder kaart ${i + 1}">🗑️</button>
        </div>`;
}

function renderEditor() {
    // Hide the start button, time-mode fieldset, and history while editing.
    document.getElementById("page-setup")?.setAttribute("data-editing", "");

    const decks = loadDecks();
    let deck;
    if (editorState.mode === "edit") {
        deck = decks.find((d) => d.id === editorState.id) || {
            id: editorState.id, name: "", cards: [], createdAt: Date.now(),
        };
    } else {
        deck = { id: null, name: "", cards: [{ front: "" }], createdAt: Date.now() };
    }

    const currentMode = deckMode(deck);
    const isTwoSided = currentMode === "two-sided";
    const title = editorState.mode === "new" ? "Nieuw deck" : "Deck bewerken";
    const cardsHtml = deck.cards.map((card, i) => cardRowHtml(card, i, isTwoSided)).join("");

    managerRoot.innerHTML = `
        <div class="deck-editor">
            <h3 class="editor-title">${escapeHtml(title)}</h3>
            <div class="field">
                <label for="deck-name-input">Naam van het deck</label>
                <input type="text" id="deck-name-input"
                    value="${escapeHtml(deck.name)}" placeholder="bijv. Hoofdsteden van Europa" autocomplete="off">
            </div>
            <fieldset class="fc-deck-type-fieldset">
                <legend>Type kaarten</legend>
                <label class="fc-mode-radio">
                    <input type="radio" name="deck-type" value="one-sided"${isTwoSided ? "" : " checked"}>
                    Uit het hoofd — alleen voorkant, alles onthouden
                </label>
                <label class="fc-mode-radio">
                    <input type="radio" name="deck-type" value="two-sided"${isTwoSided ? " checked" : ""}>
                    Koppelen — voorkant + achterkant
                </label>
            </fieldset>
            <div id="card-list">${cardsHtml}</div>
            <div class="button-row">
                <button type="button" id="fc-add-card" class="fc-btn-add">＋ Kaart toevoegen</button>
            </div>
            <div class="button-row editor-actions">
                <button type="button" id="fc-save-deck" class="primary">💾 Opslaan</button>
                <button type="button" id="fc-cancel-edit">✖ Annuleer</button>
            </div>
        </div>`;

    // Toggle back fields when mode radio changes.
    managerRoot.querySelectorAll("input[name='deck-type']").forEach((radio) => {
        radio.addEventListener("change", () => {
            const twoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']").checked;
            managerRoot.querySelectorAll(".card-fields").forEach((cf) => {
                cf.classList.toggle("one-sided", !twoSided);
            });
        });
    });

    managerRoot.querySelector("#fc-add-card").addEventListener("click", addCardRow);
    managerRoot.querySelector("#fc-save-deck").addEventListener("click", () =>
        saveDeckFromEditor(editorState.mode === "edit" ? editorState.id : null),
    );
    managerRoot.querySelector("#fc-cancel-edit").addEventListener("click", () => {
        editorState = null;
        renderManager();
    });
    bindRemoveButtons();

    const nameInput = managerRoot.querySelector("#deck-name-input");
    if (!nameInput.value) {
        nameInput.focus();
    } else {
        const emptyFront = managerRoot.querySelector(".card-front");
        if (emptyFront && !emptyFront.value) emptyFront.focus();
    }
}

function bindRemoveButtons() {
    managerRoot.querySelectorAll("[data-action='remove-card']").forEach((btn) => {
        btn.addEventListener("click", () => removeCardRow(Number(btn.dataset.index)));
    });
}

function addCardRow() {
    const list = managerRoot.querySelector("#card-list");
    const i = list.querySelectorAll(".card-row").length;
    const isTwoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    const div = document.createElement("div");
    div.innerHTML = cardRowHtml(null, i, isTwoSided);
    const row = div.firstElementChild;
    row.querySelector("[data-action='remove-card']").addEventListener("click", () =>
        removeCardRow(i),
    );
    list.appendChild(row);
    row.querySelector(".card-front").focus();
}

function removeCardRow(index) {
    const list = managerRoot.querySelector("#card-list");
    const rows = list.querySelectorAll(".card-row");
    if (rows.length <= 1) {
        alert("Een deck moet minstens één kaart hebben.");
        return;
    }
    rows[index].remove();
    list.querySelectorAll(".card-row").forEach((row, i) => {
        row.dataset.index = i;
        const delBtn = row.querySelector("[data-action='remove-card']");
        if (delBtn) {
            delBtn.dataset.index = i;
            delBtn.setAttribute("aria-label", `Verwijder kaart ${i + 1}`);
        }
    });
}

function saveDeckFromEditor(existingId) {
    const name = managerRoot.querySelector("#deck-name-input")?.value.trim();
    if (!name) {
        alert("Geef het deck een naam.");
        managerRoot.querySelector("#deck-name-input")?.focus();
        return;
    }

    const isTwoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    const mode = isTwoSided ? "two-sided" : "one-sided";

    const cards = [];
    managerRoot.querySelectorAll(".card-row").forEach((row) => {
        const front = row.querySelector(".card-front")?.value.trim();
        if (!front) return;
        if (isTwoSided) {
            const back = row.querySelector(".card-back")?.value.trim();
            cards.push(back ? { front, back } : { front });
        } else {
            cards.push({ front });
        }
    });

    if (cards.length === 0) {
        alert("Een deck moet minstens één kaart hebben met een voorkant.");
        return;
    }

    const decks = loadDecks();
    let savedId;
    if (existingId) {
        const idx = decks.findIndex((d) => d.id === existingId);
        if (idx >= 0) {
            decks[idx] = { ...decks[idx], name, mode, cards };
            savedId = existingId;
        }
    }
    if (!savedId) {
        savedId = generateId();
        decks.push({ id: savedId, name, mode, cards, createdAt: Date.now() });
    }
    saveDecks(decks);

    selectedDeckId = savedId;
    if (hiddenDeckInput) hiddenDeckInput.value = savedId;
    editorState = null;
    renderManager();
}

function deleteDeck(id) {
    const decks = loadDecks().filter((d) => d.id !== id);
    saveDecks(decks);
    if (selectedDeckId === id) {
        selectedDeckId = null;
        if (hiddenDeckInput) hiddenDeckInput.value = "";
    }
    renderManager();
}

// ---------- Share ----------

async function shareDeck(id) {
    const deck = getDeck(id);
    if (!deck) return;

    try {
        const encoded = await encodeDeck(deck);
        const url = `${location.origin}/extra/flashcards?import=${encoded}`;
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            showToast("Link gekopieerd naar klembord! 📋");
        } else {
            prompt("Kopieer deze link om het deck te delen:", url);
        }
    } catch (e) {
        console.error("Share failed", e);
        showToast("Delen mislukt. Probeer opnieuw.");
    }
}

function showToast(message) {
    document.querySelector(".fc-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "fc-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ---------- Import view ----------

function renderImport() {
    // Hide the start button, time-mode fieldset, and history while importing.
    document.getElementById("page-setup")?.setAttribute("data-editing", "");

    const deck = importPending;
    const hasBack = deck.cards.some((c) => c.back);
    const count = deck.cards.length;

    managerRoot.innerHTML = `
        <div class="fc-import-box">
            <h3>Deck importeren?</h3>
            <p>Je hebt een gedeeld deck ontvangen:</p>
            <div class="deck-preview">
                <strong>${escapeHtml(deck.name)}</strong>
                <span>${count} kaart${count === 1 ? "" : "en"} · ${hasBack ? "voor-achterkant" : "uit het hoofd"}</span>
            </div>
            <div class="button-row">
                <button type="button" id="fc-confirm-import" class="primary">📥 Importeer dit deck</button>
                <button type="button" id="fc-cancel-import">Annuleer</button>
            </div>
        </div>`;

    managerRoot.querySelector("#fc-confirm-import").addEventListener("click", () => {
        const decks = loadDecks();
        const id = generateId();
        decks.push({ id, name: deck.name, cards: deck.cards, createdAt: Date.now() });
        saveDecks(decks);
        selectedDeckId = id;
        if (hiddenDeckInput) hiddenDeckInput.value = id;
        importPending = null;
        history.replaceState({}, "", location.pathname);
        renderManager();
        showToast(`Deck "${deck.name}" is geïmporteerd! 🎉`);
    });

    managerRoot.querySelector("#fc-cancel-import").addEventListener("click", () => {
        importPending = null;
        history.replaceState({}, "", location.pathname);
        renderManager();
    });
}

// ---------- Initialisation ----------

async function initManager() {
    managerRoot = document.getElementById("deck-manager");
    hiddenDeckInput = document.getElementById("selected-deck-id");
    if (!managerRoot) return;

    ensureExamples();

    const importParam = new URLSearchParams(location.search).get("import");
    if (importParam) {
        try {
            const data = await decodeDeckParam(importParam);
            history.replaceState({}, "", location.pathname);
            const existing = loadDecks().find(
                (d) =>
                    d.name === data.name &&
                    d.cards.length === data.cards.length &&
                    d.cards[0]?.front === data.cards[0]?.front,
            );
            if (existing) {
                selectedDeckId = existing.id;
                if (hiddenDeckInput) hiddenDeckInput.value = existing.id;
                showToast("Dit deck staat al in je collectie! ✅");
            } else {
                importPending = data;
            }
        } catch (e) {
            console.warn("Import decode failed", e);
            history.replaceState({}, "", location.pathname);
        }
    }

    renderManager();
}

initManager();

// Restore the last used deck so spec.id immediately returns the right namespace
// before runExercise calls loadSavedConfig().
(function restoreLastDeck() {
    try {
        const lastId = localStorage.getItem(FC_LAST_DECK_KEY);
        if (lastId && loadDecks().some((d) => d.id === lastId)) {
            selectedDeckId = lastId;
            // Set data-exercise-id now so setupHistoryView() (called by runExercise)
            // reads the correct deck ID even when there is no saved config to trigger
            // a loadConfig() → renderList() cycle.
            const histEl = document.getElementById("history");
            if (histEl) histEl.dataset.exerciseId = `flashcards-${lastId}`;
        }
    } catch {}
})();

// ---------- Fill-in question renderer (one-sided decks) ----------
// fillInResults is cleared at the start of each session (buildDeck call) and
// populated by isCorrect() as the user works through the blanks.
const fillInResults = {}; // card-index → true | false

function clearFillInState() {
    for (const k of Object.keys(fillInResults)) delete fillInResults[k];
}

// Shows the full list with all positions visible:
//   • already answered → green or red with the correct text
//   • current blank    → single text input (id="answer")
//   • future blank     → static "___" placeholder
//   • hint card        → revealed text (muted)
function renderFillInQuestion(q, root) {
    const blankSet = new Set(q.blankIndices);
    // Active input goes at the first unanswered blank — order of typing doesn't matter.
    const activeIdx = q.blankIndices.find((i) => !(i in fillInResults));

    let html = `<div class="flash-fill-grid">`;
    q.allCards.forEach((cardFront, i) => {
        if (!blankSet.has(i)) {
            html += `<div class="fill-row fill-hint">
                <span class="fill-pos">${i + 1}.</span>
                <span class="fill-hint-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else if (i in fillInResults) {
            const ok = fillInResults[i];
            html += `<div class="fill-row ${ok ? "fill-answer-ok" : "fill-answer-bad"}">
                <span class="fill-pos">${i + 1}.</span>
                <span class="fill-answer-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else if (i === activeIdx) {
            html += `<div class="fill-row fill-current">
                <input type="text" id="answer" class="fill-input" autocomplete="off"
                    placeholder="${i + 1}. typ hier…" aria-label="jouw antwoord voor positie ${i + 1}">
            </div>`;
        } else {
            html += `<div class="fill-row fill-blank">
                <span class="fill-pos">${i + 1}.</span>
                <span class="fill-placeholder" aria-hidden="true">___</span>
            </div>`;
        }
    });
    html += `</div>`;
    root.innerHTML = html;

    const skipBtn = document.getElementById("button-skip");
    const checkBtn = document.getElementById("button-check");
    if (skipBtn) { skipBtn.hidden = false; skipBtn.textContent = "🤷 weet het niet"; }
    if (checkBtn) checkBtn.textContent = "✅ controleer";

    const input = root.querySelector("#answer");
    input?.focus();
    return () => input?.value;
}

function renderFillInReview(q, root, correct) {
    const blankSet = new Set(q.blankIndices);

    let html = `<div class="flash-fill-grid flash-fill-review">`;
    q.allCards.forEach((cardFront, i) => {
        if (!blankSet.has(i)) {
            html += `<div class="fill-row fill-hint">
                <span class="fill-pos">${i + 1}.</span>
                <span class="fill-hint-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else {
            const ok = fillInResults[i];
            const cls = ok === true ? "fill-answer-ok" : ok === false ? "fill-answer-bad" : "fill-blank";
            html += `<div class="fill-row ${cls}">
                <span class="fill-pos">${i + 1}.</span>
                <span class="fill-answer-text">${escapeHtml(cardFront)}</span>
            </div>`;
        }
    });
    html += `</div>`;
    root.innerHTML = html;
}

// ---------- Exercise spec ----------

runExercise({
    // Per-deck namespace: sessions and saved config are keyed by deck ID so
    // each deck gets its own history.  Falls back to "flashcards" when no deck
    // is selected (e.g. on first load before restoreLastDeck runs).
    get id() {
        return selectedDeckId ? `flashcards-${selectedDeckId}` : "flashcards";
    },
    label: "flitskaarten",

    loadConfig(form, saved) {
        if (!saved?.deckId) return;
        const deck = getDeck(saved.deckId);
        if (!deck) return;
        selectedDeckId = saved.deckId;
        try { localStorage.setItem(FC_LAST_DECK_KEY, saved.deckId); } catch {}
        if (hiddenDeckInput) hiddenDeckInput.value = saved.deckId;
        renderList();
    },

    readConfig(form) {
        return {
            deckId: form.querySelector("#selected-deck-id")?.value || "",
            fcMode: form.querySelector("input[name='fc-mode']:checked")?.value || "all",
            fcCount: Number(form.querySelector("input[name='fc-count']")?.value) || 0,
        };
    },

    validateConfig(cfg) {
        if (!cfg.deckId) return "Kies een deck om te oefenen.";
        const deck = getDeck(cfg.deckId);
        if (!deck) return "Dit deck bestaat niet meer — kies een ander deck.";
        if (!deck.cards.length) return "Dit deck heeft geen kaarten.";
        const isOneSided = deckMode(deck) === "one-sided";
        if (isOneSided && cfg.fcMode === "partial") {
            const max = deck.cards.length - 1;
            if (!cfg.fcCount || cfg.fcCount < 1 || cfg.fcCount > max) {
                return `Kies een aantal tussen 1 en ${max}.`;
            }
        }
        return null;
    },

    buildDeck(cfg) {
        const deck = getDeck(cfg.deckId);
        if (!deck) return [];
        const cards = deck.cards.filter((c) => c.front?.trim());
        const isOneSided = deckMode(deck) === "one-sided";

        if (!isOneSided) {
            // Two-sided: shuffle and return cards directly.
            const shuffled = cards.map((c) => ({ front: c.front, back: c.back }));
            shuffle(shuffled);
            return shuffled;
        }

        // One-sided fill-in mode.
        // Cards keep their original order: position in the grid is a visible hint.
        // All blank slots are shown at once; the framework walks them top-to-bottom
        // but the user can pre-fill any slot freely.
        clearFillInState();
        const allCards = cards.map((c) => c.front);
        let blankIndices;

        if (cfg.fcMode === "partial") {
            const count = Math.min(Math.max(1, cfg.fcCount), cards.length - 1);
            const idx = cards.map((_, i) => i);
            shuffle(idx);
            blankIndices = idx.slice(0, count).sort((a, b) => a - b);
        } else {
            blankIndices = cards.map((_, i) => i); // all blanked
        }

        return blankIndices.map((idx) => ({
            front: allCards[idx],
            back: null,
            index: idx,
            allCards,
            blankIndices,
        }));
    },

    renderQuestion(q, root, mode) {
        const isTwoSided = !!q.back;
        const skipBtn = document.getElementById("button-skip");
        const checkBtn = document.getElementById("button-check");

        // ---- Review mode (shown in result detail) ----
        if (mode.kind === "review") {
            if (!isTwoSided && q.allCards) {
                renderFillInReview(q, root, mode.correct);
                return;
            }
            if (isTwoSided) {
                root.innerHTML = `
                    <div class="flash-review">
                        <div class="flash-side flash-front-side">
                            <span class="flash-side-label">voorkant</span>
                            <p class="flash-text">${escapeHtml(q.front)}</p>
                        </div>
                        <div class="flash-side flash-back-side">
                            <span class="flash-side-label">achterkant</span>
                            <p class="flash-text">${escapeHtml(q.back)}</p>
                        </div>
                    </div>`;
            } else {
                root.innerHTML = `
                    <div class="flash-review flash-review-one-sided">
                        <p class="flash-text">${escapeHtml(q.front)}</p>
                    </div>`;
            }
            return;
        }

        // ---- Play mode ----
        if (!isTwoSided && q.allCards) {
            return renderFillInQuestion(q, root);
        }

        // Two-sided: show front, user types the back.
        root.innerHTML = `
            <div class="flash-question">
                <p class="flash-text">${escapeHtml(q.front)}</p>
                <input type="text" id="answer" autocomplete="off"
                    placeholder="jouw antwoord…" aria-label="jouw antwoord">
            </div>`;
        if (skipBtn) skipBtn.hidden = true;
        if (checkBtn) checkBtn.textContent = "👉 antwoord";
        const input = root.querySelector("#answer");
        return () => input.value;
    },

    isCorrect(q, given) {
        if (!q.back && q.allCards) {
            // Order-independent: accept if the answer matches any remaining unmatched blank.
            for (const idx of q.blankIndices) {
                if (!(idx in fillInResults) && fuzzyEqual(given, q.allCards[idx])) {
                    fillInResults[idx] = true;
                    return true;
                }
            }
            // No match — mark the first unanswered blank as wrong.
            const firstOpen = q.blankIndices.find((i) => !(i in fillInResults));
            if (firstOpen !== undefined) fillInResults[firstOpen] = false;
            return false;
        }
        if (!q.back) return given === "__know__";
        return fuzzyEqual(given, q.back);
    },

    describe(q) {
        return q.back ? `${q.front} → ${q.back}` : q.front;
    },
});
