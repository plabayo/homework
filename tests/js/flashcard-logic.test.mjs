// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Pure-logic unit tests for the matching and normalisation functions in
// src/service/exercises/flashcards.js.  These run in Node.js (no browser)
// and are fast enough to be part of the normal CI check step.
//
// Run locally:  node --test tests/js/
// Or via just:  just test-js

import { test } from "node:test";
import assert from "node:assert";

import {
    normalize,
    levenshtein,
    fuzzyEqual,
    phraseCoverageMatch,
    classifyAnswerMatch,
    splitAnswerTokens,
    tryMatchParts,
    cardParts,
    normalizeStoredCard,
    normalizeStoredDeck,
} from "./harness.mjs";

// ---------------------------------------------------------------------------
// normalize
// ---------------------------------------------------------------------------

test("normalize: lowercases input", () => {
    assert.equal(normalize("Hello World"), "hello world");
});

test("normalize: strips diacritics", () => {
    assert.equal(normalize("café"), "cafe");
    assert.equal(normalize("naïve"), "naive");
    assert.equal(normalize("Ångström"), "angstrom");
});

test("normalize: collapses internal whitespace", () => {
    assert.equal(normalize("a  b   c"), "a b c");
});

test("normalize: trims leading and trailing whitespace", () => {
    assert.equal(normalize("  hello  "), "hello");
});

test("normalize: strips emojis", () => {
    assert.equal(normalize("hello 🎉"), "hello");
    assert.equal(normalize("❄️ winter"), "winter");
});

test("normalize: handles empty and null-ish input", () => {
    assert.equal(normalize(""), "");
    assert.equal(normalize(null), "");
    assert.equal(normalize(undefined), "");
});

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------

test("levenshtein: identical strings → 0", () => {
    assert.equal(levenshtein("cat", "cat"), 0);
});

test("levenshtein: one substitution", () => {
    assert.equal(levenshtein("cat", "bat"), 1);
});

test("levenshtein: one insertion", () => {
    assert.equal(levenshtein("cat", "cart"), 1);
});

test("levenshtein: one deletion", () => {
    assert.equal(levenshtein("cart", "cat"), 1);
});

test("levenshtein: empty string", () => {
    assert.equal(levenshtein("", "abc"), 3);
    assert.equal(levenshtein("abc", ""), 3);
});

// ---------------------------------------------------------------------------
// fuzzyEqual
// ---------------------------------------------------------------------------

test("fuzzyEqual: exact match → true", () => {
    assert.equal(fuzzyEqual("hond", "hond"), true);
});

test("fuzzyEqual: very short word (≤2 chars) requires exact match", () => {
    assert.equal(fuzzyEqual("ab", "ac"), false);
    assert.equal(fuzzyEqual("ab", "ab"), true);
});

test("fuzzyEqual: one-char typo in medium word → true", () => {
    // 'maison' vs 'maizon' — 1 edit, length 6 → tolerance 1
    assert.equal(fuzzyEqual("maizon", "maison"), true);
});

test("fuzzyEqual: two-char typo in long word → true", () => {
    // 'onthouden' (9 chars) → tolerance 2
    assert.equal(fuzzyEqual("onthouden", "onthöuden"), true);
});

test("fuzzyEqual: too many edits → false", () => {
    assert.equal(fuzzyEqual("completely", "different"), false);
});

test("fuzzyEqual: case-insensitive via normalize", () => {
    assert.equal(fuzzyEqual("Hond", "hond"), true);
});

// ---------------------------------------------------------------------------
// phraseCoverageMatch
// ---------------------------------------------------------------------------

test("phraseCoverageMatch: all content words present → true", () => {
    // 'wachter van de zon' — stopwords: van, de; content: wachter, zon
    assert.equal(phraseCoverageMatch("wachter zon", "wachter van de zon"), true);
});

test("phraseCoverageMatch: fewer than 60% content words → false", () => {
    assert.equal(phraseCoverageMatch("wachter", "wachter half leeuw"), false);
});

test("phraseCoverageMatch: completely wrong → false", () => {
    assert.equal(phraseCoverageMatch("olifant", "wachter van de zon"), false);
});

test("phraseCoverageMatch: only stopwords in expected → false", () => {
    assert.equal(phraseCoverageMatch("van de", "van de"), false);
});

// ---------------------------------------------------------------------------
// classifyAnswerMatch
// ---------------------------------------------------------------------------

test("classifyAnswerMatch: exact match", () => {
    const r = classifyAnswerMatch("aap", "aap");
    assert.equal(r.accepted, true);
    assert.equal(r.exact, true);
    assert.equal(r.practiceAgain, false);
});

test("classifyAnswerMatch: fuzzy match (typo)", () => {
    const r = classifyAnswerMatch("maizon", "maison");
    assert.equal(r.accepted, true);
    assert.equal(r.exact, false);
    assert.equal(r.practiceAgain, false);
});

test("classifyAnswerMatch: phrase-coverage match → practiceAgain", () => {
    const r = classifyAnswerMatch("wachter zon", "wachter van de zon");
    assert.equal(r.accepted, true);
    assert.equal(r.exact, false);
    assert.equal(r.practiceAgain, true);
});

test("classifyAnswerMatch: wrong answer", () => {
    const r = classifyAnswerMatch("olifant", "aap");
    assert.equal(r.accepted, false);
});

// ---------------------------------------------------------------------------
// splitAnswerTokens
// ---------------------------------------------------------------------------

test("splitAnswerTokens: comma separator", () => {
    assert.deepEqual(splitAnswerTokens("a, b, c"), ["a", "b", "c"]);
});

test("splitAnswerTokens: semicolon separator", () => {
    assert.deepEqual(splitAnswerTokens("a; b"), ["a", "b"]);
});

test("splitAnswerTokens: slash separator", () => {
    assert.deepEqual(splitAnswerTokens("a / b"), ["a", "b"]);
});

test("splitAnswerTokens: 'en' word boundary separator", () => {
    assert.deepEqual(splitAnswerTokens("sinaasappelen en dadels"), ["sinaasappelen", "dadels"]);
});

test("splitAnswerTokens: newline separator", () => {
    assert.deepEqual(splitAnswerTokens("a\nb"), ["a", "b"]);
});

test("splitAnswerTokens: filters empty tokens", () => {
    assert.deepEqual(splitAnswerTokens("a,,b"), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// tryMatchParts
// ---------------------------------------------------------------------------

test("tryMatchParts: exact match against one part", () => {
    const result = tryMatchParts("half man", ["wachter van de zon", "half man", "half leeuw"], new Set(), "sfinx", false);
    assert.equal(result.length, 1);
    assert.equal(result[0].part, "half man");
    assert.equal(result[0].exact, true);
});

test("tryMatchParts: comma-separated matches all parts at once", () => {
    const parts = ["sinaasappelen", "dadels"];
    const result = tryMatchParts("sinaasappelen, dadels", parts, new Set(), "fruit", false);
    assert.equal(result.length, 2);
    assert.deepEqual(
        result.map((r) => r.part).sort(),
        ["dadels", "sinaasappelen"],
    );
});

test("tryMatchParts: already-matched parts are excluded", () => {
    const parts = ["A", "B", "C"];
    const alreadyMatched = new Set(["A"]);
    const result = tryMatchParts("A", parts, alreadyMatched, "front", false);
    assert.equal(result.length, 0, "A is already matched, should not match again");
});

test("tryMatchParts: no match returns empty array", () => {
    const result = tryMatchParts("olifant", ["aap", "noot", "mies"], new Set(), "front", false);
    assert.equal(result.length, 0);
});

test("tryMatchParts: phrase-coverage fallback (pass 2)", () => {
    // Full input doesn't split cleanly but contains all content words
    const result = tryMatchParts("wachter zon", ["wachter van de zon"], new Set(), "sfinx", false);
    assert.equal(result.length, 1);
    assert.equal(result[0].part, "wachter van de zon");
    assert.equal(result[0].exact, false);
    assert.equal(result[0].practiceAgain, true);
});

test("tryMatchParts: 'en' separator works as split (pass 1)", () => {
    const result = tryMatchParts("sinaasappelen en dadels", ["sinaasappelen", "dadels"], new Set(), "fruit", false);
    assert.equal(result.length, 2);
});

// ---------------------------------------------------------------------------
// cardParts
// ---------------------------------------------------------------------------

test("cardParts: single back value", () => {
    assert.deepEqual(cardParts({ back: "woef" }), ["woef"]);
});

test("cardParts: parts array", () => {
    assert.deepEqual(cardParts({ parts: ["A", "B", "C"] }), ["A", "B", "C"]);
});

test("cardParts: parts array trims and filters empty strings", () => {
    assert.deepEqual(cardParts({ parts: ["  A  ", "", "B"] }), ["A", "B"]);
});

test("cardParts: back with newline is NOT split (exclusive fields)", () => {
    // After normalization multi-part cards use parts[], not back.
    // cardParts must NOT split back on newlines — that is normalizeStoredCard's job.
    assert.deepEqual(cardParts({ back: "a\nb" }), ["a\nb"]);
});

test("cardParts: missing back and parts returns empty", () => {
    assert.deepEqual(cardParts({}), []);
    assert.deepEqual(cardParts(null), []);
    assert.deepEqual(cardParts(undefined), []);
});

test("cardParts: parts takes precedence over back", () => {
    // After normalization this state doesn't exist, but cardParts should be robust
    assert.deepEqual(cardParts({ parts: ["A", "B"], back: "ignored" }), ["A", "B"]);
});

// ---------------------------------------------------------------------------
// normalizeStoredCard
// ---------------------------------------------------------------------------

test("normalizeStoredCard: null/non-object returns null", () => {
    assert.equal(normalizeStoredCard(null), null);
    assert.equal(normalizeStoredCard("string"), null);
    assert.equal(normalizeStoredCard(42), null);
});

test("normalizeStoredCard: trims front", () => {
    const result = normalizeStoredCard({ front: "  hond  " });
    assert.equal(result.front, "hond");
});

test("normalizeStoredCard: legacy newline back → parts array, back removed", () => {
    const card = { front: "sfinx", back: "wachter van de zon\nhalf leeuw" };
    const result = normalizeStoredCard(card);
    assert.deepEqual(result.parts, ["wachter van de zon", "half leeuw"]);
    assert.equal(result.back, undefined, "back must be absent for multi-part cards");
});

test("normalizeStoredCard: multi-part parts array keeps parts, removes back", () => {
    const card = { front: "Q", parts: ["A", "B", "C"], back: "A\nB\nC" };
    const result = normalizeStoredCard(card);
    assert.deepEqual(result.parts, ["A", "B", "C"]);
    assert.equal(result.back, undefined, "back must be absent for multi-part cards");
});

test("normalizeStoredCard: single-element parts → back only, parts removed", () => {
    const card = { front: "Q", parts: ["A"] };
    const result = normalizeStoredCard(card);
    assert.equal(result.back, "A");
    assert.equal(result.parts, undefined);
});

test("normalizeStoredCard: orphaned partsRequired cleaned up when parts collapses to one", () => {
    const card = { front: "Q", parts: ["A"], partsRequired: 1 };
    const result = normalizeStoredCard(card);
    assert.equal(result.back, "A");
    assert.equal(result.parts, undefined);
    assert.equal(result.partsRequired, undefined, "partsRequired must be removed when card becomes single-part");
});

test("normalizeStoredCard: partsRequired == parts.length is deleted (all-required = absence)", () => {
    const card = { front: "Q", parts: ["A", "B", "C"], partsRequired: 3 };
    const result = normalizeStoredCard(card);
    assert.deepEqual(result.parts, ["A", "B", "C"]);
    assert.equal(result.partsRequired, undefined, "partsRequired equal to parts.length is redundant and must be removed");
});

test("normalizeStoredCard: valid partial partsRequired is preserved", () => {
    const card = { front: "Q", parts: ["A", "B", "C"], partsRequired: 2 };
    const result = normalizeStoredCard(card);
    assert.equal(result.partsRequired, 2);
});

test("normalizeStoredCard: out-of-range partsRequired is clamped", () => {
    // partsRequired: 5 on a 3-part card → clamped to 3 → equals parts.length → removed
    const card = { front: "Q", parts: ["A", "B", "C"], partsRequired: 5 };
    const result = normalizeStoredCard(card);
    assert.equal(result.partsRequired, undefined, "clamped-to-max partsRequired should be removed");
});

test("normalizeStoredCard: partsRequired: 0 is clamped to 1 and kept when < parts.length", () => {
    const card = { front: "Q", parts: ["A", "B", "C"], partsRequired: 0 };
    const result = normalizeStoredCard(card);
    assert.equal(result.partsRequired, 1, "0 clamps to 1; 1 < 3 so it is kept as partial");
});

test("normalizeStoredCard: unchanged card returns same reference", () => {
    const card = { front: "hond", back: "woef" };
    const result = normalizeStoredCard(card);
    assert.equal(result, card, "no changes → same object reference");
});

test("normalizeStoredCard: partsRequired without parts array is removed", () => {
    const card = { front: "Q", back: "single", partsRequired: 1 };
    const result = normalizeStoredCard(card);
    assert.equal(result.partsRequired, undefined);
});

// ---------------------------------------------------------------------------
// normalizeStoredDeck
// ---------------------------------------------------------------------------

test("normalizeStoredDeck: null/invalid returns null", () => {
    assert.equal(normalizeStoredDeck(null), null);
    assert.equal(normalizeStoredDeck({ name: "X" }), null); // missing cards
    assert.equal(normalizeStoredDeck({ cards: [] }), null); // missing name
});

test("normalizeStoredDeck: trims deck name", () => {
    const result = normalizeStoredDeck({ name: "  Test  ", cards: [{ front: "a", back: "b" }] });
    assert.equal(result.name, "Test");
});

test("normalizeStoredDeck: infers mode from cards when not set", () => {
    const twoSided = normalizeStoredDeck({ name: "X", cards: [{ front: "a", back: "b" }] });
    assert.equal(twoSided.mode, "two-sided");

    const oneSided = normalizeStoredDeck({ name: "X", cards: [{ front: "a" }] });
    assert.equal(oneSided.mode, "one-sided");
});

test("normalizeStoredDeck: normalises all cards", () => {
    const deck = {
        name: "Test",
        cards: [{ front: "  Q  ", back: "A\nB" }],
    };
    const result = normalizeStoredDeck(deck);
    assert.equal(result.cards[0].front, "Q");
    assert.deepEqual(result.cards[0].parts, ["A", "B"]);
    assert.equal(result.cards[0].back, undefined);
});
