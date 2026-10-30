// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { buildDeck, validateConfig, withRandom } from "./mathbox-harness.mjs";

const KINDS = ["som", "verschil", "splitsen", "vermenigvuldigen", "delen"];

function cfg(overrides = {}) {
    return {
        countUntil: 20,
        minFirstTerm: null,
        maxFirstTerm: null,
        minSecondTerm: null,
        maxSecondTerm: null,
        numExercises: 1,
        kinds: ["verschil"],
        ...overrides,
    };
}

// Deterministic spread of values in [0, 1) so property-style tests cover
// both ends of every range without depending on Math.random.
function spread(count, seed = 7) {
    const values = [];
    let x = seed;
    for (let i = 0; i < count; i++) {
        x = (x * 1103515245 + 12345) % 2147483648;
        values.push(x / 2147483648);
    }
    return values;
}

function deckOf(overrides, count = 200) {
    return withRandom(spread(count * 4), () => buildDeck(cfg({ numExercises: count, ...overrides })));
}

test("buildDeck: blank second-term limit keeps the overall maximum", () => {
    const [question] = withRandom([0, 0.999, 0.999], () => buildDeck(cfg()));

    assert.equal(question.a, 20);
    assert.equal(question.b, 20);
    assert.equal(question.answer, 0);
});

test("buildDeck: configured limit allows 20 minus 5 but not 20 minus 15", () => {
    const [question] = withRandom([0, 0.999, 0.999], () => buildDeck(cfg({ maxSecondTerm: 5 })));

    assert.equal(question.a, 20);
    assert.equal(question.b, 5);
    assert.equal(question.answer, 15);
});

test("buildDeck: configured limit caps every kind's second term", () => {
    for (const kind of KINDS) {
        for (const question of deckOf({ kinds: [kind], maxSecondTerm: 5 })) {
            assert.ok(question.b <= 5, `${kind} emitted second term ${question.b}`);
            assert.ok(question.answer <= 20, `${kind} emitted answer ${question.answer}`);
        }
    }
});

test("buildDeck: both ranges hold for every kind", () => {
    const ranges = { minFirstTerm: 4, maxFirstTerm: 15, minSecondTerm: 2, maxSecondTerm: 4 };
    for (const kind of KINDS) {
        for (const q of deckOf({ kinds: [kind], ...ranges })) {
            assert.ok(q.a >= 4 && q.a <= 15, `${kind} emitted first number ${q.a}`);
            assert.ok(q.b >= 2 && q.b <= 4, `${kind} emitted second number ${q.b}`);
            assert.ok(q.answer >= 0 && q.answer <= 20, `${kind} emitted answer ${q.answer}`);
        }
    }
});

test("buildDeck: answers match their operation", () => {
    for (const kind of KINDS) {
        for (const q of deckOf({ kinds: [kind] })) {
            switch (kind) {
                case "som":
                case "splitsen":
                    assert.equal(q.answer, q.a + q.b);
                    break;
                case "verschil":
                    assert.equal(q.answer, q.a - q.b);
                    break;
                case "vermenigvuldigen":
                    assert.equal(q.answer, q.a * q.b);
                    break;
                case "delen":
                    assert.ok(q.b >= 1, `delen emitted divisor ${q.b}`);
                    assert.equal(q.a, q.answer * q.b);
                    break;
            }
        }
    }
});

test("buildDeck: lower bounds cover crossing ten and skip trivial zeros", () => {
    const deck = deckOf({ kinds: ["som"], minFirstTerm: 6, maxFirstTerm: 9, minSecondTerm: 3, maxSecondTerm: 9 });

    assert.ok(deck.every((q) => q.a >= 6 && q.a <= 9 && q.b >= 3 && q.b <= 9));
    assert.ok(deck.some((q) => q.answer > 10), "expected some sums past ten");
});

test("buildDeck: the maximum only caps the answer", () => {
    const deck = deckOf({
        countUntil: 10,
        kinds: ["verschil"],
        minFirstTerm: 30,
        maxFirstTerm: 40,
        minSecondTerm: 25,
        maxSecondTerm: 35,
    });

    for (const q of deck) {
        assert.ok(q.a >= 30 && q.a <= 40, `first number ${q.a}`);
        assert.ok(q.answer >= 0 && q.answer <= 10, `answer ${q.answer}`);
    }
});

test("buildDeck: multiplication never exceeds the maximum", () => {
    const deck = deckOf({ kinds: ["vermenigvuldigen"], minFirstTerm: 3, minSecondTerm: 3 });

    assert.ok(deck.every((q) => q.answer <= 20), "a product went past 20");
});

test("buildDeck: a second number of 0 is never used as factor or divisor", () => {
    for (const kind of ["vermenigvuldigen", "delen"]) {
        assert.ok(deckOf({ kinds: [kind], minSecondTerm: 0 }).every((q) => q.b >= 1));
    }
});

test("buildDeck: impossible kinds are skipped instead of looping", () => {
    const deck = deckOf({ kinds: ["som", "verschil"], minFirstTerm: 15, minSecondTerm: 10 }, 20);

    assert.equal(deck.length, 20);
    assert.ok(deck.every((q) => q.kind === "verschil"));
});

test("validateConfig: blank and older saved configs are valid", () => {
    assert.equal(validateConfig(cfg({ kinds: KINDS })), null);
    assert.equal(validateConfig({ countUntil: 20, numExercises: 10, kinds: KINDS, maxSecondTerm: 5 }), null);
});

test("validateConfig: rejects a lower bound above the upper bound", () => {
    assert.match(validateConfig(cfg({ minFirstTerm: 8, maxFirstTerm: 3 })), /eerste getal/);
    assert.match(validateConfig(cfg({ minSecondTerm: 8, maxSecondTerm: 3 })), /tweede getal/);
});

test("validateConfig: rejects out-of-range bounds", () => {
    assert.match(validateConfig(cfg({ maxFirstTerm: 0 })), /bovengrens/);
    assert.match(validateConfig(cfg({ minSecondTerm: 1001 })), /ondergrens/);
    assert.match(validateConfig(cfg({ countUntil: 5000 })), /hoogstens/);
});

test("validateConfig: names the kind that has no possible question", () => {
    const error = validateConfig(cfg({ kinds: ["verschil", "som"], minFirstTerm: 15, minSecondTerm: 10 }));

    assert.equal(error, "Met deze grenzen bestaat er geen oefening voor optellen.");
});

test("validateConfig: delen needs a dividend that fits a divisor", () => {
    const error = validateConfig(
        cfg({ kinds: ["delen"], minFirstTerm: 7, maxFirstTerm: 7, minSecondTerm: 2, maxSecondTerm: 3 }),
    );

    assert.equal(error, "Met deze grenzen bestaat er geen oefening voor delen.");
});
