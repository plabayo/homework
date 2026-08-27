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
let randomState = 0xa8174e;
testMath.random = () => {
    randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0;
    return randomState / 0x1_0000_0000;
};

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
    formatScaledNumber: (units, places = 0) => {
        const digits = String(Math.abs(units)).padStart(places + 1, "0");
        const split = digits.length - places;
        const whole = digits.slice(0, split).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
        return `${units < 0 ? "−" : ""}${whole}${places > 0 ? `,${digits.slice(split)}` : ""}`;
    },
    pickRandom: (values) => values[Math.floor(testMath.random() * values.length)],
    randomInt: (min, max) => min + Math.floor(testMath.random() * (max - min + 1)),
    parseStrictInt,
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    document: { getElementById: () => null },
});

runInContext(patched, ctx);

export const {
    buildDeck,
    buildSteps,
    calculationColumns,
    calculationHtml,
    formatNumber,
    leadingCarry,
    makeQuestion,
    matchesDifficulty,
    stepIsCorrect,
} = ctx;
