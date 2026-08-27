// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/advanced_mathbox.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

let randomValues = [];
const testMath = Object.create(Math);
testMath.random = () => randomValues.shift() ?? 0.5;

const ctx = createContext({
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math: testMath,
    JSON,
    parseInt,
    isNaN,
    formatScaledNumber: (units) => String(units).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f"),
    pickRandom: (values) => values[Math.floor(testMath.random() * values.length)],
    randomInt: (min, max) => min + Math.floor(testMath.random() * (max - min + 1)),
    parseStrictInt: () => null,
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const { buildDeck, formatNatural } = ctx;

export function withRandom(values, callback) {
    randomValues = [...values];
    try {
        return callback();
    } finally {
        randomValues = [];
    }
}
