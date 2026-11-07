// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Unit tests for the kind weights in homework.js: how a parent's 1–5 bias
// per kind becomes the percentages the selector shows and the kinds of the
// questions in a deck.

import assert from "node:assert";
import { test } from "node:test";

import { kindShares, kindWeight, weightedPlan } from "./history-harness.mjs";

function countKinds(plan) {
    const counts = {};
    for (const kind of plan) counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
}

test("kindWeight: missing or invalid weights count as the fair default", () => {
    assert.equal(kindWeight(undefined, "som"), 3);
    assert.equal(kindWeight({}, "som"), 3);
    assert.equal(kindWeight({ som: 5 }, "som"), 5);
    assert.equal(kindWeight({ som: 1 }, "som"), 1);
    for (const bad of [0, 6, 2.5, "4", null, -1]) {
        assert.equal(kindWeight({ som: bad }, "som"), 3, `weight ${JSON.stringify(bad)}`);
    }
});

test("kindShares: equal weights split evenly and always sum to 100", () => {
    assert.deepEqual(kindShares(["a", "b"], {}), [50, 50]);
    assert.deepEqual(kindShares(["a", "b", "c"], {}), [34, 33, 33]);
    assert.deepEqual(kindShares(["a", "b", "c", "d", "e"], {}), [20, 20, 20, 20, 20]);
});

test("kindShares: follows the weights", () => {
    assert.deepEqual(kindShares(["a", "b", "c"], { b: 5 }), [27, 46, 27]);
    assert.deepEqual(kindShares(["a", "b"], { a: 1, b: 5 }), [17, 83]);
    for (const weights of [{ a: 1, b: 2, c: 4 }, { a: 5, b: 5, c: 1 }, { c: 2 }]) {
        const shares = kindShares(["a", "b", "c"], weights);
        assert.equal(shares.reduce((x, y) => x + y, 0), 100);
    }
});

test("weightedPlan: fair by default — every kind gets an even share", () => {
    const counts = countKinds(weightedPlan(["som", "verschil"], {}, 10));
    assert.deepEqual(counts, { som: 5, verschil: 5 });

    const odd = countKinds(weightedPlan(["a", "b", "c"], undefined, 10));
    assert.deepEqual(Object.values(odd).sort(), [3, 3, 4]);
});

test("weightedPlan: the deck follows the weights exactly, not on average", () => {
    for (let run = 0; run < 50; run++) {
        const counts = countKinds(weightedPlan(["som", "verschil", "splitsen"], { verschil: 5 }, 11));
        assert.deepEqual(counts, { som: 3, verschil: 5, splitsen: 3 });
    }
    const counts = countKinds(weightedPlan(["a", "b"], { a: 1, b: 4 }, 20));
    assert.deepEqual(counts, { a: 4, b: 16 });
});

test("weightedPlan: leftover questions go to different kinds across decks", () => {
    // 3 kinds, 4 questions: one kind gets the extra one — and not always the same.
    const extra = new Set();
    for (let run = 0; run < 200; run++) {
        const counts = countKinds(weightedPlan(["a", "b", "c"], {}, 4));
        extra.add(Object.keys(counts).find((kind) => counts[kind] === 2));
    }
    assert.deepEqual([...extra].sort(), ["a", "b", "c"]);
});

test("weightedPlan: returns exactly `count` kinds, all from the list", () => {
    const plan = weightedPlan(["x", "y"], { x: 2 }, 7);
    assert.equal(plan.length, 7);
    assert.ok(plan.every((kind) => kind === "x" || kind === "y"));
    assert.deepEqual(weightedPlan([], {}, 5), []);
    assert.deepEqual(weightedPlan(["x"], {}, 0), []);
});

test("weightedPlan: shuffles the kinds instead of grouping them", () => {
    const orders = new Set();
    for (let run = 0; run < 30; run++) orders.add(weightedPlan(["a", "b"], {}, 6).join(""));
    assert.ok(orders.size > 1, "every deck had the same order");
});
