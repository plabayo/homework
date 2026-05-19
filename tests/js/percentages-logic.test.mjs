// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Pure-logic unit tests for percentages.js: math helpers, deck building,
// and answer checking. Runs in Node.js (no browser).
//
// Run locally:  node --test tests/js/
// Or via just:  just test-js

import { test } from "node:test";
import assert from "node:assert";

import { buildDeck, isCorrectAnswer, renderReview } from "./percentages-harness.mjs";

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

// ---------------------------------------------------------------------------
// buildDeck — basic shape
// ---------------------------------------------------------------------------

function cfg(overrides) {
    return {
        numExercises: 5,
        difficulty: "makkelijk",
        kinds: ["breuk-naar-procent"],
        requireSimplified: false,
        ...overrides,
    };
}

test("buildDeck: returns exactly numExercises questions", () => {
    assert.equal(buildDeck(cfg({ numExercises: 8 })).length, 8);
});

test("buildDeck: returns empty deck when no kinds selected", () => {
    assert.equal(buildDeck(cfg({ kinds: [] })).length, 0);
});

// ---------------------------------------------------------------------------
// buildDeck — breuk-naar-procent
// ---------------------------------------------------------------------------

test("buildDeck: breuk-naar-procent has integer percentage answer in 1–100", () => {
    const deck = buildDeck(cfg({ kinds: ["breuk-naar-procent"], numExercises: 10 }));
    for (const q of deck) {
        assert.equal(q.kind, "breuk-naar-procent");
        assert.equal(q.answer % 1, 0, `${q.num}/${q.den} → ${q.answer} is not an integer`);
        assert.ok(q.answer >= 1 && q.answer <= 100, `answer ${q.answer} out of range`);
    }
});

test("buildDeck: no duplicates within easy pool when well within pool size", () => {
    // 8 exercises from 11-item easy pool — stale-reset cannot trigger, so all 8 must be unique.
    const deck = buildDeck(cfg({ kinds: ["breuk-naar-procent"], numExercises: 8 }));
    assert.equal(deck.length, 8);
    const keys = deck.map((q) => `${q.num}/${q.den}`);
    assert.equal(new Set(keys).size, 8, `expected all unique, got: ${JSON.stringify(keys)}`);
});

test("buildDeck: no duplicates within hard pool when well within pool size", () => {
    // 13 exercises from 19-item hard pool — safely below reset threshold.
    const deck = buildDeck(cfg({ difficulty: "moeilijk", kinds: ["breuk-naar-procent"], numExercises: 13 }));
    assert.equal(deck.length, 13);
    const keys = deck.map((q) => `${q.num}/${q.den}`);
    assert.equal(new Set(keys).size, 13, "expected all unique for hard pool");
});

// ---------------------------------------------------------------------------
// buildDeck — procent-naar-breuk
// ---------------------------------------------------------------------------

test("buildDeck: procent-naar-breuk answer fraction is always simplified", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-naar-breuk"], numExercises: 8 }));
    for (const q of deck) {
        assert.equal(q.kind, "procent-naar-breuk");
        assert.equal(gcd(q.answer.num, q.answer.den), 1, `${q.answer.num}/${q.answer.den} is not simplified`);
    }
});

test("buildDeck: procent-naar-breuk pct equals num*100/den", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-naar-breuk"], numExercises: 8 }));
    for (const q of deck) {
        assert.equal(q.pct, (q.answer.num * 100) / q.answer.den);
    }
});

test("buildDeck: procent-naar-breuk propagates requireSimplified to questions", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-naar-breuk"], requireSimplified: true, numExercises: 5 }));
    for (const q of deck) {
        assert.equal(q.requireSimplified, true);
    }
});

// ---------------------------------------------------------------------------
// buildDeck — procent-van-getal
// ---------------------------------------------------------------------------

test("buildDeck: procent-van-getal has integer answer", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-van-getal"], numExercises: 10 }));
    for (const q of deck) {
        assert.equal(q.kind, "procent-van-getal");
        assert.equal(q.answer % 1, 0, `answer ${q.answer} is not an integer`);
    }
});

test("buildDeck: procent-van-getal whole is at least 10", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-van-getal"], numExercises: 10 }));
    for (const q of deck) {
        assert.ok(q.whole >= 10, `whole=${q.whole} is too small`);
    }
});

test("buildDeck: procent-van-getal answer equals pct% of whole", () => {
    const deck = buildDeck(cfg({ kinds: ["procent-van-getal"], numExercises: 10 }));
    for (const q of deck) {
        assert.equal(q.answer, (q.pct * q.whole) / 100, `${q.pct}% van ${q.whole} ≠ ${q.answer}`);
    }
});

// ---------------------------------------------------------------------------
// buildDeck — wat-procent
// ---------------------------------------------------------------------------

test("buildDeck: wat-procent has integer percentage answer", () => {
    const deck = buildDeck(cfg({ kinds: ["wat-procent"], numExercises: 10 }));
    for (const q of deck) {
        assert.equal(q.kind, "wat-procent");
        assert.equal(q.answer % 1, 0, `answer ${q.answer} is not an integer`);
        assert.ok(q.answer >= 1 && q.answer <= 100);
    }
});

test("buildDeck: wat-procent answer equals part/whole×100", () => {
    const deck = buildDeck(cfg({ kinds: ["wat-procent"], numExercises: 10 }));
    for (const q of deck) {
        assert.equal(q.answer, (q.part * 100) / q.whole, `${q.part}/${q.whole}×100 ≠ ${q.answer}`);
    }
});

// ---------------------------------------------------------------------------
// buildDeck — pool exhaustion: fills up with repeats after reset
// ---------------------------------------------------------------------------

test("buildDeck: completes when breuk-naar-procent pool is exhausted (allows repeats)", () => {
    // Easy pool has 11 unique fracs; requesting 15 must still fill up (4 repeats allowed).
    const deck = buildDeck(cfg({ kinds: ["breuk-naar-procent"], numExercises: 15 }));
    assert.equal(deck.length, 15);
});

test("buildDeck: completes when procent-naar-breuk pool is exhausted (allows repeats)", () => {
    // Same 11-item pool (one key per percentage).
    const deck = buildDeck(cfg({ kinds: ["procent-naar-breuk"], numExercises: 15 }));
    assert.equal(deck.length, 15);
});

test("buildDeck: completes when hard pool is exhausted (allows repeats)", () => {
    const deck = buildDeck(
        cfg({ difficulty: "moeilijk", kinds: ["breuk-naar-procent"], numExercises: 25 }),
    );
    assert.equal(deck.length, 25);
});

// ---------------------------------------------------------------------------
// buildDeck — mixed kinds, no duplicates
// ---------------------------------------------------------------------------

test("buildDeck: no duplicate keys across mixed kinds", () => {
    const deck = buildDeck(
        cfg({
            kinds: ["breuk-naar-procent", "procent-naar-breuk", "procent-van-getal", "wat-procent"],
            numExercises: 20,
        }),
    );
    // Key uniqueness check per kind (different kinds have different key prefixes).
    const bnpKeys = deck.filter((q) => q.kind === "breuk-naar-procent").map((q) => `${q.num}/${q.den}`);
    const pnbKeys = deck.filter((q) => q.kind === "procent-naar-breuk").map((q) => String(q.pct));
    const pvgKeys = deck.filter((q) => q.kind === "procent-van-getal").map((q) => `${q.pct}:${q.whole}`);
    const wpKeys  = deck.filter((q) => q.kind === "wat-procent").map((q) => `${q.part}:${q.whole}`);
    assert.equal(new Set(bnpKeys).size, bnpKeys.length, "duplicate breuk-naar-procent");
    assert.equal(new Set(pnbKeys).size, pnbKeys.length, "duplicate procent-naar-breuk");
    assert.equal(new Set(pvgKeys).size, pvgKeys.length, "duplicate procent-van-getal");
    assert.equal(new Set(wpKeys).size,  wpKeys.length,  "duplicate wat-procent");
});

// ---------------------------------------------------------------------------
// isCorrectAnswer — breuk-naar-procent
// ---------------------------------------------------------------------------

test("isCorrectAnswer: breuk-naar-procent exact match", () => {
    const q = { kind: "breuk-naar-procent", num: 3, den: 4, answer: 75 };
    assert.ok(isCorrectAnswer(q, "75"));
    assert.ok(!isCorrectAnswer(q, "74"));
    assert.ok(!isCorrectAnswer(q, "76"));
    assert.ok(!isCorrectAnswer(q, ""));
});

// ---------------------------------------------------------------------------
// isCorrectAnswer — procent-naar-breuk
// ---------------------------------------------------------------------------

test("isCorrectAnswer: procent-naar-breuk accepts equivalent fraction when not simplified", () => {
    const q = { kind: "procent-naar-breuk", pct: 75, answer: { num: 3, den: 4 }, requireSimplified: false };
    assert.ok(isCorrectAnswer(q, { num: 3, den: 4 }));
    assert.ok(isCorrectAnswer(q, { num: 6, den: 8 }));  // equivalent
    assert.ok(isCorrectAnswer(q, { num: 75, den: 100 })); // equivalent
    assert.ok(!isCorrectAnswer(q, { num: 1, den: 4 }));
    assert.ok(!isCorrectAnswer(q, { num: 3, den: 0 })); // invalid denominator
});

test("isCorrectAnswer: procent-naar-breuk rejects non-simplified when requireSimplified=true", () => {
    const q = { kind: "procent-naar-breuk", pct: 75, answer: { num: 3, den: 4 }, requireSimplified: true };
    assert.ok(isCorrectAnswer(q, { num: 3, den: 4 }));
    assert.ok(!isCorrectAnswer(q, { num: 6, den: 8 }));   // not simplified
    assert.ok(!isCorrectAnswer(q, { num: 75, den: 100 })); // not simplified
    assert.ok(!isCorrectAnswer(q, { num: 1, den: 4 }));
});

test("isCorrectAnswer: procent-naar-breuk rejects zero denominator", () => {
    const q = { kind: "procent-naar-breuk", pct: 50, answer: { num: 1, den: 2 }, requireSimplified: false };
    assert.ok(!isCorrectAnswer(q, { num: 1, den: 0 }));
    assert.ok(!isCorrectAnswer(q, { num: 0, den: 0 }));
});

// ---------------------------------------------------------------------------
// isCorrectAnswer — procent-van-getal
// ---------------------------------------------------------------------------

test("isCorrectAnswer: procent-van-getal exact match", () => {
    const q = { kind: "procent-van-getal", pct: 25, num: 1, den: 4, whole: 80, answer: 20 };
    assert.ok(isCorrectAnswer(q, "20"));
    assert.ok(!isCorrectAnswer(q, "21"));
    assert.ok(!isCorrectAnswer(q, "19"));
});

// ---------------------------------------------------------------------------
// isCorrectAnswer — wat-procent
// ---------------------------------------------------------------------------

test("isCorrectAnswer: wat-procent exact match", () => {
    const q = { kind: "wat-procent", num: 1, den: 4, part: 20, whole: 80, answer: 25 };
    assert.ok(isCorrectAnswer(q, "25"));
    assert.ok(!isCorrectAnswer(q, "20"));
    assert.ok(!isCorrectAnswer(q, "30"));
});

// ---------------------------------------------------------------------------
// renderReview — must communicate that the unknown is a percentage
// ---------------------------------------------------------------------------

test("renderReview: wat-procent echoes 'is ?% van' so the unknown is clearly a %", () => {
    const q = { kind: "wat-procent", num: 1, den: 4, part: 20, whole: 80, answer: 25 };
    const html = renderReview(q);
    // Regression: previously rendered "20 van 80 → …" which read as a bare
    // division and obscured that the missing quantity is a percentage. The
    // play form already shows "X is ?% van Y" — the review must match.
    assert.ok(html.includes("20 is ?% van 80"), `expected "20 is ?% van 80" in: ${html}`);
    assert.ok(html.includes("25%"), `expected answer "25%" in: ${html}`);
});

test("renderReview: procent-van-getal still labels the percentage with %", () => {
    const q = { kind: "procent-van-getal", pct: 25, num: 1, den: 4, whole: 80, answer: 20 };
    const html = renderReview(q);
    assert.ok(html.includes("25% van 80"), `expected "25% van 80" in: ${html}`);
});

// ---------------------------------------------------------------------------
// isCorrectAnswer — strict integer parsing
//
// Regression: the previous implementation used a bare `Number(given) === q.answer`
// comparison, which silently accepted "1e2" as 100, "0x10" as 16, " 25 " as 25
// — letting a kid (or a paste handler) sneak past the comparison with input
// that didn't look like a plain integer. The strict parser must reject all of
// these and return null instead.
// ---------------------------------------------------------------------------

test("isCorrectAnswer: rejects scientific-notation, hex, whitespace, empty", () => {
    const q = { kind: "breuk-naar-procent", num: 1, den: 4, answer: 25 };
    // Real answer
    assert.ok(isCorrectAnswer(q, "25"));
    assert.ok(isCorrectAnswer(q, 25));
    // Coincidentally-numeric but malformed inputs
    assert.ok(!isCorrectAnswer(q, "2.5e1"));
    assert.ok(!isCorrectAnswer(q, "25.0"));
    assert.ok(!isCorrectAnswer(q, " 25"));
    assert.ok(!isCorrectAnswer(q, "25 "));
    assert.ok(!isCorrectAnswer(q, ""));
    assert.ok(!isCorrectAnswer(q, "+25"));
    assert.ok(!isCorrectAnswer(q, null));
    assert.ok(!isCorrectAnswer(q, undefined));
    assert.ok(!isCorrectAnswer(q, "abc"));
});

test("isCorrectAnswer: rejects hex matching the numeric answer", () => {
    // 0x10 === 16 in Number(); a strict parser must reject the leading 0x.
    const q = { kind: "procent-van-getal", pct: 25, num: 1, den: 4, whole: 64, answer: 16 };
    assert.ok(isCorrectAnswer(q, "16"));
    assert.ok(!isCorrectAnswer(q, "0x10"));
});

test("isCorrectAnswer: procent-naar-breuk rejects malformed numerator/denominator strings", () => {
    const q = { kind: "procent-naar-breuk", pct: 25, answer: { num: 1, den: 4 }, requireSimplified: true };
    assert.ok(isCorrectAnswer(q, { num: "1", den: "4" }));
    assert.ok(isCorrectAnswer(q, { num: 1, den: 4 }));
    // bad shape / non-int strings
    assert.ok(!isCorrectAnswer(q, { num: " 1", den: "4" }));
    assert.ok(!isCorrectAnswer(q, { num: "1e0", den: "4" }));
    assert.ok(!isCorrectAnswer(q, { num: "1", den: "0" }));
    assert.ok(!isCorrectAnswer(q, { num: "1", den: "" }));
    assert.ok(!isCorrectAnswer(q, null));
    assert.ok(!isCorrectAnswer(q, undefined));
});
