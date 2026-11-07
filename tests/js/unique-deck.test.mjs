// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// No repeated exercises: a question only comes back once every question the
// settings allow has been asked — on screen and on the printed sheet alike,
// since both are built by the same buildDeck.

import assert from "node:assert";
import { test } from "node:test";

import { buildDeck as fractionsDeck } from "./fractions-harness.mjs";
import { dealRounds, uniqueDeck } from "./history-harness.mjs";
import { buildDeck as mathboxDeck, withRandom } from "./mathbox-harness.mjs";
import { buildDeck as percentagesDeck } from "./percentages-harness.mjs";

const pick = (values) => values[Math.floor(Math.random() * values.length)];

/** Every block of `size` (one round) holds distinct keys. */
function assertRounds(keys, size) {
    for (let start = 0; start < keys.length; start += size) {
        const round = keys.slice(start, start + size);
        assert.equal(new Set(round).size, round.length, `repeat within a round: ${round.join(", ")}`);
    }
}

test("uniqueDeck: nothing repeats until the whole pool has been asked", () => {
    const pool = ["a", "b", "c", "d", "e"];
    for (let run = 0; run < 20; run++) {
        const deck = uniqueDeck({
            count: 12,
            plan: Array(12).fill("x"),
            draw: () => {
                const key = pick(pool);
                return { question: key, key };
            },
        });
        assert.equal(deck.length, 12);
        assertRounds(deck, pool.length);
        assert.deepEqual([...deck.slice(0, 5)].sort(), pool);
    }
});

test("uniqueDeck: a used-up kind hands its turns to kinds with fresh questions", () => {
    const pools = { small: ["s1", "s2"], big: Array.from({ length: 20 }, (_, i) => `b${i}`) };
    const deck = uniqueDeck({
        count: 10,
        plan: Array(10).fill("small"),
        kinds: ["small", "big"],
        draw: (kind) => {
            const key = pick(pools[kind]);
            return { question: key, key };
        },
    });
    assert.equal(new Set(deck).size, 10, "no repeat while the big pool still has fresh questions");
    assert.equal(deck.filter((key) => key.startsWith("s")).length, 2);
});

test("uniqueDeck: settings that allow no question give an empty deck", () => {
    assert.deepEqual(uniqueDeck({ count: 5, plan: Array(5).fill("x"), draw: () => null }), []);
});

test("uniqueDeck: onPick hears every question taken", () => {
    const taken = [];
    let next = 0;
    uniqueDeck({
        count: 3,
        plan: ["k", "k", "k"],
        draw: () => ({ question: next, key: next++ }),
        onPick: (question, kind) => taken.push(`${kind}${question}`),
    });
    assert.deepEqual(taken, ["k0", "k1", "k2"]);
});

test("dealRounds: every item once per round, then a fresh round", () => {
    const dealt = dealRounds([1, 2, 3], 8);
    assert.equal(dealt.length, 8);
    assertRounds(dealt, 3);
    assert.deepEqual(dealRounds([], 4), []);
});

test("rekendoos: '8 − 2' never comes back before every sum and difference was asked", () => {
    // Up to 5, sums and differences: 21 of each.
    const keys = (deck) => deck.map((q) => `${q.kind}:${q.a}:${q.b}`);
    // The harness scripts its randomness; feed it a long pseudo-random run.
    let seed = 12345;
    const stream = Array.from({ length: 200_000 }, () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed / 2_147_483_648;
    });
    for (let run = 0; run < 10; run++) {
        const deck = withRandom(stream.slice(run * 10_000), () => mathboxDeck({
            countUntil: 5,
            minFirstTerm: null,
            maxFirstTerm: null,
            minSecondTerm: null,
            maxSecondTerm: null,
            numExercises: 42,
            kinds: ["som", "verschil"],
        }));
        assert.equal(deck.length, 42);
        assert.equal(new Set(keys(deck)).size, 42, "all 42 different exercises before any repeat");
    }
});

test("procenten: a small pool is used up before anything repeats", () => {
    // The easiest fractions-to-percent pool is tiny; ask for twice as many.
    const once = percentagesDeck({ numExercises: 40, difficulty: "makkelijk", kinds: ["breuk-naar-procent"] });
    const pool = new Set(once.map((q) => `${q.num}/${q.den}`)).size;
    for (let run = 0; run < 10; run++) {
        const deck = percentagesDeck({ numExercises: pool * 2, difficulty: "makkelijk", kinds: ["breuk-naar-procent"] });
        assert.equal(deck.length, pool * 2);
        assertRounds(
            deck.map((q) => `${q.num}/${q.den}`),
            pool,
        );
    }
});

test("breukendoos: no repeats while the pool lasts", () => {
    for (let run = 0; run < 10; run++) {
        const deck = fractionsDeck({
            numExercises: 15,
            denominators: [2, 3, 4, 5, 6],
            kinds: ["optellen", "aftrekken"],
            mixedDenominators: false,
        });
        const keys = deck.map((q) => `${q.kind}:${q.aNum}/${q.aDen}:${q.bNum}/${q.bDen}`);
        assert.equal(new Set(keys).size, keys.length);
    }
});
