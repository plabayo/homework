// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/decimals.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

const testMath = Object.create(Math);
let randomState = 0xdec1a1;
testMath.random = () => {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
    return randomState / 0x1_0000_0000;
};

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
    parseInt,
    isNaN,
    buildReviewOptionList: () => "",
    loadFields: () => {},
    optionListHtml: () => "",
    readFields: () => ({}),
    runExercise: () => {},
    shuffle: (values) => values,
    wireOptions: () => () => null,
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const {
    buildDeck,
    compareDecimals,
    formatDecimal,
    isCorrectAnswer,
    parseDecimal,
    roundQuestion,
} = ctx;
