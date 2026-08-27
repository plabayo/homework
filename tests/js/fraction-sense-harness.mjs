// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/fraction_sense.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

const testMath = Object.create(Math);
let randomState = 0xf4ac710;
testMath.random = () => {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
    return randomState / 0x1_0000_0000;
};

function testShuffle(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index--) {
        const target = Math.floor(testMath.random() * (index + 1));
        [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
}

function strictInt(value) {
    const text = String(value ?? "");
    return /^\d+$/.test(text) ? Number(text) : null;
}

const ctx = createContext({
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math: testMath,
    JSON,
    Set,
    Map,
    RegExp,
    encodeURIComponent,
    buildReviewOptionList: () => "",
    frac: (num, den) => `${num}/${den}`,
    fractionHtml: (num, den) => `${num}/${den}`,
    loadFields: () => {},
    optionListHtml: () => "",
    parseStrictInt: strictInt,
    pickRandom: (values) => values[Math.floor(testMath.random() * values.length)],
    readFields: () => ({}),
    runExercise: () => {},
    shuffle: testShuffle,
    wireOptions: () => () => null,
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const {
    buildDeck,
    denominatorsFor,
    formatHundredths,
    isCorrectAnswer,
    parseHundredths,
} = ctx;
