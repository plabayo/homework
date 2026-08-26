// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { loadFields, parseStrictInt, pickRandom, readFields, runExercise } from "@homework";

const MAXIMUMS = [1_000, 10_000, 100_000];
const DIFFICULTIES = ["mixed", "without-transfer", "with-transfer"];
const DECIMAL_PLACES = [1, 2, 3];
const QUESTION_PROGRESS = new WeakMap();
const INTEGER_PLACE_NAMES = [
    ["E", "eenheden"],
    ["T", "tientallen"],
    ["H", "honderdtallen"],
    ["D", "duizendtallen"],
    ["TD", "tienduizendtallen"],
    ["HD", "honderdduizendtallen"],
];
const FRACTIONAL_PLACE_NAMES = [null, ["t", "tienden"], ["h", "honderdsten"], ["d", "duizendsten"]];

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function digitAt(value, placeIndex) {
    return Math.floor(value / 10 ** placeIndex) % 10;
}

function formatNumber(units, decimalPlaces = 0) {
    const digits = String(units).padStart(decimalPlaces + 1, "0");
    const split = digits.length - decimalPlaces;
    const whole = digits.slice(0, split).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
    return decimalPlaces > 0 ? `${whole},${digits.slice(split)}` : whole;
}

function buildSteps(kind, a, b, decimalPlaces = 0) {
    const steps = [];
    const operandWidth = Math.max(String(a).length, String(b).length, decimalPlaces + 1);
    let transfer = 0;

    for (let placeIndex = 0; placeIndex < operandWidth || transfer > 0; placeIndex++) {
        const aDigit = digitAt(a, placeIndex);
        const bDigit = digitAt(b, placeIndex);
        const incoming = transfer;

        if (kind === "som") {
            const total = aDigit + bDigit + incoming;
            transfer = Math.floor(total / 10);
            steps.push({ placeIndex, aDigit, bDigit, incoming, result: total % 10, transfer });
            continue;
        }

        const reducedTop = aDigit - incoming;
        transfer = reducedTop < bDigit ? 1 : 0;
        const result = reducedTop + transfer * 10 - bDigit;
        steps.push({ placeIndex, aDigit, bDigit, incoming, result, transfer });
    }

    return steps;
}

function hasTransfer(question) {
    return question.steps.some((step) => step.transfer === 1);
}

function matchesDifficulty(question, difficulty) {
    if (difficulty === "without-transfer") return !hasTransfer(question);
    if (difficulty === "with-transfer") return hasTransfer(question);
    return true;
}

function makeQuestion(kind, a, b, decimalPlaces = 0) {
    return {
        kind,
        a,
        b,
        decimalPlaces,
        answer: kind === "som" ? a + b : a - b,
        steps: buildSteps(kind, a, b, decimalPlaces),
    };
}

function fallbackQuestion(kind, maximum, difficulty, decimalPlaces) {
    const digits = String(maximum - 1).length;
    const place = 10 ** (digits - 1);

    if (difficulty === "without-transfer") {
        const repeated = (digit) => Number(String(digit).repeat(digits));
        return kind === "som"
            ? makeQuestion(kind, Number("12345".slice(0, digits)), Number("23454".slice(0, digits)), decimalPlaces)
            : makeQuestion(kind, repeated(8), repeated(3), decimalPlaces);
    }

    if (kind === "som") return makeQuestion(kind, 5 * place - 5, place + 15, decimalPlaces);
    if (maximum === 1_000) return makeQuestion(kind, 632, 185, decimalPlaces);
    return makeQuestion(kind, 6 * place + 432, Math.floor(place / 5) + 185, decimalPlaces);
}

function generateQuestion(kind, cfg, decimalPlaces) {
    const scale = 10 ** decimalPlaces;
    const maximum = cfg.maximum * scale;
    const minimumAnswer = maximum / 10;
    const minimumTerm = maximum / 100;

    for (let tries = 0; tries < 400; tries++) {
        let a;
        let b;
        if (kind === "som") {
            a = randomInt(minimumTerm, maximum - minimumTerm);
            b = randomInt(minimumTerm, maximum - a);
        } else {
            a = randomInt(minimumAnswer + minimumTerm, maximum - 1);
            b = randomInt(minimumTerm, a - minimumAnswer);
        }

        if (decimalPlaces > 0 && a % scale === 0 && b % scale === 0) continue;
        const question = makeQuestion(kind, a, b, decimalPlaces);
        if (matchesDifficulty(question, cfg.difficulty)) return question;
    }

    return fallbackQuestion(kind, maximum, cfg.difficulty, decimalPlaces);
}

function questionKey(question) {
    return `${question.kind}:${question.decimalPlaces}:${question.a}:${question.b}`;
}

function buildDeck(cfg) {
    if (
        !cfg.kinds ||
        cfg.kinds.length === 0 ||
        !MAXIMUMS.includes(cfg.maximum) ||
        !DIFFICULTIES.includes(cfg.difficulty) ||
        (cfg.includeDecimals && !DECIMAL_PLACES.includes(cfg.decimalPlaces))
    ) {
        return [];
    }

    const deck = [];
    const seen = new Set();
    let staleTries = 0;

    while (deck.length < cfg.numExercises) {
        if (staleTries > Math.max(20, seen.size)) {
            seen.clear();
            staleTries = 0;
        }

        const decimalPlaces = cfg.includeDecimals ? randomInt(1, cfg.decimalPlaces) : 0;
        const question = generateQuestion(pickRandom(cfg.kinds), cfg, decimalPlaces);
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

function placeName(question, placeIndex) {
    const exponent = placeIndex - question.decimalPlaces;
    if (exponent >= 0) {
        return INTEGER_PLACE_NAMES[exponent] ?? [`10^${exponent}`, `positie ${exponent + 1}`];
    }
    return FRACTIONAL_PLACE_NAMES[-exponent] ?? [`10^${exponent}`, `decimale positie ${-exponent}`];
}

function operandDigit(question, value, placeIndex) {
    if (placeIndex < String(value).length) return String(digitAt(value, placeIndex));
    return placeIndex <= question.decimalPlaces ? "0" : "";
}

function cellClass(base, placeIndex, currentStep) {
    return `${base}${placeIndex === currentStep ? " is-current" : ""}`;
}

function questionProgress(question) {
    return QUESTION_PROGRESS.get(question) ?? 0;
}

function transferCell(question, placeIndex, mode) {
    const step = question.steps[placeIndex];
    const visible = mode.kind === "review" || placeIndex <= questionProgress(question);
    if (!step || !visible || step.incoming === 0) return "";
    return question.kind === "som" ? "1" : "−1";
}

function resultCell(question, placeIndex, mode) {
    const step = question.steps[placeIndex];
    const progress = questionProgress(question);
    if (!step) return "";
    if (mode.kind === "review" || placeIndex < progress) return String(step.result);
    if (placeIndex !== progress) return "";

    const [, fullPlaceName] = placeName(question, placeIndex);
    return `<input class="written-digit" inputmode="numeric" pattern="[0-9]" maxlength="1"
        id="answer-digit" aria-label="cijfer bij de ${fullPlaceName}" min="0" max="9" required>`;
}

function calculationColumns(question) {
    const columns = [];
    for (let placeIndex = question.steps.length - 1; placeIndex >= 0; placeIndex--) {
        columns.push(placeIndex);
        if (question.decimalPlaces > 0 && placeIndex === question.decimalPlaces) columns.push("comma");
    }
    return columns;
}

function rowCells(columns, renderPlace, showComma) {
    return columns
        .map((column) => {
            if (column === "comma") {
                return `<td class="written-decimal-separator" aria-hidden="true">${showComma ? "," : ""}</td>`;
            }
            return renderPlace(column);
        })
        .join("");
}

function calculationHtml(question, mode) {
    const currentStep = mode.kind === "play" ? questionProgress(question) : -1;
    const columns = calculationColumns(question);
    const header = columns
        .map((column) => {
            if (column === "comma") {
                return `<th scope="col" class="written-decimal-separator">
                    <span aria-hidden="true">,</span><span class="written-sr-only">komma</span>
                </th>`;
            }
            const [short, full] = placeName(question, column);
            return `<th scope="col" class="${cellClass("written-place", column, currentStep)}">
                <span aria-hidden="true">${short}</span><span class="written-sr-only">${full}</span>
            </th>`;
        })
        .join("");
    const transfer = rowCells(
        columns,
        (placeIndex) =>
            `<td class="${cellClass("written-transfer", placeIndex, currentStep)}">${transferCell(question, placeIndex, mode)}</td>`,
        false,
    );
    const first = rowCells(
        columns,
        (placeIndex) =>
            `<td class="${cellClass("written-number", placeIndex, currentStep)}">${operandDigit(question, question.a, placeIndex)}</td>`,
        true,
    );
    const second = rowCells(
        columns,
        (placeIndex) =>
            `<td class="${cellClass("written-number", placeIndex, currentStep)}">${operandDigit(question, question.b, placeIndex)}</td>`,
        true,
    );
    const result = rowCells(
        columns,
        (placeIndex) =>
            `<td class="${cellClass("written-result", placeIndex, currentStep)}">${resultCell(question, placeIndex, mode)}</td>`,
        true,
    );
    const symbol = question.kind === "som" ? "+" : "−";

    return `<div class="written-table-wrap">
        <table class="written-calculation">
            <caption class="written-sr-only">${formatNumber(question.a, question.decimalPlaces)} ${symbol} ${formatNumber(question.b, question.decimalPlaces)}</caption>
            <thead><tr><th scope="col"><span class="written-sr-only">bewerking</span></th>${header}</tr></thead>
            <tbody>
                <tr class="written-transfer-row"><th scope="row">${question.kind === "som" ? "onthoud" : "geleend"}</th>${transfer}</tr>
                <tr class="written-operand-a"><th scope="row"><span class="written-sr-only">eerste getal</span></th>${first}</tr>
                <tr class="written-operand-b"><th scope="row" aria-label="${question.kind === "som" ? "plus" : "min"}">${symbol}</th>${second}</tr>
                <tr class="written-result-row"><th scope="row" aria-label="is gelijk aan">=</th>${result}</tr>
            </tbody>
        </table>
    </div>`;
}

function promptForStep(question) {
    const step = question.steps[questionProgress(question)];
    const [, fullPlaceName] = placeName(question, step.placeIndex);
    if (question.kind === "som") {
        const incoming = step.incoming ? ` + ${step.incoming} onthouden` : "";
        return `reken de ${fullPlaceName} uit: ${step.aDigit} + ${step.bDigit}${incoming}`;
    }
    const incoming = step.incoming ? " − 1 geleend" : "";
    return `reken de ${fullPlaceName} uit: ${step.aDigit}${incoming} − ${step.bDigit}`;
}

function transferChoiceHtml(kind) {
    const action = kind === "som" ? "onthouden" : "lenen";
    const noLabel = kind === "som" ? "nee, niets onthouden" : "nee, niet lenen";
    const yesLabel = kind === "som" ? "ja, 1 onthouden" : "ja, 1 lenen";
    return `<fieldset class="written-transfer-choice">
        <legend>Moet je 1 ${action}?</legend>
        <label><input type="radio" name="step-transfer" value="0" aria-label="${noLabel}" required> nee</label>
        <label><input type="radio" name="step-transfer" value="1" aria-label="${yesLabel}" required> ja</label>
    </fieldset>`;
}

function renderPlay(question) {
    return `${calculationHtml(question, { kind: "play" })}${transferChoiceHtml(question.kind)}`;
}

function renderReview(question) {
    return `${calculationHtml(question, { kind: "review" })}
        <p class="written-solution">${formatNumber(question.a, question.decimalPlaces)} ${question.kind === "som" ? "+" : "−"}
            ${formatNumber(question.b, question.decimalPlaces)} = ${formatNumber(question.answer, question.decimalPlaces)}</p>`;
}

function stepIsCorrect(question, given) {
    const step = question.steps[questionProgress(question)];
    const digit = parseStrictInt(given?.digit);
    const transfer = parseStrictInt(given?.transfer);
    return digit === step.result && transfer === step.transfer;
}

const FIELDS = [
    { field: "maximum", type: "radio", key: "maximum" },
    { field: "practice", type: "checkboxes", key: "kinds" },
    { field: "difficulty", type: "radio", key: "difficulty" },
    { field: "include-decimals", type: "checkbox", key: "includeDecimals" },
    { field: "decimal-places", type: "radio", key: "decimalPlaces" },
    { field: "num-exercises", type: "number", key: "numExercises" },
];

const form = document.getElementById("form-setup");
const decimalOptions = document.getElementById("decimal-options");

function syncDecimalOptions() {
    if (!form || !decimalOptions) return;
    decimalOptions.hidden = !form.elements["include-decimals"]?.checked;
}

form?.elements["include-decimals"]?.addEventListener("change", syncDecimalOptions);

runExercise({
    id: "written-arithmetic",
    label: "cijfertrainer",
    maxAttempts: 0,
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        syncDecimalOptions();
    },
    readConfig(form) {
        const cfg = readFields(form, FIELDS);
        return {
            ...cfg,
            maximum: Number(cfg.maximum),
            decimalPlaces: Number(cfg.decimalPlaces),
        };
    },
    validateConfig(cfg) {
        if (!MAXIMUMS.includes(cfg.maximum)) return "Kies een geldig grootste getal.";
        if (!DIFFICULTIES.includes(cfg.difficulty)) return "Kies een geldige moeilijkheid.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (cfg.kinds.length === 0) return "Kies minstens één soort oefening.";
        if (cfg.includeDecimals && !DECIMAL_PLACES.includes(cfg.decimalPlaces)) {
            return "Kies een geldig aantal cijfers na de komma.";
        }
        return null;
    },
    buildDeck,
    prepareQuestion(question) {
        QUESTION_PROGRESS.set(question, 0);
    },
    renderQuestion(question, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = renderReview(question);
            return;
        }

        document.getElementById("exercise-feedback").textContent = promptForStep(question);
        root.innerHTML = renderPlay(question);
        const digit = root.querySelector("#answer-digit");
        return () => {
            const transfer = root.querySelector("input[name='step-transfer']:checked");
            if (!digit.value || !transfer) return null;
            return { digit: digit.value, transfer: transfer.value };
        };
    },
    evaluateAnswer(question, given) {
        if (!stepIsCorrect(question, given)) return { correct: false };
        const nextStep = questionProgress(question) + 1;
        QUESTION_PROGRESS.set(question, nextStep);
        if (nextStep < question.steps.length) return { partialCorrect: true };
        return { correct: true };
    },
    isCorrect: stepIsCorrect,
    describe(question) {
        const symbol = question.kind === "som" ? "+" : "−";
        return `${formatNumber(question.a, question.decimalPlaces)} ${symbol} ${formatNumber(question.b, question.decimalPlaces)} = ${formatNumber(question.answer, question.decimalPlaces)}`;
    },
});
