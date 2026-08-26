// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import {
    buildDeck,
    buildSteps,
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
