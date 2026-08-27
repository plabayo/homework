// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert";
import { test } from "node:test";

import { formatScaledNumber, randomInt, simplifyFraction } from "./history-harness.mjs";

test("formatScaledNumber owns shared grouping, decimal, and sign conventions", () => {
    assert.equal(formatScaledNumber(1_234_506, 2), "12 345,06");
    assert.equal(formatScaledNumber(-5, 2), "−0,05");
    assert.equal(formatScaledNumber(12_000), "12 000");
});

test("simplifyFraction normalises zero and denominator signs", () => {
    assert.deepEqual(
        { ...simplifyFraction(0, 12) },
        { num: 0, den: 1 },
    );
    assert.deepEqual(
        { ...simplifyFraction(6, -8) },
        { num: -3, den: 4 },
    );
});

test("randomInt stays integral and inside its inclusive range", () => {
    for (let draw = 0; draw < 100; draw++) {
        const value = randomInt(-3, 7);
        assert.ok(Number.isInteger(value));
        assert.ok(value >= -3 && value <= 7);
    }
});
