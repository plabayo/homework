// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    buildReviewOptionList,
    loadFields,
    optionListHtml,
    readFields,
    runExercise,
    shuffle,
    wireOptions,
} from "@homework";

const MAX_PRECISIONS = [1, 2, 3];
const QUESTION_KINDS = ["place-value", "compare", "order", "number-line", "round"];
const FRACTIONAL_PLACES = ["", "tienden", "honderdsten", "duizendsten"];

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function scaleFor(precision) {
    return 10 ** precision;
}

function digitAt(units, placeIndex) {
    return Math.floor(units / 10 ** placeIndex) % 10;
}

function formatDecimal(value) {
    const precision = value.precision;
    const negative = value.units < 0;
    const digits = String(Math.abs(value.units)).padStart(precision + 1, "0");
    const split = digits.length - precision;
    const whole = digits.slice(0, split).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
    const fraction = precision > 0 ? `,${digits.slice(split)}` : "";
    return `${negative ? "−" : ""}${whole}${fraction}`;
}

function parseDecimal(raw) {
    const text = String(raw ?? "");
    if (!/^\d+(?:[,.]\d{1,3})?$/.test(text)) return null;
    const [whole, fraction = ""] = text.replace(".", ",").split(",");
    return {
        units: Number(whole) * scaleFor(fraction.length) + Number(fraction || 0),
        precision: fraction.length,
    };
}

function scaledUnits(value, precision) {
    return value.units * scaleFor(precision - value.precision);
}

function compareDecimals(a, b) {
    const precision = Math.max(a.precision, b.precision);
    return Math.sign(scaledUnits(a, precision) - scaledUnits(b, precision));
}

function decimalKey(value) {
    let units = value.units;
    let precision = value.precision;
    while (precision > 0 && units % 10 === 0) {
        units /= 10;
        precision--;
    }
    return `${units}:${precision}`;
}

function randomDecimal(maxPrecision, maxWhole = 99) {
    const precision = randomInt(1, maxPrecision);
    const scale = scaleFor(precision);
    return {
        units: randomInt(0, (maxWhole + 1) * scale - 1),
        precision,
    };
}

function option(label, value) {
    return { label, value };
}

function placeValueQuestion(maxPrecision) {
    const precision = randomInt(1, maxPrecision);
    const fractionalPlace = randomInt(1, precision);
    const rawPlaceIndex = precision - fractionalPlace;
    const scale = scaleFor(precision);
    let units = randomInt(scale, 999 * scale + scale - 1);
    const targetDigit = randomInt(1, 9);
    units += (targetDigit - digitAt(units, rawPlaceIndex)) * 10 ** rawPlaceIndex;
    const answer = decimalKey({ units: targetDigit, precision: fractionalPlace });
    const options = shuffle(
        [0, 1, 2, 3].map((answerPrecision) => {
            const value = { units: targetDigit, precision: answerPrecision };
            return option(formatDecimal(value), decimalKey(value));
        }),
    );
    return {
        kind: "place-value",
        value: { units, precision },
        targetDigit,
        fractionalPlace,
        options,
        answer,
    };
}

function equalPair(maxPrecision) {
    if (maxPrecision === 1) {
        const value = randomDecimal(1);
        return [value, { ...value }];
    }
    const smallPrecision = randomInt(1, maxPrecision - 1);
    const largePrecision = randomInt(smallPrecision + 1, maxPrecision);
    const small = randomDecimal(smallPrecision);
    small.precision = smallPrecision;
    small.units %= 100 * scaleFor(smallPrecision);
    return [
        small,
        {
            units: small.units * scaleFor(largePrecision - smallPrecision),
            precision: largePrecision,
        },
    ];
}

function compareQuestion(maxPrecision) {
    let left;
    let right;
    if (Math.random() < 0.25) {
        [left, right] = equalPair(maxPrecision);
    } else {
        do {
            left = randomDecimal(maxPrecision);
            right = randomDecimal(maxPrecision);
        } while (compareDecimals(left, right) === 0);
    }
    return {
        kind: "compare",
        left,
        right,
        options: [option("<", "-1"), option("=", "0"), option(">", "1")],
        answer: String(compareDecimals(left, right)),
    };
}

function displayRepresentation(units, precision) {
    let displayUnits = units;
    let displayPrecision = precision;
    while (displayPrecision > 1 && displayUnits % 10 === 0 && Math.random() < 0.6) {
        displayUnits /= 10;
        displayPrecision--;
    }
    return { units: displayUnits, precision: displayPrecision };
}

function swap(values, a, b) {
    const copy = [...values];
    [copy[a], copy[b]] = [copy[b], copy[a]];
    return copy;
}

function orderQuestion(maxPrecision) {
    const precision = randomInt(1, maxPrecision);
    const scale = scaleFor(precision);
    const canonical = new Set();
    while (canonical.size < 4) canonical.add(randomInt(0, 100 * scale - 1));
    const sourceUnits = shuffle([...canonical]);
    const values = sourceUnits.map((units) => ({
        canonicalUnits: units,
        display: displayRepresentation(units, precision),
    }));
    const byUnits = new Map(values.map((value) => [value.canonicalUnits, value.display]));
    const correct = [...canonical].sort((a, b) => a - b);
    const sequences = [correct, [...correct].reverse(), swap(correct, 0, 1), swap(correct, 2, 3)];
    const options = shuffle(
        sequences.map((sequence) =>
            option(sequence.map((units) => formatDecimal(byUnits.get(units))).join(" < "), sequence.join(":")),
        ),
    );
    return {
        kind: "order",
        values,
        options,
        answer: correct.join(":"),
    };
}

function numberLineQuestion(maxPrecision) {
    const precision = randomInt(1, maxPrecision);
    const start = randomInt(0, 100 * scaleFor(precision - 1)) * 10;
    const markIndex = randomInt(1, 9);
    return {
        kind: "number-line",
        precision,
        start,
        end: start + 10,
        markIndex,
        answer: { units: start + markIndex, precision },
    };
}

function roundQuestion(maxPrecision) {
    const precision = randomInt(1, maxPrecision);
    const scale = scaleFor(precision);
    let units = randomInt(0, 999 * scale + scale - 1);
    units += randomInt(1, 9) - (units % 10);
    return {
        kind: "round",
        value: { units, precision },
        targetPrecision: precision - 1,
        answer: { units: Math.floor((units + 5) / 10), precision: precision - 1 },
    };
}

function generateQuestion(kind, maxPrecision) {
    if (kind === "place-value") return placeValueQuestion(maxPrecision);
    if (kind === "compare") return compareQuestion(maxPrecision);
    if (kind === "order") return orderQuestion(maxPrecision);
    if (kind === "number-line") return numberLineQuestion(maxPrecision);
    return roundQuestion(maxPrecision);
}

function questionKey(question) {
    if (question.kind === "place-value")
        return `${question.kind}:${decimalKey(question.value)}:${question.fractionalPlace}`;
    if (question.kind === "compare")
        return `${question.kind}:${decimalKey(question.left)}:${decimalKey(question.right)}`;
    if (question.kind === "order") return `${question.kind}:${question.values.map((v) => v.canonicalUnits).join(":")}`;
    if (question.kind === "number-line")
        return `${question.kind}:${question.precision}:${question.start}:${question.markIndex}`;
    return `${question.kind}:${decimalKey(question.value)}:${question.targetPrecision}`;
}

function buildDeck(cfg) {
    if (!MAX_PRECISIONS.includes(cfg.precision) || !cfg.numExercises || cfg.numExercises < 1) return [];
    const deck = [];
    const seen = new Set();
    const offset = randomInt(0, QUESTION_KINDS.length - 1);
    let tries = 0;
    while (deck.length < cfg.numExercises && tries < cfg.numExercises * 100) {
        const kind = QUESTION_KINDS[(offset + deck.length) % QUESTION_KINDS.length];
        const question = generateQuestion(kind, cfg.precision);
        const key = questionKey(question);
        tries++;
        if (seen.has(key)) continue;
        seen.add(key);
        deck.push(question);
    }
    return deck;
}

function questionOptionsHtml(question) {
    return optionListHtml(
        question.options,
        (item) => item.label,
        (item) => item.value,
    );
}

function numberLineHtml(question) {
    const ticks = Array.from({ length: 11 }, (_, index) => {
        const x = 20 + index * 26;
        const length = index === 0 || index === 10 ? 13 : 8;
        return `<line class="decimal-line-tick" x1="${x}" y1="31" x2="${x}" y2="${31 + length}"></line>`;
    }).join("");
    const pointX = 20 + question.markIndex * 26;
    return `<div class="decimal-line-card">
        <svg class="decimal-number-line" viewBox="0 0 300 58" aria-hidden="true" focusable="false">
            <line class="decimal-line-axis" x1="20" y1="31" x2="280" y2="31"></line>
            ${ticks}
            <circle class="decimal-line-point" cx="${pointX}" cy="20" r="7"></circle>
        </svg>
        <div class="decimal-line-labels">
            <span>${formatDecimal({ units: question.start, precision: question.precision })}</span>
            <span>${formatDecimal({ units: question.end, precision: question.precision })}</span>
        </div>
    </div>`;
}

function answerInput() {
    return `<input class="decimal-answer" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?"
        id="answer" aria-label="jouw kommagetal" required>`;
}

function renderPrompt(question) {
    if (question.kind === "place-value") {
        return `<p class="decimal-expression">
            Welke waarde heeft de <span class="decimal-target-digit">${question.targetDigit}</span> in
            <span class="decimal-number">${formatDecimal(question.value)}</span>?
        </p>
        <p class="decimal-place-name">Kijk naar de ${FRACTIONAL_PLACES[question.fractionalPlace]}.</p>
        ${questionOptionsHtml(question)}`;
    }
    if (question.kind === "compare") {
        return `<div class="decimal-comparison">
            <p class="decimal-expression"><span class="decimal-number">${formatDecimal(question.left)}</span>
                &nbsp;?&nbsp; <span class="decimal-number">${formatDecimal(question.right)}</span></p>
            ${questionOptionsHtml(question)}
        </div>`;
    }
    if (question.kind === "order") {
        const tokens = question.values
            .map((value) => `<span class="decimal-token">${formatDecimal(value.display)}</span>`)
            .join("");
        return `<div class="decimal-order">
            <p class="decimal-place-name">Zet van klein naar groot.</p>
            <p class="decimal-order-source">${tokens}</p>
            ${questionOptionsHtml(question)}
        </div>`;
    }
    if (question.kind === "number-line") {
        return `${numberLineHtml(question)}${answerInput()}`;
    }
    const target = question.targetPrecision === 0 ? "eenheden" : FRACTIONAL_PLACES[question.targetPrecision];
    return `<p class="decimal-expression">Rond <span class="decimal-number">${formatDecimal(question.value)}</span> af</p>
        <p class="decimal-round-place">op ${target}</p>${answerInput()}`;
}

function correctLabel(question) {
    if (question.options) return question.options.find((item) => item.value === question.answer)?.label ?? "";
    return formatDecimal(question.answer);
}

function renderReview(question, given) {
    const prompt = renderPrompt(question);
    if (question.options) {
        const marker = questionOptionsHtml(question);
        const reviewOptions = buildReviewOptionList(
            question.options,
            (item) => item.value === question.answer,
            (item) => item.value === given,
        );
        return `${prompt.replace(marker, reviewOptions)}`;
    }
    return `${prompt.replace(answerInput(), "")}
        <p class="decimal-solution">antwoord: <span class="box bad">${correctLabel(question)}</span></p>`;
}

function isCorrectAnswer(question, given) {
    if (question.options) return given === question.answer;
    const parsed = parseDecimal(given);
    return parsed !== null && compareDecimals(parsed, question.answer) === 0;
}

const FEEDBACK = {
    "place-value": "welke waarde heeft het cijfer?",
    compare: "kies <, = of >",
    order: "van klein naar groot",
    "number-line": "lees de getallenas",
    round: "rond het kommagetal af",
};

const FIELDS = [
    { field: "precision", type: "radio", key: "precision" },
    { field: "num-exercises", type: "number", key: "numExercises" },
];

runExercise({
    id: "decimals",
    label: "kommatrainer",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
    },
    readConfig(form) {
        const cfg = readFields(form, FIELDS);
        return { ...cfg, precision: Number(cfg.precision) };
    },
    validateConfig(cfg) {
        if (!MAX_PRECISIONS.includes(cfg.precision)) return "Kies een geldige nauwkeurigheid.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        return null;
    },
    buildDeck,
    renderQuestion(question, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = `<div class="decimal-question" data-kind="${question.kind}">${renderReview(question, mode.given)}</div>`;
            return;
        }
        document.getElementById("exercise-feedback").textContent = FEEDBACK[question.kind];
        root.innerHTML = `<div class="decimal-question" data-kind="${question.kind}">${renderPrompt(question)}</div>`;
        if (question.options) return wireOptions(root);
        const input = root.querySelector("#answer");
        return () => input.value;
    },
    isCorrect: isCorrectAnswer,
    describe(question) {
        if (question.kind === "compare") {
            return `${formatDecimal(question.left)} ${correctLabel(question)} ${formatDecimal(question.right)}`;
        }
        if (question.kind === "order") return `volgorde: ${correctLabel(question)}`;
        if (question.kind === "place-value") {
            return `${question.targetDigit} in ${formatDecimal(question.value)} = ${correctLabel(question)}`;
        }
        if (question.kind === "number-line") return `getallenas: ${correctLabel(question)}`;
        return `${formatDecimal(question.value)} afgerond = ${correctLabel(question)}`;
    },
});
