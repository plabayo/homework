// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { buildDeck, buildDistractors } from "./digital-clock-harness.mjs";

function cfg(overrides = {}) {
    return {
        numExercises: 24,
        granularity: "kwart",
        directions: ["digital-to-words", "words-to-digital"],
        answerMode: "multiple",
        use24h: true,
        includeSeconds: false,
        secondStep: "5",
        ...overrides,
    };
}

test("digital clock keeps seconds disabled by default", () => {
    for (const q of buildDeck(cfg())) {
        assert.equal(q.includeSeconds, false);
        assert.equal(q.s, 0);
        assert.ok(!q.phraseVariant.includes("seconden"));
    }
});

test("digital clock supports five-second precision", () => {
    for (const q of buildDeck(cfg({ includeSeconds: true, secondStep: "5" }))) {
        assert.equal(q.includeSeconds, true);
        assert.ok(q.s >= 5 && q.s <= 55);
        assert.equal(q.s % 5, 0);
        assert.ok(q.phraseVariant.includes(`${q.s} seconden`));
    }
});

test("digital clock supports every second", () => {
    for (const q of buildDeck(cfg({ includeSeconds: true, secondStep: "1" }))) {
        assert.ok(q.s >= 1 && q.s <= 59);
    }
});

test("second-aware distractors never duplicate the target", () => {
    const q = buildDeck(cfg({ includeSeconds: true, secondStep: "5", numExercises: 1 }))[0];
    const distractors = buildDistractors(q, 3);
    assert.equal(distractors.length, 3);
    assert.ok(
        distractors.some((option) => option.h === q.h && option.m === q.m && option.s !== q.s),
        "at least one distractor should require comparing seconds",
    );
    for (const option of distractors) {
        assert.notDeepEqual(
            [option.h % 12, option.m, option.s],
            [q.h % 12, q.m, q.s],
        );
    }
});
