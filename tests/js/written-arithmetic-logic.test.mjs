// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import {
    buildDeck,
    buildSteps,
    calculationColumns,
    calculationHtml,
    formatNumber,
    leadingCarry,
    makeQuestion,
    matchesDifficulty,
    stepIsCorrect,
} from "./written-arithmetic-harness.mjs";

test("buildSteps: addition carries into each following column", () => {
    const steps = buildSteps("som", 12_478, 3_856);
    assert.deepEqual(
        steps.map(({ aDigit, bDigit, incoming, result, transfer }) => ({
            aDigit,
            bDigit,
            incoming,
            result,
            transfer,
        })),
        [
            { aDigit: 8, bDigit: 6, incoming: 0, result: 4, transfer: 1 },
            { aDigit: 7, bDigit: 5, incoming: 1, result: 3, transfer: 1 },
            { aDigit: 4, bDigit: 8, incoming: 1, result: 3, transfer: 1 },
            { aDigit: 2, bDigit: 3, incoming: 1, result: 6, transfer: 0 },
            { aDigit: 1, bDigit: 0, incoming: 0, result: 1, transfer: 0 },
        ],
    );
});

test("buildSteps: a final carry uses reserved space instead of a fake step", () => {
    const question = makeQuestion("som", 8_308, 1_692, 1);

    assert.equal(question.steps.length, 4);
    assert.deepEqual(
        question.steps.map(({ incoming, result, transfer }) => ({ incoming, result, transfer })),
        [
            { incoming: 0, result: 0, transfer: 1 },
            { incoming: 1, result: 0, transfer: 1 },
            { incoming: 1, result: 0, transfer: 1 },
            { incoming: 1, result: 0, transfer: 1 },
        ],
    );
    assert.equal(leadingCarry(question), 1);
    assert.deepEqual(Array.from(calculationColumns(question)), [4, 3, 2, 1, "comma", 0]);

    const review = calculationHtml(question, { kind: "review" });
    assert.match(review, /written-result written-leading-column/);
    assert.match(review, /data-leading-result aria-live="polite">1<\/span>/);
    assert.doesNotMatch(review, /positie 5/);
});

test("calculationColumns: additions always reserve a quiet leading column", () => {
    const question = makeQuestion("som", 830, 98);

    assert.equal(leadingCarry(question), 0);
    assert.deepEqual(Array.from(calculationColumns(question)), [3, 2, 1, 0]);
    assert.match(calculationHtml(question, { kind: "review" }), /data-leading-result aria-live="polite"><\/span>/);
});

test("buildSteps: subtraction propagates borrowing by column", () => {
    const steps = buildSteps("verschil", 6_432, 2_185);
    assert.deepEqual(
        steps.map(({ incoming, result, transfer }) => ({ incoming, result, transfer })),
        [
            { incoming: 0, result: 7, transfer: 1 },
            { incoming: 1, result: 4, transfer: 1 },
            { incoming: 1, result: 2, transfer: 0 },
            { incoming: 0, result: 4, transfer: 0 },
        ],
    );
});

test("matchesDifficulty: distinguishes procedural transfer work", () => {
    assert.equal(matchesDifficulty(makeQuestion("som", 123, 234), "without-transfer"), true);
    assert.equal(matchesDifficulty(makeQuestion("som", 478, 156), "with-transfer"), true);
    assert.equal(matchesDifficulty(makeQuestion("verschil", 888, 333), "without-transfer"), true);
    assert.equal(matchesDifficulty(makeQuestion("verschil", 632, 185), "with-transfer"), true);
});

test("buildDeck: generated operands and answers stay within the selected maximum", () => {
    for (const maximum of [1_000, 10_000, 100_000]) {
        const deck = buildDeck({
            maximum,
            numExercises: 25,
            kinds: ["som", "verschil"],
            difficulty: "mixed",
        });
        assert.equal(deck.length, 25);
        for (const question of deck) {
            assert.ok(question.a > 0 && question.a <= maximum);
            assert.ok(question.b > 0 && question.b <= maximum);
            assert.ok(question.answer >= 0 && question.answer <= maximum);
        }
    }
});

test("buildDeck: requested transfer difficulty applies to every question", () => {
    for (const difficulty of ["without-transfer", "with-transfer"]) {
        for (const kind of ["som", "verschil"]) {
            const deck = buildDeck({
                maximum: 1_000,
                numExercises: 10,
                kinds: [kind],
                difficulty,
            });
            assert.equal(deck.length, 10);
            for (const question of deck) {
                assert.equal(matchesDifficulty(question, difficulty), true);
            }
        }
    }
});

test("stepIsCorrect: checks both the result digit and the transfer", () => {
    const question = makeQuestion("som", 478, 156);
    assert.equal(stepIsCorrect(question, { digit: "4", transfer: "1" }), true);
    assert.equal(stepIsCorrect(question, { digit: "4", transfer: "0" }), false);
    assert.equal(stepIsCorrect(question, { digit: "14", transfer: "1" }), false);
});

test("buildSteps: decimal columns carry across the comma", () => {
    const steps = buildSteps("som", 1_248, 385, 2);
    assert.deepEqual(
        steps.map(({ incoming, result, transfer }) => ({ incoming, result, transfer })),
        [
            { incoming: 0, result: 3, transfer: 1 },
            { incoming: 1, result: 3, transfer: 1 },
            { incoming: 1, result: 6, transfer: 0 },
            { incoming: 0, result: 1, transfer: 0 },
        ],
    );
});

test("formatNumber: keeps the decimal comma aligned and trailing zeroes visible", () => {
    assert.equal(formatNumber(1_633, 2), "16,33");
    assert.equal(formatNumber(120, 2), "1,20");
    assert.equal(formatNumber(5, 2), "0,05");
});

test("buildDeck: decimal mode is opt-in and stays within the selected maximum", () => {
    const natural = buildDeck({
        maximum: 1_000,
        numExercises: 5,
        kinds: ["som"],
        difficulty: "mixed",
        includeDecimals: false,
        decimalPlaces: 3,
    });
    assert.ok(natural.every((question) => question.decimalPlaces === 0));

    const decimals = buildDeck({
        maximum: 1_000,
        numExercises: 20,
        kinds: ["som", "verschil"],
        difficulty: "mixed",
        includeDecimals: true,
        decimalPlaces: 3,
    });
    assert.ok(decimals.every((question) => question.decimalPlaces >= 1));
    assert.ok(decimals.every((question) => question.decimalPlaces <= 3));
    for (const question of decimals) {
        const maximumUnits = 1_000 * 10 ** question.decimalPlaces;
        assert.ok(question.a <= maximumUnits);
        assert.ok(question.b <= maximumUnits);
        assert.ok(question.answer <= maximumUnits);
    }
});
