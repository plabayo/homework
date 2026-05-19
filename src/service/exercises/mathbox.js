// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, parseStrictInt, pickRandom, readFields, runExercise } from "@homework";

function buildDeck(cfg) {
    const deck = [];
    const N = cfg.numExercises;
    while (deck.length < N) {
        const kind = pickRandom(cfg.kinds);
        let a, b, answer;
        switch (kind) {
            case "som":
            case "splitsen":
                a = Math.floor(Math.random() * (cfg.countUntil + 1));
                b = Math.floor(Math.random() * (cfg.countUntil - a + 1));
                answer = a + b;
                break;
            case "verschil":
                a = Math.floor(Math.random() * (cfg.countUntil + 1));
                b = Math.floor(Math.random() * (a + 1));
                answer = a - b;
                break;
            case "vermenigvuldigen":
            case "delen": {
                let tries = 0;
                do {
                    a = Math.floor(Math.random() * Math.max(1, Math.floor(cfg.countUntil / 2) + 1));
                    b = 1 + Math.floor(Math.random() * Math.max(1, Math.floor(cfg.countUntil / 2)));
                    answer = a * b;
                    tries++;
                } while (answer > cfg.countUntil && tries < 50);
                if (kind === "delen") {
                    const product = answer;
                    answer = a;
                    a = product;
                }
                break;
            }
        }
        const q = { kind, a, b, answer };
        // Splitsen also picks which side is hidden
        if (kind === "splitsen") q.hide = Math.random() < 0.5 ? "a" : "b";
        deck.push(q);
    }
    return deck;
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
    validateConfig(cfg) {
        if (cfg.kinds.length === 0) return "Gelieve minstens één soort oefening te selecteren.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Gelieve een geldig aantal oefeningen op te geven.";
        if (!cfg.countUntil || cfg.countUntil < 3) return "Tot hoeveel kan het kind tellen? Minimum 3.";
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
        const input = root.querySelector("#answer");
        return () => input.value;
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
