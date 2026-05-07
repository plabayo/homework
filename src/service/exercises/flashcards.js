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

// ---------- Phrase fuzzy matching (multi-part answers) ----------

// Dutch stopwords to skip when checking content-word coverage of a phrase.
const PHRASE_STOPWORDS = new Set([
    "van", "de", "het", "een", "en", "in", "op", "of", "met", "te",
    "aan", "bij", "tot", "voor", "door", "als", "die", "dat", "om",
    "er", "zijn", "naar", "dan", "nog", "al", "zo", "af", "uit",
    "is", "was", "waren", "heeft", "hebben", "had", "worden", "je", "ze", "we",
]);

// Accept a given phrase for an expected multi-word answer.
// First tries exact/Levenshtein fuzzy on the whole phrase; if that fails,
// checks that ≥60% of content words (non-stopwords) are fuzzily present.
function fuzzyMatchPhrase(given, expected) {
    if (fuzzyEqual(given, expected)) return true;
    const bWords = normalize(expected).split(" ").filter((w) => w.length > 0);
    const contentWords = bWords.filter((w) => !PHRASE_STOPWORDS.has(w));
    if (contentWords.length === 0) return false;
    const aWords = normalize(given).split(" ").filter((w) => w.length > 0);
    let matched = 0;
    for (const cw of contentWords) {
        if (aWords.some((aw) => fuzzyEqual(aw, cw))) matched++;
    }
    return matched / contentWords.length >= 0.6;
}

// Returns true when the answer was accepted via phrase-coverage fallback (not
// exact/Levenshtein), so we can flag it as "bijna goed" for the teacher.
function isLenientMatch(given, expected) {
    if (normalize(given) === normalize(expected)) return false;
    if (fuzzyEqual(given, expected)) return false;
    return true; // phrase-coverage fallback was used
}

// ---------- Lenient-match tracking ----------

const lenientMatches = [];

function pushLenientMatch(given, expected, front) {
    lenientMatches.push({ given, expected, front });
}

function appendLenientSection(matches) {
    const resultEl = document.getElementById("result");
    if (!resultEl || matches.length === 0) return;
    const items = matches
        .map(
            (m) =>
                `<li class="item-lenient">
            <span class="item-desc">${escapeHtml(m.front)}</span>
            <span class="item-meta">jij: <em>${escapeHtml(m.given)}</em> → juist: <strong>${escapeHtml(m.expected)}</strong></span>
        </li>`,
        )
        .join("");
    const section = document.createElement("section");
    section.className = "result-detail";
    section.innerHTML = `<h3 class="section-title">Bijna goed 〜</h3>
        <ul class="result-detail-list">${items}</ul>`;
    resultEl.appendChild(section);
}

// Split raw input into individual answer tokens on comma, semicolon, slash,
// newline, or the word " en " — for "all at once" multi-part detection.
function splitAnswerTokens(raw) {
    return raw
        .split(/[,;\n/+&]|\b(?:en|of|and|plus)\b/i)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

// Try to match one or more tokens from `given` against unmatched parts.
// Returns a Set of newly matched part strings.
function tryMatchParts(given, allParts, alreadyMatched) {
    const tokens = splitAnswerTokens(given);
    const newlyMatched = new Set();
    const remaining = allParts.filter((p) => !alreadyMatched.has(p));

    // Pass 1: match each split token against an unmatched part.
    for (const token of tokens) {
        for (const part of remaining) {
            if (!newlyMatched.has(part) && fuzzyMatchPhrase(token, part)) {
                newlyMatched.add(part);
                break;
            }
        }
    }

    // Pass 2 (phrase-contains fallback): if the full input contains all content words
    // of a remaining part, count it as matched.  Handles any separator the user picks
    // (space, "en", "+", etc.) without needing to enumerate them all.
    // Only runs when pass 1 left parts unmatched.
    for (const part of remaining) {
        if (newlyMatched.has(part)) continue;
        const bWords = normalize(part).split(" ").filter((w) => w.length > 0);
        const contentWords = bWords.filter((w) => !PHRASE_STOPWORDS.has(w));
        if (contentWords.length === 0) continue;
        const aWords = normalize(given).split(" ").filter((w) => w.length > 0);
        let matched = 0;
        for (const cw of contentWords) {
            if (aWords.some((aw) => fuzzyEqual(aw, cw))) matched++;
        }
        // Require ALL content words present AND at most one extra word per content word
        // (prevents single-word parts from matching long unrelated phrases).
        if (matched === contentWords.length && aWords.length <= contentWords.length * 2 + 1) {
            newlyMatched.add(part);
        }
    }

    return newlyMatched;
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
    const json = JSON.stringify({
        name: deck.name,
        mode: deck.mode,
        bidirectional: deck.bidirectional || false,
        cards: deck.cards,
    });
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
            const isTwo = deckMode(deck) === "two-sided";
            const modeLabel = !isTwo ? "uit het hoofd" : deck.bidirectional ? "twee richtingen" : "voor-achterkant";
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

function cardRowHtml(card, i, isTwoSided, isBidirectional) {
    const hintVal = escapeHtml(card?.hint || "");
    const hintRevVal = escapeHtml(card?.hintReverse || "");
    const rawParts = card?.parts || (card?.back ? [card.back] : []);
    const backVal = escapeHtml(rawParts.join("\n"));
    const partsCount = rawParts.length;
    const hasMinRequired = partsCount > 1 && card?.partsRequired != null && card.partsRequired < partsCount;
    const minRequiredVal = hasMinRequired ? card.partsRequired : partsCount;
    return `
        <div class="card-row" data-index="${i}">
            <div class="card-row-main">
                <div class="card-fields${isTwoSided ? "" : " one-sided"}">
                    <div class="card-field">
                        <label for="card-front-${i}">Voorkant</label>
                        <input type="text" id="card-front-${i}" class="card-front"
                            value="${escapeHtml(card?.front || "")}" placeholder="Tekst op de voorkant" autocomplete="off">
                    </div>
                    <div class="card-field card-back-field">
                        <label for="card-back-${i}">Achterkant <span class="optional">(één per regel)</span></label>
                        <textarea id="card-back-${i}" class="card-back" rows="2" wrap="off"
                            placeholder="Antwoord — meerdere regels = meerdere onderdelen"
                            autocomplete="off">${backVal}</textarea>
                        <div class="card-parts-required"${partsCount > 1 ? "" : " hidden"}>
                            <label class="fc-parts-min-label">
                                <input type="checkbox" class="card-parts-min-check"${hasMinRequired ? " checked" : ""}>
                                Minimaal:
                                <input type="number" class="card-parts-min-count" min="1"
                                    max="${partsCount}" value="${minRequiredVal}"${hasMinRequired ? "" : " disabled"}>
                                van <span class="card-parts-total">${partsCount}</span> onderdelen
                            </label>
                        </div>
                    </div>
                </div>
                <button type="button" class="fc-btn-sm fc-btn-delete" data-action="remove-card"
                    data-index="${i}" aria-label="Verwijder kaart ${i + 1}">🗑️</button>
            </div>
            <div class="card-hints"${isTwoSided ? "" : " hidden"}>
                <div class="card-hint-row">
                    <label class="fc-hint-label">
                        <input type="checkbox" class="card-hint-check" data-dir="fwd"${card?.hint ? " checked" : ""}>
                        ? hint
                    </label>
                    <input type="text" class="card-hint-input" data-dir="fwd"
                        value="${hintVal}" placeholder="hint voor de achterkant…"${card?.hint ? "" : " hidden"}>
                </div>
                <div class="card-hint-row card-hint-row-reverse"${isBidirectional ? "" : " hidden"}>
                    <label class="fc-hint-label">
                        <input type="checkbox" class="card-hint-check" data-dir="bwd"${card?.hintReverse ? " checked" : ""}>
                        ? hint (omgekeerd)
                    </label>
                    <input type="text" class="card-hint-input" data-dir="bwd"
                        value="${hintRevVal}" placeholder="hint voor de voorkant…"${card?.hintReverse ? "" : " hidden"}>
                </div>
            </div>
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
    const isBidirectional = isTwoSided && deck.bidirectional === true;
    const title = editorState.mode === "new" ? "Nieuw deck" : "Deck bewerken";
    const cardsHtml = deck.cards.map((card, i) => cardRowHtml(card, i, isTwoSided, isBidirectional)).join("");

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
                <div id="fc-bidir-option" class="fc-bidir-option${isTwoSided ? "" : " hidden"}">
                    <label class="fc-mode-radio">
                        <input type="checkbox" id="deck-bidirectional"${isBidirectional ? " checked" : ""}>
                        Twee richtingen (ook achterkant → voorkant)
                    </label>
                </div>
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

    // Toggle back fields, bidir option and hint rows when mode radio changes.
    managerRoot.querySelectorAll("input[name='deck-type']").forEach((radio) => {
        radio.addEventListener("change", () => {
            const twoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']").checked;
            managerRoot.querySelectorAll(".card-fields").forEach((cf) => {
                cf.classList.toggle("one-sided", !twoSided);
            });
            managerRoot.querySelector("#fc-bidir-option")?.classList.toggle("hidden", !twoSided);
            syncCardHints();
        });
    });

    // Toggle reverse-hint rows when bidirectional checkbox changes.
    managerRoot.querySelector("#deck-bidirectional")?.addEventListener("change", syncCardHints);

    managerRoot.querySelector("#fc-add-card").addEventListener("click", addCardRow);
    managerRoot.querySelector("#fc-save-deck").addEventListener("click", () =>
        saveDeckFromEditor(editorState.mode === "edit" ? editorState.id : null),
    );
    managerRoot.querySelector("#fc-cancel-edit").addEventListener("click", () => {
        editorState = null;
        renderManager();
    });
    bindRemoveButtons();
    bindHintCheckboxes();
    managerRoot.querySelectorAll(".card-row").forEach(bindCardPartHandlers);

    const nameInput = managerRoot.querySelector("#deck-name-input");
    if (!nameInput.value) {
        nameInput.focus();
    } else {
        const emptyFront = managerRoot.querySelector(".card-front");
        if (emptyFront && !emptyFront.value) emptyFront.focus();
    }
}

// Show/hide hint rows based on current deck-type and bidirectional state.
function syncCardHints() {
    const isTwoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    const isBidir = isTwoSided && managerRoot.querySelector("#deck-bidirectional")?.checked;
    managerRoot.querySelectorAll(".card-hints").forEach((h) => { h.hidden = !isTwoSided; });
    managerRoot.querySelectorAll(".card-hint-row-reverse").forEach((row) => { row.hidden = !isBidir; });
}

// Wire hint checkboxes so they show/hide their text input.
function bindHintCheckboxes() {
    managerRoot.querySelectorAll(".card-hint-check").forEach((cb) => {
        const hintRow = cb.closest(".card-hint-row");
        const input = hintRow?.querySelector(".card-hint-input");
        if (!input) return;
        cb.addEventListener("change", () => {
            input.hidden = !cb.checked;
            if (cb.checked) input.focus();
        });
    });
}

function autoResizeTextarea(ta) {
    // Vertical: collapse then expand to content.
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";

    // Horizontal: with wrap="off", scrollWidth reflects true content width.
    // If it overflows the current column, switch the card-fields grid to a single
    // full-width column so the back field can take the whole row ("plop down").
    const cardFields = ta.closest(".card-fields");
    if (!cardFields) return;
    cardFields.classList.remove("wide-back"); // reset to measure at half-width
    if (ta.scrollWidth > ta.clientWidth) {
        cardFields.classList.add("wide-back");
    }
}

// Wire the textarea back field so it auto-resizes and the parts-required section
// shows/hides automatically as the user adds or removes lines.
function bindCardPartHandlers(row) {
    const textarea = row.querySelector(".card-back");
    const reqDiv = row.querySelector(".card-parts-required");
    if (!textarea || !reqDiv) return;
    const minCheck = row.querySelector(".card-parts-min-check");
    const minCount = row.querySelector(".card-parts-min-count");
    const totalSpan = row.querySelector(".card-parts-total");

    const syncPartsUI = () => {
        autoResizeTextarea(textarea);
        const parts = textarea.value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
        const n = parts.length;
        reqDiv.hidden = n <= 1;
        if (totalSpan) totalSpan.textContent = n;
        if (minCount) {
            minCount.max = n;
            if (Number(minCount.value) > n) minCount.value = n;
        }
    };
    textarea.addEventListener("input", syncPartsUI);
    autoResizeTextarea(textarea); // set initial height to fit existing content

    if (minCheck && minCount) {
        minCheck.addEventListener("change", () => {
            minCount.disabled = !minCheck.checked;
            if (minCheck.checked) minCount.focus();
        });
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
    const isBidirectional = isTwoSided && managerRoot.querySelector("#deck-bidirectional")?.checked;
    const div = document.createElement("div");
    div.innerHTML = cardRowHtml(null, i, isTwoSided, isBidirectional);
    const row = div.firstElementChild;
    row.querySelector("[data-action='remove-card']").addEventListener("click", () =>
        removeCardRow(i),
    );
    row.querySelectorAll(".card-hint-check").forEach((cb) => {
        const hintRow = cb.closest(".card-hint-row");
        const input = hintRow?.querySelector(".card-hint-input");
        if (!input) return;
        cb.addEventListener("change", () => {
            input.hidden = !cb.checked;
            if (cb.checked) input.focus();
        });
    });
    list.appendChild(row);
    bindCardPartHandlers(row);
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
    const isBidirectional = isTwoSided && managerRoot.querySelector("#deck-bidirectional")?.checked;

    const cards = [];
    let hintErrorInput = null;
    managerRoot.querySelectorAll(".card-row").forEach((row) => {
        if (hintErrorInput) return;
        const front = row.querySelector(".card-front")?.value.trim();
        if (!front) return;
        const card = { front };
        if (isTwoSided) {
            const backRaw = row.querySelector(".card-back")?.value || "";
            const parts = backRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
            if (parts.length > 1) {
                card.parts = parts;
                card.back = parts[0]; // backward compat fallback
                const minCheck = row.querySelector(".card-parts-min-check");
                if (minCheck?.checked) {
                    const minVal = Number(row.querySelector(".card-parts-min-count")?.value) || parts.length;
                    card.partsRequired = Math.min(Math.max(1, minVal), parts.length);
                }
            } else if (parts.length === 1) {
                card.back = parts[0];
            }

            const hintCheck = row.querySelector(".card-hint-check[data-dir='fwd']");
            const hintInput = row.querySelector(".card-hint-input[data-dir='fwd']");
            if (hintCheck?.checked) {
                const val = hintInput?.value.trim();
                if (!val) { hintErrorInput = hintInput; return; }
                card.hint = val;
            }

            if (isBidirectional) {
                const hintRevCheck = row.querySelector(".card-hint-check[data-dir='bwd']");
                const hintRevInput = row.querySelector(".card-hint-input[data-dir='bwd']");
                if (hintRevCheck?.checked) {
                    const val = hintRevInput?.value.trim();
                    if (!val) { hintErrorInput = hintRevInput; return; }
                    card.hintReverse = val;
                }
            }
        }
        cards.push(card);
    });

    if (hintErrorInput) {
        alert("Vul de hint tekst in, of verwijder het vinkje.");
        hintErrorInput.focus();
        return;
    }

    if (cards.length === 0) {
        alert("Een deck moet minstens één kaart hebben met een voorkant.");
        return;
    }

    const decks = loadDecks();
    let savedId;
    if (existingId) {
        const idx = decks.findIndex((d) => d.id === existingId);
        if (idx >= 0) {
            decks[idx] = { ...decks[idx], name, mode, bidirectional: isBidirectional, cards };
            savedId = existingId;
        }
    }
    if (!savedId) {
        savedId = generateId();
        decks.push({ id: savedId, name, mode, bidirectional: isBidirectional, cards, createdAt: Date.now() });
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
    const isTwo = deck.cards.some((c) => c.back) || deck.mode === "two-sided";
    const isBidir = isTwo && deck.bidirectional;
    const count = deck.cards.length;
    const modeLabel = !isTwo ? "uit het hoofd" : isBidir ? "twee richtingen" : "voor-achterkant";

    managerRoot.innerHTML = `
        <div class="fc-import-box">
            <h3>Deck importeren?</h3>
            <p>Je hebt een gedeeld deck ontvangen:</p>
            <div class="deck-preview">
                <strong>${escapeHtml(deck.name)}</strong>
                <span>${count} kaart${count === 1 ? "" : "en"} · ${modeLabel}</span>
            </div>
            <div class="button-row">
                <button type="button" id="fc-confirm-import" class="primary">📥 Importeer dit deck</button>
                <button type="button" id="fc-cancel-import">Annuleer</button>
            </div>
        </div>`;

    managerRoot.querySelector("#fc-confirm-import").addEventListener("click", () => {
        const decks = loadDecks();
        const id = generateId();
        decks.push({
            id,
            name: deck.name,
            mode: deck.mode || (isTwo ? "two-sided" : "one-sided"),
            bidirectional: deck.bidirectional || false,
            cards: deck.cards,
            createdAt: Date.now(),
        });
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

// ---------- Multi-part question renderer ----------

function renderMultiPartQuestion(q, root, mode) {
    const { allParts, sharedState, requiredCount } = q;
    const matched = sharedState.matched;
    const skipBtn = document.getElementById("button-skip");
    const checkBtn = document.getElementById("button-check");

    // Review mode: show all parts with matched/missed status.
    if (mode.kind === "review") {
        const partsHtml = allParts
            .map((p) => {
                const ok = matched.has(p);
                return `<div class="mp-part ${ok ? "mp-matched" : "mp-missed"}">${ok ? "✅" : "❌"} ${escapeHtml(p)}</div>`;
            })
            .join("");
        const shownLabel = q.direction === "bwd" ? "achterkant" : "voorkant";
        root.innerHTML = `
            <div class="flash-review">
                <div class="flash-side flash-front-side">
                    <span class="flash-side-label">${shownLabel}</span>
                    <p class="flash-text">${escapeHtml(q.front)}</p>
                </div>
                <div class="flash-side flash-back-side">
                    <span class="flash-side-label">onderdelen</span>
                    <div class="mp-parts-list">${partsHtml}</div>
                    <p class="mp-required-label">${matched.size}/${requiredCount} gevonden</p>
                </div>
            </div>`;
        return;
    }

    // Already satisfied from a prior "all at once" answer — auto-advance.
    if (matched.size >= requiredCount) {
        root.innerHTML = `
            <div class="flash-question">
                <p class="flash-text">${escapeHtml(q.front)}</p>
                <p class="fc-mp-done">✅ onderdelen gevonden</p>
            </div>`;
        if (skipBtn) skipBtn.hidden = true;
        setTimeout(() => document.getElementById("form-exercise")?.requestSubmit(), 200);
        return () => "__matched__";
    }

    // A previous entry for this card was skipped — propagate skip to this entry too.
    if (q.partIndex > matched.size) {
        root.innerHTML = `
            <div class="flash-question">
                <p class="flash-text">${escapeHtml(q.front)}</p>
            </div>`;
        setTimeout(() => {
            const btn = document.getElementById("button-skip");
            if (!btn) return;
            btn.hidden = false; // ensure click fires even on non-rendering elements
            btn.click(); // nextQuestion() will hide it again
        }, 50);
        return () => "";
    }

    // Normal play: show already-matched parts and an input for the next one.
    if (skipBtn) skipBtn.hidden = true;
    if (checkBtn) { checkBtn.hidden = false; checkBtn.textContent = "👉 antwoord"; }

    const matchedHtml = [...matched]
        .map((p) => `<div class="mp-part mp-matched">✅ ${escapeHtml(p)}</div>`)
        .join("");

    root.innerHTML = `
        <div class="flash-question">
            <p class="flash-text">${escapeHtml(q.front)}</p>
            ${q.hint ? `<button type="button" class="fc-hint-toggle">? hint</button>
            <p class="fc-hint-text" hidden>${escapeHtml(q.hint)}</p>` : ""}
            <p class="fc-mp-progress">${matched.size}/${requiredCount} gevonden</p>
            ${matchedHtml}
            <input type="text" id="answer" autocomplete="off"
                placeholder="geef een onderdeel…" aria-label="jouw antwoord">
        </div>`;

    root.querySelector(".fc-hint-toggle")?.addEventListener("click", () => {
        const hintText = root.querySelector(".fc-hint-text");
        if (hintText) hintText.hidden = !hintText.hidden;
    });

    const input = root.querySelector("#answer");
    input?.focus();
    return () => input?.value ?? "";
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
            // Two-sided: create per-card groups (multi-part cards → N entries sharing state),
            // shuffle the groups so a multi-part card's entries stay consecutive.
            const isBidirectional = deck.bidirectional === true;
            const cardGroups = cards.map((c) => {
                if (isBidirectional && Math.random() < 0.5) {
                    // Backward: show back (or first part), expect front.
                    return [{ front: c.back || (c.parts?.[0] ?? ""), back: c.front, hint: c.hintReverse || null, direction: "bwd" }];
                }
                // Forward direction — check for multi-part.
                const isMultiPart = c.parts && c.parts.length > 1;
                if (isMultiPart) {
                    const requiredCount = c.partsRequired != null
                        ? Math.min(Math.max(1, c.partsRequired), c.parts.length)
                        : c.parts.length;
                    const sharedState = { matched: new Set() };
                    return Array.from({ length: requiredCount }, (_, pi) => ({
                        front: c.front,
                        allParts: c.parts,
                        requiredCount,
                        sharedState,
                        partIndex: pi,
                        hint: c.hint || null,
                        direction: "fwd",
                    }));
                }
                return [{ front: c.front, back: c.back, hint: c.hint || null, direction: "fwd" }];
            });
            shuffle(cardGroups);
            return cardGroups.flat();
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
        // Multi-part two-sided question — delegate entirely.
        if (q.allParts) return renderMultiPartQuestion(q, root, mode);

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
                // For bidirectional cards, show labels that reflect which side was asked.
                const shownLabel = q.direction === "bwd" ? "achterkant" : "voorkant";
                const answerLabel = q.direction === "bwd" ? "voorkant" : "achterkant";
                root.innerHTML = `
                    <div class="flash-review">
                        <div class="flash-side flash-front-side">
                            <span class="flash-side-label">${shownLabel}</span>
                            <p class="flash-text">${escapeHtml(q.front)}</p>
                        </div>
                        <div class="flash-side flash-back-side">
                            <span class="flash-side-label">${answerLabel}</span>
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
                ${q.hint ? `<button type="button" class="fc-hint-toggle">? hint</button>
                <p class="fc-hint-text" hidden>${escapeHtml(q.hint)}</p>` : ""}
                <input type="text" id="answer" autocomplete="off"
                    placeholder="jouw antwoord…" aria-label="jouw antwoord">
            </div>`;
        if (skipBtn) skipBtn.hidden = true;
        if (checkBtn) checkBtn.textContent = "👉 antwoord";
        root.querySelector(".fc-hint-toggle")?.addEventListener("click", () => {
            const hintText = root.querySelector(".fc-hint-text");
            if (hintText) hintText.hidden = !hintText.hidden;
        });
        const input = root.querySelector("#answer");
        return () => input.value;
    },

    isCorrect(q, given) {
        // Multi-part: match against unmatched parts (all-at-once detection via splitAnswerTokens).
        if (q.allParts) {
            if (given === "__matched__") return q.sharedState.matched.size >= q.requiredCount;
            const { sharedState, allParts } = q;
            const newlyMatched = tryMatchParts(given, allParts, sharedState.matched);
            if (newlyMatched.size > 0) {
                for (const p of newlyMatched) sharedState.matched.add(p);
                return true;
            }
            return false;
        }
        if (!q.back && q.allCards) {
            // Order-independent: accept if the answer matches any remaining unmatched blank.
            for (const idx of q.blankIndices) {
                if (!(idx in fillInResults) && fuzzyMatchPhrase(given, q.allCards[idx])) {
                    if (isLenientMatch(given, q.allCards[idx]))
                        pushLenientMatch(given, q.allCards[idx], q.allCards.join(" … "));
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
        if (fuzzyMatchPhrase(given, q.back)) {
            if (isLenientMatch(given, q.back)) pushLenientMatch(given, q.back, q.front);
            return true;
        }
        return false;
    },

    describe(q) {
        if (q.allParts) return `${q.front} → [${q.allParts.join(" / ")}]`;
        return q.back ? `${q.front} → ${q.back}` : q.front;
    },
});

// ---------- Card wave animation (one-sided decks) ----------

function showCardWave(cards) {
    if (!cards.length) return;
    const overlay = document.createElement("div");
    overlay.className = "fc-wave-overlay";
    const items = cards
        .map((text, i) => `<div class="fc-wave-card" style="--i:${i}">${escapeHtml(text)}</div>`)
        .join("");
    overlay.innerHTML = `<div class="fc-wave-stage">${items}</div>`;
    document.body.appendChild(overlay);
    const totalMs = Math.min(cards.length - 1, 19) * 80 + 900;
    setTimeout(() => {
        overlay.classList.add("fc-wave-fade");
        setTimeout(() => overlay.remove(), 400);
    }, totalMs);
}

// ---------- Lenient-match observer ----------

(function setupResultObservers() {
    const pageExercises = document.getElementById("page-exercises");
    if (pageExercises) {
        new MutationObserver(() => {
            if (!pageExercises.hidden) lenientMatches.length = 0;
        }).observe(pageExercises, { attributes: true, attributeFilter: ["hidden"] });
    }
    const pageResult = document.getElementById("page-result");
    if (pageResult) {
        new MutationObserver(() => {
            if (!pageResult.hidden) {
                if (lenientMatches.length > 0) appendLenientSection(lenientMatches.splice(0));
                const deck = selectedDeckId ? getDeck(selectedDeckId) : null;
                if (deck && deckMode(deck) === "one-sided") {
                    showCardWave(deck.cards.map((c) => c.front).filter(Boolean));
                }
            }
        }).observe(pageResult, { attributes: true, attributeFilter: ["hidden"] });
    }
})();
