// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import {
    buildDeck,
    compareDecimals,
    formatDecimal,
    isCorrectAnswer,
    parseDecimal,
    roundQuestion,
} from "./decimals-harness.mjs";

test("formatDecimal: preserves requested trailing zeroes and groups thousands", () => {
    assert.equal(formatDecimal({ units: 370, precision: 2 }), "3,70");
    assert.equal(formatDecimal({ units: 1_234_056, precision: 3 }), "1\u202f234,056");
    assert.equal(formatDecimal({ units: 7, precision: 3 }), "0,007");
});

test("parseDecimal: accepts Dutch comma and keyboard-friendly dot", () => {
    assert.deepEqual(parseDecimal("3,70"), { units: 370, precision: 2 });
    assert.deepEqual(parseDecimal("3.70"), { units: 370, precision: 2 });
    assert.deepEqual(parseDecimal("4"), { units: 4, precision: 0 });
});

test("parseDecimal: rejects loose and ambiguous numeric syntax", () => {
    for (const value of [" 3,7", "3,7 ", "1e2", "0x10", "3,", ",7", "3,7,0", ""]) {
        assert.equal(parseDecimal(value), null, value);
    }
});

test("compareDecimals: treats trailing zeroes as equal", () => {
    assert.equal(compareDecimals({ units: 37, precision: 1 }, { units: 370, precision: 2 }), 0);
    assert.equal(compareDecimals({ units: 307, precision: 2 }, { units: 37, precision: 1 }), -1);
    assert.equal(compareDecimals({ units: 371, precision: 2 }, { units: 37, precision: 1 }), 1);
});

test("buildDeck: balances all five concepts and respects maximum precision", () => {
    const deck = buildDeck({ precision: 3, numExercises: 10 });
    assert.equal(deck.length, 10);
    assert.deepEqual(new Set(deck.map((question) => question.kind)), new Set([
        "place-value",
        "compare",
        "order",
        "number-line",
        "round",
    ]));
    for (const question of deck) {
        const values = [question.value, question.left, question.right, question.answer].filter(
            (value) => value && typeof value === "object" && "precision" in value,
        );
        assert.ok(values.every((value) => value.precision <= 3));
    }
});

test("buildDeck: every generated correct answer is accepted", () => {
    const deck = buildDeck({ precision: 3, numExercises: 15 });
    for (const question of deck) {
        const given = question.options ? question.answer : formatDecimal(question.answer);
        assert.equal(isCorrectAnswer(question, given), true, question.kind);
    }
});

test("number-line questions use ten equal intervals and an interior marker", () => {
    const deck = buildDeck({ precision: 3, numExercises: 10 });
    for (const question of deck.filter((item) => item.kind === "number-line")) {
        assert.equal(question.end - question.start, 10);
        assert.ok(question.markIndex >= 1 && question.markIndex <= 9);
        assert.equal(question.answer.units, question.start + question.markIndex);
    }
});

test("roundQuestion: rounds scaled integers without floating-point drift", () => {
    const question = roundQuestion(3);
    assert.equal(question.answer.precision, question.value.precision - 1);
    assert.equal(question.answer.units, Math.floor((question.value.units + 5) / 10));
});
