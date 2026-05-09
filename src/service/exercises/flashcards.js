// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { clearLeaveGuard, escapeHtml, refreshLeaveGuards, runExercise, setLeaveGuard, shuffle } from "@homework";

// ---------- Fuzzy matching ----------

function normalize(s) {
    return (
        String(s || "")
            .trim()
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/\p{Extended_Pictographic}/gu, "")
            // Strip variation selectors (U+FE00-FE0F), ZWJ (U+200D) and keycap combiner
            // (U+20E3) left behind after Extended_Pictographic removal (e.g. U+FE0F after ❄).
            .replace(/[\uFE00-\uFE0F\u20E3]|\u200D|\p{Emoji_Modifier}/gu, "")
            .replace(/\s+/g, " ")
            .trim()
    );
}

function cardParts(card) {
    const explicitParts = Array.isArray(card?.parts)
        ? card.parts.map((part) => String(part || "").trim()).filter(Boolean)
        : [];
    if (explicitParts.length > 0) return explicitParts;

    const rawBack = String(card?.back || "").trim();
    if (!rawBack) return [];

    const backParts = rawBack
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return backParts.length > 1 ? backParts : [rawBack];
}

function normalizeStoredCard(card) {
    if (!card || typeof card !== "object") return null;
    const normalized = { ...card };
    let changed = false;

    if (typeof normalized.front === "string") {
        const front = normalized.front.trim();
        if (front !== normalized.front) changed = true;
        normalized.front = front;
    }

    if (typeof normalized.wikimedia === "string") {
        const wikimedia = normalized.wikimedia.trim();
        if (wikimedia !== normalized.wikimedia) changed = true;
        normalized.wikimedia = wikimedia;
    }

    if (Array.isArray(normalized.parts)) {
        const parts = normalized.parts.map((part) => String(part || "").trim()).filter(Boolean);
        if (parts.length > 1) {
            if (JSON.stringify(parts) !== JSON.stringify(normalized.parts)) changed = true;
            normalized.parts = parts;
            const joined = parts.join("\n");
            if (normalized.back !== joined) {
                normalized.back = joined;
                changed = true;
            }
        } else if (parts.length === 1) {
            if (normalized.back !== parts[0] || Object.hasOwn(normalized, "parts")) changed = true;
            normalized.back = parts[0];
            delete normalized.parts;
        } else {
            delete normalized.parts;
            changed = true;
        }
    } else {
        const back = String(normalized.back || "").trim();
        if (back) {
            const parts = back
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            if (parts.length > 1) {
                normalized.parts = parts;
                normalized.back = back;
                changed = true;
            } else if (parts.length === 1 && normalized.back !== parts[0]) {
                normalized.back = parts[0];
                changed = true;
            }
        }
    }

    if (normalized.partsRequired != null && Array.isArray(normalized.parts)) {
        const max = normalized.parts.length;
        const clamped = Math.min(Math.max(1, Number(normalized.partsRequired) || max), max);
        if (clamped !== normalized.partsRequired) {
            normalized.partsRequired = clamped;
            changed = true;
        }
        if (normalized.parts.length <= 1) {
            delete normalized.partsRequired;
            changed = true;
        }
    }

    return changed ? normalized : card;
}

function normalizeStoredDeck(deck) {
    if (!deck || typeof deck !== "object") return null;
    if (!Array.isArray(deck.cards)) return null;

    const normalizedCards = [];
    let changed = false;
    for (const card of deck.cards) {
        const normalizedCard = normalizeStoredCard(card);
        if (normalizedCard) {
            normalizedCards.push(normalizedCard);
            if (normalizedCard !== card) changed = true;
        } else {
            changed = true;
        }
    }

    const name = typeof deck.name === "string" ? deck.name.trim() : "";
    if (!name) return null;
    if (name !== deck.name) changed = true;

    const mode =
        deck.mode === "one-sided" || deck.mode === "two-sided"
            ? deck.mode
            : normalizedCards.some((card) => card.back)
              ? "two-sided"
              : "one-sided";
    if (mode !== deck.mode) changed = true;

    const bidirectional = deck.bidirectional === true;
    if (bidirectional !== deck.bidirectional) changed = true;

    const normalized = {
        ...deck,
        name,
        mode,
        bidirectional,
        cards: normalizedCards,
    };
    return changed ? normalized : deck;
}

// Optimised O(n) space Levenshtein distance.
function levenshtein(a, b) {
    const m = a.length,
        n = b.length;
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
    "van",
    "de",
    "het",
    "een",
    "en",
    "in",
    "op",
    "of",
    "met",
    "te",
    "aan",
    "bij",
    "tot",
    "voor",
    "door",
    "als",
    "die",
    "dat",
    "om",
    "er",
    "zijn",
    "naar",
    "dan",
    "nog",
    "al",
    "zo",
    "af",
    "uit",
    "is",
    "was",
    "waren",
    "heeft",
    "hebben",
    "had",
    "worden",
    "je",
    "ze",
    "we",
]);

// Check that ≥60% of content words (non-stopwords) are fuzzily present.
function phraseCoverageMatch(given, expected) {
    const bWords = normalize(expected)
        .split(" ")
        .filter((w) => w.length > 0);
    const contentWords = bWords.filter((w) => !PHRASE_STOPWORDS.has(w));
    if (contentWords.length === 0) return false;
    const aWords = normalize(given)
        .split(" ")
        .filter((w) => w.length > 0);
    let matched = 0;
    for (const cw of contentWords) {
        if (aWords.some((aw) => fuzzyEqual(aw, cw))) matched++;
    }
    return matched / contentWords.length >= 0.6;
}

function classifyAnswerMatch(given, expected) {
    if (normalize(given) === normalize(expected)) {
        return { accepted: true, exact: true, practiceAgain: false };
    }
    if (fuzzyEqual(given, expected)) {
        return { accepted: true, exact: false, practiceAgain: false };
    }
    if (phraseCoverageMatch(given, expected)) {
        return { accepted: true, exact: false, practiceAgain: true };
    }
    return { accepted: false, exact: false, practiceAgain: false };
}

// ---------- Lenient-match tracking ----------

const lenientMatches = [];

function pushLenientMatch(given, expected, front) {
    lenientMatches.push({ given, expected, front });
}

// Match `given` against `expected` and, if accepted, auto-track as lenient when
// only the phrase-coverage fallback was used.  Single source of truth so callers
// can't forget the tracking step.
function matchAndTrackLenient(given, expected, front) {
    const match = classifyAnswerMatch(given, expected);
    if (!match.accepted) return null;
    if (match.practiceAgain) pushLenientMatch(given, expected, front);
    return match;
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
// `front` is the card's front text, used for lenient-match tracking.
// Returns match objects for newly matched parts.
function tryMatchParts(given, allParts, alreadyMatched, front, trackLenient = true) {
    const tokens = splitAnswerTokens(given);
    const newlyMatched = [];
    const remaining = allParts.filter((p) => !alreadyMatched.has(p));

    // Pass 1: match each split token against an unmatched part.
    for (const token of tokens) {
        for (const part of remaining) {
            if (newlyMatched.some((m) => m.part === part)) continue;
            const match = trackLenient ? matchAndTrackLenient(token, part, front) : classifyAnswerMatch(token, part);
            if (match) {
                newlyMatched.push({ part, ...match });
                break;
            }
        }
    }

    // Pass 2 (phrase-contains fallback): if the full input contains all content words
    // of a remaining part, count it as matched.  Handles any separator the user picks
    // (space, "en", "+", etc.) without needing to enumerate them all.
    // Only runs when pass 1 left parts unmatched.  Always lenient by definition.
    for (const part of remaining) {
        if (newlyMatched.some((m) => m.part === part)) continue;
        const bWords = normalize(part)
            .split(" ")
            .filter((w) => w.length > 0);
        const contentWords = bWords.filter((w) => !PHRASE_STOPWORDS.has(w));
        if (contentWords.length === 0) continue;
        const aWords = normalize(given)
            .split(" ")
            .filter((w) => w.length > 0);
        let matched = 0;
        for (const cw of contentWords) {
            if (aWords.some((aw) => fuzzyEqual(aw, cw))) matched++;
        }
        // Require ALL content words present AND at most one extra word per content word
        // (prevents single-word parts from matching long unrelated phrases).
        if (matched === contentWords.length && aWords.length <= contentWords.length * 2 + 1) {
            if (trackLenient) pushLenientMatch(given, part, front);
            newlyMatched.push({
                part,
                accepted: true,
                exact: false,
                practiceAgain: true,
            });
        }
    }

    return newlyMatched;
}

function buildAcceptedFeedback(answerText, practiceAgain, plural = false) {
    const intro = plural ? "Op de kaart staan:" : "Op de kaart staat:";
    const retry = practiceAgain ? " Deze kaart komt terug bij fouten oefenen." : "";
    return `Bijna goed. ${intro} ${answerText}.${retry}`;
}

function buildRevealFeedback(answerText, plural = false) {
    const intro = plural ? "Op de kaart staan:" : "Op de kaart staat:";
    return `${intro} ${answerText}.`;
}

// ---------- Deck validation ----------

// Validate and normalise raw deck data from any untrusted source (import URL,
// future sync, etc.).  Returns a clean object or null if data is unusable.
function validateDeckData(raw) {
    if (!raw || typeof raw.name !== "string" || !Array.isArray(raw.cards)) return null;
    const name = raw.name.trim();
    if (!name) return null;
    const cards = raw.cards
        .filter((c) => {
            if (!c) return false;
            if (typeof c.wikimedia === "string" && c.wikimedia.trim()) return true;
            return typeof c.front === "string" && c.front.trim();
        })
        .map((c) => normalizeStoredCard(c))
        .filter(Boolean);
    if (cards.length === 0) return null;
    const mode =
        raw.mode === "one-sided" || raw.mode === "two-sided"
            ? raw.mode
            : cards.some((card) => card.back)
              ? "two-sided"
              : "one-sided";
    return {
        name,
        mode,
        bidirectional: raw.bidirectional === true,
        cards,
    };
}

// ---------- Storage ----------

const STORAGE_KEY = "homework_flashcard_decks";
const FC_LAST_DECK_KEY = "homework_fc_last_deck";

function loadDecks() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(parsed)) return [];
        let changed = false;
        const normalized = parsed
            .map((deck) => {
                const next = normalizeStoredDeck(deck);
                if (next !== deck) changed = true;
                return next;
            })
            .filter(Boolean);
        if (changed) {
            saveDecks(normalized);
        }
        return normalized;
    } catch {
        return [];
    }
}

function saveDecks(decks) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
    } catch (_e) {}
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

// Canonical JSON key for comparing deck *content* independent of ID / createdAt /
// editor-only fields such as thumbUrl.  Two decks with the same key are identical.
function deckContentKey(deck) {
    return JSON.stringify({
        name: (deck.name || "").trim(),
        mode: deck.mode === "one-sided" ? "one-sided" : "two-sided",
        bidirectional: deck.bidirectional === true,
        cards: (deck.cards || []).map((c) => {
            if (c.wikimedia) {
                const card = { wikimedia: c.wikimedia.trim() };
                if (c.back) card.back = c.back;
                if (c.hint) card.hint = c.hint;
                return card;
            }
            const card = { front: c.front };
            if (c.back) card.back = c.back;
            if (c.parts) card.parts = c.parts;
            if (c.partsRequired != null) card.partsRequired = c.partsRequired;
            if (c.hint) card.hint = c.hint;
            if (c.hintReverse) card.hintReverse = c.hintReverse;
            return card;
        }),
    });
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Wikimedia Commons image cache ----------
//
// The Commons action API and the upload.wikimedia.org media CDN both expose
// permissive CORS headers (Access-Control-Allow-Origin: *), so all fetches
// below work from any origin — localhost during development and
// https://elementary.training in production.  The `origin=*` query parameter
// is required so the action API includes CORS response headers.

const WM_API = "https://commons.wikimedia.org/w/api.php";
const WM_DB_NAME = "homework-wikimedia-v1";
const WM_STORE = "blobs";

// Session-level map: filename → objectURL.  Populated lazily by wmLoad().
const imageObjectURLs = new Map();

let _wmDbHandle = null;
async function wmDb() {
    if (_wmDbHandle) return _wmDbHandle;
    _wmDbHandle = await new Promise((resolve, reject) => {
        const req = indexedDB.open(WM_DB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(WM_STORE);
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
    return _wmDbHandle;
}

async function wmDbGet(filename) {
    try {
        const db = await wmDb();
        return await new Promise((resolve) => {
            const req = db.transaction(WM_STORE).objectStore(WM_STORE).get(filename);
            req.onsuccess = () => resolve(req.result ?? null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function wmDbPut(filename, blob) {
    try {
        const db = await wmDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(WM_STORE, "readwrite");
            tx.objectStore(WM_STORE).put(blob, filename);
            tx.oncomplete = resolve;
            tx.onerror = (e) => reject(e.target.error);
        });
    } catch (_e) {}
}

// Resolve a Commons filename to a thumbnail URL via the action API.
async function wmResolveThumb(filename, width) {
    const params = new URLSearchParams({
        action: "query",
        titles: filename,
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: String(width),
        format: "json",
        origin: "*",
    });
    const resp = await fetch(`${WM_API}?${params}`);
    const data = await resp.json();
    for (const page of Object.values(data.query?.pages ?? {})) {
        const info = page.imageinfo?.[0];
        if (info?.thumburl) return info.thumburl;
        if (info?.url) return info.url;
    }
    throw new Error(`No image info for ${filename}`);
}

// Ensure a file is in imageObjectURLs; load from IDB cache or fetch if needed.
async function wmLoad(filename) {
    if (imageObjectURLs.has(filename)) return imageObjectURLs.get(filename);
    let blob = await wmDbGet(filename);
    if (!blob) {
        const thumbUrl = await wmResolveThumb(filename, 400);
        const resp = await fetch(thumbUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${thumbUrl}`);
        blob = await resp.blob();
        await wmDbPut(filename, blob);
    }
    const url = URL.createObjectURL(blob);
    imageObjectURLs.set(filename, url);
    return url;
}

// Pre-load all image cards in a deck. Returns { loaded, failed } filename arrays.
async function wmPreloadDeck(deck) {
    const filenames = [...new Set(deck.cards.filter((c) => c.wikimedia).map((c) => c.wikimedia))];
    const loaded = [],
        failed = [];
    await Promise.all(
        filenames.map(async (fn) => {
            try {
                await wmLoad(fn);
                loaded.push(fn);
            } catch (_e) {
                failed.push(fn);
            }
        }),
    );
    return { loaded, failed };
}

// Search Commons for images matching term. Returns [{ title, thumbUrl }].
// Uses the generator API so title lookup and imageinfo come in one round-trip.
async function wmSearch(term) {
    if (!term.trim()) return [];
    const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: term,
        gsrnamespace: "6",
        gsrlimit: "15",
        prop: "imageinfo",
        iiprop: "url",
        iiurlwidth: "120",
        format: "json",
        origin: "*",
    });
    try {
        const resp = await fetch(`${WM_API}?${params}`);
        const data = await resp.json();
        return Object.values(data.query?.pages ?? {})
            .filter((p) => p.imageinfo?.[0]?.thumburl)
            .map((p) => ({ title: p.title, thumbUrl: p.imageinfo[0].thumburl }));
    } catch {
        return [];
    }
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
        // Strip editor-only fields (thumbUrl) so shared deck URLs stay lean.
        cards: deck.cards.map((c) => {
            if (c.wikimedia) {
                const card = { wikimedia: c.wikimedia };
                if (c.back) card.back = c.back;
                return card;
            }
            const card = { front: c.front };
            if (c.back) card.back = c.back;
            if (c.parts) card.parts = c.parts;
            if (c.partsRequired != null) card.partsRequired = c.partsRequired;
            if (c.hint) card.hint = c.hint;
            if (c.hintReverse) card.hintReverse = c.hintReverse;
            return card;
        }),
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
    const data = validateDeckData(JSON.parse(json));
    if (!data) throw new Error("invalid deck data");
    return data;
}

// ---------- Example decks ----------

const EXAMPLE_DECKS = [
    {
        id: "__example_seasons__",
        name: "De seizoenen 🌸",
        mode: "one-sided",
        cards: [{ front: "lente 🌸" }, { front: "zomer ☀️" }, { front: "herfst 🍂" }, { front: "winter ❄️" }],
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
    const decks = loadDecks().filter((d) => !RETIRED_EXAMPLE_IDS.has(d.id));
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
let importPending = null; // { name, cards, _conflictId? } | null
let _highlightNewDeck = false; // true → animate selected deck item on next renderList()
const editorLeaveGuardId = Symbol("flashcards-editor");
let editorBaseline = null;
const reviewState = {
    active: false,
    deckId: null,
    cards: [],
    currentIndex: 0,
    flipped: new Set(),
    keyHandler: null,
    resizeHandler: null,
    resizeTimer: null,
};

function setupPage() {
    return document.getElementById("page-setup");
}

function playPage() {
    return document.getElementById("page-exercises");
}

function resultPage() {
    return document.getElementById("page-result");
}

function exerciseBox() {
    return document.getElementById("exercise");
}

function exerciseForm() {
    return document.getElementById("form-exercise");
}

function exerciseContent() {
    return document.getElementById("exercise-content");
}

function exerciseFeedback() {
    return document.getElementById("exercise-feedback");
}

function exerciseTitle() {
    return document.getElementById("exercise-title");
}

function reviewStartButton() {
    return document.getElementById("fc-start-review");
}

function captureEditorDraft() {
    if (!managerRoot?.querySelector(".deck-editor")) return null;
    return {
        name: managerRoot.querySelector("#deck-name-input")?.value || "",
        mode: managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked
            ? "two-sided"
            : "one-sided",
        bidirectional: !!managerRoot.querySelector("#deck-bidirectional")?.checked,
        cards: Array.from(managerRoot.querySelectorAll(".card-row")).map((row) => ({
            cardType: row.dataset.cardType || "text",
            front: row.querySelector(".card-front")?.value || "",
            wikimedia: row.querySelector(".card-wikimedia")?.value || "",
            thumb: row.querySelector(".card-wikimedia")?.dataset.thumb || "",
            back: row.querySelector(".card-back")?.value || "",
            minChecked: !!row.querySelector(".card-parts-min-check")?.checked,
            minCount: row.querySelector(".card-parts-min-count")?.value || "",
            hintChecked: !!row.querySelector(".card-hint-check[data-dir='fwd']")?.checked,
            hint: row.querySelector(".card-hint-input[data-dir='fwd']")?.value || "",
            hintReverseChecked: !!row.querySelector(".card-hint-check[data-dir='bwd']")?.checked,
            hintReverse: row.querySelector(".card-hint-input[data-dir='bwd']")?.value || "",
        })),
    };
}

function clearEditorLeaveGuard() {
    editorBaseline = null;
    clearLeaveGuard(editorLeaveGuardId);
}

function updateEditorLeaveGuard() {
    const draft = captureEditorDraft();
    if (!draft) {
        clearEditorLeaveGuard();
        return;
    }
    if (editorBaseline == null) editorBaseline = JSON.stringify(draft);
    setLeaveGuard(editorLeaveGuardId, {
        isActive() {
            const current = captureEditorDraft();
            return !!current && JSON.stringify(current) !== editorBaseline;
        },
        beforeUnloadMessage: "Je deck is nog niet opgeslagen.",
        getDialog() {
            return {
                title: "Deck niet opgeslagen",
                message: "Je wijzigingen zijn nog niet opgeslagen.",
                buttons: [
                    { value: "stay", label: "Blijf hier", className: "primary", id: "leave-stay", autofocus: true },
                    { value: "save", label: "Opslaan en weg", id: "leave-save" },
                    { value: "discard", label: "Weg zonder opslaan", id: "leave-discard" },
                ],
            };
        },
        onChoice(choice) {
            if (choice === "discard") return true;
            if (choice !== "save") return false;
            saveDeckFromEditor(editorState?.mode === "edit" ? editorState.id : null);
            return !managerRoot?.querySelector(".deck-editor");
        },
    });
    refreshLeaveGuards();
}

function bindEditorLeaveGuardTracking() {
    const editor = managerRoot?.querySelector(".deck-editor");
    if (!editor) return;
    editor.addEventListener("input", () => refreshLeaveGuards());
    editor.addEventListener("change", () => refreshLeaveGuards());
}

function renderManager() {
    if (!managerRoot) return;
    if (importPending) {
        renderImport();
    } else if (editorState) {
        renderEditor();
    } else {
        renderList();
    }
    syncReviewLaunchButton();
}

// ---------- Deck list view ----------

function renderList() {
    clearEditorLeaveGuard();
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
        histEl.dataset.exerciseId = selectedDeckId ? `flashcards-${selectedDeckId}` : "flashcards";
    }

    // Leave editing mode — show the start button, time-mode fieldset, and history.
    document.getElementById("page-setup")?.removeAttribute("data-editing");

    managerRoot.innerHTML = html;

    // Briefly highlight the deck that was just saved / imported.
    if (_highlightNewDeck && selectedDeckId) {
        const item = managerRoot.querySelector(`[data-deck-id="${selectedDeckId}"]`);
        if (item) {
            // Force a reflow before adding the class so the animation always starts fresh.
            void item.offsetWidth;
            item.classList.add("deck-item-new");
        }
        _highlightNewDeck = false;
    }

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
    syncReviewLaunchButton();
}

function ensureReviewLaunchButton() {
    const actions = document.querySelector("#form-setup .button-row");
    if (!actions) return null;
    let btn = reviewStartButton();
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "fc-start-review";
    btn.textContent = "👀 bekijk kaarten";
    btn.addEventListener("click", () => {
        void startReviewSession();
    });
    actions.appendChild(btn);
    return btn;
}

function syncReviewLaunchButton() {
    const btn = ensureReviewLaunchButton();
    if (!btn) return;
    const deck = selectedDeckId ? getDeck(selectedDeckId) : null;
    const hasCards = deck?.cards?.length > 0;
    btn.disabled = !hasCards;
    btn.hidden = reviewState.active;
}

function _reviewCardBackText(card) {
    const parts = cardParts(card);
    if (parts.length > 0) return parts.join(" / ");
    return String(card?.back || card?.front || "").trim();
}

function buildReviewCards(deck) {
    const mode = deckMode(deck);
    return deck.cards.map((card, index) => {
        const isImage = !!card.wikimedia;
        const rawParts = isImage ? [] : cardParts(card);
        const hasParts = rawParts.length > 1;
        const backText = rawParts.length > 0 ? rawParts.join(" / ") : String(card?.back || card?.front || "").trim();
        const partsRequired =
            hasParts && card.partsRequired != null && card.partsRequired < rawParts.length ? card.partsRequired : null;
        const oneSided = mode === "one-sided" && !card.back && !hasParts;
        return {
            index,
            oneSided,
            frontKind: isImage ? "image" : "text",
            frontText: String(card.front || "").trim() || "—",
            frontLabel: isImage ? "afbeelding" : mode === "two-sided" ? "voorkant" : "kaart",
            backKind: "text",
            backText: oneSided ? String(card.front || "").trim() || "—" : backText,
            backParts: hasParts ? rawParts : null,
            backPartsRequired: partsRequired,
            backLabel: isImage ? "antwoord" : hasParts ? "onderdelen" : mode === "two-sided" ? "achterkant" : "kaart",
            wikimedia: card.wikimedia || "",
        };
    });
}

function reviewImageHtml(filename) {
    const src = imageObjectURLs.get(filename) || "";
    if (src) {
        return `<img src="${src}" alt="afbeelding" class="fc-review-image">`;
    }
    return `<div class="fc-review-image-loading fc-review-face-image" data-wikimedia="${escapeHtml(filename)}">⏳ afbeelding laden…</div>`;
}

function reviewFaceHtml(label, kind, value, wikimedia = "", parts = null, partsRequired = null) {
    let body;
    if (kind === "image") {
        body = reviewImageHtml(wikimedia);
    } else if (parts && parts.length > 1) {
        const chips = parts.map((p) => `<span class="fc-review-part-chip">${escapeHtml(p)}</span>`).join("");
        const note =
            partsRequired != null
                ? `<span class="fc-review-parts-note">${partsRequired} van ${parts.length} verplicht</span>`
                : "";
        body = `<span class="fc-review-parts">${chips}${note}</span>`;
    } else {
        body = `<span class="fc-review-face-text">${escapeHtml(value || "—")}</span>`;
    }
    return `
        <span class="fc-review-face-body">
            <span class="fc-review-face-label">${escapeHtml(label)}</span>
            ${body}
        </span>`;
}

function buildReviewCardHtml(index) {
    const card = reviewState.cards[index];
    const total = reviewState.cards.length;
    return `<button type="button" class="fc-review-card is-active${card.oneSided ? " no-flip" : ""}${reviewState.flipped.has(index) ? " is-flipped" : ""}" data-index="${index}" aria-label="kaart ${index + 1} van ${total}">
        <span class="fc-review-card-inner">
            <span class="fc-review-face fc-review-face-front">
                ${reviewFaceHtml(card.frontLabel, card.frontKind, card.frontText, card.wikimedia)}
            </span>
            <span class="fc-review-face fc-review-face-back">
                ${reviewFaceHtml(card.backLabel, card.backKind, card.backText, "", card.backParts, card.backPartsRequired)}
            </span>
        </span>
    </button>`;
}

function renderReviewViewer() {
    if (!reviewState.active) return;
    const root = exerciseContent();
    const title = exerciseTitle();
    const feedback = exerciseFeedback();
    if (!root || !title || !feedback || reviewState.cards.length === 0) return;

    const total = reviewState.cards.length;
    title.textContent = `kaart 1 van ${total}`;
    const canFlip = reviewState.cards.some((c) => !c.oneSided);
    feedback.textContent = canFlip
        ? "Tik op de kaart om om te draaien. Gebruik pijltjes of de knoppen om te bladeren."
        : "Gebruik pijltjes of de knoppen om te bladeren.";
    feedback.classList.remove("is-bad");

    root.innerHTML = `
        <div class="fc-review-viewer">
            <div class="fc-review-stage">
                <div class="fc-review-viewport">
                    ${buildReviewCardHtml(0)}
                </div>
            </div>
            <div class="fc-review-controls">
                <button type="button" id="fc-review-prev" disabled>⬅ vorige</button>
                <p class="fc-review-counter">1 / ${total}</p>
                <button type="button" id="fc-review-next"${total <= 1 ? " disabled" : ""}>volgende ➡</button>
            </div>
        </div>`;

    root.querySelector(".fc-review-viewport").addEventListener("click", () => {
        toggleReviewFlip(reviewState.currentIndex);
    });
    root.querySelector("#fc-review-prev").addEventListener("click", () => moveReviewBy(-1));
    root.querySelector("#fc-review-next").addEventListener("click", () => moveReviewBy(1));

    fitReviewFaceText();
    requestAnimationFrame(() => {
        fitReviewFaceText();
        hydrateReviewImages();
    });
}

function hydrateReviewImages() {
    document.querySelectorAll(".fc-review-face-image[data-wikimedia]").forEach((el) => {
        const filename = el.dataset.wikimedia;
        if (!filename) return;
        if (imageObjectURLs.has(filename)) {
            el.outerHTML = `<img src="${imageObjectURLs.get(filename)}" alt="afbeelding" class="fc-review-image">`;
            return;
        }
        wmLoad(filename)
            .then((src) => {
                if (!reviewState.active || !el.isConnected) return;
                el.outerHTML = `<img src="${src}" alt="afbeelding" class="fc-review-image">`;
            })
            .catch(() => {
                if (!el.isConnected) return;
                el.textContent = "Afbeelding niet beschikbaar";
            });
    });
}

function fitReviewFaceText() {
    document.querySelectorAll(".fc-review-face-text").forEach((el) => {
        const body = el.closest(".fc-review-face-body");
        if (!body) return;
        el.style.fontSize = "";
        const computed = window.getComputedStyle(el);
        let size = parseFloat(computed.fontSize) || 22;
        const minSize = 11;
        while (
            size > minSize &&
            (el.scrollHeight > el.clientHeight + 1 ||
                el.scrollWidth > el.clientWidth + 1 ||
                body.scrollHeight > body.clientHeight + 1)
        ) {
            size -= 0.5;
            el.style.fontSize = `${size}px`;
        }
    });
}

function updateReviewActiveCard() {
    const current = reviewState.currentIndex;
    const total = reviewState.cards.length;
    const title = exerciseTitle();
    if (title) title.textContent = `kaart ${current + 1} van ${total}`;
    const viewport = document.querySelector(".fc-review-viewport");
    if (viewport) viewport.innerHTML = buildReviewCardHtml(current);
    const counter = document.querySelector(".fc-review-counter");
    if (counter) counter.textContent = `${current + 1} / ${total}`;
    const prev = document.getElementById("fc-review-prev");
    const next = document.getElementById("fc-review-next");
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current >= total - 1;
    fitReviewFaceText();
    hydrateReviewImages();
}

function moveReviewBy(step) {
    if (!reviewState.active || reviewState.cards.length === 0) return;
    const nextIndex = Math.max(0, Math.min(reviewState.cards.length - 1, reviewState.currentIndex + step));
    if (nextIndex === reviewState.currentIndex) return;
    reviewState.currentIndex = nextIndex;
    updateReviewActiveCard();
}

function toggleReviewFlip(index) {
    if (!reviewState.active) return;
    if (reviewState.cards[index]?.oneSided) return;
    const willFlip = !reviewState.flipped.has(index);
    if (willFlip) reviewState.flipped.add(index);
    else reviewState.flipped.delete(index);
    document.querySelector(".fc-review-card")?.classList.toggle("is-flipped", willFlip);
}

function showReviewPage() {
    setupPage().hidden = true;
    playPage().hidden = false;
    resultPage().hidden = true;
    playPage().scrollIntoView({ behavior: "smooth" });
}

function stopReviewSession({ keepPage = false } = {}) {
    if (!reviewState.active) return;
    reviewState.active = false;
    reviewState.deckId = null;
    reviewState.cards = [];
    reviewState.currentIndex = 0;
    reviewState.flipped.clear();
    if (reviewState.keyHandler) {
        document.removeEventListener("keydown", reviewState.keyHandler, true);
        reviewState.keyHandler = null;
    }
    if (reviewState.resizeHandler) {
        window.removeEventListener("resize", reviewState.resizeHandler);
        reviewState.resizeHandler = null;
    }
    if (reviewState.resizeTimer) {
        clearTimeout(reviewState.resizeTimer);
        reviewState.resizeTimer = null;
    }
    exerciseForm()?.removeAttribute("data-review-mode");
    exerciseBox()?.classList.remove("fc-review-session");
    const checkBtn = document.getElementById("button-check");
    const skipBtn = document.getElementById("button-skip");
    if (checkBtn) checkBtn.hidden = false;
    if (skipBtn) skipBtn.hidden = true;
    if (!keepPage) {
        setupPage().hidden = false;
        playPage().hidden = true;
        resultPage().hidden = true;
        setupPage().scrollIntoView({ behavior: "smooth" });
    }
    syncReviewLaunchButton();
}

async function startReviewSession() {
    const deck = selectedDeckId ? getDeck(selectedDeckId) : null;
    if (deck?.cards?.length === 0) return;
    stopReviewSession({ keepPage: true });
    reviewState.active = true;
    reviewState.deckId = deck.id;
    reviewState.cards = buildReviewCards(deck);
    reviewState.currentIndex = 0;
    reviewState.flipped.clear();
    exerciseForm()?.setAttribute("data-review-mode", "true");
    exerciseBox()?.classList.add("fc-review-session");
    const checkBtn = document.getElementById("button-check");
    const skipBtn = document.getElementById("button-skip");
    if (checkBtn) checkBtn.hidden = true;
    if (skipBtn) skipBtn.hidden = true;

    reviewState.keyHandler = (e) => {
        if (!reviewState.active || e.altKey || e.ctrlKey || e.metaKey) return;
        const targetTag = e.target?.tagName;
        if (targetTag === "INPUT" || targetTag === "TEXTAREA" || targetTag === "SELECT") return;
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            moveReviewBy(-1);
            return;
        }
        if (e.key === "ArrowRight") {
            e.preventDefault();
            moveReviewBy(1);
            return;
        }
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggleReviewFlip(reviewState.currentIndex);
        }
    };
    reviewState.resizeHandler = () => {
        if (reviewState.resizeTimer) clearTimeout(reviewState.resizeTimer);
        reviewState.resizeTimer = setTimeout(() => {
            reviewState.resizeTimer = null;
            fitReviewFaceText();
        }, 120);
    };
    document.addEventListener("keydown", reviewState.keyHandler, true);
    window.addEventListener("resize", reviewState.resizeHandler);
    showReviewPage();
    renderReviewViewer();
    syncReviewLaunchButton();
    const imageCards = deck.cards.some((card) => card.wikimedia?.trim());
    if (imageCards)
        wmPreloadDeck(deck)
            .then(() => {
                if (reviewState.active) hydrateReviewImages();
            })
            .catch(() => {});
}

function renderModeOptionsHtml(deck) {
    // Only text cards participate in the fill-in grid; image cards are standalone.
    const n = deck.cards.filter((c) => !c.wikimedia && c.front?.trim()).length;
    if (n === 0) return "";
    const defaultCount = Math.max(1, Math.ceil(n / 2));
    const partialModeHtml =
        n >= 2
            ? `
            <label class="fc-mode-radio">
                <input type="radio" name="fc-mode" value="partial">
                vul ontbrekende in:
                <input type="number" name="fc-count" id="fc-count" min="1" max="${n - 1}" value="${defaultCount}" disabled>
                van ${n} lege vakjes — de rest zie je als hint
            </label>`
            : "";
    return `
        <div class="fc-mode-options">
            <p class="fc-mode-label">Hoe wil je oefenen?</p>
            <label class="fc-mode-radio">
                <input type="radio" name="fc-mode" value="all" checked>
                vul alles in uit het hoofd (${n} lege vakjes)
            </label>
            ${partialModeHtml}
            <label class="fc-mode-radio fc-order-label">
                <input type="checkbox" id="fc-order-important">
                Volgorde is belangrijk <span class="fc-order-note">(standaard: willekeurig)</span>
            </label>
        </div>`;
}

function wireModeOptions() {
    const allRadio = managerRoot.querySelector("input[name='fc-mode'][value='all']");
    const partialRadio = managerRoot.querySelector("input[name='fc-mode'][value='partial']");
    const countInput = managerRoot.querySelector("input[name='fc-count']");
    if (!partialRadio || !countInput) return;
    const sync = () => {
        countInput.disabled = !partialRadio.checked;
    };
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
            try {
                localStorage.setItem(FC_LAST_DECK_KEY, deckId);
            } catch {}
            renderList();
            // Pre-load image cards in the background so they're ready when the session starts.
            {
                const sel = getDeck(deckId);
                if (sel) wmPreloadDeck(sel);
            }
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
    const isImageCard = !!card?.wikimedia;
    const hintVal = escapeHtml(card?.hint || "");
    const hintRevVal = escapeHtml(card?.hintReverse || "");
    const rawParts = isImageCard ? (card?.back ? [card.back] : []) : cardParts(card);
    const backVal = escapeHtml(rawParts.join("\n"));
    const partsCount = rawParts.length;
    const hasMinRequired = partsCount > 1 && card?.partsRequired != null && card.partsRequired < partsCount;
    const minRequiredVal = hasMinRequired ? card.partsRequired : partsCount;
    // Image cards always expose their answer field regardless of deck mode.
    const showBack = isTwoSided || isImageCard;
    const wmFilename = escapeHtml(card?.wikimedia || "");
    const wmThumb = escapeHtml(card?.thumbUrl || "");
    return `
        <div class="card-row" data-index="${i}" data-card-type="${isImageCard ? "image" : "text"}">
            <div class="card-type-toggle">
                <label class="fc-type-label">
                    <input type="radio" name="card-type-${i}" value="text"${isImageCard ? "" : " checked"}> ✍️ Tekst
                </label>
                <label class="fc-type-label">
                    <input type="radio" name="card-type-${i}" value="image"${isImageCard ? " checked" : ""}> 🖼️ Wikimedia afbeelding
                </label>
            </div>
            <div class="card-row-main">
                <div class="card-fields${showBack ? "" : " one-sided"}${isImageCard ? " has-image" : ""}">
                    <div class="card-field card-text-front"${isImageCard ? " hidden" : ""}>
                        <label for="card-front-${i}">Voorkant</label>
                        <input type="text" id="card-front-${i}" class="card-front"
                            value="${escapeHtml(card?.front || "")}" placeholder="Tekst op de voorkant" autocomplete="off">
                    </div>
                    <div class="card-field card-image-front"${isImageCard ? "" : " hidden"}>
                        <label>Afbeelding (Wikimedia Commons)</label>
                        <div class="card-image-picker">
                            <input type="hidden" class="card-wikimedia" value="${wmFilename}"${wmThumb ? ` data-thumb="${wmThumb}"` : ""}>
                            <div class="card-image-selected"${wmFilename ? "" : " hidden"}>
                                ${wmFilename && wmThumb ? `<img class="card-image-thumb" src="${wmThumb}" alt="">` : ""}
                                ${wmFilename ? `<span class="card-image-filename">${wmFilename}</span>` : ""}
                            </div>
                            <input type="text" class="card-image-search"
                                placeholder="Zoek op Wikimedia Commons…" autocomplete="off" spellcheck="false">
                            <div class="card-image-results" hidden></div>
                        </div>
                    </div>
                    <div class="card-field card-back-field">
                        <label for="card-back-${i}">${isImageCard ? "Antwoord" : "Achterkant"} <span class="optional">(één per regel)</span></label>
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
            <div class="card-hints"${isTwoSided || isImageCard ? "" : " hidden"}>
                <div class="card-hint-row">
                    <label class="fc-hint-label">
                        <input type="checkbox" class="card-hint-check" data-dir="fwd"${card?.hint ? " checked" : ""}>
                        ? hint
                    </label>
                    <input type="text" class="card-hint-input" data-dir="fwd"
                        value="${hintVal}" placeholder="hint voor de achterkant…"${card?.hint ? "" : " hidden"}>
                </div>
                <div class="card-hint-row card-hint-row-reverse"${isBidirectional && !isImageCard ? "" : " hidden"}>
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

// Toggle between text and image front for a card row.
function bindCardTypeToggle(row) {
    const isTwoSided = () => managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    row.querySelectorAll("input[name^='card-type-']").forEach((radio) => {
        radio.addEventListener("change", () => {
            if (!radio.checked) return;
            const isImage = radio.value === "image";
            row.dataset.cardType = radio.value;
            row.querySelector(".card-text-front").hidden = isImage;
            row.querySelector(".card-image-front").hidden = !isImage;
            const cardFields = row.querySelector(".card-fields");
            cardFields.classList.toggle("has-image", isImage);
            cardFields.classList.toggle("one-sided", !isImage && !isTwoSided());
            const hintsDiv = row.querySelector(".card-hints");
            if (hintsDiv) hintsDiv.hidden = !isTwoSided() && !isImage;
            // Back label
            const backLabel = row.querySelector(".card-back-field > label");
            if (backLabel) backLabel.firstChild.textContent = isImage ? "Antwoord " : "Achterkant ";
        });
    });
}

// Wire the Wikimedia image search inside a card row.
function bindImageSearch(row) {
    const searchInput = row.querySelector(".card-image-search");
    const resultsDiv = row.querySelector(".card-image-results");
    const wmInput = row.querySelector(".card-wikimedia");
    const selectedDiv = row.querySelector(".card-image-selected");
    if (!searchInput || !resultsDiv || !wmInput || !selectedDiv) return;

    let debounce = null;
    searchInput.addEventListener("input", () => {
        clearTimeout(debounce);
        const term = searchInput.value.trim();
        if (!term) {
            resultsDiv.hidden = true;
            resultsDiv.innerHTML = "";
            return;
        }
        debounce = setTimeout(async () => {
            resultsDiv.hidden = false;
            resultsDiv.innerHTML = `<div class="wm-search-status">Zoeken…</div>`;
            const results = await wmSearch(term);
            if (!searchInput.value.trim()) return;
            if (results.length === 0) {
                resultsDiv.innerHTML = `<div class="wm-search-status">Geen afbeeldingen gevonden.</div>`;
                return;
            }
            resultsDiv.innerHTML = results
                .map(
                    (r) =>
                        `<button type="button" class="wm-result-btn"
                    data-filename="${escapeHtml(r.title)}" data-thumb="${escapeHtml(r.thumbUrl)}"
                    title="${escapeHtml(r.title)}">
                    <img src="${escapeHtml(r.thumbUrl)}" alt="${escapeHtml(r.title)}" loading="lazy">
                </button>`,
                )
                .join("");
            resultsDiv.querySelectorAll(".wm-result-btn").forEach((btn) => {
                btn.addEventListener("click", () => {
                    const filename = btn.dataset.filename;
                    const thumb = btn.dataset.thumb;
                    wmInput.value = filename;
                    wmInput.dataset.thumb = thumb;
                    selectedDiv.innerHTML = `<img class="card-image-thumb" src="${escapeHtml(thumb)}" alt=""><span class="card-image-filename">${escapeHtml(filename)}</span>`;
                    selectedDiv.hidden = false;
                    searchInput.value = "";
                    resultsDiv.hidden = true;
                    resultsDiv.innerHTML = "";
                    // Ensure image type is active
                    row.dataset.cardType = "image";
                    const imgRadio = row.querySelector("input[name^='card-type-'][value='image']");
                    if (imgRadio) imgRadio.checked = true;
                    row.querySelector(".card-text-front").hidden = true;
                    row.querySelector(".card-image-front").hidden = false;
                    row.querySelector(".card-fields")?.classList.add("has-image");
                    row.querySelector(".card-fields")?.classList.remove("one-sided");
                    const backLabel = row.querySelector(".card-back-field > label");
                    if (backLabel) backLabel.firstChild.textContent = "Antwoord ";
                });
            });
        }, 400);
    });
}

// ---------- Hint toggle helpers (play phase) ----------

function hintToggleHtml(hint) {
    if (!hint) return "";
    return `<div class="fc-hint-wrap">
        <button type="button" class="fc-hint-toggle">? hint</button>
        <p class="fc-hint-text" hidden>${escapeHtml(hint)}</p>
    </div>`;
}

function wireHintToggle(root) {
    root.querySelector(".fc-hint-toggle")?.addEventListener("click", () => {
        const hintText = root.querySelector(".fc-hint-text");
        if (hintText) hintText.hidden = !hintText.hidden;
    });
}

function renderEditor() {
    // Hide the start button, time-mode fieldset, and history while editing.
    document.getElementById("page-setup")?.setAttribute("data-editing", "");

    const decks = loadDecks();
    let deck;
    if (editorState.mode === "edit") {
        deck = decks.find((d) => d.id === editorState.id) || {
            id: editorState.id,
            name: "",
            cards: [],
            createdAt: Date.now(),
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
                // Don't hide back field for image cards — they always need an answer.
                if (!cf.classList.contains("has-image")) {
                    cf.classList.toggle("one-sided", !twoSided);
                }
            });
            managerRoot.querySelector("#fc-bidir-option")?.classList.toggle("hidden", !twoSided);
            syncCardHints();
        });
    });

    // Toggle reverse-hint rows when bidirectional checkbox changes.
    managerRoot.querySelector("#deck-bidirectional")?.addEventListener("change", syncCardHints);

    managerRoot.querySelector("#fc-add-card").addEventListener("click", addCardRow);
    managerRoot
        .querySelector("#fc-save-deck")
        .addEventListener("click", () => saveDeckFromEditor(editorState.mode === "edit" ? editorState.id : null));
    managerRoot.querySelector("#fc-cancel-edit").addEventListener("click", () => {
        editorState = null;
        renderManager();
    });
    bindRemoveButtons();
    bindHintCheckboxes();
    managerRoot.querySelectorAll(".card-row").forEach((row) => {
        bindCardPartHandlers(row);
        bindCardTypeToggle(row);
        bindImageSearch(row);
    });

    const nameInput = managerRoot.querySelector("#deck-name-input");
    if (!nameInput.value) {
        nameInput.focus();
    } else {
        const emptyFront = managerRoot.querySelector(".card-front");
        if (emptyFront && !emptyFront.value) emptyFront.focus();
    }
    editorBaseline = JSON.stringify(captureEditorDraft());
    updateEditorLeaveGuard();
    bindEditorLeaveGuardTracking();
}

// Show/hide hint rows based on current deck-type and bidirectional state.
function syncCardHints() {
    const isTwoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    const isBidir = isTwoSided && managerRoot.querySelector("#deck-bidirectional")?.checked;
    managerRoot.querySelectorAll(".card-hints").forEach((h) => {
        const cardRow = h.closest(".card-row");
        const isImage = cardRow?.dataset.cardType === "image";
        h.hidden = !isTwoSided && !isImage;
    });
    managerRoot.querySelectorAll(".card-hint-row-reverse").forEach((row) => {
        row.hidden = !isBidir;
    });
}

// Wire hint checkboxes within `root` so they show/hide their text input.
function bindHintCheckboxesFor(root) {
    root.querySelectorAll(".card-hint-check").forEach((cb) => {
        const hintRow = cb.closest(".card-hint-row");
        const input = hintRow?.querySelector(".card-hint-input");
        if (!input) return;
        cb.addEventListener("change", () => {
            input.hidden = !cb.checked;
            if (cb.checked) input.focus();
        });
    });
}

function bindHintCheckboxes() {
    bindHintCheckboxesFor(managerRoot);
}

function autoResizeTextarea(ta) {
    // Vertical: collapse then expand to content.
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;

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
        const parts = textarea.value
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
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
        btn.addEventListener("click", handleRemoveCardClick);
    });
}

function handleRemoveCardClick(e) {
    removeCardRow(Number(e.currentTarget.dataset.index));
}

function addCardRow() {
    const list = managerRoot.querySelector("#card-list");
    const i = list.querySelectorAll(".card-row").length;
    const isTwoSided = managerRoot.querySelector("input[name='deck-type'][value='two-sided']")?.checked;
    const isBidirectional = isTwoSided && managerRoot.querySelector("#deck-bidirectional")?.checked;
    const div = document.createElement("div");
    div.innerHTML = cardRowHtml(null, i, isTwoSided, isBidirectional);
    const row = div.firstElementChild;
    row.querySelector("[data-action='remove-card']").addEventListener("click", handleRemoveCardClick);
    bindHintCheckboxesFor(row);
    bindCardTypeToggle(row);
    bindImageSearch(row);
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

        if (row.dataset.cardType === "image") {
            const wikimediaVal = row.querySelector(".card-wikimedia")?.value.trim();
            if (!wikimediaVal) return; // skip rows with no image selected
            const backRaw = row.querySelector(".card-back")?.value?.trim() || "";
            if (!backRaw) return; // answer is required for image cards
            const card = { wikimedia: wikimediaVal, back: backRaw };
            // Store thumb URL locally (editor preview only — stripped on share).
            const thumb = row.querySelector(".card-wikimedia")?.dataset.thumb;
            if (thumb) card.thumbUrl = thumb;
            const hintCheck = row.querySelector(".card-hint-check[data-dir='fwd']");
            const hintInput = row.querySelector(".card-hint-input[data-dir='fwd']");
            if (hintCheck?.checked) {
                const val = hintInput?.value.trim();
                if (!val) {
                    hintErrorInput = hintInput;
                    return;
                }
                card.hint = val;
            }
            cards.push(card);
            return;
        }

        const front = row.querySelector(".card-front")?.value.trim();
        if (!front) return;
        const card = { front };
        if (isTwoSided) {
            const backRaw = row.querySelector(".card-back")?.value || "";
            const parts = backRaw
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0);
            if (parts.length > 1) {
                card.parts = parts;
                card.back = parts.join("\n");
                const minCheck = row.querySelector(".card-parts-min-check");
                if (minCheck?.checked) {
                    const minVal = Number(row.querySelector(".card-parts-min-count")?.value) || parts.length > 0;
                    card.partsRequired = Math.min(Math.max(1, minVal), parts.length);
                }
            } else if (parts.length === 1) {
                card.back = parts[0];
            }

            const hintCheck = row.querySelector(".card-hint-check[data-dir='fwd']");
            const hintInput = row.querySelector(".card-hint-input[data-dir='fwd']");
            if (hintCheck?.checked) {
                const val = hintInput?.value.trim();
                if (!val) {
                    hintErrorInput = hintInput;
                    return;
                }
                card.hint = val;
            }

            if (isBidirectional) {
                const hintRevCheck = row.querySelector(".card-hint-check[data-dir='bwd']");
                const hintRevInput = row.querySelector(".card-hint-input[data-dir='bwd']");
                if (hintRevCheck?.checked) {
                    const val = hintRevInput?.value.trim();
                    if (!val) {
                        hintErrorInput = hintRevInput;
                        return;
                    }
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
        alert("Een deck moet minstens één kaart hebben met een voorkant (of een afbeelding met antwoord).");
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
    _highlightNewDeck = true;
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
    } catch (_e) {
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

// Shared save logic used by both the normal confirm and the conflict resolution buttons.
// `name` is the final deck name; `replaceId` (optional) replaces an existing deck.
async function doImport(name, replaceId) {
    const deck = importPending;
    const isTwo = deckMode(deck) === "two-sided";
    const imageCount = deck.cards.filter((c) => c.wikimedia).length;

    // Disable all action buttons in the import box while saving.
    managerRoot.querySelectorAll(".fc-import-box button").forEach((b) => {
        b.disabled = true;
    });
    if (imageCount > 0) {
        const primary = managerRoot.querySelector(".fc-import-box .primary");
        if (primary) primary.textContent = "⏳ Afbeeldingen laden…";
    }

    const decks = loadDecks();
    let id;
    if (replaceId) {
        const idx = decks.findIndex((d) => d.id === replaceId);
        if (idx >= 0) {
            decks[idx] = {
                ...decks[idx],
                name,
                mode: deck.mode || (isTwo ? "two-sided" : "one-sided"),
                bidirectional: deck.bidirectional || false,
                cards: deck.cards,
            };
            id = replaceId;
        }
    }
    if (!id) {
        id = generateId();
        decks.push({
            id,
            name,
            mode: deck.mode || (isTwo ? "two-sided" : "one-sided"),
            bidirectional: deck.bidirectional || false,
            cards: deck.cards,
            createdAt: Date.now(),
        });
    }
    saveDecks(decks);
    selectedDeckId = id;
    if (hiddenDeckInput) hiddenDeckInput.value = id;
    importPending = null;
    history.replaceState({}, "", location.pathname);

    if (imageCount > 0) {
        const { failed } = await wmPreloadDeck({ cards: deck.cards });
        showToast(
            failed.length > 0
                ? `Deck geïmporteerd, maar ${failed.length} afbeelding${failed.length === 1 ? "" : "en"} kon niet worden geladen.`
                : `Deck "${name}" is geïmporteerd! 🎉`,
        );
    } else {
        showToast(`Deck "${name}" is geïmporteerd! 🎉`);
    }
    _highlightNewDeck = true;
    renderManager();
}

function renderImport() {
    clearEditorLeaveGuard();
    // Hide the start button, time-mode fieldset, and history while importing.
    document.getElementById("page-setup")?.setAttribute("data-editing", "");

    const deck = importPending;
    const isTwo = deckMode(deck) === "two-sided";
    const isBidir = isTwo && deck.bidirectional;
    const count = deck.cards.length;
    const imageCount = deck.cards.filter((c) => c.wikimedia).length;
    const modeLabel = !isTwo ? "uit het hoofd" : isBidir ? "twee richtingen" : "voor-achterkant";
    const imageNote = imageCount > 0 ? ` · ${imageCount} afbeelding${imageCount === 1 ? "" : "en"}` : "";
    const imageNoteParagraph =
        imageCount > 0
            ? `<p class="fc-import-image-note">📥 Afbeeldingen worden na import automatisch gedownload.</p>`
            : "";
    const deckPreview = `
        <div class="deck-preview">
            <strong>${escapeHtml(deck.name)}</strong>
            <span>${count} kaart${count === 1 ? "" : "en"} · ${modeLabel}${imageNote}</span>
        </div>`;

    const hasConflict = !!deck._conflictId;

    if (hasConflict) {
        managerRoot.innerHTML = `
            <div class="fc-import-box">
                <h3>Deck al aanwezig</h3>
                <p>Je hebt al een deck genaamd <strong>${escapeHtml(deck.name)}</strong>, maar de inhoud verschilt. Kies wat je wil doen:</p>
                ${deckPreview}
                ${imageNoteParagraph}
                <div class="field">
                    <label for="fc-import-name">Naam voor nieuw deck</label>
                    <input type="text" id="fc-import-name" value="${escapeHtml(deck.name)}" autocomplete="off">
                </div>
                <div class="button-row">
                    <button type="button" id="fc-overwrite-import" class="primary">♻️ Overschrijf bestaand</button>
                    <button type="button" id="fc-saveas-import">💾 Opslaan als nieuw</button>
                    <button type="button" id="fc-cancel-import">Annuleer</button>
                </div>
            </div>`;

        managerRoot.querySelector("#fc-overwrite-import").addEventListener("click", () => {
            doImport(deck.name, deck._conflictId);
        });
        managerRoot.querySelector("#fc-saveas-import").addEventListener("click", () => {
            const name = (managerRoot.querySelector("#fc-import-name")?.value || "").trim() || deck.name;
            doImport(name, null);
        });
    } else {
        managerRoot.innerHTML = `
            <div class="fc-import-box">
                <h3>Deck importeren?</h3>
                <p>Je hebt een gedeeld deck ontvangen:</p>
                ${deckPreview}
                ${imageNoteParagraph}
                <div class="button-row">
                    <button type="button" id="fc-confirm-import" class="primary">📥 Importeer dit deck</button>
                    <button type="button" id="fc-cancel-import">Annuleer</button>
                </div>
            </div>`;

        managerRoot.querySelector("#fc-confirm-import").addEventListener("click", () => {
            doImport(deck.name, null);
        });
    }

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

    // While the editor or import UI is open the outer #form-setup submit button
    // is hidden via CSS, but browsers still fire implicit form submission when
    // the user presses Enter inside a text input.  Block that here so editing a
    // card name never accidentally starts a new exercise session.
    managerRoot.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.target.tagName === "TEXTAREA") return;
        if (managerRoot.querySelector(".deck-editor, .fc-import-box")) {
            e.preventDefault();
        }
    });

    document.querySelector("#page-exercises .button-reset")?.addEventListener(
        "click",
        (e) => {
            if (!reviewState.active) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            stopReviewSession();
        },
        true,
    );

    ensureExamples();

    const importParam = new URLSearchParams(location.search).get("import");
    if (importParam) {
        try {
            const data = await decodeDeckParam(importParam);
            history.replaceState({}, "", location.pathname);
            const incomingKey = deckContentKey(data);
            const decks = loadDecks();
            const exactMatch = decks.find((d) => deckContentKey(d) === incomingKey);
            if (exactMatch) {
                // Identical content already in collection — just select it.
                selectedDeckId = exactMatch.id;
                if (hiddenDeckInput) hiddenDeckInput.value = exactMatch.id;
                showToast("Dit deck staat al in je collectie! ✅");
            } else {
                const nameConflict = decks.find((d) => d.name.trim() === data.name.trim());
                // Store conflict id on the pending object so renderImport() can offer
                // overwrite vs. save-as-new options.
                importPending = nameConflict ? { ...data, _conflictId: nameConflict.id } : data;
            }
        } catch (_e) {
            history.replaceState({}, "", location.pathname);
        }
    }

    renderManager();
    ensureReviewLaunchButton();
    syncReviewLaunchButton();

    // Pre-load image cards for the initially selected deck (set by restoreLastDeck).
    if (selectedDeckId) {
        const d = getDeck(selectedDeckId);
        if (d) wmPreloadDeck(d);
    }
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
    if (skipBtn) {
        skipBtn.hidden = false;
        skipBtn.textContent = "🤷 weet het niet";
    }
    if (checkBtn) checkBtn.textContent = "✅ controleer";

    const input = root.querySelector("#answer");
    input?.focus();
    return () => input?.value;
}

function renderFillInReview(q, root) {
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
    if (checkBtn) {
        checkBtn.hidden = false;
        checkBtn.textContent = "👉 antwoord";
    }

    const matchedHtml = [...matched].map((p) => `<div class="mp-part mp-matched">✅ ${escapeHtml(p)}</div>`).join("");

    root.innerHTML = `
        <div class="flash-question">
            <p class="flash-text">${escapeHtml(q.front)}</p>
            ${hintToggleHtml(q.hint)}
            <p class="fc-mp-progress">${matched.size}/${requiredCount} gevonden</p>
            ${matchedHtml}
            <input type="text" id="answer" autocomplete="off"
                placeholder="geef een onderdeel…" aria-label="jouw antwoord">
        </div>`;

    wireHintToggle(root);

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

    loadConfig(_form, saved) {
        if (!saved?.deckId) return;
        const deck = getDeck(saved.deckId);
        if (!deck) return;
        selectedDeckId = saved.deckId;
        try {
            localStorage.setItem(FC_LAST_DECK_KEY, saved.deckId);
        } catch {}
        if (hiddenDeckInput) hiddenDeckInput.value = saved.deckId;
        renderList();
        // Re-apply mode options that were saved alongside the deck selection.
        // renderList() creates the mode-options HTML with defaults, so we overwrite
        // them here after the DOM exists.
        if (saved.fcMode) {
            const modeRadio = managerRoot?.querySelector(`input[name='fc-mode'][value='${saved.fcMode}']`);
            if (modeRadio) {
                modeRadio.checked = true;
                const countInput = managerRoot.querySelector("#fc-count");
                if (countInput) {
                    countInput.disabled = saved.fcMode !== "partial";
                    if (saved.fcMode === "partial" && saved.fcCount) {
                        countInput.value = String(saved.fcCount);
                    }
                }
            }
        }
        if (saved.fcOrderImportant) {
            const orderCheck = managerRoot?.querySelector("#fc-order-important");
            if (orderCheck) orderCheck.checked = true;
        }
    },

    readConfig(form) {
        return {
            deckId: form.querySelector("#selected-deck-id")?.value || "",
            fcMode: form.querySelector("input[name='fc-mode']:checked")?.value || "all",
            fcCount: Number(form.querySelector("input[name='fc-count']")?.value) || 0,
            fcOrderImportant: form.querySelector("#fc-order-important")?.checked || false,
        };
    },

    validateConfig(cfg) {
        if (!cfg.deckId) return "Kies een deck om te oefenen.";
        const deck = getDeck(cfg.deckId);
        if (!deck) return "Dit deck bestaat niet meer — kies een ander deck.";
        if (deck.cards.length === 0) return "Dit deck heeft geen kaarten.";
        const isOneSided = deckMode(deck) === "one-sided";
        if (isOneSided && cfg.fcMode === "partial") {
            const textCount = deck.cards.filter((c) => !c.wikimedia && c.front?.trim()).length;
            if (textCount < 2) {
                return "Deze modus heeft minstens 2 tekstkaarten nodig.";
            }
            const max = textCount - 1;
            if (!cfg.fcCount || cfg.fcCount < 1 || cfg.fcCount > max) {
                return `Kies een aantal tussen 1 en ${max}.`;
            }
        }
        return null;
    },

    buildDeck(cfg) {
        const deck = getDeck(cfg.deckId);
        if (!deck) return [];
        // Image cards always produce standalone questions regardless of deck mode.
        const imageCards = deck.cards.filter((c) => c.wikimedia?.trim());
        const textCards = deck.cards.filter((c) => !c.wikimedia && c.front?.trim());
        const isOneSided = deckMode(deck) === "one-sided";

        const imageQuestions = imageCards.map((c) => ({
            kind: "image",
            wikimedia: c.wikimedia,
            back: c.back || "",
            hint: c.hint || null,
        }));

        if (!isOneSided) {
            // Two-sided text cards: per-card groups, shuffle groups so multi-part entries stay consecutive.
            const isBidirectional = deck.bidirectional === true;
            const cardGroups = textCards.map((c) => {
                if (isBidirectional && Math.random() < 0.5) {
                    const parts = cardParts(c);
                    return [
                        {
                            kind: "two-sided",
                            front: parts[0] || c.back || "",
                            back: c.front,
                            hint: c.hintReverse || null,
                            direction: "bwd",
                        },
                    ];
                }
                const parts = cardParts(c);
                const isMultiPart = parts.length > 1;
                if (isMultiPart) {
                    const requiredCount =
                        c.partsRequired != null ? Math.min(Math.max(1, c.partsRequired), parts.length) : parts.length;
                    const sharedState = {
                        matched: new Set(),
                        revealAtEnd: false,
                        revealPracticeAgain: false,
                        revealShown: false,
                    };
                    return Array.from({ length: requiredCount }, (_, pi) => ({
                        kind: "multi-part",
                        front: c.front,
                        allParts: parts,
                        requiredCount,
                        sharedState,
                        partIndex: pi,
                        hint: c.hint || null,
                        direction: "fwd",
                    }));
                }
                return [{ kind: "two-sided", front: c.front, back: c.back, hint: c.hint || null, direction: "fwd" }];
            });
            // Wrap each image question as a single-item group so it shuffles in
            // with text card groups rather than always appearing first.
            const allGroups = [...imageQuestions.map((q) => [q]), ...cardGroups];
            shuffle(allGroups);
            return allGroups.flat();
        }

        // One-sided fill-in mode (text cards only).
        // Image cards are shuffled among themselves and come before the fill-in
        // grid, which is a single compound exercise covering all text cards.
        shuffle(imageQuestions);
        clearFillInState();
        if (textCards.length === 0) return imageQuestions;

        // Shuffle card positions unless the user opted in to strict ordering.
        const orderedTextCards = cfg.fcOrderImportant ? textCards : shuffle([...textCards]);
        const allFronts = orderedTextCards.map((c) => c.front);
        let blankIndices;

        if (cfg.fcMode === "partial") {
            const count = Math.min(Math.max(1, cfg.fcCount), textCards.length - 1);
            const idx = textCards.map((_, i) => i);
            shuffle(idx);
            blankIndices = idx.slice(0, count).sort((a, b) => a - b);
        } else {
            blankIndices = textCards.map((_, i) => i);
        }

        const fillInQuestions = blankIndices.map((idx) => ({
            kind: "fill-in",
            front: allFronts[idx],
            index: idx,
            allCards: allFronts,
            blankIndices,
        }));
        return [...imageQuestions, ...fillInQuestions];
    },

    renderQuestion(q, root, mode) {
        switch (q.kind) {
            case "multi-part":
                return renderMultiPartQuestion(q, root, mode);
            case "fill-in":
                if (mode.kind === "review") {
                    renderFillInReview(q, root);
                    return;
                }
                return renderFillInQuestion(q, root);
            case "image": {
                const skipBtn = document.getElementById("button-skip");
                const checkBtn = document.getElementById("button-check");
                const imgSrc = imageObjectURLs.get(q.wikimedia) || "";
                if (mode.kind === "review") {
                    root.innerHTML = `
                        <div class="flash-review">
                            <div class="flash-side flash-front-side flash-image-side">
                                <span class="flash-side-label">afbeelding</span>
                                ${
                                    imgSrc
                                        ? `<img src="${imgSrc}" alt="afbeelding" class="flash-card-image">`
                                        : `<div class="flash-image-missing">Afbeelding niet beschikbaar</div>`
                                }
                            </div>
                            <div class="flash-side flash-back-side">
                                <span class="flash-side-label">antwoord</span>
                                <p class="flash-text">${escapeHtml(q.back)}</p>
                            </div>
                        </div>`;
                    return;
                }
                root.innerHTML = `
                    <div class="flash-question">
                        <div class="flash-image-container">
                            ${
                                imgSrc
                                    ? `<img src="${imgSrc}" alt="afbeelding" class="flash-card-image">`
                                    : `<div class="flash-image-loading">⏳ afbeelding laden…</div>`
                            }
                        </div>
                        ${hintToggleHtml(q.hint)}
                        <input type="text" id="answer" autocomplete="off"
                            placeholder="wat zie je?" aria-label="jouw antwoord">
                    </div>`;
                if (skipBtn) skipBtn.hidden = true;
                if (checkBtn) {
                    checkBtn.hidden = false;
                    checkBtn.textContent = "👉 antwoord";
                }
                wireHintToggle(root);
                // If not cached yet, retry once the load completes in the background.
                if (!imgSrc) {
                    wmLoad(q.wikimedia)
                        .then((url) => {
                            const container = root.querySelector(".flash-image-container");
                            if (container)
                                container.innerHTML = `<img src="${url}" alt="afbeelding" class="flash-card-image">`;
                        })
                        .catch(() => {});
                }
                const input = root.querySelector("#answer");
                return () => input?.value ?? "";
            }
            case "two-sided": {
                const skipBtn = document.getElementById("button-skip");
                const checkBtn = document.getElementById("button-check");
                if (mode.kind === "review") {
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
                    return;
                }
                root.innerHTML = `
                    <div class="flash-question">
                        <p class="flash-text">${escapeHtml(q.front)}</p>
                        ${hintToggleHtml(q.hint)}
                        <input type="text" id="answer" autocomplete="off"
                            placeholder="jouw antwoord…" aria-label="jouw antwoord">
                    </div>`;
                if (skipBtn) skipBtn.hidden = true;
                if (checkBtn) checkBtn.textContent = "👉 antwoord";
                wireHintToggle(root);
                const input = root.querySelector("#answer");
                return () => input.value;
            }
            default:
                throw new Error(`Unknown card kind: ${q.kind}`);
        }
    },

    evaluateAnswer(q, given) {
        switch (q.kind) {
            case "multi-part": {
                if (given === "__matched__") {
                    return {
                        correct: q.sharedState.matched.size >= q.requiredCount,
                        exact: !q.sharedState.revealShown,
                    };
                }
                const { sharedState, allParts } = q;
                const partialRequired = q.requiredCount < allParts.length;
                const newlyMatched = tryMatchParts(given, allParts, sharedState.matched, q.front, !partialRequired);
                if (newlyMatched.length > 0) {
                    for (const match of newlyMatched) sharedState.matched.add(match.part);
                    const exactThisStep = partialRequired || newlyMatched.every((match) => match.exact);
                    const practiceAgainThisStep = !partialRequired && newlyMatched.some((match) => match.practiceAgain);
                    if (!partialRequired && !exactThisStep) sharedState.revealAtEnd = true;
                    if (practiceAgainThisStep) sharedState.revealPracticeAgain = true;
                    const finished = sharedState.matched.size >= q.requiredCount;
                    const showReview =
                        !partialRequired && finished && sharedState.revealAtEnd && !sharedState.revealShown;
                    if (showReview) sharedState.revealShown = true;
                    return {
                        correct: true,
                        exact: partialRequired || (exactThisStep && !sharedState.revealAtEnd),
                        showReview,
                        practiceAgain: practiceAgainThisStep,
                        feedback: showReview
                            ? buildAcceptedFeedback(
                                  allParts.join(" / "),
                                  sharedState.revealPracticeAgain,
                                  allParts.length > 1,
                              )
                            : undefined,
                    };
                }
                return { correct: false };
            }
            case "fill-in": {
                // Order-independent: accept if the answer matches any remaining unmatched blank.
                for (const idx of q.blankIndices) {
                    if (idx in fillInResults) continue;
                    const match = matchAndTrackLenient(given, q.allCards[idx], q.allCards.join(" … "));
                    if (match) {
                        fillInResults[idx] = true;
                        return {
                            correct: true,
                            exact: match.exact,
                            showReview: !match.exact,
                            practiceAgain: match.practiceAgain,
                            feedback: match.exact
                                ? undefined
                                : buildAcceptedFeedback(q.allCards[idx], match.practiceAgain),
                        };
                    }
                }
                // No match — mark the first unanswered blank as wrong.
                const firstOpen = q.blankIndices.find((i) => !(i in fillInResults));
                if (firstOpen !== undefined) fillInResults[firstOpen] = false;
                return { correct: false };
            }
            case "image": {
                const match = matchAndTrackLenient(given, q.back, q.wikimedia);
                return match
                    ? {
                          correct: true,
                          exact: match.exact,
                          showReview: !match.exact,
                          practiceAgain: match.practiceAgain,
                          feedback: match.exact ? undefined : buildAcceptedFeedback(q.back, match.practiceAgain),
                      }
                    : { correct: false };
            }
            case "two-sided": {
                const match = matchAndTrackLenient(given, q.back, q.front);
                return match
                    ? {
                          correct: true,
                          exact: match.exact,
                          showReview: !match.exact,
                          practiceAgain: match.practiceAgain,
                          feedback: match.exact ? undefined : buildAcceptedFeedback(q.back, match.practiceAgain),
                      }
                    : { correct: false };
            }
            default:
                throw new Error(`Unknown card kind: ${q.kind}`);
        }
    },

    evaluateSkip(q) {
        if (q.kind === "two-sided" || q.kind === "image") {
            return { showReview: true, feedback: buildRevealFeedback(q.back) };
        }
        if (q.kind !== "multi-part") return null;
        if (q.partIndex !== q.sharedState.matched.size) return null;
        q.sharedState.revealShown = true;
        return {
            showReview: true,
            feedback: buildRevealFeedback(q.allParts.join(" / "), q.allParts.length > 1),
        };
    },

    describe(q) {
        switch (q.kind) {
            case "multi-part":
                return `${q.front} → [${q.allParts.join(" / ")}]`;
            case "two-sided":
                return `${q.front} → ${q.back}`;
            case "image":
                return `[🖼️ ${q.wikimedia}] → ${q.back}`;
            case "fill-in":
                return q.front;
            default:
                throw new Error(`Unknown card kind: ${q.kind}`);
        }
    },
});

// ---------- Card wave animation (one-sided decks) ----------

function showCardWave(cards) {
    if (cards.length === 0) return;
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
                    if (pageResult.querySelector("#review-button-repeat")) return;
                    const scoreText = pageResult.querySelector("h3")?.textContent ?? "";
                    const [rawCorrect, rawTotal] = scoreText.split("/");
                    const correct = parseInt(rawCorrect, 10);
                    const total = parseInt(rawTotal, 10);
                    if (correct > 0 && correct === total) {
                        showCardWave(deck.cards.map((c) => c.front).filter(Boolean));
                    }
                }
            }
        }).observe(pageResult, { attributes: true, attributeFilter: ["hidden"] });
    }
})();
