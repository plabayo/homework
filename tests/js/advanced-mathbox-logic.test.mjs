// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { buildDeck, formatNatural, withRandom } from "./advanced-mathbox-harness.mjs";

function cfg(overrides = {}) {
    return {
        maximum: 10_000,
        numExercises: 50,
        kinds: ["som", "verschil", "vermenigvuldigen", "delen"],
        includeRemainders: true,
        ...overrides,
    };
}

test("buildDeck: every natural-number question stays inside the chosen range", () => {
    for (const maximum of [10_000, 100_000]) {
        const deck = buildDeck(cfg({ maximum, numExercises: 200 }));
        assert.equal(deck.length, 200);
        for (const q of deck) {
            assert.ok(q.a > 0 && q.a <= maximum, `${q.kind}: first term ${q.a}`);
            assert.ok(q.b > 0 && q.b <= maximum, `${q.kind}: second term ${q.b}`);
            assert.ok(q.answer >= 0 && q.answer <= maximum, `${q.kind}: answer ${q.answer}`);
        }
    }
});

test("buildDeck: multiplication and division use a one-digit second term", () => {
    for (const kind of ["vermenigvuldigen", "delen"]) {
        const deck = buildDeck(cfg({ kinds: [kind] }));
        for (const q of deck) assert.ok(q.b >= 2 && q.b <= 9, `${kind}: ${q.b}`);
    }
});

test("buildDeck: division questions preserve quotient and remainder", () => {
    const deck = buildDeck(cfg({ kinds: ["delen"], numExercises: 100 }));
    for (const q of deck) {
        assert.equal(q.a, q.answer * q.b + q.remainder);
        assert.ok(q.remainder >= 0 && q.remainder < q.b);
    }
});

test("buildDeck: remainder mode can emit a non-zero remainder", () => {
    const [question] = withRandom([0, 0, 0, 0, 0], () =>
        buildDeck(cfg({ kinds: ["delen"], numExercises: 1 })),
    );
    assert.equal(question.remainder, 1);
    assert.equal(question.a, question.answer * question.b + 1);
});

test("formatNatural: groups thousands without changing the digits", () => {
    assert.equal(formatNatural(100_000), "100\u202f000");
});
