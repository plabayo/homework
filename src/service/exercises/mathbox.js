// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    loadFields,
    parseStrictInt,
    pickRandom,
    randomInt,
    readFields,
    runExercise,
    uniqueDeck,
    weightedPlan,
} from "@homework";

const MAX_NUMBER = 1000;

const KIND_LABELS = {
    som: "optellen",
    verschil: "aftrekken",
    splitsen: "splitsen",
    vermenigvuldigen: "vermenigvuldigen",
    delen: "delen",
};

// Inclusive [lo, hi] range for both numbers as the child sees them: for
// delen that is dividend ÷ divisor. A blank bound falls back to a per-kind
// default; `countUntil` itself only caps the answer.
function termRanges(kind, cfg) {
    const N = cfg.countUntil;
    const factors = kind === "vermenigvuldigen" || kind === "delen";
    // Factors default to half the maximum so ×1 and ÷1 don't dominate, and
    // a divisor (or second factor) is never 0.
    const half = Math.max(1, Math.floor(N / 2));
    const aDefaultHi = kind === "vermenigvuldigen" ? half : N;
    const bDefaultHi = factors ? half : N;
    const aLo = cfg.minFirstTerm ?? 0;
    const bLo = factors ? Math.max(1, cfg.minSecondTerm ?? 1) : (cfg.minSecondTerm ?? 0);
    // An explicit lower bound above the default keeps its own range open.
    const aHi = cfg.maxFirstTerm ?? Math.max(aDefaultHi, aLo);
    const bHi = cfg.maxSecondTerm ?? Math.max(bDefaultHi, bLo);
    return { aLo, aHi, bLo, bHi };
}

// Returns a generator for one question of `kind`, or null when no question
// fits the configured ranges. Feasibility is decided before any randomness
// so validation and deck building agree.
function planQuestion(kind, cfg) {
    const N = cfg.countUntil;
    const { aLo, aHi, bLo, bHi } = termRanges(kind, cfg);
    if (aLo > aHi || bLo > bHi) return null;
    switch (kind) {
        case "som":
        case "splitsen": {
            const hi = Math.min(aHi, N - bLo);
            if (aLo > hi) return null;
            return () => {
                const a = randomInt(aLo, hi);
                const b = randomInt(bLo, Math.min(bHi, N - a));
                return { kind, a, b, answer: a + b };
            };
        }
        case "verschil": {
            // b ≤ a keeps the answer ≥ 0; a − b ≤ N caps it from above.
            const lo = Math.max(aLo, bLo);
            const hi = Math.min(aHi, bHi + N);
            if (lo > hi) return null;
            return () => {
                const a = randomInt(lo, hi);
                const b = randomInt(Math.max(bLo, a - N), Math.min(bHi, a));
                return { kind, a, b, answer: a - b };
            };
        }
        case "vermenigvuldigen": {
            const hi = Math.min(aHi, Math.floor(N / bLo));
            if (aLo > hi) return null;
            return () => {
                const a = randomInt(aLo, hi);
                const b = randomInt(bLo, a === 0 ? bHi : Math.min(bHi, Math.floor(N / a)));
                return { kind, a, b, answer: a * b };
            };
        }
        case "delen": {
            // The dividend must be a multiple of the divisor, so collect the
            // divisors that leave at least one quotient in range.
            const quotients = (b) => [Math.ceil(aLo / b), Math.min(N, Math.floor(aHi / b))];
            const divisors = [];
            for (let b = bLo; b <= bHi; b++) {
                const [lo, hi] = quotients(b);
                if (lo <= hi) divisors.push(b);
            }
            if (divisors.length === 0) return null;
            return () => {
                const b = pickRandom(divisors);
                const answer = randomInt(...quotients(b));
                return { kind, a: answer * b, b, answer };
            };
        }
    }
    return null;
}

function buildDeck(cfg) {
    const plans = new Map();
    for (const kind of cfg.kinds) {
        const plan = planQuestion(kind, cfg);
        if (plan) plans.set(kind, plan);
    }
    const kinds = [...plans.keys()];
    if (kinds.length === 0) return [];

    return uniqueDeck({
        count: cfg.numExercises,
        plan: weightedPlan(kinds, cfg.kindWeights, cfg.numExercises),
        weights: cfg.kindWeights,
        draw(kind) {
            const q = plans.get(kind)();
            if (kind !== "splitsen") return { question: q, key: `${kind}:${q.a}:${q.b}` };
            // Splitsen also picks which side is hidden. "10 → 9 + ?" and
            // "10 → ? + 9" are the same task for a child: one key.
            q.hide = Math.random() < 0.5 ? "a" : "b";
            return { question: q, key: `${kind}:${q.answer}:${q.hide === "a" ? q.b : q.a}` };
        },
    });
}

function validateTerm(min, max, name) {
    if (min != null && (!Number.isInteger(min) || min < 0 || min > MAX_NUMBER)) {
        return `Kies voor het ${name} getal een ondergrens tussen 0 en ${MAX_NUMBER}, of laat het veld leeg.`;
    }
    if (max != null && (!Number.isInteger(max) || max < 1 || max > MAX_NUMBER)) {
        return `Kies voor het ${name} getal een bovengrens tussen 1 en ${MAX_NUMBER}, of laat het veld leeg.`;
    }
    if (min != null && max != null && min > max) {
        return `Bij het ${name} getal mag "van" niet groter zijn dan "tot".`;
    }
    return null;
}

function validateConfig(cfg) {
    if (cfg.kinds.length === 0) return "Kies minstens één soort oefening.";
    if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
    if (!cfg.countUntil || cfg.countUntil < 3) return "Kies een getal van minstens 3.";
    if (cfg.countUntil > MAX_NUMBER) return `Kies een getal van hoogstens ${MAX_NUMBER}.`;
    const termError =
        validateTerm(cfg.minFirstTerm, cfg.maxFirstTerm, "eerste") ??
        validateTerm(cfg.minSecondTerm, cfg.maxSecondTerm, "tweede");
    if (termError) return termError;
    const impossible = cfg.kinds.find((kind) => !planQuestion(kind, cfg));
    if (impossible) return `Met deze grenzen bestaat er geen oefening voor ${KIND_LABELS[impossible]}.`;
    return null;
}

const SPLIT_LEGS = `<svg class="split-legs" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><line x1="50" y1="2" x2="14" y2="28"/><line x1="50" y1="2" x2="86" y2="28"/></svg>`;

function renderPlay(q) {
    const fb = FEEDBACK[q.kind];
    const input = `<input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required>`;
    switch (q.kind) {
        case "som":
            return { feedback: fb, html: `<p><span>${q.a} + ${q.b} =</span>${input}</p>` };
        case "verschil":
            return { feedback: fb, html: `<p><span>${q.a} − ${q.b} =</span>${input}</p>` };
        case "vermenigvuldigen":
            return { feedback: fb, html: `<p><span>${q.a} × ${q.b} =</span>${input}</p>` };
        case "delen":
            return { feedback: fb, html: `<p><span>${q.a} ÷ ${q.b} =</span>${input}</p>` };
        case "splitsen": {
            const visibleVal = q.hide === "a" ? q.b : q.a;
            const inputCell = `<input inputmode="numeric" pattern="[0-9]+" id="answer" class="split-part" min="0" max="100000" size="3" required>`;
            const visibleCell = `<span class="box split-part">${visibleVal}</span>`;
            const left = q.hide === "a" ? inputCell : visibleCell;
            const right = q.hide === "a" ? visibleCell : inputCell;
            return {
                feedback: fb,
                html: `<div class="split-stack"><div class="split-top"><span class="box split-part">${q.answer}</span></div>${SPLIT_LEGS}<div class="split-bottom">${left}${right}</div></div>`,
            };
        }
    }
}

const FEEDBACK = {
    som: "maak de som ➕",
    verschil: "maak het verschil ➖",
    vermenigvuldigen: "maak de vermenigvuldiging ✖️",
    delen: "maak de deling ➗",
    splitsen: "maak de splitsing 🔼",
};

function renderReview(q) {
    let body;
    switch (q.kind) {
        case "som":
            body = `<p><span>${q.a} + ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "verschil":
            body = `<p><span>${q.a} − ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "vermenigvuldigen":
            body = `<p><span>${q.a} × ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "delen":
            body = `<p><span>${q.a} ÷ ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "splitsen": {
            const a = `<span class="box split-part${q.hide === "a" ? " bad" : ""}">${q.a}</span>`;
            const b = `<span class="box split-part${q.hide === "b" ? " bad" : ""}">${q.b}</span>`;
            body = `
                <div class="split-stack">
                    <div class="split-top"><span class="box split-part">${q.answer}</span></div>
                    <svg class="split-legs" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                        <line x1="50" y1="2" x2="14" y2="28" />
                        <line x1="50" y1="2" x2="86" y2="28" />
                    </svg>
                    <div class="split-bottom">${a}${b}</div>
                </div>
            `;
            break;
        }
    }
    return body;
}

const FIELDS = [
    { field: "count-until", type: "number", key: "countUntil" },
    { field: "min-first-term", type: "optional-number", key: "minFirstTerm" },
    { field: "max-first-term", type: "optional-number", key: "maxFirstTerm" },
    { field: "min-second-term", type: "optional-number", key: "minSecondTerm" },
    { field: "max-second-term", type: "optional-number", key: "maxSecondTerm" },
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "practice", type: "checkboxes", key: "kinds" },
];

runExercise({
    id: "mathbox",
    label: "rekendoos",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig,
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = renderReview(q);
            return;
        }
        const r = renderPlay(q);
        document.getElementById("exercise-feedback").textContent = r.feedback;
        root.innerHTML = r.html;
        const input = root.querySelector("#answer");
        return () => input.value;
    },
    renderPrint(q, root) {
        root.innerHTML = renderPlay(q).html;
    },
    isCorrect(q, given) {
        const expect = q.kind === "splitsen" ? (q.hide === "a" ? q.a : q.b) : q.answer;
        const n = parseStrictInt(given);
        return n !== null && n === expect;
    },
    describe(q) {
        switch (q.kind) {
            case "som":
                return `${q.a} + ${q.b} = ${q.answer}`;
            case "verschil":
                return `${q.a} − ${q.b} = ${q.answer}`;
            case "vermenigvuldigen":
                return `${q.a} × ${q.b} = ${q.answer}`;
            case "delen":
                return `${q.a} ÷ ${q.b} = ${q.answer}`;
            case "splitsen":
                return `${q.answer} = ${q.a} + ${q.b}`;
        }
    },
});
