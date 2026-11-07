// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Loads Rekendoos deck generation into a Node.js VM context so its numeric
// bounds can be tested without mounting the browser exercise framework.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { uniqueDeck } from "./history-harness.mjs";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/mathbox.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

let randomValues = [];
const testMath = Object.create(Math);
testMath.random = () => randomValues.shift() ?? 0.5;

const ctx = createContext({
    uniqueDeck,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math: testMath,
    JSON,
    parseInt,
    isNaN,
    pickRandom: (values) => values[Math.floor(testMath.random() * values.length)],
    // One draw per question, like the pickRandom it replaces, so scripted
    // random sequences keep lining up with the values they were written for.
    weightedPlan: (kinds, _weights, count) =>
        Array.from({ length: count }, () => kinds[Math.floor(testMath.random() * kinds.length)]),
    randomInt: (min, max) => min + Math.floor(testMath.random() * (max - min + 1)),
    parseStrictInt: () => null,
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const { buildDeck, validateConfig } = ctx;

export function withRandom(values, callback) {
    randomValues = [...values];
    try {
        return callback();
    } finally {
        randomValues = [];
    }
}
