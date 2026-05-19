// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, parseStrictInt, pickRandom, readFields, runExercise } from "@homework";

// ---------- Fraction pools ----------

// All (num, den) pairs in simplified form where num × 100 is divisible by den
// (so the percentage is always a whole number). Matches Belgian/Dutch primary
// school curriculum for percentages.
//
// `makkelijk` keeps to num=1 fractions, where "procent van een getal" is a
// single divide step: 10% / 20% / 25% / 50%. `gemiddeld` adds the rest of
// the round-percentage pairs (30/40/60/70/75/80/90). `moeilijk` adds the
// 5%-step fractions that need denominator 20.
const MAKKELIJK_FRACS = [
    [1, 10], // 10%
    [1, 5], // 20%
    [1, 4], // 25%
    [1, 2], // 50%
];

const GEMIDDELD_FRACS = [
    ...MAKKELIJK_FRACS,
    [3, 10],
    [7, 10],
    [9, 10], // 30%, 70%, 90%
    [2, 5],
    [3, 5],
    [4, 5], // 40%, 60%, 80%
    [3, 4], // 75%
];

const MOEILIJK_FRACS = [
    ...GEMIDDELD_FRACS,
    [1, 20],
    [3, 20],
    [7, 20],
    [9, 20], // 5%, 15%, 35%, 45%
    [11, 20],
    [13, 20],
    [17, 20],
    [19, 20], // 55%, 65%, 85%, 95%
];

function fracPool(difficulty) {
    if (difficulty === "moeilijk") return MOEILIJK_FRACS;
    if (difficulty === "gemiddeld") return GEMIDDELD_FRACS;
    return MAKKELIJK_FRACS;
}

// Cap the largest "whole" for "procent van een getal" by difficulty. Even
// with the simplest fractions, 90% of 90 = 81 is mental-math-heavy for an
// 8-year-old; capping to 50 on `makkelijk` keeps the numbers in pen-and-
// paper range, while `gemiddeld` / `moeilijk` open up to 100.
function maxWholeForDifficulty(difficulty) {
    if (difficulty === "moeilijk") return 100;
    if (difficulty === "gemiddeld") return 100;
    return 50;
}

// ---------- HTML helpers ----------

function frac(num, den) {
    return `<span class="fraction"><span class="frac-num">${num}</span><span class="frac-bar"></span><span class="frac-den">${den}</span></span>`;
}

const FRAC_INPUT = `<span class="fraction-input"><input inputmode="numeric" pattern="[0-9]+" id="answer-num" min="0" max="10000" required><span class="frac-bar"></span><input inputmode="numeric" pattern="[0-9]+" id="answer-den" min="1" max="10000" required></span>`;

// ---------- Question generators ----------

function genBreukNaarProcent(pool) {
    const [num, den] = pickRandom(pool);
    return {
        q: { kind: "breuk-naar-procent", num, den, answer: (num * 100) / den },
        key: `bnp:${num}/${den}`,
    };
}

function genProcentNaarBreuk(pool, requireSimplified) {
    const [num, den] = pickRandom(pool);
    const pct = (num * 100) / den;
    return {
        q: { kind: "procent-naar-breuk", pct, answer: { num, den }, requireSimplified },
        key: `pnb:${pct}`,
    };
}

// Pick a k for whole = den * k that keeps whole within [10, maxWhole] when
// possible. If maxWhole is too tight to allow whole ≥ 10, return minK so
// the smallest valid whole comes out (the deck builder will skip duplicate
// keys but the result is still a valid question).
function pickWholeMultiplier(den, maxWhole) {
    const minK = Math.max(1, Math.ceil(10 / den));
    const capK = Math.floor(maxWhole / den);
    const maxK = capK < minK ? minK : capK;
    return minK + Math.floor(Math.random() * (maxK - minK + 1));
}

function genProcentVanGetal(pool, maxWhole) {
    const [num, den] = pickRandom(pool);
    const pct = (num * 100) / den;
    const k = pickWholeMultiplier(den, maxWhole);
    const whole = den * k;
    const answer = num * k;
    return {
        q: { kind: "procent-van-getal", pct, num, den, whole, answer },
        key: `pvg:${pct}:${whole}`,
    };
}

function genWatProcent(pool, maxWhole) {
    const [num, den] = pickRandom(pool);
    const pct = (num * 100) / den;
    const k = pickWholeMultiplier(den, maxWhole);
    const part = num * k;
    const whole = den * k;
    return {
        q: { kind: "wat-procent", num, den, part, whole, answer: pct },
        key: `wp:${part}:${whole}`,
    };
}

function pickQuestion(kind, pool, cfg) {
    if (kind === "breuk-naar-procent") return genBreukNaarProcent(pool);
    if (kind === "procent-naar-breuk") return genProcentNaarBreuk(pool, cfg.requireSimplified);
    if (kind === "procent-van-getal") return genProcentVanGetal(pool, cfg.maxWhole);
    if (kind === "wat-procent") return genWatProcent(pool, cfg.maxWhole);
    return null;
}

// ---------- Deck builder ----------

function buildDeck(cfg) {
    const deck = [];
    const N = cfg.numExercises;
    const pool = fracPool(cfg.difficulty);
    const kinds = cfg.kinds || [];
    if (kinds.length === 0 || pool.length === 0) return deck;
    // Default maxWhole to the difficulty's cap; explicit cfg.maxWhole
    // (from the optional "max getal" field) overrides if set.
    const buildCfg = { ...cfg, maxWhole: cfg.maxWhole || maxWholeForDifficulty(cfg.difficulty) };

    const seen = new Set();
    let staleTries = 0;
    let totalTries = 0;

    while (deck.length < N && totalTries < N * 50) {
        totalTries++;
        if (staleTries > Math.max(20, seen.size)) {
            seen.clear();
            staleTries = 0;
        }
        const kind = pickRandom(kinds);
        const result = pickQuestion(kind, pool, buildCfg);
        if (!result) continue;
        const { q, key } = result;
        if (seen.has(key)) {
            staleTries++;
            continue;
        }
        seen.add(key);
        staleTries = 0;
        deck.push(q);
    }
    return deck;
}

// ---------- Rendering ----------

const FEEDBACK = {
    "breuk-naar-procent": "breuk naar procent",
    "procent-naar-breuk": "procent naar breuk",
    "procent-van-getal": "procent van een getal",
    "wat-procent": "hoeveel procent?",
};

function renderPlay(q) {
    const extra = q.kind === "procent-naar-breuk" && q.requireSimplified ? " · vereenvoudig" : "";
    const fb = FEEDBACK[q.kind] + extra;
    let html;
    switch (q.kind) {
        case "breuk-naar-procent":
            html = `<p class="pct-expr">${frac(q.num, q.den)} = <input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100" required> <span class="pct-suffix">%</span></p>`;
            break;
        case "procent-naar-breuk": {
            const hint = q.requireSimplified ? `<p class="pct-hint">Schrijf de breuk in vereenvoudigde vorm.</p>` : "";
            html = `<p class="pct-expr"><span class="pct-display">${q.pct}</span><span class="pct-suffix">%</span> = ${FRAC_INPUT}</p>${hint}`;
            break;
        }
        case "procent-van-getal":
            html = `<p class="pct-expr"><span class="pct-display">${q.pct}</span><span class="pct-suffix">%</span> van <span class="pct-whole">${q.whole}</span> = <input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="10000" required></p>`;
            break;
        case "wat-procent":
            html = `<p class="pct-expr"><span class="pct-part">${q.part}</span> is <input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100" required> <span class="pct-suffix">%</span> van <span class="pct-whole">${q.whole}</span></p>`;
            break;
    }
    return { feedback: fb, html };
}

const STEP_ARROW = `<span class="pct-step-arrow" aria-hidden="true">→</span>`;

function renderReview(q) {
    switch (q.kind) {
        case "breuk-naar-procent":
            return `<p class="pct-expr">${frac(q.num, q.den)} ${STEP_ARROW} <span class="pct-step">${q.num} × 100 ÷ ${q.den}</span> = <span class="box bad pct-step">${q.answer}%</span></p>`;
        case "procent-naar-breuk":
            // Show: pct% → pct/100 → simplified answer
            return `<p class="pct-expr">${q.pct}% ${STEP_ARROW} <span class="pct-step">${frac(q.pct, 100)}</span> ${STEP_ARROW} <span class="box bad pct-step">${frac(q.answer.num, q.answer.den)}</span></p>`;
        case "procent-van-getal": {
            // Show: pct% van whole → whole ÷ den [× num] = answer
            const step = q.num === 1 ? `${q.whole} ÷ ${q.den}` : `${q.whole} ÷ ${q.den} × ${q.num}`;
            return `<p class="pct-expr">${q.pct}% van ${q.whole} ${STEP_ARROW} <span class="pct-step">${step}</span> = <span class="box bad pct-step">${q.answer}</span></p>`;
        }
        case "wat-procent":
            // Echo the play form ("X is ?% van Y") so it's obvious the unknown
            // is a percentage — "X van Y" alone reads as plain division.
            return `<p class="pct-expr">${q.part} is ?% van ${q.whole} ${STEP_ARROW} <span class="pct-step">${q.part} ÷ ${q.whole} × 100</span> = <span class="box bad pct-step">${q.answer}%</span></p>`;
    }
}

// ---------- Answer checking ----------

function isCorrectAnswer(q, given) {
    switch (q.kind) {
        case "breuk-naar-procent":
        case "procent-van-getal":
        case "wat-procent": {
            // Strict parse so "1e2", " 5", "0x10" etc. can't sneak past
            // the comparison. The live-input filter on numeric inputs in
            // homework.js strips most non-digits, but paste/programmatic
            // value setting can still bypass it.
            const n = parseStrictInt(given);
            return n !== null && n === q.answer;
        }
        case "procent-naar-breuk": {
            const gNum = parseStrictInt(given?.num);
            const gDen = parseStrictInt(given?.den);
            if (gNum === null || gDen === null) return false;
            if (gDen <= 0) return false;
            if (q.requireSimplified) {
                return gNum === q.answer.num && gDen === q.answer.den;
            }
            return gNum * q.answer.den === q.answer.num * gDen;
        }
    }
    return false;
}

// ---------- Config form wiring ----------

const FIELDS = [
    { field: "difficulty", type: "radio", key: "difficulty", default: "makkelijk" },
    { field: "require-simplified", type: "checkbox", key: "requireSimplified" },
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "max-whole", type: "number", key: "maxWhole" },
    { field: "practice", type: "checkboxes", key: "kinds" },
];

function setupSimplifiedVisibility(form) {
    const section = form.querySelector("#simplified-section");
    if (!section) return;
    const pnbCb = form.querySelector('input[value="procent-naar-breuk"]');
    function update() {
        section.hidden = !pnbCb?.checked;
    }
    pnbCb?.addEventListener("change", update);
    update();
}

// ---------- Exercise spec ----------

runExercise({
    id: "percentages",
    label: "procenten",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        setupSimplifiedVisibility(form);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (cfg.kinds.length === 0) return "Gelieve minstens één soort oefening te selecteren.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Gelieve een geldig aantal oefeningen op te geven.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = renderReview(q);
            return;
        }
        const r = renderPlay(q);
        document.getElementById("exercise-feedback").textContent = r.feedback;
        root.innerHTML = r.html;
        if (q.kind === "procent-naar-breuk") {
            const numInput = root.querySelector("#answer-num");
            const denInput = root.querySelector("#answer-den");
            // Return the raw strings so isCorrectAnswer's parseStrictInt sees
            // the original input — Number() here would silently swallow
            // "0x10", "1e0", " 25", "+25" etc. before the strict check ran.
            return () => ({ num: numInput.value, den: denInput.value });
        }
        const input = root.querySelector("#answer");
        return () => input.value;
    },
    isCorrect: isCorrectAnswer,
    describe(q) {
        switch (q.kind) {
            case "breuk-naar-procent":
                return `${q.num}/${q.den} = ${q.answer}%`;
            case "procent-naar-breuk":
                return `${q.pct}% = ${q.answer.num}/${q.answer.den}`;
            case "procent-van-getal":
                return `${q.pct}% van ${q.whole} = ${q.answer}`;
            case "wat-procent":
                return `${q.part} is ${q.answer}% van ${q.whole}`;
        }
    },
});
