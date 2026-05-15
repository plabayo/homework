// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Pure-logic unit tests for fractions.js: math helpers and deck-building
// deduplication.  Runs in Node.js (no browser).
//
// Run locally:  node --test tests/js/
// Or via just:  just test-js

import { test } from "node:test";
import assert from "node:assert";

import { gcd, simplify, lcm, buildDeck } from "./fractions-harness.mjs";

// ---------------------------------------------------------------------------
// gcd
// ---------------------------------------------------------------------------

test("gcd: gcd(12, 8) = 4", () => {
    assert.equal(gcd(12, 8), 4);
});

test("gcd: gcd(7, 13) = 1 (coprime)", () => {
    assert.equal(gcd(7, 13), 1);
});

test("gcd: gcd(0, 5) = 5", () => {
    assert.equal(gcd(0, 5), 5);
});

test("gcd: gcd(6, 0) = 6", () => {
    assert.equal(gcd(6, 0), 6);
});

test("gcd: handles negative inputs via abs", () => {
    assert.equal(gcd(-12, 8), 4);
    assert.equal(gcd(12, -8), 4);
});

// ---------------------------------------------------------------------------
// lcm
// ---------------------------------------------------------------------------

test("lcm: lcm(4, 6) = 12", () => {
    assert.equal(lcm(4, 6), 12);
});

test("lcm: lcm(3, 5) = 15 (coprime)", () => {
    assert.equal(lcm(3, 5), 15);
});

// ---------------------------------------------------------------------------
// simplify
// ---------------------------------------------------------------------------

// deepStrictEqual checks prototypes — objects from the VM realm differ, so
// compare num/den properties directly.
function assertFrac(actual, num, den) {
    assert.equal(actual.num, num, `expected num=${num}, got ${actual.num}`);
    assert.equal(actual.den, den, `expected den=${den}, got ${actual.den}`);
}

test("simplify: 6/4 → 3/2", () => {
    assertFrac(simplify(6, 4), 3, 2);
});

test("simplify: 0/n → 0/1", () => {
    assertFrac(simplify(0, 7), 0, 1);
});

test("simplify: already reduced fraction unchanged", () => {
    assertFrac(simplify(3, 7), 3, 7);
});

test("simplify: 10/5 → 2/1", () => {
    assertFrac(simplify(10, 5), 2, 1);
});

// ---------------------------------------------------------------------------
// buildDeck — basic shape
// ---------------------------------------------------------------------------

function cfg(overrides) {
    return {
        numExercises: 5,
        denominators: [2, 3, 4],
        kinds: ["optellen"],
        mixedDenominators: false,
        ...overrides,
    };
}

test("buildDeck: returns exactly numExercises questions", () => {
    const deck = buildDeck(cfg({ numExercises: 8 }));
    assert.equal(deck.length, 8);
});

test("buildDeck: returns empty deck when denominators is empty", () => {
    const deck = buildDeck(cfg({ denominators: [] }));
    assert.equal(deck.length, 0);
});

test("buildDeck: each question has the expected kind", () => {
    const deck = buildDeck(cfg({ kinds: ["vermenigvuldigen"], numExercises: 6 }));
    for (const q of deck) {
        assert.equal(q.kind, "vermenigvuldigen");
    }
});

test("buildDeck: breuk-van-getal questions have integer answers", () => {
    const deck = buildDeck(cfg({ kinds: ["breuk-van-getal"], numExercises: 6 }));
    for (const q of deck) {
        assert.equal(typeof q.answer, "number");
        assert.equal(q.answer % 1, 0);
    }
});

test("buildDeck: fraction answers are in simplified form", () => {
    const deck = buildDeck(cfg({ kinds: ["optellen"], numExercises: 10, denominators: [2, 3, 4, 6] }));
    for (const q of deck) {
        const { num, den } = q.answer;
        assert.equal(gcd(num, den), 1, `${num}/${den} should be simplified`);
    }
});

// ---------------------------------------------------------------------------
// buildDeck — deduplication
// ---------------------------------------------------------------------------

// Reconstruct the question key the same way buildDeck does internally.
function questionKey(q) {
    switch (q.kind) {
        case "breuk-van-getal":
            return `bvg:${q.num}/${q.den}:${q.n}`;
        case "optellen":
        case "aftrekken":
            return `${q.kind}:${q.aNum}/${q.aDen}:${q.bNum}/${q.bDen}`;
        case "vermenigvuldigen":
            return `vm:${q.aNum}/${q.aDen}:${q.bNum}/${q.bDen}`;
        case "delen":
            return `del:${q.num}/${q.den}:${q.divisor}`;
    }
}

test("buildDeck: no duplicate questions when pool is large enough", () => {
    // denominators [2,3,4,6] with optellen gives a large pool — 10 exercises
    // should all be unique.
    const deck = buildDeck(cfg({ numExercises: 10, denominators: [2, 3, 4, 6], kinds: ["optellen"] }));
    const keys = deck.map(questionKey);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length, `expected all unique, got duplicates: ${JSON.stringify(keys)}`);
});

test("buildDeck: no duplicate questions across mixed kinds", () => {
    const deck = buildDeck(
        cfg({
            numExercises: 15,
            denominators: [2, 3, 4],
            kinds: ["optellen", "aftrekken", "vermenigvuldigen", "delen"],
        }),
    );
    const keys = deck.map(questionKey);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length, "expected no duplicates across mixed kinds");
});

test("buildDeck: completes even when pool is smaller than numExercises (allows repeats after exhaustion)", () => {
    // denominator=[2], kind=["delen"] gives only 1 possible question (1/2 ÷ 2 or 1/2 ÷ 3).
    // Requesting 6 exercises must still return 6 without hanging.
    const deck = buildDeck(cfg({ numExercises: 6, denominators: [2], kinds: ["delen"] }));
    assert.equal(deck.length, 6);
});

test("buildDeck: breuk-van-getal deduplication across denominators", () => {
    const deck = buildDeck(
        cfg({ numExercises: 8, denominators: [2, 3, 4, 5], kinds: ["breuk-van-getal"] }),
    );
    const keys = deck.map(questionKey);
    const unique = new Set(keys);
    assert.equal(unique.size, keys.length, "expected unique breuk-van-getal questions");
});
