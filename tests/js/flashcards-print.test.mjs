// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Cut-out flashcards: the backs must land behind their fronts when the
// pages are printed double-sided and flipped on the long edge.

import assert from "node:assert";
import { test } from "node:test";

import { cardSheets } from "./harness.mjs";

const cards = (count) => Array.from({ length: count }, (_, i) => `c${i + 1}`);

test("cardSheets: backs mirror every row, so each back sits behind its front", () => {
    const [sheet] = cardSheets(cards(12));
    assert.deepEqual(sheet.front, ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11", "c12"]);
    assert.deepEqual(sheet.back, ["c3", "c2", "c1", "c6", "c5", "c4", "c9", "c8", "c7", "c12", "c11", "c10"]);
    // Long-edge flip: column c on the front is column (2 − c) on the back.
    for (let slot = 0; slot < 12; slot++) {
        const row = Math.floor(slot / 3);
        const column = slot % 3;
        assert.equal(sheet.back[row * 3 + (2 - column)], sheet.front[slot]);
    }
});

test("cardSheets: twelve cards per sheet, the last one padded with empty slots", () => {
    const sheets = cardSheets(cards(14));
    assert.equal(sheets.length, 2);
    assert.deepEqual(sheets[1].front, ["c13", "c14", null, null, null, null, null, null, null, null, null, null]);
    // The empty slots keep their places, so c13 and c14 still line up.
    assert.deepEqual(sheets[1].back.slice(0, 3), [null, "c14", "c13"]);
});

test("cardSheets: no cards, no sheets", () => {
    assert.deepEqual(cardSheets([]), []);
});
