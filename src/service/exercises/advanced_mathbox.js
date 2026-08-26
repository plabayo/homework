// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, parseStrictInt, pickRandom, readFields, runExercise } from "@homework";

const MAXIMUMS = [10_000, 100_000];

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function formatNatural(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

function questionKey(q) {
    return `${q.kind}:${q.a}:${q.b}:${q.remainder}`;
}

function generateQuestion(kind, cfg) {
    const maximum = cfg.maximum;
    const minimumTerm = Math.max(10, Math.floor(maximum / 100));
    let a;
    let b;
    let answer;
    let remainder = 0;

    switch (kind) {
        case "som":
            a = randomInt(minimumTerm, maximum - minimumTerm);
            b = randomInt(minimumTerm, maximum - a);
            answer = a + b;
            break;
        case "verschil":
            a = randomInt(minimumTerm * 2, maximum);
            b = randomInt(minimumTerm, a - minimumTerm);
            answer = a - b;
            break;
        case "vermenigvuldigen":
            b = randomInt(2, 9);
            a = randomInt(minimumTerm, Math.floor(maximum / b));
            answer = a * b;
            break;
        case "delen": {
            b = randomInt(2, 9);
            const withRemainder = cfg.includeRemainders && Math.random() < 0.5;
            remainder = withRemainder ? randomInt(1, b - 1) : 0;
            const largestQuotient = Math.floor((maximum - remainder) / b);
            answer = randomInt(minimumTerm, largestQuotient);
            a = answer * b + remainder;
            break;
        }
        default:
            return null;
    }

    return { kind, a, b, answer, remainder };
}

function buildDeck(cfg) {
    if (!cfg.kinds || cfg.kinds.length === 0 || !MAXIMUMS.includes(cfg.maximum)) return [];

    const deck = [];
    const seen = new Set();
    let staleTries = 0;
    let totalTries = 0;

    while (deck.length < cfg.numExercises && totalTries < cfg.numExercises * 50) {
        totalTries++;
        if (staleTries > Math.max(20, seen.size)) {
            seen.clear();
            staleTries = 0;
        }

        const question = generateQuestion(pickRandom(cfg.kinds), cfg);
        if (!question) continue;
        const key = questionKey(question);
        if (seen.has(key)) {
            staleTries++;
            continue;
        }

        seen.add(key);
        staleTries = 0;
        deck.push(question);
    }

    return deck;
}

const SYMBOLS = {
    som: "+",
    verschil: "−",
    vermenigvuldigen: "×",
    delen: "÷",
};

const FEEDBACK = {
    som: "maak de som ➕",
    verschil: "maak het verschil ➖",
    vermenigvuldigen: "maak de vermenigvuldiging ✖️",
    delen: "maak de deling ➗",
};

function expression(q) {
    return `${formatNatural(q.a)} ${SYMBOLS[q.kind]} ${formatNatural(q.b)}`;
}

function renderReview(q) {
    if (q.kind === "delen" && q.remainder > 0) {
        return `
            <p class="advanced-expression">
                <span>${expression(q)} =</span>
                <span class="box bad">${formatNatural(q.answer)}</span>
                <span class="remainder-review">rest <span class="box bad">${q.remainder}</span></span>
            </p>
        `;
    }
    return `
        <p class="advanced-expression">
            <span>${expression(q)} =</span>
            <span class="box bad">${formatNatural(q.answer)}</span>
        </p>
    `;
}

function renderPlay(q) {
    const prompt = `<p class="advanced-expression"><span>${expression(q)} =</span></p>`;
    if (q.kind === "delen" && q.remainder > 0) {
        return `${prompt}
            <div class="remainder-answer">
                <label class="remainder-field" for="answer">quotiënt
                    <input inputmode="numeric" pattern="[0-9]+" id="answer" aria-label="quotiënt" min="0" max="100000" required>
                </label>
                <label class="remainder-field" for="answer-remainder">rest
                    <input inputmode="numeric" pattern="[0-9]+" id="answer-remainder" aria-label="rest" min="0" max="8" required>
                </label>
            </div>`;
    }
    return `${prompt.slice(0, -4)}
        <input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required>
    </p>`;
}

const FIELDS = [
    { field: "maximum", type: "radio", key: "maximum" },
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "practice", type: "checkboxes", key: "kinds" },
    { field: "include-remainders", type: "checkbox", key: "includeRemainders" },
];

const form = document.getElementById("form-setup");
const divisionOptions = document.getElementById("division-options");

function syncDivisionOptions() {
    if (!form || !divisionOptions) return;
    const division = form.querySelector("input[name='practice'][value='delen']");
    divisionOptions.hidden = !division?.checked;
}

form?.addEventListener("change", (event) => {
    if (event.target.matches("input[name='practice'][value='delen']")) syncDivisionOptions();
});

runExercise({
    id: "advanced-mathbox",
    label: "grote rekendoos",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        syncDivisionOptions();
    },
    readConfig(form) {
        const cfg = readFields(form, FIELDS);
        return { ...cfg, maximum: Number(cfg.maximum) };
    },
    validateConfig(cfg) {
        if (!MAXIMUMS.includes(cfg.maximum)) return "Kies een geldig grootste getal.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (cfg.kinds.length === 0) return "Kies minstens één soort oefening.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = renderReview(q);
            return;
        }

        document.getElementById("exercise-feedback").textContent = FEEDBACK[q.kind];
        root.innerHTML = renderPlay(q);
        const answer = root.querySelector("#answer");
        const remainder = root.querySelector("#answer-remainder");
        if (remainder) return () => ({ quotient: answer.value, remainder: remainder.value });
        return () => answer.value;
    },
    isCorrect(q, given) {
        if (q.kind === "delen" && q.remainder > 0) {
            const quotient = parseStrictInt(given?.quotient);
            const remainder = parseStrictInt(given?.remainder);
            return quotient === q.answer && remainder === q.remainder;
        }
        return parseStrictInt(given) === q.answer;
    },
    describe(q) {
        const rest = q.remainder > 0 ? ` rest ${q.remainder}` : "";
        return `${expression(q)} = ${formatNatural(q.answer)}${rest}`;
    },
});
