// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, parseStrictInt, pickRandom, readFields, runExercise } from "@homework";

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) {
        [x, y] = [y, x % y];
    }
    return x || 1;
}

function simplify(num, den) {
    if (num === 0) return { num: 0, den: 1 };
    const g = gcd(Math.abs(num), Math.abs(den));
    return { num: num / g, den: den / g };
}

function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

function frac(num, den) {
    return `<span class="fraction"><span class="frac-num">${num}</span><span class="frac-bar"></span><span class="frac-den">${den}</span></span>`;
}

const FRAC_INPUT = `<span class="fraction-input"><input inputmode="numeric" pattern="[0-9]+" id="answer-num" min="0" max="10000" required><span class="frac-bar"></span><input inputmode="numeric" pattern="[0-9]+" id="answer-den" min="1" max="10000" required></span>`;

const INT_INPUT = `<input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required>`;

function genBreukVanGetal(dens) {
    const den = pickRandom(dens);
    const num = 1 + Math.floor(Math.random() * (den - 1));
    const maxK = Math.max(2, Math.floor(20 / den));
    const k = 1 + Math.floor(Math.random() * maxK);
    return {
        q: { kind: "breuk-van-getal", num, den, n: den * k, answer: num * k },
        key: `bvg:${num}/${den}:${den * k}`,
    };
}

function genOptellenAftrekken(kind, dens, mixedPairs, cfg) {
    let aDen, bDen;
    if (cfg.mixedDenominators && mixedPairs.length > 0) {
        const [small, big] = pickRandom(mixedPairs);
        [aDen, bDen] = Math.random() < 0.5 ? [small, big] : [big, small];
    } else {
        aDen = pickRandom(dens);
        bDen = aDen;
    }
    const aNum = 1 + Math.floor(Math.random() * (aDen - 1));
    const bNum = 1 + Math.floor(Math.random() * (bDen - 1));
    const commonDen = lcm(aDen, bDen);
    const extA = aNum * (commonDen / aDen);
    const extB = bNum * (commonDen / bDen);
    let resNum;
    if (kind === "optellen") {
        resNum = extA + extB;
    } else {
        if (extA <= extB) return null;
        resNum = extA - extB;
    }
    return {
        q: { kind, aNum, aDen, bNum, bDen, answer: simplify(resNum, commonDen) },
        key: `${kind}:${aNum}/${aDen}:${bNum}/${bDen}`,
    };
}

function genVermenigvuldigen(dens) {
    const aDen = pickRandom(dens);
    const bDen = pickRandom(dens);
    const aNum = 1 + Math.floor(Math.random() * (aDen - 1));
    const bNum = 1 + Math.floor(Math.random() * (bDen - 1));
    return {
        q: { kind: "vermenigvuldigen", aNum, aDen, bNum, bDen, answer: simplify(aNum * bNum, aDen * bDen) },
        key: `vm:${aNum}/${aDen}:${bNum}/${bDen}`,
    };
}

function genDelen(dens) {
    const den = pickRandom(dens);
    const num = 1 + Math.floor(Math.random() * (den - 1));
    const divisor = 2 + Math.floor(Math.random() * 2);
    return {
        q: { kind: "delen", num, den, divisor, answer: simplify(num, den * divisor) },
        key: `del:${num}/${den}:${divisor}`,
    };
}

function pickQuestion(kind, dens, mixedPairs, cfg) {
    if (kind === "breuk-van-getal") return genBreukVanGetal(dens);
    if (kind === "optellen" || kind === "aftrekken") return genOptellenAftrekken(kind, dens, mixedPairs, cfg);
    if (kind === "vermenigvuldigen") return genVermenigvuldigen(dens);
    if (kind === "delen") return genDelen(dens);
    return null;
}

function buildDeck(cfg) {
    const deck = [];
    const N = cfg.numExercises;
    const dens = (cfg.denominators || []).map(Number).filter((n) => n >= 2);
    if (dens.length === 0) return deck;

    // Pairs [small, big] where big is a strict multiple of small — used for mixed denominators.
    const mixedPairs = [];
    for (const a of dens) {
        for (const b of dens) {
            if (b > a && b % a === 0) mixedPairs.push([a, b]);
        }
    }

    // Track used question keys to avoid repeating the same assignment.
    // When we fail to find an unseen question too many times in a row (signal
    // of exhaustion), reset so repeats become allowed again.
    const seen = new Set();
    let staleTries = 0;
    let totalTries = 0;

    while (deck.length < N && totalTries < N * 50) {
        totalTries++;

        if (staleTries > Math.max(20, seen.size)) {
            seen.clear();
            staleTries = 0;
        }

        const kind = pickRandom(cfg.kinds);
        const result = pickQuestion(kind, dens, mixedPairs, cfg);

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

const FEEDBACK = {
    "breuk-van-getal": "breuk van een getal ½",
    optellen: "maak de som ➕",
    aftrekken: "maak het verschil ➖",
    vermenigvuldigen: "maak de vermenigvuldiging ✖️",
    delen: "maak de deling ➗",
};

function renderPlay(q) {
    const fb = FEEDBACK[q.kind];
    let html;
    switch (q.kind) {
        case "breuk-van-getal":
            html = `<p class="fraction-expr">${frac(q.num, q.den)} van ${q.n} = ${INT_INPUT}</p>`;
            break;
        case "optellen":
            html = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} + ${frac(q.bNum, q.bDen)} = ${FRAC_INPUT}</p>`;
            break;
        case "aftrekken":
            html = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} − ${frac(q.bNum, q.bDen)} = ${FRAC_INPUT}</p>`;
            break;
        case "vermenigvuldigen":
            html = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} × ${frac(q.bNum, q.bDen)} = ${FRAC_INPUT}</p>`;
            break;
        case "delen":
            html = `<p class="fraction-expr">${frac(q.num, q.den)} ÷ ${q.divisor} = ${FRAC_INPUT}</p>`;
            break;
    }
    return { feedback: fb, html };
}

// On the review screen we render the intermediate (unsimplified) step so the
// child can see *why* the answer is what it is — the common-denominator form
// for sum/diff, the raw num*num / den*den for multiply, the implicit ÷
// denominator multiplication for divide. Each stage fades in with a small
// delay (driven by CSS using `--step` as a custom property) so the eye reads
// left-to-right. The `→` arrow is wrapped in `.frac-step` so the same CSS
// rule reaches the intermediate and the simplified box.
function renderReview(q) {
    let body;
    const stepArrow = `<span class="frac-step-arrow" aria-hidden="true">→</span>`;
    switch (q.kind) {
        case "breuk-van-getal":
            body = `<p class="fraction-expr">${frac(q.num, q.den)} van ${q.n} = <span class="box bad">${q.answer}</span></p>`;
            break;
        case "optellen":
        case "aftrekken": {
            const op = q.kind === "optellen" ? "+" : "−";
            const commonDen = lcm(q.aDen, q.bDen);
            const extA = q.aNum * (commonDen / q.aDen);
            const extB = q.bNum * (commonDen / q.bDen);
            const resNum = q.kind === "optellen" ? extA + extB : extA - extB;
            // Skip the intermediate when both sides already share a
            // denominator — it would just repeat the same expression.
            const sameDen = q.aDen === q.bDen;
            const intermediateStep = sameDen
                ? ""
                : `${stepArrow}<span class="frac-step">${frac(extA, commonDen)} ${op} ${frac(extB, commonDen)}</span>`;
            const sumStep = `${stepArrow}<span class="frac-step">${frac(resNum, commonDen)}</span>`;
            // The combined raw sum (resNum/commonDen) reduces to the
            // canonical answer; only show the reduction step when it
            // actually does something.
            const reduced = resNum === q.answer.num && commonDen === q.answer.den ? "" : sumStep;
            body = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} ${op} ${frac(q.bNum, q.bDen)}${intermediateStep}${reduced} = <span class="box bad frac-step">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        }
        case "vermenigvuldigen": {
            const rawNum = q.aNum * q.bNum;
            const rawDen = q.aDen * q.bDen;
            const reduced =
                rawNum === q.answer.num && rawDen === q.answer.den
                    ? ""
                    : `${stepArrow}<span class="frac-step">${frac(rawNum, rawDen)}</span>`;
            body = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} × ${frac(q.bNum, q.bDen)}${reduced} = <span class="box bad frac-step">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        }
        case "delen": {
            const rawNum = q.num;
            const rawDen = q.den * q.divisor;
            const reduced =
                rawNum === q.answer.num && rawDen === q.answer.den
                    ? ""
                    : `${stepArrow}<span class="frac-step">${frac(rawNum, rawDen)}</span>`;
            body = `<p class="fraction-expr">${frac(q.num, q.den)} ÷ ${q.divisor}${reduced} = <span class="box bad frac-step">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        }
    }
    return body;
}

const FIELDS = [
    { field: "denominators", type: "checkboxes", key: "denominators" },
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "practice", type: "checkboxes", key: "kinds" },
    { field: "mixed-denominators", type: "checkbox", key: "mixedDenominators" },
];

// Show/hide the "extra opties" fieldset based on whether optellen or aftrekken is selected.
function setupMixedDenominatorsVisibility(form) {
    const extraOpties = form.querySelector("#extra-opties");
    if (!extraOpties) return;
    const optellenCb = form.querySelector('input[value="optellen"]');
    const aftrekkenCb = form.querySelector('input[value="aftrekken"]');

    function update() {
        extraOpties.hidden = !(optellenCb?.checked || aftrekkenCb?.checked);
    }

    optellenCb?.addEventListener("change", update);
    aftrekkenCb?.addEventListener("change", update);
    update();
}

runExercise({
    id: "fractions",
    label: "breukendoos",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        setupMixedDenominatorsVisibility(form);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!cfg.denominators || cfg.denominators.length === 0) return "Gelieve minstens één noemer te selecteren.";
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
        if (q.kind === "breuk-van-getal") {
            const input = root.querySelector("#answer");
            return () => input.value;
        }
        const numInput = root.querySelector("#answer-num");
        const denInput = root.querySelector("#answer-den");
        return () => ({ num: numInput.value, den: denInput.value });
    },
    isCorrect(q, given) {
        if (q.kind === "breuk-van-getal") {
            const n = parseStrictInt(given);
            return n !== null && n === q.answer;
        }
        const gNum = parseStrictInt(given?.num);
        const gDen = parseStrictInt(given?.den);
        if (gNum === null || gDen === null || gDen <= 0) return false;
        // Accept any equivalent fraction via cross-multiplication.
        return gNum * q.answer.den === q.answer.num * gDen;
    },
    describe(q) {
        switch (q.kind) {
            case "breuk-van-getal":
                return `${q.num}/${q.den} van ${q.n} = ${q.answer}`;
            case "optellen":
                return `${q.aNum}/${q.aDen} + ${q.bNum}/${q.bDen} = ${q.answer.num}/${q.answer.den}`;
            case "aftrekken":
                return `${q.aNum}/${q.aDen} - ${q.bNum}/${q.bDen} = ${q.answer.num}/${q.answer.den}`;
            case "vermenigvuldigen":
                return `${q.aNum}/${q.aDen} × ${q.bNum}/${q.bDen} = ${q.answer.num}/${q.answer.den}`;
            case "delen":
                return `${q.num}/${q.den} ÷ ${q.divisor} = ${q.answer.num}/${q.answer.den}`;
        }
    },
});
