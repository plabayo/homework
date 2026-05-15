// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, pickRandom, readFields, runExercise } from "@homework";

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

function renderReview(q) {
    const fb = FEEDBACK[q.kind];
    let body;
    switch (q.kind) {
        case "breuk-van-getal":
            body = `<p class="fraction-expr">${frac(q.num, q.den)} van ${q.n} = <span class="box bad">${q.answer}</span></p>`;
            break;
        case "optellen":
            body = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} + ${frac(q.bNum, q.bDen)} = <span class="box bad">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        case "aftrekken":
            body = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} − ${frac(q.bNum, q.bDen)} = <span class="box bad">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        case "vermenigvuldigen":
            body = `<p class="fraction-expr">${frac(q.aNum, q.aDen)} × ${frac(q.bNum, q.bDen)} = <span class="box bad">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
        case "delen":
            body = `<p class="fraction-expr">${frac(q.num, q.den)} ÷ ${q.divisor} = <span class="box bad">${frac(q.answer.num, q.answer.den)}</span></p>`;
            break;
    }
    return `<h3>${fb}</h3>${body}`;
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
        return () => ({ num: Number(numInput.value), den: Number(denInput.value) });
    },
    isCorrect(q, given) {
        if (q.kind === "breuk-van-getal") {
            return Number(given) === q.answer;
        }
        const { num: gNum, den: gDen } = given;
        if (!gDen || gDen <= 0) return false;
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
