// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { buildDeck, withRandom } from "./mathbox-harness.mjs";

function cfg(overrides = {}) {
    return {
        countUntil: 20,
        maxSecondTerm: null,
        numExercises: 1,
        kinds: ["verschil"],
        ...overrides,
    };
}

test("buildDeck: blank second-term limit keeps the overall maximum", () => {
    const [question] = withRandom([0, 0.999, 0.999], () => buildDeck(cfg()));

    assert.equal(question.a, 20);
    assert.equal(question.b, 20);
    assert.equal(question.answer, 0);
});

test("buildDeck: configured limit allows 20 minus 5 but not 20 minus 15", () => {
    const [question] = withRandom([0, 0.999, 0.999], () =>
        buildDeck(cfg({ maxSecondTerm: 5 })),
    );

    assert.equal(question.a, 20);
    assert.equal(question.b, 5);
    assert.equal(question.answer, 15);
});

test("buildDeck: configured limit caps every kind's second term", () => {
    for (const kind of ["som", "verschil", "splitsen", "vermenigvuldigen", "delen"]) {
        const [question] = buildDeck(cfg({ kinds: [kind], maxSecondTerm: 5 }));

        assert.ok(question.b <= 5, `${kind} emitted second term ${question.b}`);
        assert.ok(question.answer <= 20, `${kind} emitted answer ${question.answer}`);
    }
});
