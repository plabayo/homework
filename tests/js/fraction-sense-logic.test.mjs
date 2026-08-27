// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import {
    buildDeck,
    denominatorsFor,
    formatHundredths,
    isCorrectAnswer,
    parseHundredths,
} from "./fraction-sense-harness.mjs";

const ALL_KINDS = ["recognize", "compare", "equivalent", "improper"];
const ALL_VARIANTS = new Set([
    "visual-to-fraction",
    "fraction-to-visual",
    "number-line",
    "compare",
    "order",
    "complete-equivalent",
    "simplify",
    "common-denominator",
    "improper-to-mixed",
    "mixed-to-improper",
    "fraction-to-decimal",
    "decimal-to-fraction",
]);

function config(overrides = {}) {
    return {
        kinds: ALL_KINDS,
        denominatorSet: "large",
        includeDecimals: true,
        numExercises: 12,
        ...overrides,
    };
}

function correctGiven(question) {
    if (["fraction-to-visual", "compare", "order"].includes(question.kind)) return question.answer;
    if (["visual-to-fraction", "number-line", "simplify", "mixed-to-improper", "decimal-to-fraction"].includes(question.kind)) {
        return { num: String(question.answer.num), den: String(question.answer.den) };
    }
    if (question.kind === "complete-equivalent") return String(question.answer);
    if (question.kind === "common-denominator") {
        return {
            leftNum: String(question.answer.leftNum),
            rightNum: String(question.answer.rightNum),
        };
    }
    if (question.kind === "improper-to-mixed") {
        return {
            whole: String(question.answer.whole),
            num: String(question.answer.num),
            den: String(question.answer.den),
        };
    }
    return formatHundredths(question.answer);
}

test("denominator choices expose their exact cumulative sets", () => {
    assert.deepEqual([...denominatorsFor("small")], [2, 3, 4, 5, 6]);
    assert.deepEqual([...denominatorsFor("standard")], [2, 3, 4, 5, 6, 8, 9, 10, 12]);
    assert.deepEqual([...denominatorsFor("large")], [2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 20, 25, 50, 100]);
    assert.deepEqual([...denominatorsFor("unknown")], []);
});

test("buildDeck covers every variant when every checkbox is enabled", () => {
    const deck = buildDeck(config());
    assert.equal(deck.length, 12);
    assert.deepEqual(new Set(deck.map((question) => question.kind)), ALL_VARIANTS);
});

test("concept checkboxes can be selected independently", () => {
    const improper = buildDeck(
        config({ kinds: ["improper"], denominatorSet: "small", includeDecimals: false, numExercises: 8 }),
    );
    assert.deepEqual(new Set(improper.map((question) => question.kind)), new Set([
        "improper-to-mixed",
        "mixed-to-improper",
    ]));

    const decimals = buildDeck(config({ kinds: [], denominatorSet: "small", numExercises: 6 }));
    assert.deepEqual(new Set(decimals.map((question) => question.kind)), new Set([
        "fraction-to-decimal",
        "decimal-to-fraction",
    ]));
});

test("every generated canonical answer is accepted", () => {
    const deck = buildDeck(config({ numExercises: 48 }));
    assert.equal(deck.length, 48);
    for (const question of deck) {
        assert.equal(isCorrectAnswer(question, correctGiven(question)), true, question.kind);
    }
});

test("decimal answers accept comma or dot but reject loose syntax", () => {
    assert.equal(parseHundredths("0,75"), 75);
    assert.equal(parseHundredths("0.5"), 50);
    assert.equal(parseHundredths("1"), 100);
    for (const value of [" 0,5", "0,5 ", ",5", "0,", "1e2", "0x10", ""]) {
        assert.equal(parseHundredths(value), null, value);
    }
});

test("simplifying and decimal-to-fraction require simplest form", () => {
    const deck = buildDeck(config({ numExercises: 24 }));
    for (const question of deck.filter((item) => item.kind === "simplify" || item.kind === "decimal-to-fraction")) {
        const doubled = {
            num: String(question.answer.num * 2),
            den: String(question.answer.den * 2),
        };
        assert.equal(isCorrectAnswer(question, doubled), false, question.kind);
    }
});
