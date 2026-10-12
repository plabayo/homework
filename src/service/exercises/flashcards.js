// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    answerChecking,
    downloadDeck,
    findImportMatch,
    inferDeckMode,
    parseDeckData,
    portableDeck,
    practiceConfig,
    practiceFromConfig,
    readPractice,
    storeImportedDeck,
} from "@flashcards-data";

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
    if (Array.isArray(card?.parts)) {
        return card.parts.map((part) => String(part || "").trim()).filter(Boolean);
    }
    const back = String(card?.back || "").trim();
    return back ? [back] : [];
}

// Normalise answer representation to exclusive fields (multi-part XOR single-part).
// Mutates `normalized` in place. Returns true when any field changed.
function normalizeAnswerFields(normalized) {
    let changed = false;
    if (Array.isArray(normalized.parts)) {
        const parts = normalized.parts.map((part) => String(part || "").trim()).filter(Boolean);
        if (parts.length > 1) {
            if (JSON.stringify(parts) !== JSON.stringify(normalized.parts)) changed = true;
            normalized.parts = parts;
            if (Object.hasOwn(normalized, "back")) {
                delete normalized.back;
                changed = true;
            }
        } else if (parts.length === 1) {
            if (normalized.back !== parts[0] || Object.hasOwn(normalized, "parts")) changed = true;
            normalized.back = parts[0];
            delete normalized.parts;
        } else {
            if (Object.hasOwn(normalized, "parts")) {
                delete normalized.parts;
                changed = true;
            }
        }
    } else {
        const back = String(normalized.back || "").trim();
        if (back) {
            const lines = back
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
            if (lines.length > 1) {
                normalized.parts = lines;
                delete normalized.back;
                changed = true;
            } else if (lines.length === 1 && normalized.back !== lines[0]) {
                normalized.back = lines[0];
                changed = true;
            }
        }
    }
    return changed;
}

// partsRequired is only meaningful when parts has ≥2 elements AND the required count
// is strictly less than the total.  Delete it in all other cases — callers can then
// use `partsRequired != null` as the partial-mode check.
// Mutates `normalized` in place. Returns true when any field changed.
function normalizePartsRequired(normalized) {
    if (!Object.hasOwn(normalized, "partsRequired")) return false;
    const isMultiPart = Array.isArray(normalized.parts) && normalized.parts.length > 1;
    if (!isMultiPart) {
        delete normalized.partsRequired;
        return true;
    }
    const max = normalized.parts.length;
    const n = Number(normalized.partsRequired);
    const clamped = Math.min(Math.max(1, Number.isNaN(n) ? max : n), max);
    if (clamped >= max) {
        delete normalized.partsRequired;
        return true;
    }
    if (clamped !== normalized.partsRequired) {
        normalized.partsRequired = clamped;
        return true;
    }
    return false;
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

    if (normalizeAnswerFields(normalized)) changed = true;
    if (normalizePartsRequired(normalized)) changed = true;

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

    const mode = deck.mode === "one-sided" || deck.mode === "two-sided" ? deck.mode : inferDeckMode(normalizedCards);
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

// Accept answers that are "close enough": 1 typo for short words, 2 for medium, 3 for long.
// Very short words (≤2 chars) require exact match to avoid false positives,
// and a different digit is never close. See `analyzeAnswer`.
function fuzzyEqual(given, expected) {
    const analysis = analyzeAnswer(given, expected);
    return analysis.exact || analysis.near;
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

// ---------- Answer checking ----------
//
// Every comparison folds both texts into per-character comparison keys, so
// only the differences a deck's checking settings care about survive.
// Lenient ("soepel") checking folds case, accents and punctuation away and
// accepts a small typo as "bijna goed". Strict ("streng") checking keeps what
// its rules demand — accents, plus capitals and punctuation in sentences — and
// rejects a near miss with a pointed hint, so the child fixes it themselves.

const LENIENT = answerChecking();

const EMOJI = /\p{Extended_Pictographic}|[\uFE00-\uFE0F\u20E3\u200D]|\p{Emoji_Modifier}/gu;
const MARKS = /\p{Mn}/gu;

// Typographic variants a child cannot (or need not) type. They compare equal
// in every mode; œ and æ are letters NFKD leaves alone.
const TYPOGRAPHIC = new Map([
    ["’", "'"],
    ["‘", "'"],
    ["‚", "'"],
    ["‛", "'"],
    ["`", "'"],
    ["´", "'"],
    ["′", "'"],
    ["«", '"'],
    ["»", '"'],
    ["“", '"'],
    ["”", '"'],
    ["„", '"'],
    ["‟", '"'],
    ["‹", '"'],
    ["›", '"'],
    ["…", "..."],
    ["‐", "-"],
    ["‑", "-"],
    ["‒", "-"],
    ["–", "-"],
    ["—", "-"],
    ["−", "-"],
    ["œ", "oe"],
    ["Œ", "OE"],
    ["æ", "ae"],
    ["Æ", "AE"],
]);
const TYPOGRAPHIC_CHARS = new RegExp(`[${[...TYPOGRAPHIC.keys()].join("")}]`, "gu");

// Apostrophes and hyphens are part of a word's spelling, not punctuation.
const PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "¿", "¡", '"']);

// Above this many alignment cells an answer is only compared as a whole.
const MAX_ALIGN_CELLS = 40000;

const graphemes =
    typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

// User-perceived characters, so an accented letter or an emoji with its
// modifiers is one unit — the unit a child would point at.
function answerUnits(text) {
    const s = String(text ?? "")
        .trim()
        .normalize("NFC");
    return graphemes ? Array.from(graphemes.segment(s), (part) => part.segment) : Array.from(s);
}

// Sentences end in . ! ? or …, optionally inside a closing quote or bracket
// (with the French space before it).
function isSentence(text) {
    return /[.!?…][\s"'»”’)\]]*$/u.test(
        String(text ?? "")
            .replace(EMOJI, "")
            .trim(),
    );
}

function isPunctuationKey(key) {
    return key !== "" && [...key].every((ch) => PUNCTUATION.has(ch));
}

function unitKey(unit, rules) {
    let key = unit.replace(EMOJI, "");
    if (!key) return "";
    if (/^\s+$/u.test(key)) return " ";
    key = key.replace(TYPOGRAPHIC_CHARS, (ch) => TYPOGRAPHIC.get(ch));
    key = rules.accents ? key.normalize("NFKC") : key.normalize("NFKD").replace(MARKS, "");
    return rules.capitals ? key : key.toLowerCase();
}

// Comparison keys, one per unit. An empty key means the unit does not count:
// emoji, and spacing that carries no meaning — runs of spaces, the ends, and
// any space next to punctuation (French puts one before ? ! : ;, children
// put them anywhere). Punctuation the rules ignore separates words like a
// space, so "oui,non" still reads as two words. `numeric` holds the units
// of a decimal comma, thousands dot or clock colon: those belong to a number.
function answerKeys(text, rules) {
    const units = answerUnits(text);
    const keys = units.map((unit) => unitKey(unit, rules));
    const numeric = new Set();
    const neighbour = (from, step) => {
        for (let i = from; i >= 0 && i < keys.length; i += step) {
            if (keys[i] && keys[i] !== " ") return keys[i];
        }
        return "";
    };
    for (let i = 0; i < keys.length; i++) {
        if (!isPunctuationKey(keys[i])) continue;
        if (/^[.,:]$/.test(keys[i]) && /\d$/.test(neighbour(i - 1, -1)) && /^\d/.test(neighbour(i + 1, 1))) {
            numeric.add(i);
        } else if (!rules.punctuation) {
            keys[i] = " ";
        }
    }
    let previous = "";
    for (let i = 0; i < keys.length; i++) {
        if (keys[i] !== " ") {
            if (keys[i]) previous = keys[i];
            continue;
        }
        const next = neighbour(i + 1, 1);
        const meaningless =
            !previous || previous === " " || !next || isPunctuationKey(previous) || isPunctuationKey(next);
        if (meaningless && !numeric.has(i)) keys[i] = "";
        else previous = " ";
    }
    return { units, keys, numeric };
}

function keyChars(keys) {
    const chars = [];
    keys.forEach((key, unit) => {
        for (const ch of key) chars.push({ ch, unit });
    });
    return chars;
}

function baseLetter(ch) {
    return ch.normalize("NFKD").replace(MARKS, "").toLowerCase();
}

function substitutionCost(a, b) {
    if (a === b) return 0;
    return baseLetter(a) === baseLetter(b) ? 1 : 2;
}

// Weighted edit alignment. Changing only an accent or the case of a letter is
// cheaper than a different letter, so é lines up with e instead of being read
// as one letter dropped and another added.
function alignChars(given, expected) {
    const m = given.length;
    const n = expected.length;
    const w = n + 1;
    const cost = new Uint32Array((m + 1) * w);
    for (let i = 0; i <= m; i++) cost[i * w] = 2 * i;
    for (let j = 0; j <= n; j++) cost[j] = 2 * j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const sub = cost[(i - 1) * w + j - 1] + substitutionCost(given[i - 1].ch, expected[j - 1].ch);
            cost[i * w + j] = Math.min(sub, cost[(i - 1) * w + j] + 2, cost[i * w + j - 1] + 2);
        }
    }
    const ops = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0) {
            const sub = substitutionCost(given[i - 1].ch, expected[j - 1].ch);
            if (cost[i * w + j] === cost[(i - 1) * w + j - 1] + sub) {
                ops.push({ type: sub ? "sub" : "eq", g: i - 1, e: j - 1 });
                i--;
                j--;
                continue;
            }
        }
        if (i > 0 && cost[i * w + j] === cost[(i - 1) * w + j] + 2) {
            ops.push({ type: "del", g: i - 1, e: -1 });
            i--;
        } else {
            ops.push({ type: "ins", g: -1, e: j - 1 });
            j--;
        }
    }
    return ops.reverse();
}

// What kind of mistake one aligned difference is. A different digit is
// never a typo: 1831 is simply not 1830.
function differenceKinds(a, b, numeric) {
    if (numeric || /\d/.test(a ?? "") || /\d/.test(b ?? "")) return ["number"];
    if (a !== undefined && b !== undefined) {
        if (baseLetter(a) === baseLetter(b)) {
            if (a.toLowerCase() === b.toLowerCase()) return ["capital"];
            const sameLetters = a.normalize("NFKD").replace(MARKS, "") === b.normalize("NFKD").replace(MARKS, "");
            return sameLetters ? ["accent"] : ["accent", "capital"];
        }
        return PUNCTUATION.has(a) && PUNCTUATION.has(b) ? ["punctuation"] : ["spelling"];
    }
    return PUNCTUATION.has(a ?? b) ? ["punctuation"] : ["spelling"];
}

// Compare an answer with the expected text under a deck's checking settings.
// `near` means only small differences remain: form differences the strict
// rules care about, and at most a typo or two (1 for short words, up to 3 for
// long ones; very short words must be spelled exactly).
function analyzeAnswer(given, expected, checking = LENIENT) {
    const sentence = isSentence(expected);
    const rules = {
        accents: checking.accents,
        capitals: checking.capitals && sentence,
        punctuation: checking.punctuation && sentence,
    };
    const g = answerKeys(given, rules);
    const e = answerKeys(expected, rules);
    const gChars = keyChars(g.keys);
    const eChars = keyChars(e.keys);
    const kinds = { accent: 0, capital: 0, punctuation: 0, spelling: 0, number: 0 };
    const exact = g.keys.join("") === e.keys.join("");
    const base = {
        exact,
        near: false,
        kinds,
        given: g,
        expected: e,
        gChars,
        eChars,
        ops: null,
        edits: 0,
        similarity: 0,
    };
    if (exact || gChars.length * eChars.length > MAX_ALIGN_CELLS) return base;

    const ops = alignChars(gChars, eChars);
    let same = 0;
    for (const op of ops) {
        if (op.type === "eq") {
            same++;
            continue;
        }
        const gc = gChars[op.g];
        const ec = eChars[op.e];
        const numeric = (gc && g.numeric.has(gc.unit)) || (ec && e.numeric.has(ec.unit));
        for (const kind of differenceKinds(gc?.ch, ec?.ch, numeric)) kinds[kind]++;
    }
    const length = Math.max(gChars.length, eChars.length);
    const tolerance = length <= 2 ? 0 : length <= 5 ? 1 : length <= 9 ? 2 : 3;
    return {
        ...base,
        near: gChars.length > 0 && kinds.number === 0 && kinds.spelling <= tolerance,
        ops,
        edits: ops.length - same,
        similarity: same / length,
    };
}

function classifyAnswerMatch(given, expected, checking = LENIENT) {
    const analysis = analyzeAnswer(given, expected, checking);
    if (analysis.exact) return { accepted: true, exact: true, practiceAgain: false };
    if (analysis.near) {
        const { kinds } = analysis;
        // Folding already removed every form difference no rule asks for.
        if (kinds.accent + kinds.capital + kinds.punctuation > 0 || (checking.spelling && kinds.spelling > 0)) {
            return { accepted: false, exact: false, practiceAgain: false, nudge: kinds };
        }
        return { accepted: true, exact: false, practiceAgain: checking.nearMissIsMistake };
    }
    if (!checking.strict && phraseCoverageMatch(given, expected)) {
        return { accepted: true, exact: false, practiceAgain: true };
    }
    return { accepted: false, exact: false, practiceAgain: false };
}

// Best match of an answer among a card's accepted answers: an exact one wins
// over a near miss, whatever the order. A strict near miss comes back as a
// `nudge` naming the closest answer, so the hint can point at the mistake.
function matchAnswer(given, candidates, checking = LENIENT) {
    let accepted = null;
    let nudge = null;
    for (const expected of candidates) {
        if (!expected) continue;
        const match = classifyAnswerMatch(given, expected, checking);
        if (match.exact) return { match, expected };
        if (match.accepted && !accepted) accepted = { match, expected };
        if (match.nudge && !nudge) nudge = { kinds: match.nudge, expected };
    }
    return accepted ?? { match: null, nudge };
}

// The candidate an answer was most likely meant to be — the one it differs
// from least — to explain what was off.
function closestExpected(given, candidates, checking = LENIENT) {
    let best = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const expected of candidates) {
        if (!expected) continue;
        const analysis = analyzeAnswer(given, expected, checking);
        const score = analysis.exact ? -1 : analysis.ops ? analysis.edits : Number.POSITIVE_INFINITY;
        if (score < bestScore) {
            best = expected;
            bestScore = score;
        }
    }
    return best ?? candidates.find(Boolean) ?? null;
}

function joinDutch(items) {
    return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} en ${items.at(-1)}`;
}

// The retry hint for a strict near miss: it names what to look at without
// giving the answer away.
function nudgeText(kinds) {
    const items = [];
    if (kinds.accent) items.push(kinds.accent === 1 ? "het accent" : "de accenten");
    if (kinds.capital) items.push(kinds.capital === 1 ? "de hoofdletter" : "de hoofdletters");
    if (kinds.punctuation) items.push(kinds.punctuation === 1 ? "het leesteken" : "de leestekens");
    if (kinds.spelling) items.push("de spelling");
    return `bijna! kijk nog eens naar ${joinDutch(items)}.`;
}

function kindLabels(kinds) {
    const labels = [];
    if (kinds.accent) labels.push(kinds.accent === 1 ? "accent" : `${kinds.accent} accenten`);
    if (kinds.capital) labels.push(kinds.capital === 1 ? "hoofdletter" : `${kinds.capital} hoofdletters`);
    if (kinds.punctuation) labels.push(kinds.punctuation === 1 ? "leesteken" : `${kinds.punctuation} leestekens`);
    if (kinds.spelling) labels.push(kinds.spelling === 1 ? "1 spelfout" : `${kinds.spelling} spelfouten`);
    if (kinds.number) labels.push(kinds.number === 1 ? "1 cijfer" : `${kinds.number} cijfers`);
    return labels;
}

// ---------- Answer comparison display ----------

// Pair the typed and the expected characters into display columns: same,
// changed, extra (only typed), missing (only expected) or ignored (does not
// count under the rules). A unit whose key spans several characters, like œ
// for a typed "oe", shares one column with everything aligned to it.
function diffColumns(analysis) {
    const { given, expected, gChars, eChars, ops } = analysis;
    if (!ops) return [];
    const columns = [];
    const next = { g: 0, e: 0 };
    // Units that do not count have no alignment op; they keep their place.
    const flushIgnored = (gUntil, eUntil) => {
        while (next.g < gUntil || next.e < eUntil) {
            const column = { type: "ignored", g: [], e: [] };
            if (next.g < gUntil) column.g.push(next.g++);
            if (next.e < eUntil) column.e.push(next.e++);
            columns.push(column);
        }
    };
    let last = null;
    for (const op of ops) {
        const gu = op.g >= 0 ? gChars[op.g].unit : -1;
        const eu = op.e >= 0 ? eChars[op.e].unit : -1;
        if (!sharesUnit(last, gu, eu)) {
            flushIgnored(gu >= 0 ? gu : next.g, eu >= 0 ? eu : next.e);
            last = { types: new Set(), g: [], e: [] };
            columns.push(last);
        }
        last.types.add(op.type);
        addUnit(last.g, gu);
        addUnit(last.e, eu);
        next.g = Math.max(next.g, gu + 1);
        next.e = Math.max(next.e, eu + 1);
    }
    flushIgnored(given.units.length, expected.units.length);
    return columns.map((column) =>
        column.type ? column : { type: columnType(column.types), g: column.g, e: column.e },
    );
}

function sharesUnit(column, gu, eu) {
    return !!column && ((gu >= 0 && column.g.at(-1) === gu) || (eu >= 0 && column.e.at(-1) === eu));
}

function addUnit(units, unit) {
    if (unit >= 0 && units.at(-1) !== unit) units.push(unit);
}

function columnType(types) {
    if (types.size > 1) return "changed";
    if (types.has("eq")) return "same";
    if (types.has("del")) return "extra";
    return types.has("ins") ? "missing" : "changed";
}

function unitsText(units, indices) {
    return indices.map((i) => units[i]).join("");
}

function isSpaceColumn(column, analysis) {
    const text = unitsText(analysis.given.units, column.g) + unitsText(analysis.expected.units, column.e);
    return text !== "" && /^\s+$/u.test(text);
}

// A space that counts as a mistake is drawn so it can be marked.
function cellText(text, marked) {
    return marked && /^\s+$/u.test(text) ? "␣" : text;
}

function diffCellsHtml(analysis, column) {
    const marked = column.type !== "same" && column.type !== "ignored";
    const g = cellText(unitsText(analysis.given.units, column.g), marked);
    const e = cellText(unitsText(analysis.expected.units, column.e), marked);
    return `<span class="fc-diff-col is-${column.type}"><span class="fc-diff-g">${escapeHtml(g)}</span><span class="fc-diff-e">${escapeHtml(e)}</span></span>`;
}

// Words stay together as two-row blocks; lines only wrap between words.
function diffWordsHtml(analysis) {
    let html = "";
    let word = "";
    for (const column of diffColumns(analysis)) {
        if ((column.type === "same" || column.type === "ignored") && isSpaceColumn(column, analysis)) {
            if (word) html += `<span class="fc-diff-word">${word}</span>`;
            word = "";
            continue;
        }
        word += diffCellsHtml(analysis, column);
    }
    if (word) html += `<span class="fc-diff-word">${word}</span>`;
    return html;
}

// A typed answer next to the expected one, with every difference that counts
// marked in both rows. Returns "" when the answer was exactly right. Answers
// too different for a letter-by-letter comparison show as two plain lines.
function answerDiffHtml(given, expected, checking = LENIENT, { compact = false } = {}) {
    if (typeof given !== "string" || !given.trim() || !expected) return "";
    const analysis = analyzeAnswer(given, expected, checking);
    if (analysis.exact) return "";
    const aligned = analysis.ops && (analysis.near || analysis.similarity >= 0.5);
    const labels = aligned ? kindLabels(analysis.kinds) : [];
    const spoken = `Jij typte “${given.trim()}”, juist is “${String(expected).trim()}”${labels.length > 0 ? `: ${labels.join(", ")}` : ""}.`;
    const rows = aligned
        ? diffWordsHtml(analysis)
        : `<span class="fc-diff-word fc-diff-whole"><span class="fc-diff-col is-changed"><span class="fc-diff-g">${escapeHtml(given.trim())}</span><span class="fc-diff-e">${escapeHtml(String(expected).trim())}</span></span></span>`;
    const chips = labels.map((label) => `<span class="fc-diff-kind">${escapeHtml(label)}</span>`).join("");
    return `<figure class="fc-diff${compact ? " fc-diff-compact" : ""}">
        <figcaption class="visually-hidden">${escapeHtml(spoken)}</figcaption>
        <div class="fc-diff-rows" aria-hidden="true">
            <span class="fc-diff-word fc-diff-labels"><span class="fc-diff-col"><span class="fc-diff-g"><span class="fc-diff-tag">jij</span></span><span class="fc-diff-e"><span class="fc-diff-tag">juist</span></span></span></span>${rows}
        </div>
        ${chips ? `<p class="fc-diff-kinds" aria-hidden="true">${chips}</p>` : ""}
    </figure>`;
}

// The child's own attempt with the spots to look at marked, for the retry
// hint. It never shows the expected letters — only where they go.
function attemptHtml(given, expected, checking = LENIENT) {
    const analysis = analyzeAnswer(given, expected, checking);
    if (analysis.exact || !analysis.ops) return "";
    const cells = diffColumns(analysis)
        .map((column) => {
            const text = unitsText(analysis.given.units, column.g);
            if (column.type === "missing") return `<span class="fc-attempt-gap"></span>`;
            if (column.type === "changed" || column.type === "extra") {
                return `<span class="fc-attempt-off">${escapeHtml(cellText(text, true))}</span>`;
            }
            return escapeHtml(text);
        })
        .join("");
    return `<span class="fc-attempt" aria-hidden="true">${cells}</span>`;
}

// Split raw input into individual answer tokens on comma, semicolon, slash,
// newline, or the word " en " — for "all at once" multi-part detection.
function splitAnswerTokens(raw) {
    return raw
        .split(/[,;\n/+&]|\b(?:en|of|and|plus)\b/i)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
}

// Drop tokens that merely restate a part the learner already gave. Listing what
// you have so far is not a mistake, and a repeated token left in play is free to
// fuzzy-claim a part that is still missing — an earlier "lopen" grabbing
// "gelopen" — which downgrades an otherwise perfect answer to "bijna goed" and
// sends the card back to mistake practice.
function dropRestatedParts(tokens, allParts, alreadyMatched, checking) {
    return tokens.filter(
        (token) =>
            !allParts.some((part) => alreadyMatched.has(part) && classifyAnswerMatch(token, part, checking).exact),
    );
}

// First unclaimed part that `token` matches, or null. `exactOnly` restricts the
// sweep to verbatim matches.
function findPartForToken(token, remaining, newlyMatched, exactOnly, checking) {
    for (const part of remaining) {
        if (newlyMatched.some((m) => m.part === part)) continue;
        const match = classifyAnswerMatch(token, part, checking);
        if (!match.accepted || (exactOnly && !match.exact)) continue;
        return { part, match };
    }
    return null;
}

// Pass 1: match tokens against unmatched parts, sweeping exact before lenient so
// a fuzzy near-miss can never claim a part that another token in the same answer
// names outright. Flags each consumed token in `tokenUsed` so pass 2 cannot
// spend it a second time.
function matchTokensToParts(tokens, remaining, tokenUsed, newlyMatched, checking) {
    for (const exactOnly of [true, false]) {
        for (let i = 0; i < tokens.length; i++) {
            if (tokenUsed[i]) continue;
            const hit = findPartForToken(tokens[i], remaining, newlyMatched, exactOnly, checking);
            if (!hit) continue;
            newlyMatched.push({ part: hit.part, given: tokens[i], ...hit.match });
            tokenUsed[i] = true;
        }
    }
}

// Pass 2 (phrase-contains fallback): if the leftover words cover all content
// words of a remaining part, count it as matched. Handles any separator the user
// picks (space, "en", "+", etc.) without needing to enumerate them all. Only
// reached for parts pass 1 left open, and always lenient by definition.
function matchPartsByPhraseCoverage(leftoverWords, remaining, newlyMatched) {
    for (const part of remaining) {
        if (newlyMatched.some((m) => m.part === part)) continue;
        const contentWords = normalize(part)
            .split(" ")
            .filter((w) => w.length > 0 && !PHRASE_STOPWORDS.has(w));
        if (contentWords.length === 0) continue;
        const covered = contentWords.filter((cw) => leftoverWords.some((aw) => fuzzyEqual(aw, cw))).length;
        // Require ALL content words present AND at most one extra word per content word
        // (prevents single-word parts from matching long unrelated phrases).
        if (covered !== contentWords.length || leftoverWords.length > contentWords.length * 2 + 1) continue;
        newlyMatched.push({
            part,
            given: leftoverWords.join(" "),
            accepted: true,
            exact: false,
            practiceAgain: true,
        });
    }
}

// Try to match one or more tokens from `given` against unmatched parts.
// Returns match objects for newly matched parts, each with the token it took.
function tryMatchParts(given, allParts, alreadyMatched, checking = LENIENT) {
    const newlyMatched = [];
    const remaining = allParts.filter((p) => !alreadyMatched.has(p));
    const tokens = dropRestatedParts(splitAnswerTokens(given), allParts, alreadyMatched, checking);
    const tokenUsed = new Array(tokens.length).fill(false);

    matchTokensToParts(tokens, remaining, tokenUsed, newlyMatched, checking);
    // Strict checking has no partial-phrase fallback: every part must be named.
    if (checking.strict) return newlyMatched;

    // Pass 2 sees only the tokens pass 1 could not place, so one token can never
    // name two parts. Reading the whole input here let a single answer of
    // "groot" claim both "groot" (exactly) and "grootst" (fuzzyEqual tolerates
    // the two-letter gap) — handing the learner a part they never gave.
    const leftoverWords = normalize(tokens.filter((_, i) => !tokenUsed[i]).join(" "))
        .split(" ")
        .filter((w) => w.length > 0);
    matchPartsByPhraseCoverage(leftoverWords, remaining, newlyMatched);

    return newlyMatched;
}

// The strict near miss among an answer's tokens, if any: which part it was
// close to, and what was off.
function partNudge(given, remaining, checking) {
    if (!checking.strict) return null;
    for (const token of splitAnswerTokens(given)) {
        const { nudge } = matchAnswer(token, remaining, checking);
        if (nudge) return { ...nudge, given: token };
    }
    return null;
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

// ---------- Per-question answer state ----------
//
// Kept beside the question objects rather than on them: questions are stored
// in the history and compared as JSON to find recent mistakes, so per-session
// scratch data must not leak into them.

// Checking settings of each question's own deck, resolved once per session.
const questionChecking = new WeakMap();
// Questions whose hint was opened while answering.
const hintUsedQuestions = new WeakSet();
// Multi-part near misses seen while answering: [{ given, expected }].
const answerPairs = new WeakMap();

function checkingFor(q) {
    if (questionChecking.has(q)) return questionChecking.get(q);
    const deck = getDeck(q.historySource?.id || q.deckId || selectedDeckId || "");
    return deck ? answerChecking(readPractice(deck)) : LENIENT;
}

function noteHintUsed(q) {
    hintUsedQuestions.add(q);
}

function noteAnswerPair(q, given, expected) {
    const pairs = (answerPairs.get(q) || []).filter((pair) => pair.expected !== expected);
    pairs.push({ given, expected });
    answerPairs.set(q, pairs);
}

function expectedCandidates(q) {
    switch (q.kind) {
        case "two-sided":
            return [q.back];
        case "image":
            return q.parts?.length > 1 ? q.parts : [q.back];
        case "fill-in":
            return (q.blankIndices || [q.index]).map((i) => q.allCards[i]);
        default:
            return [];
    }
}

// Which typed answer and expected text an outcome should show compared: the
// accepted answer when it was only nearly right, otherwise the last try that
// missed. A child who corrected themselves still sees what the slip was.
function outcomeAnswerPairs(q, outcome, checking) {
    if (q.kind === "multi-part") return [...(answerPairs.get(q) || [])];
    const givens = (outcome.givens || [outcome.given]).filter((g) => typeof g === "string" && g.trim());
    const given = outcome.correct && outcome.exact !== false ? givens.at(-2) : givens.at(-1);
    if (!given) return [];
    const expected = closestExpected(given, expectedCandidates(q), checking);
    if (!expected || analyzeAnswer(given, expected, checking).exact) return [];
    return [{ given, expected }];
}

function outcomeDetailHtml(outcome) {
    const q = outcome.question || {};
    // Sessions saved before answers were compared were all checked leniently.
    const check = outcome.check || { checking: LENIENT, pairs: outcomeAnswerPairs(q, outcome, LENIENT) };
    const checking = { ...LENIENT, ...check.checking };
    const diffs = (check.pairs || [])
        .map(({ given, expected }) => answerDiffHtml(given, expected, checking, { compact: true }))
        .join("");
    const notes = [];
    if (q.kind !== "multi-part" && outcome.givens) {
        const shown = new Set((check.pairs || []).map((pair) => pair.given));
        const final = outcome.correct ? outcome.givens.at(-1) : null;
        const earlier = outcome.givens.filter((g) => typeof g === "string" && g !== final && !shown.has(g));
        if (earlier.length > 0) {
            notes.push(
                `<span class="fc-outcome-note">eerder: ${earlier.map((g) => `<s>${escapeHtml(g)}</s>`).join(", ")}</span>`,
            );
        }
    }
    if (outcome.correct && outcome.exact !== false && outcome.attempts > 0) {
        notes.push(`<span class="fc-outcome-note fc-outcome-fixed">daarna zelf verbeterd ✓</span>`);
    }
    if (check.hintUsed) notes.push(`<span class="fc-outcome-note">💡 hint gebruikt</span>`);
    if (!diffs && notes.length === 0) return "";
    return `<div class="fc-outcome-detail">${diffs}${notes.length > 0 ? `<p class="fc-outcome-notes">${notes.join("")}</p>` : ""}</div>`;
}

// The comparison under a review card: what was typed against the answer it
// was closest to.
function reviewDiffHtml(q, given) {
    const checking = checkingFor(q);
    if (q.kind === "multi-part") {
        return (answerPairs.get(q) || []).map((pair) => answerDiffHtml(pair.given, pair.expected, checking)).join("");
    }
    if (typeof given !== "string" || !given.trim()) return "";
    return answerDiffHtml(given, closestExpected(given, expectedCandidates(q), checking), checking);
}

// ---------- Storage ----------

const STORAGE_KEY = "homework_flashcard_decks";
const FC_LAST_DECK_KEY = "homework_fc_last_deck";
const FC_SELECTION_KEY = "homework_fc_selection";

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
        return true;
    } catch {
        showToast("Opslaan mislukt: lokale opslag is niet beschikbaar of vol.");
        return false;
    }
}

function getDeck(id) {
    return loadDecks().find((d) => d.id === id) || null;
}

// Resolve the deck mode: new decks carry an explicit field; legacy decks are
// inferred from whether any card has a back.
function deckMode(deck) {
    if (deck.mode === "one-sided" || deck.mode === "two-sided") return deck.mode;
    return inferDeckMode(deck.cards);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function currentPractice(deck) {
    const form = document.getElementById("form-setup");
    return practiceFromConfig(
        {
            fcMode: form.querySelector("input[name='fc-mode']:checked")?.value || "all",
            fcCount: Number(form.querySelector("#fc-count")?.value),
            fcOrderImportant: form.querySelector("#fc-order-important")?.checked || false,
            timeMode: form.querySelector("#time-mode")?.checked || false,
            deadlineOn: form.querySelector("#deadline-on")?.checked || false,
            deadlineSeconds: Number(form.querySelector("#deadline-seconds")?.value),
            // Without the options on screen (a deck with no cards yet), keep
            // the deck's own checking settings rather than resetting them.
            ...(form.querySelector("#fc-strict") ? readCheckingConfig(form) : storedCheckingConfig(deck)),
        },
        deck,
    );
}

function restoreDeckPractice() {
    if (multiDeckMode) return;
    const deck = selectedDeckId ? getDeck(selectedDeckId) : null;
    if (!deck) return;
    if (hiddenDeckInput) hiddenDeckInput.value = deck.id;
    const config = practiceConfig(deck, readPractice(deck));
    const mode = managerRoot.querySelector(`input[name='fc-mode'][value='${config.fcMode}']`);
    if (mode) mode.checked = true;
    const count = managerRoot.querySelector("#fc-count");
    if (count) {
        count.value = String(config.fcCount);
        count.disabled = config.fcMode !== "partial";
    }
    for (const [id, checked] of [
        ["fc-order-important", config.fcOrderImportant],
        ["time-mode", config.timeMode],
        ["deadline-on", config.deadlineOn],
    ]) {
        const field = document.getElementById(id);
        if (field) field.checked = checked;
    }
    restoreCheckingOptions(config);
    const seconds = document.getElementById("deadline-seconds");
    if (seconds) seconds.value = String(config.deadlineSeconds);
    const section = document.getElementById("deadline-section");
    if (section) section.hidden = !config.timeMode;
    const field = document.getElementById("deadline-field");
    if (field) field.hidden = !(config.timeMode && config.deadlineOn);
}

function persistDeckPractice() {
    if (multiDeckMode || !selectedDeckId || editorState || importPending) return;
    const decks = loadDecks();
    const deck = decks.find((item) => item.id === selectedDeckId);
    if (!deck) return;
    try {
        const practice = currentPractice(deck);
        if (JSON.stringify(deck.practice) === JSON.stringify(practice)) return;
        deck.practice = practice;
        saveDecks(decks);
    } catch {
        // A half-entered count/deadline is validated by the setup form or export.
    }
}

function exportDeck(id) {
    const deck = getDeck(id);
    if (!deck) return;
    try {
        const practice = !multiDeckMode && id === selectedDeckId ? currentPractice(deck) : readPractice(deck);
        downloadDeck(deck, practice);
        showToast(`JSON-export van “${deck.name}” gestart.`);
    } catch (error) {
        showToast(`Exporteren mislukt: ${error.message}`);
    }
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
    // Drop any object URLs for files no longer needed. Without this, every
    // edited deck and every Wikimedia preview kept its blob alive for the
    // whole session — tens of MB of leaked memory after an hour.
    wmRevokeExcept(filenames);
    return { loaded, failed };
}

// Revoke object URLs for filenames not in `keep`. Pass an empty array to
// drop everything (used on pagehide).
function wmRevokeExcept(keep) {
    const keepSet = new Set(keep);
    for (const [fn, url] of imageObjectURLs) {
        if (keepSet.has(fn)) continue;
        try {
            URL.revokeObjectURL(url);
        } catch {}
        imageObjectURLs.delete(fn);
    }
}

// On page-unload, drop *all* outstanding object URLs so the browser can
// reclaim the underlying blob memory immediately rather than waiting for GC.
window.addEventListener("pagehide", () => wmRevokeExcept([]));

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
    const json = JSON.stringify(portableDeck(deck, readPractice(deck)));
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
    const data = parseDeckData(JSON.parse(json));
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
let multiDeckMode = false;
let combinedDeckIds = new Set();
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

function selectedDeckIds() {
    return multiDeckMode ? [...combinedDeckIds] : selectedDeckId ? [selectedDeckId] : [];
}

function selectedDecks() {
    return selectedDeckIds().map(getDeck).filter(Boolean);
}

function rememberSelection() {
    try {
        localStorage.setItem(FC_SELECTION_KEY, JSON.stringify(multiDeckMode ? selectedDeckIds() : null));
        if (selectedDeckId) localStorage.setItem(FC_LAST_DECK_KEY, selectedDeckId);
    } catch {}
}

function preloadSelection() {
    // Preload once for the union: per-deck calls revoke each other's image URLs.
    void wmPreloadDeck({ cards: selectedDecks().flatMap((deck) => deck.cards) });
}

function toggleMultiDeckMode() {
    persistDeckPractice();
    multiDeckMode = !multiDeckMode;
    if (multiDeckMode) combinedDeckIds = new Set(selectedDeckId ? [selectedDeckId] : []);
    else if (!combinedDeckIds.has(selectedDeckId)) selectedDeckId = [...combinedDeckIds][0] || null;
    renderList();
    document.getElementById("fc-toggle-multiple")?.focus();
    preloadSelection();
}

// ---------- Deck list view ----------

function deckListItemHtml(deck) {
    const isTwo = deckMode(deck) === "two-sided";
    const modeLabel = !isTwo ? "uit het hoofd" : deck.bidirectional ? "twee richtingen" : "voor-achterkant";
    const count = deck.cards.length;
    const sel = selectedDeckIds().includes(deck.id);
    return `<li class="deck-item${sel ? " selected" : ""}" data-deck-id="${escapeHtml(deck.id)}">
    ${
        multiDeckMode
            ? `<label class="deck-select-btn fc-deck-check"><input type="checkbox" data-action="select" data-deck-id="${escapeHtml(deck.id)}" ${sel ? "checked" : ""}>
            <span class="fc-deck-text"><span class="deck-name">${escapeHtml(deck.name)}</span><span class="deck-meta">${count} kaart${count === 1 ? "" : "en"} · ${modeLabel}</span></span></label>`
            : `<button type="button" class="deck-select-btn" data-action="select" data-deck-id="${escapeHtml(deck.id)}" aria-pressed="${sel}">
            <span class="deck-name">${escapeHtml(deck.name)}</span>
            <span class="deck-meta">${count} kaart${count === 1 ? "" : "en"} · ${modeLabel}</span>
        </button>`
    }

    <div class="deck-actions">
        <button type="button" class="fc-btn-sm" data-action="edit" data-deck-id="${escapeHtml(deck.id)}" title="Bewerk" aria-label="Bewerk ${escapeHtml(deck.name)}">✏️</button>
        <button type="button" class="fc-btn-sm" data-action="share" data-deck-id="${escapeHtml(deck.id)}" title="Deel" aria-label="Deel ${escapeHtml(deck.name)}">🔗</button>
        <button type="button" class="fc-btn-sm" data-action="export" data-deck-id="${escapeHtml(deck.id)}" title="Exporteer JSON" aria-label="Exporteer ${escapeHtml(deck.name)} als JSON"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg></button>
        <button type="button" class="fc-btn-sm fc-btn-delete" data-action="delete" data-deck-id="${escapeHtml(deck.id)}" title="Verwijder" aria-label="Verwijder ${escapeHtml(deck.name)}">🗑️</button>
    </div>
</li>`;
}

function renderList() {
    clearEditorLeaveGuard();
    const decks = loadDecks();
    combinedDeckIds = new Set([...combinedDeckIds].filter((id) => decks.some((deck) => deck.id === id)));
    rememberSelection();
    if (hiddenDeckInput) hiddenDeckInput.value = selectedDeckId || "";

    let html = `<div class="deck-list-header">
        <a class="fc-btn-new fc-import-link" href="/extra/flashcards/import">📥 Importeer JSON</a>
        <button type="button" class="fc-btn-new btn-lift" id="fc-new-deck">＋ Nieuw deck</button>
        <button type="button" class="fc-btn-new btn-lift" id="fc-toggle-multiple" aria-pressed="${multiDeckMode}">${multiDeckMode ? "📖 Eén deck" : "📚 Meerdere decks"}</button>
    </div>`;
    if (multiDeckMode) {
        html += `<p class="fc-selection-help">Je oefent de gekozen decks door elkaar. Invuloefeningen blijven bij elkaar.
            Elk deck gebruikt zijn eigen oefeninstellingen. De tijdinstelling hieronder geldt voor de hele sessie.</p>`;
    }

    if (decks.length === 0) {
        html += `<p class="fc-empty">Nog geen decks — maak een nieuw deck aan!</p>`;
    } else {
        html += `<ul class="deck-list" role="list">`;
        html += decks.map(deckListItemHtml).join("");
        html += `</ul>`;
    }

    if (multiDeckMode) {
        const count = combinedDeckIds.size;
        html += `<p class="fc-selection-count" role="status">${count} deck${count === 1 ? "" : "s"} geselecteerd</p>`;
    }

    // For a selected one-sided deck, show fill-in mode options; every
    // selected deck shows how its answers are checked.
    if (!multiDeckMode && selectedDeckId) {
        const sel = getDeck(selectedDeckId);
        if (sel && sel.cards.length > 0 && deckMode(sel) === "one-sided") {
            html += renderModeOptionsHtml(sel);
        }
        if (sel && sel.cards.length > 0) html += renderCheckingOptionsHtml(sel);
    }

    // Sync history section so it shows the selected deck's sessions.
    const histEl = document.getElementById("history");
    if (histEl) {
        histEl.dataset.exerciseId = selectionExerciseId(selectedDeckIds(), multiDeckMode);
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

    managerRoot.querySelector("#fc-toggle-multiple")?.addEventListener("click", toggleMultiDeckMode);

    // Wire up the count input enable/disable based on which radio is selected.
    wireModeOptions();
    managerRoot.querySelector("#fc-strict")?.addEventListener("change", syncCheckingOptions);
    restoreDeckPractice();

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
    btn.className = "default-button btn-lift";
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
    const hasCards = selectedDecks().some((deck) => deck.cards.length > 0);
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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: card-type fan-out
    return deck.cards.map((card, index) => {
        const isImage = !!card.wikimedia;
        const rawParts = cardParts(card);
        const hasParts = rawParts.length > 1;
        const backText = rawParts.length > 0 ? rawParts.join(" / ") : String(card?.back || card?.front || "").trim();
        // partsRequired is only stored when strictly < parts.length (canonical form).
        const partsRequired = hasParts ? (card.partsRequired ?? null) : null;
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
        return `<img src="${src}" alt="" class="fc-review-image">`;
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
    return `${card.deckName ? `<p class="fc-source-deck">${escapeHtml(card.deckName)}</p>` : ""}<button type="button" class="fc-review-card is-active${card.oneSided ? " no-flip" : ""}${reviewState.flipped.has(index) ? " is-flipped" : ""}" data-index="${index}" aria-label="kaart ${index + 1} van ${total}">
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
                <button type="button" class="default-button btn-lift" id="fc-review-prev" disabled>⬅ vorige</button>
                <p class="fc-review-counter">1 / ${total}</p>
                <button type="button" class="default-button btn-lift" id="fc-review-next"${total <= 1 ? " disabled" : ""}>volgende ➡</button>
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
            el.outerHTML = `<img src="${imageObjectURLs.get(filename)}" alt="" class="fc-review-image">`;
            return;
        }
        wmLoad(filename)
            .then((src) => {
                if (!reviewState.active || !el.isConnected) return;
                el.outerHTML = `<img src="${src}" alt="" class="fc-review-image">`;
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
        let size = Number.parseFloat(computed.fontSize) || 22;
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
    const counter = document.querySelector(".fc-review-counter");
    const prev = document.getElementById("fc-review-prev");
    const next = document.getElementById("fc-review-next");

    const commit = () => {
        if (viewport) viewport.innerHTML = buildReviewCardHtml(current);
        if (counter) counter.textContent = `${current + 1} / ${total}`;
        if (prev) prev.disabled = current === 0;
        if (next) next.disabled = current >= total - 1;
        fitReviewFaceText();
        hydrateReviewImages();
    };

    // Symmetric exit: fade the outgoing card before swapping in the next one
    // so arrow-key spamming doesn't snap-cut between cards. Reduced-motion
    // skips the fade and commits immediately.
    const outgoing = viewport?.querySelector(".fc-review-card");
    if (outgoing && window.matchMedia("(prefers-reduced-motion: no-preference)").matches) {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            commit();
        };
        outgoing.addEventListener("animationend", finish, { once: true });
        outgoing.classList.add("is-leaving");
        setTimeout(finish, 160);
        return;
    }
    commit();
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
    const decks = selectedDecks();
    if (!decks.some((deck) => deck.cards.length > 0)) return;
    stopReviewSession({ keepPage: true });
    reviewState.active = true;
    reviewState.deckId = decks[0].id;
    reviewState.cards = decks.flatMap((deck) =>
        buildReviewCards(deck).map((card) => ({ ...card, deckName: multiDeckMode ? deck.name : null })),
    );
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
    const deck = { cards: decks.flatMap((item) => item.cards) };
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

const STRICT_RULE_LABELS = [
    ["accents", "accenten", "é is niet hetzelfde als e"],
    ["capitals", "hoofdletters", "in zinnen"],
    ["punctuation", "leestekens", "in zinnen, zoals . ? !"],
    ["spelling", "spelling", "geen typfouten"],
];

const CHECKING_HELP = {
    lenient: "Soepel: hoofdletters, accenten en leestekens tellen niet mee. Een kleine typfout is ‘bijna goed’.",
    strict: "Streng, zoals op een toets: ‘bijna goed’ telt als fout. Kies wat juist moet zijn.",
};

// How answers are checked. Strict checking is a switch with the rules it
// enforces nested under it; the lenient-only and hint options sit beside it.
// Everything that counts as a mistake comes back in "oefen fouten opnieuw".
function renderCheckingOptionsHtml(deck) {
    const hasHints = deck.cards.some((card) => card.hint || card.hintReverse);
    const rules = STRICT_RULE_LABELS.map(
        ([rule, label, note]) => `
            <label class="fc-check-row">
                <input type="checkbox" name="fc-strict-rule" value="${rule}" checked>
                <span>${label} <span class="fc-check-note">(${note})</span></span>
            </label>`,
    ).join("");
    return `
        <fieldset class="fc-checking" id="fc-checking">
            <legend>Nakijken</legend>
            <label class="fc-switch">
                <input type="checkbox" role="switch" id="fc-strict" class="fc-switch-input visually-hidden"
                    aria-describedby="fc-checking-help">
                <span class="fc-switch-track" aria-hidden="true"><span class="fc-switch-thumb"></span></span>
                <span class="fc-switch-label">Streng nakijken</span>
            </label>
            <p class="field-hint" id="fc-checking-help">${CHECKING_HELP.lenient}</p>
            <div class="nested-options" id="fc-strict-rules" hidden>
                ${rules}
                <p class="field-hint">Een zin eindigt op . ? of !. Bij losse woorden tellen hoofdletters en leestekens niet mee.</p>
            </div>
            <div class="nested-options" id="fc-lenient-options">
                <label class="fc-check-row">
                    <input type="checkbox" id="fc-near-miss-mistake">
                    <span>‘bijna goed’ telt als fout</span>
                </label>
            </div>
            <label class="fc-check-row" id="fc-hint-mistake-row"${hasHints ? "" : " hidden"}>
                <input type="checkbox" id="fc-hint-mistake">
                <span>hint gebruikt telt als fout</span>
            </label>
            <p class="field-hint">Wat als fout telt, komt terug bij ‘oefen fouten opnieuw’.</p>
        </fieldset>`;
}

function syncCheckingOptions() {
    const strict = !!managerRoot?.querySelector("#fc-strict")?.checked;
    const rules = managerRoot?.querySelector("#fc-strict-rules");
    const lenient = managerRoot?.querySelector("#fc-lenient-options");
    const help = managerRoot?.querySelector("#fc-checking-help");
    if (rules) rules.hidden = !strict;
    if (lenient) lenient.hidden = strict;
    if (help) help.textContent = strict ? CHECKING_HELP.strict : CHECKING_HELP.lenient;
}

function readCheckingConfig(form) {
    return {
        fcStrict: !!form.querySelector("#fc-strict")?.checked,
        fcStrictRules: [...form.querySelectorAll("input[name='fc-strict-rule']:checked")].map((input) => input.value),
        fcNearMissIsMistake: !!form.querySelector("#fc-near-miss-mistake")?.checked,
        fcHintIsMistake: !!form.querySelector("#fc-hint-mistake")?.checked,
    };
}

function storedCheckingConfig(deck) {
    const { fcStrict, fcStrictRules, fcNearMissIsMistake, fcHintIsMistake } = practiceConfig(deck, readPractice(deck));
    return { fcStrict, fcStrictRules, fcNearMissIsMistake, fcHintIsMistake };
}

function restoreCheckingOptions(config) {
    const strict = managerRoot.querySelector("#fc-strict");
    if (!strict) return;
    strict.checked = config.fcStrict;
    for (const input of managerRoot.querySelectorAll("input[name='fc-strict-rule']")) {
        input.checked = config.fcStrictRules.includes(input.value);
    }
    managerRoot.querySelector("#fc-near-miss-mistake").checked = config.fcNearMissIsMistake;
    managerRoot.querySelector("#fc-hint-mistake").checked = config.fcHintIsMistake;
    syncCheckingOptions();
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
            if (multiDeckMode) {
                if (btn.checked) combinedDeckIds.add(deckId);
                else combinedDeckIds.delete(deckId);
                // Keep the native checkbox in place so keyboard focus and its
                // screen-reader announcement survive each selection.
                btn.closest(".deck-item").classList.toggle("selected", btn.checked);
                managerRoot.querySelector(".fc-selection-count").textContent =
                    `${combinedDeckIds.size} deck${combinedDeckIds.size === 1 ? "" : "s"} geselecteerd`;
                rememberSelection();
                const hist = document.getElementById("history");
                if (hist) hist.dataset.exerciseId = selectionExerciseId(selectedDeckIds(), true);
                document.dispatchEvent(new CustomEvent("homework:refresh-history"));
                syncReviewLaunchButton();
                preloadSelection();
                break;
            }
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
            persistDeckPractice();
            shareDeck(deckId);
            break;
        case "export":
            exportDeck(deckId);
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: rich HTML template with many card variants
function cardRowHtml(card, i, isTwoSided, isBidirectional) {
    const isImageCard = !!card?.wikimedia;
    const hintVal = escapeHtml(card?.hint || "");
    const hintRevVal = escapeHtml(card?.hintReverse || "");
    const rawParts = cardParts(card);
    const backVal = escapeHtml(rawParts.join("\n"));
    const partsCount = rawParts.length;
    // partsRequired is only stored when strictly < partsCount (canonical form).
    const hasMinRequired = partsCount > 1 && card?.partsRequired != null;
    const minRequiredVal = hasMinRequired ? card.partsRequired : partsCount - 1;
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
                        <div class="card-parts-required"${partsCount > 1 && !isImageCard ? "" : " hidden"}>
                            <label class="fc-parts-min-label">
                                <input type="checkbox" class="card-parts-min-check"${hasMinRequired ? " checked" : ""}>
                                Minimaal:
                                <input type="number" class="card-parts-min-count" min="1"
                                    max="${partsCount - 1}" value="${minRequiredVal}"${hasMinRequired ? "" : " disabled"}>
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
    return `<button type="button" class="fc-hint-chip"><span class="fc-hint-q">?</span><span class="fc-hint-body"><span class="fc-hint-text">${escapeHtml(hint)}</span></span></button>`;
}

// Opening the hint is remembered per question: a deck can count it as a
// mistake, and the result shows it either way.
function wireHintToggle(root, q) {
    root.querySelector(".fc-hint-chip")?.addEventListener("click", (e) => {
        if (e.currentTarget.classList.toggle("open")) noteHintUsed(q);
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
                <button type="button" id="fc-add-card" class="fc-btn-add btn-lift">＋ Kaart toevoegen</button>
            </div>
            <div class="button-row editor-actions">
                <button type="button" id="fc-save-deck" class="default-button primary btn-lift">💾 Opslaan</button>
                <button type="button" id="fc-cancel-edit" class="default-button btn-lift">✖ Annuleer</button>
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
            minCount.max = n - 1;
            if (Number(minCount.value) > n - 1) minCount.value = n - 1;
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
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: card-editor validation with many field types
    managerRoot.querySelectorAll(".card-row").forEach((row) => {
        if (hintErrorInput) return;

        if (row.dataset.cardType === "image") {
            const wikimediaVal = row.querySelector(".card-wikimedia")?.value.trim();
            if (!wikimediaVal) return; // skip rows with no image selected
            const backRaw = row.querySelector(".card-back")?.value?.trim() || "";
            if (!backRaw) return; // answer is required for image cards
            const imgParts = backRaw
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0);
            const card = { wikimedia: wikimediaVal };
            if (imgParts.length > 1) {
                card.parts = imgParts;
            } else {
                card.back = imgParts[0] ?? backRaw;
            }
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
                const minCheck = row.querySelector(".card-parts-min-check");
                if (minCheck?.checked) {
                    const rawMin = Number(row.querySelector(".card-parts-min-count")?.value);
                    const minVal = Number.isNaN(rawMin) ? parts.length : rawMin;
                    const clamped = Math.min(Math.max(1, minVal), parts.length - 1);
                    if (clamped < parts.length) card.partsRequired = clamped;
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
            const config = practiceConfig(decks[idx], readPractice(decks[idx]));
            decks[idx] = { ...decks[idx], name, mode, bidirectional: isBidirectional, cards };
            const textCount = cards.filter((card) => !card.wikimedia).length;
            if (mode !== "one-sided" || textCount < 2) config.fcMode = "all";
            config.fcCount = Math.min(config.fcCount, Math.max(1, textCount - 1));
            decks[idx].practice = practiceFromConfig(config, decks[idx]);
            savedId = existingId;
        }
    }
    if (!savedId) {
        savedId = generateId();
        decks.push({ id: savedId, name, mode, bidirectional: isBidirectional, cards, createdAt: Date.now() });
    }
    if (!saveDecks(decks)) return;

    selectedDeckId = savedId;
    if (multiDeckMode) combinedDeckIds.add(savedId);
    if (hiddenDeckInput) hiddenDeckInput.value = savedId;
    editorState = null;
    _highlightNewDeck = true;
    renderManager();
}

function deleteDeck(id) {
    const decks = loadDecks().filter((d) => d.id !== id);
    if (!saveDecks(decks)) return;
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
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ---------- Import view ----------

// Shared save logic used by both the normal confirm and the conflict resolution buttons.
// `name` is the final deck name; `replaceId` (optional) replaces an existing deck.
async function doImport(name, replaceId) {
    const deck = importPending;
    let saved;
    try {
        saved = storeImportedDeck(deck, { name, replaceId });
    } catch {
        showToast(
            "Importeren mislukt: lokale opslag is niet beschikbaar of vol. Je bestaande decks zijn niet gewijzigd.",
        );
        return;
    }
    multiDeckMode = false;
    selectedDeckId = saved.id;
    if (hiddenDeckInput) hiddenDeckInput.value = saved.id;
    importPending = null;
    history.replaceState({}, "", location.pathname);
    _highlightNewDeck = true;
    renderManager();
    showToast(`Deck “${name}” is geïmporteerd.`);
    const { failed } = await wmPreloadDeck(deck);
    if (failed.length > 0)
        showToast(`Deck geïmporteerd, maar ${failed.length} afbeelding(en) kon niet worden geladen.`);
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
                    <button type="button" id="fc-overwrite-import" class="default-button primary btn-lift">♻️ Overschrijf bestaand</button>
                    <button type="button" id="fc-saveas-import" class="default-button btn-lift">💾 Opslaan als nieuw</button>
                    <button type="button" id="fc-cancel-import" class="default-button btn-lift">Annuleer</button>
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
                    <button type="button" id="fc-confirm-import" class="default-button primary">📥 Importeer dit deck</button>
                    <button type="button" id="fc-cancel-import" class="default-button">Annuleer</button>
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

    ensureExamples();

    const importParam = new URLSearchParams(location.search).get("import");
    if (importParam) {
        try {
            const data = await decodeDeckParam(importParam);
            const decks = loadDecks();
            const { exact: exactMatch, conflict: nameConflict } = findImportMatch(data, decks);
            if (exactMatch) {
                // Identical content already in collection — just select it.
                multiDeckMode = false;
                selectedDeckId = exactMatch.id;
                if (hiddenDeckInput) hiddenDeckInput.value = exactMatch.id;
                showToast("Dit deck staat al in je collectie! ✅");
                history.replaceState({}, "", location.pathname);
            } else {
                // Store conflict id on the pending object so renderImport() can offer
                // overwrite vs. save-as-new options.
                importPending = nameConflict ? { ...data, _conflictId: nameConflict.id } : data;
                // Keep ?import= in the URL until the user resolves the dialog —
                // doImport() and the cancel button both clear it. Consuming it
                // here instead lets any reload in between (a refresh, a restored
                // tab, a service worker upgrade) silently drop the shared deck.
            }
        } catch (error) {
            showToast(`Dit deck kon niet worden geïmporteerd: ${error.message}`);
            history.replaceState({}, "", location.pathname);
        }
    }

    renderManager();
    ensureReviewLaunchButton();
    syncReviewLaunchButton();

    preloadSelection();
}

// Restore the last used deck so spec.id immediately returns the right namespace
// before runExercise calls loadSavedConfig().
(function restoreLastDeck() {
    try {
        const requestedId = new URLSearchParams(location.hash.slice(1)).get("deck");
        const lastId = requestedId || localStorage.getItem(FC_LAST_DECK_KEY);
        const savedSelection = JSON.parse(localStorage.getItem(FC_SELECTION_KEY) || "null");
        if (!requestedId && Array.isArray(savedSelection)) {
            multiDeckMode = true;
            combinedDeckIds = new Set(savedSelection.filter((id) => getDeck(id)));
        }
        if (lastId && loadDecks().some((d) => d.id === lastId)) {
            selectedDeckId = lastId;
            localStorage.setItem(FC_LAST_DECK_KEY, lastId);
            if (requestedId) history.replaceState({}, "", location.pathname + location.search);
            // Set data-exercise-id now so setupHistoryView() (called by runExercise)
            // reads the correct deck ID even when there is no saved config to trigger
            // a loadConfig() → renderList() cycle.
            const histEl = document.getElementById("history");
            if (histEl) histEl.dataset.exerciseId = `flashcards-${lastId}`;
        }
    } catch {}
})();

initManager();

// ---------- Fill-in question renderer (one-sided decks) ----------
// Keys are shared within a grid and survive IndexedDB structured cloning.
const fillInStates = new WeakMap();

function fillInState(q) {
    if (!fillInStates.has(q.blankIndices)) {
        fillInStates.set(q.blankIndices, {
            results: {},
            lastResolved: null,
            blankIndices: q.blankIndices,
            questions: [q],
        });
    }
    return fillInStates.get(q.blankIndices);
}

// Shows the full list with all positions visible:
//   • already answered → green or red with the correct text
//   • current blank    → single text input (id="answer")
//   • future blank     → static "___" placeholder
//   • hint card        → revealed text (muted)
function renderFillInQuestion(q, root) {
    const state = fillInState(q);
    const fillInResults = state.results;
    const blankSet = new Set(fillInState(q).blankIndices);
    // Active input goes at the first unanswered blank — order of typing doesn't matter.
    const activeIdx = state.blankIndices.find((i) => !(i in fillInResults));
    // Answers may be supplied in any order. Record the actual blank, so a
    // later retry and its result label refer to the word that was answered.
    if (activeIdx !== undefined) {
        q.index = activeIdx;
        q.front = q.allCards[activeIdx];
    }

    // The row that just flipped from blank → green/red (set in evaluateAnswer)
    // gets `is-just-resolved` so it can pop in. Consumed once per render.
    const justResolved = state.lastResolved;
    state.lastResolved = null;

    let html = `<div class="flash-fill-grid">`;
    q.allCards.forEach((cardFront, i) => {
        if (!blankSet.has(i)) {
            html += `<div class="fill-row fill-hint">
                <span class="fill-hint-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else if (i in fillInResults) {
            const ok = fillInResults[i];
            const fresh = i === justResolved ? " is-just-resolved" : "";
            html += `<div class="fill-row ${ok ? "fill-answer-ok" : "fill-answer-bad"}${fresh}">
                <span class="fill-answer-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else if (i === activeIdx) {
            html += `<div class="fill-row fill-current">
                <input type="text" id="answer" class="fill-input" autocomplete="off"
                    placeholder="typ hier…" aria-label="jouw antwoord">
            </div>`;
        } else {
            html += `<div class="fill-row fill-blank">
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
        skipBtn.textContent = q.deckName ? "sla invuloefening over" : "🛑 stop oefening";
    }
    if (checkBtn) checkBtn.textContent = "✅ controleer";

    const input = root.querySelector("#answer");
    input?.focus();
    return () => input?.value;
}

function renderFillInReview(q, root) {
    const fillInResults = fillInState(q).results;
    if (!(q.index in fillInResults)) fillInResults[q.index] = false;
    const blankSet = new Set(fillInState(q).blankIndices);

    let html = `<div class="flash-fill-grid flash-fill-review">`;
    q.allCards.forEach((cardFront, i) => {
        if (!blankSet.has(i)) {
            html += `<div class="fill-row fill-hint">
                <span class="fill-hint-text">${escapeHtml(cardFront)}</span>
            </div>`;
        } else {
            const ok = fillInResults[i];
            const cls = ok === true ? "fill-answer-ok" : ok === false ? "fill-answer-bad" : "fill-blank";
            html += `<div class="fill-row ${cls}">
                <span class="fill-answer-text">${escapeHtml(cardFront)}</span>
            </div>`;
        }
    });
    html += `</div>`;
    root.innerHTML = html;
}

// ---------- Multi-part question renderer ----------

function renderMultiPartQuestion(q, root, mode) {
    const { allParts, partsRequired, matched } = q;
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
                    <p class="mp-required-label">${matched.size}/${partsRequired} gevonden</p>
                </div>
            </div>
            ${reviewDiffHtml(q)}`;
        return;
    }

    // Play mode: show already-matched parts and an input for the next one.
    // The framework owns "weet het niet": quiet before the first try, a
    // plain one-press button after a wrong attempt or a matched part.
    if (checkBtn) {
        checkBtn.hidden = false;
        checkBtn.textContent = "👉 antwoord";
    }

    // Only the *newly* matched chip gets `is-just-matched` so it can pop in;
    // every chip rendered before that already played its entrance on the
    // previous tick. `_lastSeenMatchedSize` is a per-question scratch field
    // that survives the framework's re-render between attempts.
    const matchedArr = [...matched];
    const isFreshMatch = matchedArr.length > (q._lastSeenMatchedSize || 0);
    q._lastSeenMatchedSize = matchedArr.length;
    const matchedHtml = matchedArr
        .map((p, i) => {
            const fresh = isFreshMatch && i === matchedArr.length - 1 ? " is-just-matched" : "";
            return `<div class="mp-part mp-matched${fresh}">✅ ${escapeHtml(p)}</div>`;
        })
        .join("");

    root.innerHTML = `
        <div class="flash-question fc-mp-question">
            <p class="flash-text">${escapeHtml(q.front)}</p>
            ${hintToggleHtml(q.hint)}
            <p class="fc-mp-progress">${matched.size}/${partsRequired} gevonden</p>
            ${matchedHtml}
            <input type="text" id="answer" autocomplete="off"
                placeholder="geef je antwoord…" aria-label="jouw antwoord"
                aria-describedby="fc-mp-instructions">
            <details class="fc-mp-instructions">
                <summary id="fc-mp-instructions">Eén per keer of met komma’s</summary>
                <p>Geef één onderdeel per keer en klik op antwoord. Of geef er meerdere tegelijk
                    met een komma (,) of puntkomma (;) ertussen. De volgorde maakt niet uit.</p>
            </details>
        </div>`;

    wireHintToggle(root, q);

    const input = root.querySelector("#answer");
    input?.focus();
    return () => input?.value ?? "";
}

// Store the source with every generated question, including single-deck runs.
// It survives IndexedDB, retries, and later deck renames or deletions.
function buildDeckQuestions(deck, cfg) {
    return generateDeckQuestions(deck, cfg).map((q) => ({
        ...q,
        historySource: { id: deck.id, name: deck.name },
    }));
}

function flashcardHistoryGroups(session, decks = loadDecks()) {
    const groups = new Map();
    for (const outcome of session.questions || []) {
        const q = outcome.question || {};
        const id =
            q.historySource?.id ||
            q.deckId ||
            session.config?.deckId ||
            (session.exerciseId?.startsWith("flashcards-") ? session.exerciseId.slice(11) : null);
        const savedName = q.historySource?.name || q.deckName;
        const currentName = decks.find((deck) => deck.id === id)?.name;
        const name = savedName || (currentName ? `${currentName} (huidige naam)` : "Onbekend deck");
        const key = id || savedName || "unknown";
        if (!groups.has(key)) groups.set(key, { name, questions: [] });
        // Older combined sessions included the deck name in every label.
        const prefix = q.deckName ? `${q.deckName}: ` : "";
        const label = prefix && outcome.label?.startsWith(prefix) ? outcome.label.slice(prefix.length) : outcome.label;
        groups.get(key).questions.push({ ...outcome, label });
    }
    return [...groups.values()];
}

function generateDeckQuestions(deck, cfg) {
    if (!deck) return [];
    // Image cards always produce standalone questions regardless of deck mode.
    const imageCards = deck.cards.filter((c) => c.wikimedia?.trim());
    const textCards = deck.cards.filter((c) => !c.wikimedia && c.front?.trim());
    const isOneSided = deckMode(deck) === "one-sided";

    const imageQuestions = imageCards.map((c) => {
        const iParts = cardParts(c);
        const q = {
            kind: "image",
            wikimedia: c.wikimedia,
            back: c.back || "",
            hint: c.hint || null,
        };
        if (iParts.length > 1) q.parts = iParts;
        return q;
    });

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
                // One queue entry per card; state lives directly on the question
                // object so there is no shared-reference coupling between entries.
                // partsRequired is only stored when strictly < parts.length.
                return [
                    {
                        kind: "multi-part",
                        front: c.front,
                        allParts: parts,
                        partsRequired: c.partsRequired ?? parts.length,
                        partialMode: c.partsRequired != null,
                        matched: new Set(),
                        revealAtEnd: false,
                        revealPracticeAgain: false,
                        revealShown: false,
                        hint: c.hint || null,
                        direction: "fwd",
                    },
                ];
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
}

function renderFlashQuestion(q, root, mode) {
    switch (q.kind) {
        case "multi-part":
            return renderMultiPartQuestion(q, root, mode);
        case "fill-in":
            if (mode.kind === "review") {
                renderFillInReview(q, root);
                root.insertAdjacentHTML("beforeend", reviewDiffHtml(q, mode.given));
                return;
            }
            return renderFillInQuestion(q, root);
        case "image": {
            const checkBtn = document.getElementById("button-check");
            const imgSrc = imageObjectURLs.get(q.wikimedia) || "";
            if (mode.kind === "review") {
                const backBodyHtml =
                    q.parts && q.parts.length > 1
                        ? `<span class="fc-review-parts">${q.parts.map((p) => `<span class="fc-review-part-chip">${escapeHtml(p)}</span>`).join("")}</span>`
                        : `<p class="flash-text">${escapeHtml(q.back)}</p>`;
                root.innerHTML = `
                    <div class="flash-review">
                        <div class="flash-side flash-front-side flash-image-side">
                            <span class="flash-side-label">afbeelding</span>
                            ${
                                imgSrc
                                    ? `<img src="${imgSrc}" alt="" class="flash-card-image">`
                                    : `<div class="flash-image-missing">Afbeelding niet beschikbaar</div>`
                            }
                        </div>
                        <div class="flash-side flash-back-side">
                            <span class="flash-side-label">antwoord</span>
                            ${backBodyHtml}
                        </div>
                    </div>
                    ${reviewDiffHtml(q, mode.given)}`;
                return;
            }
            root.innerHTML = `
                <div class="flash-question">
                    <div class="flash-image-container">
                        ${
                            imgSrc
                                ? `<img src="${imgSrc}" alt="" class="flash-card-image">`
                                : `<div class="flash-image-loading">⏳ afbeelding laden…</div>`
                        }
                    </div>
                    ${hintToggleHtml(q.hint)}
                    <input type="text" id="answer" autocomplete="off"
                        placeholder="wat zie je?" aria-label="jouw antwoord">
                </div>`;
            if (checkBtn) {
                checkBtn.hidden = false;
                checkBtn.textContent = "👉 antwoord";
            }
            wireHintToggle(root, q);
            // If not cached yet, retry once the load completes in the background.
            if (!imgSrc) {
                wmLoad(q.wikimedia)
                    .then((url) => {
                        const container = root.querySelector(".flash-image-container");
                        if (container) container.innerHTML = `<img src="${url}" alt="" class="flash-card-image">`;
                    })
                    .catch(() => {});
            }
            const input = root.querySelector("#answer");
            return () => input?.value ?? "";
        }
        case "two-sided": {
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
                    </div>
                    ${reviewDiffHtml(q, mode.given)}`;
                return;
            }
            root.innerHTML = `
                <div class="flash-question">
                    <p class="flash-text">${escapeHtml(q.front)}</p>
                    ${hintToggleHtml(q.hint)}
                    <input type="text" id="answer" autocomplete="off"
                        placeholder="jouw antwoord…" aria-label="jouw antwoord">
                </div>`;
            if (checkBtn) checkBtn.textContent = "👉 antwoord";
            wireHintToggle(root, q);
            const input = root.querySelector("#answer");
            return () => input.value;
        }
        default:
            throw new Error(`Unknown card kind: ${q.kind}`);
    }
}

// Each fill-in grid is one shuffle unit. Ordinary cards remain independent.
function groupQuestions(questions) {
    const groups = [];
    const grids = new Map();
    for (const q of questions) {
        if (q.kind !== "fill-in") {
            groups.push([q]);
            continue;
        }
        let group = grids.get(q.blankIndices);
        if (!group) {
            group = [];
            grids.set(q.blankIndices, group);
            groups.push(group);
        }
        group.push(q);
    }
    return groups;
}

function buildCombinedQuestions(decks) {
    const questions = decks.flatMap((deck) =>
        buildDeckQuestions(deck, practiceConfig(deck, readPractice(deck))).map((q) => ({
            ...q,
            deckId: deck.id,
            deckName: deck.name,
        })),
    );
    return shuffle(groupQuestions(questions)).flat();
}

// The framework shuffles retries, including ones restored from history. Regroup
// grids and reveal the blanks that weren't selected for this retry.
function preparePracticeDeck(questions, mode) {
    // Every question is checked by its own deck's current settings — also a
    // retry restored from history, or a card in a mix of decks.
    const decks = new Map(loadDecks().map((deck) => [deck.id, deck]));
    for (const q of questions) {
        const deck = decks.get(q.historySource?.id || q.deckId || selectedDeckId);
        questionChecking.set(q, deck ? answerChecking(readPractice(deck)) : LENIENT);
    }
    const groups = groupQuestions(questions);
    for (const group of groups) {
        const q = group[0];
        if (q.kind !== "fill-in") continue;
        fillInStates.set(q.blankIndices, {
            results: {},
            lastResolved: null,
            blankIndices:
                mode === "mistakes"
                    ? [...new Set(group.map((item) => item.index))].sort((a, b) => a - b)
                    : q.blankIndices,
            questions: group,
        });
    }
    return mode === "mistakes" ? groups.flat() : questions;
}

function configDeckIds(cfg) {
    return cfg.deckIds || (cfg.deckId ? [cfg.deckId] : []);
}

function selectionExerciseId(ids, multiple) {
    return multiple
        ? `flashcards:mix:${JSON.stringify([...new Set(ids)].sort())}`
        : ids[0]
          ? `flashcards-${ids[0]}`
          : "flashcards";
}

function validateDeckConfig(deck, cfg) {
    if (!deck) return "Dit deck bestaat niet meer — kies een ander deck.";
    if (deck.cards.length === 0) return "Dit deck heeft geen kaarten.";
    const isOneSided = deckMode(deck) === "one-sided";
    if (!isOneSided && deck.cards.some((card) => !card.wikimedia && cardParts(card).length === 0)) {
        return "Dit deck bevat kaartjes zonder antwoord. Vul die eerst in via Bewerken.";
    }
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
}

// ---------- Answer evaluation ----------

function nudgeResult(given, nudge, checking) {
    return {
        correct: false,
        feedback: nudgeText(nudge.kinds),
        feedbackHtml: attemptHtml(given, nudge.expected, checking),
    };
}

// An answer checked against every accepted answer of a card. `answerText` is
// what the card shows as its answer.
function singleAnswerResult(given, candidates, checking, answerText) {
    const { match, nudge } = matchAnswer(given, candidates, checking);
    if (!match) return nudge ? nudgeResult(given, nudge, checking) : { correct: false };
    return {
        correct: true,
        exact: match.exact,
        showReview: !match.exact,
        practiceAgain: match.practiceAgain,
        feedback: match.exact ? undefined : buildAcceptedFeedback(answerText, match.practiceAgain),
    };
}

function evaluateFillIn(q, given, checking) {
    const state = fillInState(q);
    // Order-independent: the answer may fill any blank that is still open.
    const open = state.blankIndices.filter((idx) => !(idx in state.results));
    const { match, expected, nudge } = matchAnswer(
        given,
        open.map((idx) => q.allCards[idx]),
        checking,
    );
    // Keep the same blank open while the framework allows another attempt;
    // the review renderer marks it wrong only when done.
    if (!match) return nudge ? nudgeResult(given, nudge, checking) : { correct: false };
    const idx = open.find((i) => q.allCards[i] === expected);
    q.index = idx;
    q.front = expected;
    state.results[idx] = true;
    state.lastResolved = idx;
    return {
        correct: true,
        exact: match.exact,
        showReview: !match.exact,
        practiceAgain: match.practiceAgain,
        feedback: match.exact ? undefined : buildAcceptedFeedback(expected, match.practiceAgain),
    };
}

function evaluateMultiPart(q, given, checking) {
    const { allParts, partialMode } = q;
    const newlyMatched = tryMatchParts(given, allParts, q.matched, checking);
    if (newlyMatched.length === 0) {
        const nudge = partNudge(
            given,
            allParts.filter((part) => !q.matched.has(part)),
            checking,
        );
        if (!nudge) return { correct: false };
        noteAnswerPair(q, nudge.given, nudge.expected);
        return nudgeResult(nudge.given, nudge, checking);
    }

    for (const match of newlyMatched) {
        q.matched.add(match.part);
        if (!match.exact && !partialMode) noteAnswerPair(q, match.given, match.part);
    }
    const exactThisStep = partialMode || newlyMatched.every((match) => match.exact);
    if (!partialMode && !exactThisStep) q.revealAtEnd = true;
    if (!partialMode && newlyMatched.some((match) => match.practiceAgain)) q.revealPracticeAgain = true;

    if (q.matched.size < q.partsRequired) return { partialCorrect: true };

    const showReview = !partialMode && q.revealAtEnd && !q.revealShown;
    if (showReview) q.revealShown = true;
    return {
        correct: true,
        exact: partialMode || !q.revealAtEnd,
        showReview,
        // Any step that was only nearly right sends the whole card back, not
        // just the step that completed it.
        practiceAgain: q.revealPracticeAgain,
        feedback: showReview
            ? buildAcceptedFeedback(allParts.join(" / "), q.revealPracticeAgain, allParts.length > 1)
            : undefined,
    };
}

// ---------- Exercise spec ----------

runExercise({
    // Per-deck namespace: sessions and saved config are keyed by deck ID so
    // each deck gets its own history.  Falls back to "flashcards" when no deck
    // is selected (e.g. on first load before restoreLastDeck runs).
    get id() {
        return selectionExerciseId(selectedDeckIds(), multiDeckMode);
    },
    label: "flitskaarten",

    loadConfig(_form, saved) {
        if (multiDeckMode) return;
        if (!saved?.deckId) return;
        const deck = getDeck(saved.deckId);
        if (!deck) return;
        selectedDeckId = saved.deckId;
        try {
            localStorage.setItem(FC_LAST_DECK_KEY, saved.deckId);
        } catch {}
        if (hiddenDeckInput) hiddenDeckInput.value = saved.deckId;
        renderList();
        Object.assign(saved, practiceConfig(deck, readPractice(deck)));
    },

    readConfig(form) {
        if (multiDeckMode) return { deckIds: selectedDeckIds() };
        return {
            deckId: form.querySelector("#selected-deck-id")?.value || "",
            fcMode: form.querySelector("input[name='fc-mode']:checked")?.value || "all",
            fcCount: Number(form.querySelector("input[name='fc-count']")?.value) || 0,
            fcOrderImportant: form.querySelector("#fc-order-important")?.checked || false,
        };
    },

    onBeforeReset() {
        stopReviewSession({ keepPage: true });
    },

    validateConfig(cfg) {
        const ids = configDeckIds(cfg);
        if (ids.length === 0) return "Kies een deck om te oefenen.";
        for (const id of ids) {
            const deck = getDeck(id);
            const error = validateDeckConfig(
                deck,
                cfg.deckIds && deck ? practiceConfig(deck, readPractice(deck)) : cfg,
            );
            if (error) return cfg.deckIds && deck ? `${deck.name}: ${error}` : error;
        }
        return null;
    },

    buildDeck(cfg) {
        const decks = configDeckIds(cfg).map(getDeck).filter(Boolean);
        if (!cfg.deckIds) return buildDeckQuestions(decks[0], cfg);
        return buildCombinedQuestions(decks);
    },

    prepareDeck: preparePracticeDeck,

    historyGroups: flashcardHistoryGroups,

    // Reset the progress a question accumulated during an earlier session.
    //
    // A question object outlives the session it was built for: recordOutcome()
    // stores it by reference, and "fouten oefenen" replays that very object —
    // straight from memory for an immediate retry, or structured-cloned out of
    // IndexedDB later, which preserves a Set intact. Without this reset a
    // multi-part card comes back with every part still marked as matched, so it
    // reveals the whole answer and rejects everything the learner types: there
    // is nothing left to match. Each fill-in grid also starts with fresh progress.
    prepareQuestion(q) {
        if (q.kind === "multi-part") {
            q.matched = new Set();
            q.revealAtEnd = false;
            q.revealPracticeAgain = false;
            q.revealShown = false;
            q._lastSeenMatchedSize = 0;
        }
        hintUsedQuestions.delete(q);
        answerPairs.delete(q);
    },

    renderQuestion(q, root, mode) {
        const answer = renderFlashQuestion(q, root, mode);
        if (q.deckName) {
            const label = document.createElement("p");
            label.className = "fc-source-deck";
            label.textContent = q.deckName;
            root.prepend(label);
        }
        return answer;
    },

    evaluateAnswer(q, given) {
        const checking = checkingFor(q);
        switch (q.kind) {
            case "multi-part":
                return evaluateMultiPart(q, given, checking);
            case "fill-in":
                return evaluateFillIn(q, given, checking);
            case "image":
                return q.parts && q.parts.length > 1
                    ? singleAnswerResult(given, q.parts, checking, q.parts.join(" / "))
                    : singleAnswerResult(given, [q.back], checking, q.back);
            case "two-sided":
                return singleAnswerResult(given, [q.back], checking, q.back);
            default:
                throw new Error(`Unknown card kind: ${q.kind}`);
        }
    },

    // Snapshot how the answer was checked, so the result and the history can
    // show — also much later — what was typed against what was expected.
    annotateOutcome(outcome) {
        const q = outcome.question;
        const checking = checkingFor(q);
        outcome.check = { checking, pairs: outcomeAnswerPairs(q, outcome, checking) };
        if (!hintUsedQuestions.has(q)) return;
        outcome.check.hintUsed = true;
        if (checking.hintIsMistake && outcome.correct && !outcome.practiceAgain) {
            outcome.practiceAgain = true;
            outcome.practiceLabel = "hint gebruikt · opnieuw oefenen";
        }
    },

    renderOutcomeDetail: outcomeDetailHtml,

    evaluateSkip(q) {
        if (q.kind === "two-sided" || q.kind === "image") {
            const revealText = q.parts && q.parts.length > 1 ? q.parts.join(" / ") : q.back;
            return {
                showReview: true,
                feedback: buildRevealFeedback(revealText, !!(q.parts && q.parts.length > 1)),
            };
        }
        if (q.kind === "fill-in") {
            const state = fillInState(q);
            const remaining = state.blankIndices.filter((idx) => !(idx in state.results));
            const pending = state.questions.slice(state.questions.indexOf(q));
            pending.forEach((question, i) => {
                if (remaining[i] === undefined) return;
                question.index = remaining[i];
                question.front = q.allCards[remaining[i]];
                state.results[remaining[i]] = false;
            });
            return { skipRemainingFillIn: true };
        }
        if (q.kind !== "multi-part") return null;
        q.revealShown = true;
        return {
            showReview: true,
            feedback: buildRevealFeedback(q.allParts.join(" / "), q.allParts.length > 1),
        };
    },

    skipConfirmDialog(q) {
        if (q.kind !== "fill-in") return null;
        return {
            title: q.deckName ? "Invuloefening overslaan?" : "Invuloefening stoppen?",
            message: q.deckName
                ? "De resterende vakjes van dit deck worden overgeslagen. Daarna ga je verder met de andere kaarten."
                : "Alle resterende vakjes worden overgeslagen.",
            buttons: [
                { value: "stay", label: "Blijf hier", className: "primary", id: "fill-stop-stay", autofocus: true },
                { value: "stop", label: q.deckName ? "Sla over" : "Stop oefening", id: "fill-stop-confirm" },
            ],
        };
    },

    describe(q) {
        const source = q.deckName ? `${q.deckName}: ` : "";
        switch (q.kind) {
            case "multi-part":
                return `${source}${q.front} → [${q.allParts.join(" / ")}]`;
            case "two-sided":
                return `${source}${q.front} → ${q.back}`;
            case "image":
                return `${source}[🖼️ ${q.wikimedia}] → ${q.parts?.length ? `[${q.parts.join(" / ")}]` : q.back}`;
            case "fill-in":
                return source + q.front;
            default:
                throw new Error(`Unknown card kind: ${q.kind}`);
        }
    },
});

// ---------- Card wave animation (one-sided decks) ----------

function showCardWave(cards) {
    if (cards.length === 0) return;
    // Always insert the overlay — motion preference is a CSS concern.
    // The keyframes live inside @media (prefers-reduced-motion: no-preference)
    // so reduced-motion users see the cards statically without animation.
    const overlay = document.createElement("div");
    overlay.className = "fc-wave-overlay";
    const items = cards.map((text) => `<div class="fc-wave-card">${escapeHtml(text)}</div>`).join("");
    overlay.innerHTML = `<div class="fc-wave-stage">${items}</div>`;
    document.body.appendChild(overlay);
    // Stagger each card's animation by setting `--i` via CSSOM rather
    // than as an inline `style="--i:…"` attribute on the template — the
    // attribute form would require `'unsafe-inline'` in `style-src-attr`.
    // `.style.setProperty` is CSSOM-side and not CSP-governed.
    for (const [i, el] of overlay.querySelectorAll(".fc-wave-card").entries()) {
        el.style.setProperty("--i", String(i));
    }
    let dismissed = false;
    function dismiss() {
        if (dismissed) return;
        dismissed = true;
        overlay.classList.add("fc-wave-fade");
        setTimeout(() => overlay.remove(), 400);
    }
    overlay.addEventListener("click", dismiss, { once: true });
    const totalMs = Math.min(cards.length - 1, 19) * 80 + 3000;
    setTimeout(dismiss, totalMs);
}

// ---------- Perfect-score hook ----------
//
// Listen for the framework's structured session-finished event instead of
// observing page-result attributes — the previous MutationObserver had to
// parse "X / Y" out of the result heading textContent, which broke as soon
// as the result chrome gained extra spans (time, cycles, etc).

const pageResultEl = document.getElementById("page-result");
document.addEventListener("homework:session-finished", (e) => {
    const { exerciseId, correct, total } = e.detail || {};
    // The flashcards spec namespaces its id per deck (`flashcards-<deckId>`),
    // so check the prefix rather than an exact match.
    if (!exerciseId?.startsWith("flashcards")) return;
    const deck = selectedDeckId ? getDeck(selectedDeckId) : null;
    if (!multiDeckMode && deck && deckMode(deck) === "one-sided" && correct > 0 && correct === total) {
        // Defer briefly so the result page is fully rendered before the
        // wave covers it (the event fires before show("result") finishes).
        setTimeout(() => {
            if (pageResultEl?.querySelector("#review-button-repeat")) return;
            showCardWave(deck.cards.map((c) => c.front).filter(Boolean));
        }, 0);
    }
});

// Save changed setup preferences with the deck so export includes choices made
// before starting a session, and an imported deck can restore them atomically.
document.getElementById("form-setup")?.addEventListener("change", persistDeckPractice);
