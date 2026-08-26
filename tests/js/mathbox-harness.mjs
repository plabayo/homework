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
    parseStrictInt: () => null,
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const { buildDeck } = ctx;

export function withRandom(values, callback) {
    randomValues = [...values];
    try {
        return callback();
    } finally {
        randomValues = [];
    }
}
