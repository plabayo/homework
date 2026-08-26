// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/written_arithmetic.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

const testMath = Object.create(Math);
testMath.random = () => 0.5;

function parseStrictInt(value) {
    const text = String(value ?? "");
    return /^-?\d+$/.test(text) ? Number(text) : null;
}

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
    parseStrictInt,
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const { buildDeck, buildSteps, makeQuestion, matchesDifficulty, stepIsCorrect } = ctx;
