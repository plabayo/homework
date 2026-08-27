// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    buildReviewOptionList,
    fractionHtml as frac,
    loadFields,
    optionListHtml,
    parseStrictInt,
    pickRandom,
    readFields,
    runExercise,
    shuffle,
    wireOptions,
} from "@homework";

const DENOMINATOR_SETS = {
    small: [2, 3, 4, 5, 6],
    standard: [2, 3, 4, 5, 6, 8, 9, 10, 12],
    large: [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20, 25, 50, 100],
};

const VARIANTS = {
    recognize: ["visual-to-fraction", "fraction-to-visual"],
    compare: ["number-line", "compare", "order"],
    equivalent: ["complete-equivalent", "simplify", "common-denominator"],
    improper: ["improper-to-mixed", "mixed-to-improper"],
    decimals: ["fraction-to-decimal", "decimal-to-fraction"],
};

function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
}

function lcm(a, b) {
    return (a * b) / gcd(a, b);
}

function simplify(num, den) {
    const divisor = gcd(num, den);
    return { num: num / divisor, den: den / divisor };
}

function denominatorsFor(name) {
    return DENOMINATOR_SETS[name] ?? [];
}

function properFraction(denominators, coprime = false) {
    const den = pickRandom(denominators);
    const numerators = Array.from({ length: den - 1 }, (_, index) => index + 1).filter(
        (num) => !coprime || gcd(num, den) === 1,
    );
    return { num: pickRandom(numerators), den };
}

function denominatorPairs(denominators) {
    const pairs = [];
    for (const small of denominators) {
        for (const large of denominators) {
            if (large > small && large % small === 0) pairs.push([small, large]);
        }
    }
    return pairs;
}

function commonDenominatorPairs(denominators) {
    const allowed = new Set(denominators);
    const pairs = [];
    for (let a = 0; a < denominators.length; a++) {
        for (let b = a + 1; b < denominators.length; b++) {
            const first = denominators[a];
            const second = denominators[b];
            const common = lcm(first, second);
            if (allowed.has(common)) pairs.push([first, second, common]);
        }
    }
    return pairs;
}

function decimalFractions(denominators) {
    const found = new Map();
    for (const den of denominators.filter((value) => 100 % value === 0)) {
        for (let num = 1; num < den; num++) {
            const answer = simplify(num, den);
            const hundredths = (num * 100) / den;
            found.set(`${answer.num}/${answer.den}`, { ...answer, hundredths });
        }
    }
    return [...found.values()];
}

function visualToFractionQuestion(denominators) {
    const answer = properFraction(denominators.filter((den) => den <= 12));
    return {
        question: { kind: "visual-to-fraction", answer },
        key: `visual:${answer.num}/${answer.den}`,
    };
}

function fractionToVisualQuestion(denominators) {
    const den = pickRandom(denominators.filter((value) => value >= 4 && value <= 12));
    const numerators = shuffle(Array.from({ length: den - 1 }, (_, index) => index + 1));
    const answerNum = numerators[0];
    const optionNums = shuffle([answerNum, ...numerators.slice(1, 3)]);
    const options = optionNums.map((num) => ({ num, den, value: `${num}/${den}` }));
    return {
        question: {
            kind: "fraction-to-visual",
            target: { num: answerNum, den },
            options,
            answer: `${answerNum}/${den}`,
        },
        key: `choose-visual:${answerNum}/${den}`,
    };
}

function numberLineQuestion(denominators) {
    const answer = properFraction(denominators.filter((den) => den <= 12));
    return {
        question: { kind: "number-line", answer },
        key: `line:${answer.num}/${answer.den}`,
    };
}

function compareQuestion(denominators) {
    let left;
    let right;
    if (Math.random() < 0.2) {
        const [small, large] = pickRandom(denominatorPairs(denominators));
        const num = randomInt(1, small - 1);
        left = { num, den: small };
        right = { num: num * (large / small), den: large };
    } else if (Math.random() < 0.5) {
        const [leftDen, rightDen] = shuffle([...denominators]).slice(0, 2);
        left = { num: 1, den: leftDen };
        right = { num: 1, den: rightDen };
    } else {
        const den = pickRandom(denominators);
        const [leftNum, rightNum] = shuffle(Array.from({ length: den - 1 }, (_, index) => index + 1)).slice(0, 2);
        left = { num: leftNum, den };
        right = { num: rightNum, den };
    }
    const difference = left.num * right.den - right.num * left.den;
    const answer = difference < 0 ? "<" : difference > 0 ? ">" : "=";
    return {
        question: {
            kind: "compare",
            left,
            right,
            options: ["<", "=", ">"].map((value) => ({ label: value, value })),
            answer,
        },
        key: `compare:${left.num}/${left.den}:${right.num}/${right.den}`,
    };
}

function swap(values, first, second) {
    const copy = [...values];
    [copy[first], copy[second]] = [copy[second], copy[first]];
    return copy;
}

function fractionValue(fraction) {
    return fraction.num / fraction.den;
}

function fractionValueKey(fraction) {
    return `${fraction.num}/${fraction.den}`;
}

function orderQuestion(denominators) {
    let fractions;
    if (Math.random() < 0.5) {
        fractions = shuffle([...denominators])
            .slice(0, 4)
            .map((den) => ({ num: 1, den }));
    } else {
        const den = pickRandom(denominators.filter((value) => value >= 5));
        fractions = shuffle(Array.from({ length: den - 1 }, (_, index) => ({ num: index + 1, den }))).slice(0, 4);
    }
    const correct = [...fractions].sort((a, b) => fractionValue(a) - fractionValue(b));
    const sequences = [correct, [...correct].reverse(), swap(correct, 0, 1), swap(correct, 2, 3)];
    const sequenceValue = (sequence) => sequence.map(fractionValueKey).join(":");
    const options = shuffle(
        sequences.map((sequence) => ({
            label: sequence.map(fractionValueKey).join(" < "),
            value: sequenceValue(sequence),
        })),
    );
    return {
        question: { kind: "order", fractions, options, answer: sequenceValue(correct) },
        key: `order:${fractions.map(fractionValueKey).join(":")}`,
    };
}

function completeEquivalentQuestion(denominators) {
    const [small, large] = pickRandom(denominatorPairs(denominators));
    const num = randomInt(1, small - 1);
    return {
        question: {
            kind: "complete-equivalent",
            source: { num, den: small },
            targetDen: large,
            answer: num * (large / small),
        },
        key: `complete:${num}/${small}:${large}`,
    };
}

function simplifyQuestion(denominators) {
    const [small, large] = pickRandom(denominatorPairs(denominators));
    const answer = properFraction([small], true);
    const factor = large / small;
    const source = { num: answer.num * factor, den: large };
    return {
        question: { kind: "simplify", source, answer },
        key: `simplify:${source.num}/${source.den}`,
    };
}

function commonDenominatorQuestion(denominators) {
    const [leftDen, rightDen, commonDen] = pickRandom(commonDenominatorPairs(denominators));
    const left = { num: randomInt(1, leftDen - 1), den: leftDen };
    const right = { num: randomInt(1, rightDen - 1), den: rightDen };
    return {
        question: {
            kind: "common-denominator",
            left,
            right,
            commonDen,
            answer: {
                leftNum: left.num * (commonDen / left.den),
                rightNum: right.num * (commonDen / right.den),
            },
        },
        key: `common:${left.num}/${left.den}:${right.num}/${right.den}`,
    };
}

function improperToMixedQuestion(denominators) {
    const den = pickRandom(denominators.filter((value) => value <= 12));
    const whole = randomInt(1, 3);
    const remainder = randomInt(1, den - 1);
    return {
        question: {
            kind: "improper-to-mixed",
            source: { num: whole * den + remainder, den },
            answer: { whole, num: remainder, den },
        },
        key: `to-mixed:${whole}:${remainder}/${den}`,
    };
}

function mixedToImproperQuestion(denominators) {
    const den = pickRandom(denominators.filter((value) => value <= 12));
    const whole = randomInt(1, 3);
    const num = randomInt(1, den - 1);
    return {
        question: {
            kind: "mixed-to-improper",
            source: { whole, num, den },
            answer: { num: whole * den + num, den },
        },
        key: `to-improper:${whole}:${num}/${den}`,
    };
}

function fractionToDecimalQuestion(denominators) {
    const source = pickRandom(decimalFractions(denominators));
    return {
        question: {
            kind: "fraction-to-decimal",
            source: { num: source.num, den: source.den },
            answer: source.hundredths,
        },
        key: `to-decimal:${source.num}/${source.den}`,
    };
}

function decimalToFractionQuestion(denominators) {
    const answer = pickRandom(decimalFractions(denominators));
    return {
        question: {
            kind: "decimal-to-fraction",
            source: answer.hundredths,
            answer: { num: answer.num, den: answer.den },
        },
        key: `to-fraction:${answer.hundredths}`,
    };
}

const GENERATORS = {
    "visual-to-fraction": visualToFractionQuestion,
    "fraction-to-visual": fractionToVisualQuestion,
    "number-line": numberLineQuestion,
    compare: compareQuestion,
    order: orderQuestion,
    "complete-equivalent": completeEquivalentQuestion,
    simplify: simplifyQuestion,
    "common-denominator": commonDenominatorQuestion,
    "improper-to-mixed": improperToMixedQuestion,
    "mixed-to-improper": mixedToImproperQuestion,
    "fraction-to-decimal": fractionToDecimalQuestion,
    "decimal-to-fraction": decimalToFractionQuestion,
};

function activeVariants(cfg) {
    const variants = (cfg.kinds ?? []).flatMap((kind) => VARIANTS[kind] ?? []);
    if (cfg.includeDecimals) variants.push(...VARIANTS.decimals);
    return variants;
}

function buildDeck(cfg) {
    const denominators = denominatorsFor(cfg.denominatorSet);
    const variants = activeVariants(cfg);
    if (denominators.length === 0 || variants.length === 0 || !cfg.numExercises || cfg.numExercises < 1) return [];

    const deck = [];
    const seen = new Set();
    const offset = randomInt(0, variants.length - 1);
    let staleTries = 0;
    let totalTries = 0;
    while (deck.length < cfg.numExercises && totalTries < cfg.numExercises * 100) {
        const variant = variants[(offset + deck.length) % variants.length];
        const result = GENERATORS[variant](denominators);
        totalTries++;
        if (seen.has(result.key)) {
            staleTries++;
            if (staleTries > Math.max(30, seen.size)) {
                seen.clear();
                staleTries = 0;
            }
            continue;
        }
        seen.add(result.key);
        staleTries = 0;
        deck.push(result.question);
    }
    return deck;
}

function fractionInputHtml(numId = "answer-num", denId = "answer-den", label = "jouw breuk") {
    return `<span class="fraction-input" role="group" aria-label="${label}">
        <input inputmode="numeric" pattern="[0-9]+" id="${numId}" aria-label="teller" min="0" required>
        <span class="frac-bar"></span>
        <input inputmode="numeric" pattern="[0-9]+" id="${denId}" aria-label="noemer" min="1" required>
    </span>`;
}

function integerInputHtml(id, label) {
    return `<input class="fraction-integer-answer" inputmode="numeric" pattern="[0-9]+"
        id="${id}" aria-label="${label}" min="0" required>`;
}

function decimalInputHtml() {
    return `<input class="fraction-decimal-answer" inputmode="decimal" pattern="[0-9]+([,.][0-9]+)?"
        id="answer-decimal" aria-label="jouw kommagetal" required>`;
}

function visualBarHtml(num, den) {
    const parts = Array.from(
        { length: den },
        (_, index) => `<span class="fraction-visual-part${index < num ? " is-filled" : ""}"></span>`,
    ).join("");
    return `<span class="fraction-visual" role="img" aria-label="${num} van ${den} delen gekleurd">${parts}</span>`;
}

function visualOptionsHtml(question, given = null, review = false) {
    const buttons = question.options.map((option) => {
        const correct = option.value === question.answer;
        const chosen = !correct && option.value === given;
        const reviewClass = !review ? "" : correct ? " review-correct" : chosen ? " review-wrong" : " review-dim";
        const disabled = review ? " disabled" : "";
        return `<button type="button" class="default-button option fraction-visual-option${reviewClass}"
            role="radio" aria-checked="false" aria-label="${option.num} van ${option.den} delen gekleurd"
            data-value="${encodeURIComponent(option.value)}"${disabled}>${visualBarHtml(option.num, option.den)}</button>`;
    });
    return `<div class="option-list fraction-visual-options" role="radiogroup">${buttons.join("")}</div>`;
}

function standardOptionsHtml(question) {
    return optionListHtml(
        question.options,
        (option) => option.label,
        (option) => option.value,
    );
}

function numberLineHtml(question) {
    const { num, den } = question.answer;
    const ticks = Array.from({ length: den + 1 }, (_, index) => {
        const x = 20 + (260 * index) / den;
        const length = index === 0 || index === den ? 14 : 9;
        return `<line class="fraction-line-tick" x1="${x}" y1="31" x2="${x}" y2="${31 + length}"></line>`;
    }).join("");
    const pointX = 20 + (260 * num) / den;
    return `<div class="fraction-line-card" role="img" aria-label="getallenas van nul tot één met een stip">
        <svg class="fraction-number-line" viewBox="0 0 300 60" aria-hidden="true" focusable="false">
            <line class="fraction-line-axis" x1="20" y1="31" x2="280" y2="31"></line>
            ${ticks}
            <circle class="fraction-line-point" cx="${pointX}" cy="20" r="7"></circle>
        </svg>
        <div class="fraction-line-labels"><span>0</span><span>1</span></div>
    </div>`;
}

function mixedDisplay(value) {
    return `<span class="fraction-mixed-number"><strong>${value.whole}</strong>${frac(value.num, value.den)}</span>`;
}

function mixedInputHtml() {
    return `<span class="fraction-mixed-input" role="group" aria-label="jouw gemengd getal">
        ${integerInputHtml("answer-whole", "gehele getallen")}
        <span>en</span>
        ${fractionInputHtml("answer-mixed-num", "answer-mixed-den", "breukdeel")}
    </span>`;
}

function commonDenominatorInput(question) {
    const fractionWithInput = (id, label) => `<span class="fraction-input fraction-partial-input">
        ${integerInputHtml(id, label)}<span class="frac-bar"></span><span>${question.commonDen}</span>
    </span>`;
    return `<div class="fraction-common-rows">
        <p>${frac(question.left.num, question.left.den)} <span aria-hidden="true">→</span>
            ${fractionWithInput("answer-left-num", "eerste teller")}</p>
        <p>${frac(question.right.num, question.right.den)} <span aria-hidden="true">→</span>
            ${fractionWithInput("answer-right-num", "tweede teller")}</p>
    </div>`;
}

function renderPrompt(question, controls = true) {
    if (question.kind === "visual-to-fraction") {
        return `<p class="fraction-sense-prompt">Welke breuk is gekleurd?</p>
            ${visualBarHtml(question.answer.num, question.answer.den)}
            ${controls ? fractionInputHtml() : ""}`;
    }
    if (question.kind === "fraction-to-visual") {
        return `<p class="fraction-sense-prompt">Welke strook toont ${frac(question.target.num, question.target.den)}?</p>
            ${controls ? visualOptionsHtml(question) : ""}`;
    }
    if (question.kind === "number-line") {
        return `<p class="fraction-sense-prompt">Welke breuk staat bij de stip?</p>${numberLineHtml(question)}
            ${controls ? fractionInputHtml() : ""}`;
    }
    if (question.kind === "compare") {
        return `<p class="fraction-sense-expression">${frac(question.left.num, question.left.den)}
            <span class="fraction-question-mark">?</span>${frac(question.right.num, question.right.den)}</p>
            ${controls ? standardOptionsHtml(question) : ""}`;
    }
    if (question.kind === "order") {
        const source = question.fractions
            .map((value) => `<span class="fraction-token">${frac(value.num, value.den)}</span>`)
            .join("");
        return `<p class="fraction-sense-prompt">Zet van klein naar groot.</p>
            <div class="fraction-order-source">${source}</div>${controls ? standardOptionsHtml(question) : ""}`;
    }
    return renderWrittenPrompt(question, controls);
}

function renderWrittenPrompt(question, controls) {
    if (question.kind === "complete-equivalent") {
        const target = controls
            ? `<span class="fraction-input fraction-partial-input">${integerInputHtml("answer-integer", "ontbrekende teller")}
                <span class="frac-bar"></span><span>${question.targetDen}</span></span>`
            : `<span class="fraction-placeholder">?/${question.targetDen}</span>`;
        return `<p class="fraction-sense-prompt">Vul de ontbrekende teller in.</p>
            <p class="fraction-sense-expression">${frac(question.source.num, question.source.den)} = ${target}</p>`;
    }
    if (question.kind === "simplify") {
        return `<p class="fraction-sense-prompt">Vereenvoudig de breuk zo ver mogelijk.</p>
            <p class="fraction-sense-expression">${frac(question.source.num, question.source.den)}
                <span aria-hidden="true">=</span>${controls ? fractionInputHtml() : "?"}</p>`;
    }
    if (question.kind === "common-denominator") {
        return `<p class="fraction-sense-prompt">Maak beide breuken gelijknamig met noemer ${question.commonDen}.</p>
            ${
                controls
                    ? commonDenominatorInput(question)
                    : `<p class="fraction-sense-expression">
                ${frac(question.left.num, question.left.den)} en ${frac(question.right.num, question.right.den)}</p>`
            }`;
    }
    if (question.kind === "improper-to-mixed") {
        return `<p class="fraction-sense-prompt">Schrijf als gehelen en een breuk.</p>
            <p class="fraction-sense-expression">${frac(question.source.num, question.source.den)} =
                ${controls ? mixedInputHtml() : "?"}</p>`;
    }
    if (question.kind === "mixed-to-improper") {
        return `<p class="fraction-sense-prompt">Schrijf als één breuk.</p>
            <p class="fraction-sense-expression">${mixedDisplay(question.source)} =
                ${controls ? fractionInputHtml() : "?"}</p>`;
    }
    if (question.kind === "fraction-to-decimal") {
        return `<p class="fraction-sense-prompt">Schrijf de breuk als kommagetal.</p>
            <p class="fraction-sense-expression">${frac(question.source.num, question.source.den)} =
                ${controls ? decimalInputHtml() : "?"}</p>`;
    }
    return `<p class="fraction-sense-prompt">Schrijf zo eenvoudig mogelijk als breuk.</p>
        <p class="fraction-sense-expression"><span class="fraction-decimal-source">${formatHundredths(question.source)}</span> =
            ${controls ? fractionInputHtml() : "?"}</p>`;
}

function formatHundredths(value) {
    const whole = Math.floor(value / 100);
    const fraction = String(value % 100)
        .padStart(2, "0")
        .replace(/0$/, "");
    return `${whole},${fraction}`;
}

function solutionHtml(question) {
    let answer;
    if (
        ["visual-to-fraction", "number-line", "simplify", "mixed-to-improper", "decimal-to-fraction"].includes(
            question.kind,
        )
    ) {
        answer = frac(question.answer.num, question.answer.den);
    } else if (question.kind === "complete-equivalent") {
        answer = String(question.answer);
    } else if (question.kind === "common-denominator") {
        answer = `${frac(question.answer.leftNum, question.commonDen)} en ${frac(question.answer.rightNum, question.commonDen)}`;
    } else if (question.kind === "improper-to-mixed") {
        answer = mixedDisplay(question.answer);
    } else {
        answer = formatHundredths(question.answer);
    }
    return `<p class="fraction-sense-solution">antwoord: <span class="box bad">${answer}</span></p>`;
}

function renderReview(question, given) {
    if (question.kind === "fraction-to-visual") {
        return `${renderPrompt(question, false)}${visualOptionsHtml(question, given, true)}`;
    }
    if (question.kind === "compare" || question.kind === "order") {
        const options = buildReviewOptionList(
            question.options,
            (option) => option.value === question.answer,
            (option) => option.value === given,
        );
        return `${renderPrompt(question, false)}${options}`;
    }
    return `${renderPrompt(question, false)}${solutionHtml(question)}`;
}

function fractionGetter(root, numId = "answer-num", denId = "answer-den") {
    const numerator = root.querySelector(`#${numId}`);
    const denominator = root.querySelector(`#${denId}`);
    return () => ({ num: numerator.value, den: denominator.value });
}

function answerGetter(question, root) {
    if (["fraction-to-visual", "compare", "order"].includes(question.kind)) return wireOptions(root);
    if (
        ["visual-to-fraction", "number-line", "simplify", "mixed-to-improper", "decimal-to-fraction"].includes(
            question.kind,
        )
    ) {
        return fractionGetter(root);
    }
    if (question.kind === "complete-equivalent") {
        const input = root.querySelector("#answer-integer");
        return () => input.value;
    }
    if (question.kind === "common-denominator") {
        const left = root.querySelector("#answer-left-num");
        const right = root.querySelector("#answer-right-num");
        return () => ({ leftNum: left.value, rightNum: right.value });
    }
    if (question.kind === "improper-to-mixed") {
        const whole = root.querySelector("#answer-whole");
        const fraction = fractionGetter(root, "answer-mixed-num", "answer-mixed-den");
        return () => ({ whole: whole.value, ...fraction() });
    }
    const input = root.querySelector("#answer-decimal");
    return () => input.value;
}

function parsedFraction(given) {
    const num = parseStrictInt(given?.num);
    const den = parseStrictInt(given?.den);
    return num === null || den === null || den <= 0 ? null : { num, den };
}

function fractionAnswerIsCorrect(given, answer, exact = false) {
    const parsed = parsedFraction(given);
    if (!parsed) return false;
    if (exact) return parsed.num === answer.num && parsed.den === answer.den;
    return parsed.num * answer.den === answer.num * parsed.den;
}

function parseHundredths(raw) {
    const text = String(raw ?? "");
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ""] = text.replace(".", ",").split(",");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function isCorrectAnswer(question, given) {
    if (["fraction-to-visual", "compare", "order"].includes(question.kind)) return given === question.answer;
    if (["visual-to-fraction", "number-line"].includes(question.kind)) {
        return fractionAnswerIsCorrect(given, question.answer);
    }
    if (["simplify", "mixed-to-improper", "decimal-to-fraction"].includes(question.kind)) {
        return fractionAnswerIsCorrect(given, question.answer, true);
    }
    if (question.kind === "complete-equivalent") return parseStrictInt(given) === question.answer;
    if (question.kind === "common-denominator") {
        return (
            parseStrictInt(given?.leftNum) === question.answer.leftNum &&
            parseStrictInt(given?.rightNum) === question.answer.rightNum
        );
    }
    if (question.kind === "improper-to-mixed") {
        return (
            parseStrictInt(given?.whole) === question.answer.whole &&
            parseStrictInt(given?.num) === question.answer.num &&
            parseStrictInt(given?.den) === question.answer.den
        );
    }
    return parseHundredths(given) === question.answer;
}

const FEEDBACK = {
    "visual-to-fraction": "herken de gekleurde breuk",
    "fraction-to-visual": "kies de juiste voorstelling",
    "number-line": "lees de breuk op de getallenas",
    compare: "kies <, = of >",
    order: "zet de breuken in de juiste volgorde",
    "complete-equivalent": "maak de breuk gelijkwaardig",
    simplify: "vereenvoudig de breuk",
    "common-denominator": "maak de breuken gelijknamig",
    "improper-to-mixed": "maak gehelen en een breuk",
    "mixed-to-improper": "maak één breuk",
    "fraction-to-decimal": "zet om naar een kommagetal",
    "decimal-to-fraction": "zet om naar een breuk",
};

const FIELDS = [
    { field: "practice", type: "checkboxes", key: "kinds" },
    { field: "denominator-set", type: "radio", key: "denominatorSet" },
    { field: "include-decimals", type: "checkbox", key: "includeDecimals" },
    { field: "num-exercises", type: "number", key: "numExercises" },
];

runExercise({
    id: "fraction-sense",
    label: "breukenwijzer",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!DENOMINATOR_SETS[cfg.denominatorSet]) return "Kies geldige noemers.";
        if ((cfg.kinds?.length ?? 0) === 0 && !cfg.includeDecimals) return "Kies minstens één soort oefening.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        return null;
    },
    buildDeck,
    renderQuestion(question, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = `<div class="fraction-sense-question" data-kind="${question.kind}">${renderReview(question, mode.given)}</div>`;
            return;
        }
        document.getElementById("exercise-feedback").textContent = FEEDBACK[question.kind];
        root.innerHTML = `<div class="fraction-sense-question" data-kind="${question.kind}">${renderPrompt(question)}</div>`;
        return answerGetter(question, root);
    },
    isCorrect: isCorrectAnswer,
    describe(question) {
        if (question.kind === "compare") {
            return `${fractionValueKey(question.left)} ${question.answer} ${fractionValueKey(question.right)}`;
        }
        if (question.kind === "order")
            return `volgorde: ${question.options.find((option) => option.value === question.answer)?.label}`;
        if (question.kind === "fraction-to-visual") return `voorstelling van ${fractionValueKey(question.target)}`;
        if (question.kind === "visual-to-fraction" || question.kind === "number-line") {
            return `breuk: ${fractionValueKey(question.answer)}`;
        }
        if (question.kind === "complete-equivalent") {
            return `${fractionValueKey(question.source)} = ${question.answer}/${question.targetDen}`;
        }
        if (question.kind === "simplify")
            return `${fractionValueKey(question.source)} = ${fractionValueKey(question.answer)}`;
        if (question.kind === "common-denominator") {
            return `${fractionValueKey(question.left)} en ${fractionValueKey(question.right)} op noemer ${question.commonDen}`;
        }
        if (question.kind === "improper-to-mixed") {
            return `${fractionValueKey(question.source)} = ${question.answer.whole} en ${question.answer.num}/${question.answer.den}`;
        }
        if (question.kind === "mixed-to-improper")
            return `${question.source.whole} en ${question.source.num}/${question.source.den} = ${fractionValueKey(question.answer)}`;
        if (question.kind === "fraction-to-decimal")
            return `${fractionValueKey(question.source)} = ${formatHundredths(question.answer)}`;
        return `${formatHundredths(question.source)} = ${fractionValueKey(question.answer)}`;
    },
});
