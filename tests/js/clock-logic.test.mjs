// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Regression tests for clock.js::buildDeck.
//
// These exist to catch the kind of bug that shipped on 2026-05 where the
// "zet de klok vanuit woorden" question generator silently filtered the
// eligible times down to volle-uren / kwart / half / kwart voor, so on a
// 5-minute granularity the student never saw a "vijf voor half X" question
// (and the inline phrase-flip widget never had a reason to render). The
// generator must produce the full range of question kinds and time values
// each granularity allows.
//
// Run locally:  node --test tests/js/
// Or via just:  just test-js

import { test } from "node:test";
import assert from "node:assert";

import { buildDeck, dutchTimePhraseVariants } from "./clock-harness.mjs";

// All m-values that have at least one Dutch phrasing.
const ALL_5MIN_BOUNDARIES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
// m-values with two valid wordings — drive the phrase-flip widget.
const DUAL_VARIANT_MINUTES = [20, 25, 35, 40];

function cfg(overrides) {
    return {
        numExercises: 200,
        granularity: "five",
        kinds: ["zet-woorden"],
        answerMode: "multiple",
        hideNumbers: false,
        ...overrides,
    };
}

// Draw a large deck so every reachable (h, m) appears at least once with
// overwhelming probability. 200 samples over 144 candidate (h, m) pairs is
// plenty; the pick-without-replacement bag pattern in buildDeck also helps.
function collectMinutes(deck) {
    const seen = new Set();
    for (const q of deck) seen.add(q.m);
    return seen;
}

// ---------------------------------------------------------------------------
// zet-woorden — must cover every 5-minute boundary in `five` granularity
// ---------------------------------------------------------------------------

test("zet-woorden @ five granularity: every 5-min boundary appears", () => {
    const deck = buildDeck(cfg({ kinds: ["zet-woorden"], granularity: "five" }));
    const minutes = collectMinutes(deck);
    for (const m of ALL_5MIN_BOUNDARIES) {
        assert.ok(
            minutes.has(m),
            `zet-woorden at five-min granularity should include xx:${String(m).padStart(2, "0")} questions, ` +
                `but observed minutes were ${[...minutes].sort((a, b) => a - b).join(",")}`,
        );
    }
});

test("zet-woorden @ five granularity: dual-variant times all appear (phrase-flip widget coverage)", () => {
    const deck = buildDeck(cfg({ kinds: ["zet-woorden"], granularity: "five", numExercises: 400 }));
    const minutes = collectMinutes(deck);
    for (const m of DUAL_VARIANT_MINUTES) {
        assert.ok(
            minutes.has(m),
            `dual-variant time xx:${m} must be reachable so the phrase-flip widget gets exercised`,
        );
        // Sanity-check the variant generator itself — the widget only renders
        // when both wordings exist.
        assert.equal(dutchTimePhraseVariants(0, m).length, 2);
    }
});

test("zet-woorden @ kwartier granularity: only volle-uur / kwart / half / kwart-voor", () => {
    const deck = buildDeck(cfg({ kinds: ["zet-woorden"], granularity: "quarter" }));
    const minutes = collectMinutes(deck);
    for (const m of minutes) {
        assert.ok(
            [0, 15, 30, 45].includes(m),
            `kwartier granularity must not yield xx:${m} (got minutes ${[...minutes].sort((a, b) => a - b)})`,
        );
    }
});

test("zet-woorden @ half granularity: only volle uur and half uur", () => {
    const deck = buildDeck(cfg({ kinds: ["zet-woorden"], granularity: "half" }));
    const minutes = collectMinutes(deck);
    for (const m of minutes) {
        assert.ok([0, 30].includes(m), `half granularity must not yield xx:${m}`);
    }
});

// ---------------------------------------------------------------------------
// Per-question shape — protects downstream renderers
// ---------------------------------------------------------------------------

test("buildDeck: every question has h ∈ [0,12) and m ∈ [0,60) and one of the configured kinds", () => {
    const deck = buildDeck(cfg({ kinds: ["lees", "zet", "zet-woorden"], numExercises: 60 }));
    const allowedKinds = new Set(["lees", "zet", "zet-woorden"]);
    for (const q of deck) {
        assert.ok(q.h >= 0 && q.h < 12, `h out of range: ${q.h}`);
        assert.ok(q.m >= 0 && q.m < 60, `m out of range: ${q.m}`);
        assert.ok(allowedKinds.has(q.kind), `unexpected kind: ${q.kind}`);
    }
});

test("buildDeck: returns exactly numExercises questions", () => {
    for (const n of [1, 5, 20, 50]) {
        const deck = buildDeck(cfg({ numExercises: n }));
        assert.equal(deck.length, n, `expected ${n} questions, got ${deck.length}`);
    }
});

// ---------------------------------------------------------------------------
// Mixed kinds — each requested kind must show up
// ---------------------------------------------------------------------------

test("buildDeck: when multiple kinds are requested, each appears at least once", () => {
    const deck = buildDeck(cfg({ kinds: ["lees", "zet", "zet-woorden"], numExercises: 60 }));
    const seenKinds = new Set(deck.map((q) => q.kind));
    for (const k of ["lees", "zet", "zet-woorden"]) {
        assert.ok(seenKinds.has(k), `kind ${k} must appear at least once in a 60-deck of all kinds`);
    }
});

// ---------------------------------------------------------------------------
// promptStyle — `words` only on times dutchTimePhrase accepts
// ---------------------------------------------------------------------------

test("zet-woorden questions always have promptStyle=words", () => {
    const deck = buildDeck(cfg({ kinds: ["zet-woorden"], numExercises: 40 }));
    for (const q of deck) {
        assert.equal(
            q.promptStyle,
            "words",
            `zet-woorden question xx:${q.m} got promptStyle=${q.promptStyle}`,
        );
    }
});

test("choiceStyle=words only assigned when the time has a Dutch phrasing", () => {
    const deck = buildDeck(cfg({ kinds: ["lees"], numExercises: 200, granularity: "one" }));
    for (const q of deck) {
        if (q.choiceStyle === "words") {
            assert.ok(
                ALL_5MIN_BOUNDARIES.includes(q.m),
                `lees question with choiceStyle=words must land on a 5-min boundary, got xx:${q.m}`,
            );
        }
    }
});
