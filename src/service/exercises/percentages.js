// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, pickRandom, readFields, runExercise } from "@homework";

// ---------- Math helpers ----------

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        [x, y] = [y, x % y];
    }
    return x || 1;
}

// ---------- Fraction pools ----------

// All (num, den) pairs in simplified form where num × 100 is divisible by den
// (so the percentage is always a whole number). Matches Belgian/Dutch primary
// school curriculum for percentages.
const EASY_FRACS = [
    [1, 10],
    [3, 10],
    [7, 10],
    [9, 10], // 10%, 30%, 70%, 90%
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5], // 20%, 40%, 60%, 80%
    [1, 4],
    [3, 4], // 25%, 75%
    [1, 2], // 50%
];

// Adds 5%-step fractions that need denominator 20.
const HARD_FRACS = [
    ...EASY_FRACS,
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
    return difficulty === "moeilijk" ? HARD_FRACS : EASY_FRACS;
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

function genProcentVanGetal(pool) {
    const [num, den] = pickRandom(pool);
    const pct = (num * 100) / den;
    // Ensure whole is at least 10 to avoid trivially small numbers.
    const minK = Math.max(1, Math.ceil(10 / den));
    const maxK = Math.max(minK + 4, Math.floor(100 / den));
    const k = minK + Math.floor(Math.random() * (maxK - minK + 1));
    const whole = den * k;
    const answer = num * k;
    return {
        q: { kind: "procent-van-getal", pct, num, den, whole, answer },
        key: `pvg:${pct}:${whole}`,
    };
}

function genWatProcent(pool) {
    const [num, den] = pickRandom(pool);
    const pct = (num * 100) / den;
    const minK = Math.max(1, Math.ceil(10 / den));
    const maxK = Math.max(minK + 4, Math.floor(100 / den));
    const k = minK + Math.floor(Math.random() * (maxK - minK + 1));
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
    if (kind === "procent-van-getal") return genProcentVanGetal(pool);
    if (kind === "wat-procent") return genWatProcent(pool);
    return null;
}

// ---------- Deck builder ----------

function buildDeck(cfg) {
    const deck = [];
    const N = cfg.numExercises;
    const pool = fracPool(cfg.difficulty);
    const kinds = cfg.kinds || [];
    if (kinds.length === 0 || pool.length === 0) return deck;

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
        const result = pickQuestion(kind, pool, cfg);
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
    "breuk-naar-procent": "breuk naar procent 📊",
    "procent-naar-breuk": "procent naar breuk 🔣",
    "procent-van-getal": "procent van een getal 🔢",
    "wat-procent": "hoeveel procent? ❓",
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
            // Show: part van whole → part ÷ whole × 100 = answer%
            return `<p class="pct-expr">${q.part} van ${q.whole} ${STEP_ARROW} <span class="pct-step">${q.part} ÷ ${q.whole} × 100</span> = <span class="box bad pct-step">${q.answer}%</span></p>`;
    }
}

// ---------- Answer checking ----------

function isCorrectAnswer(q, given) {
    switch (q.kind) {
        case "breuk-naar-procent":
        case "procent-van-getal":
        case "wat-procent":
            return Number(given) === q.answer;
        case "procent-naar-breuk": {
            const gNum = Number(given.num);
            const gDen = Number(given.den);
            if (!gDen || gDen <= 0) return false;
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
            return () => ({ num: Number(numInput.value), den: Number(denInput.value) });
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
