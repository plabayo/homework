// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Loads the pure math/deck-building functions from fractions.js into a Node.js
// VM context, stripping the browser-only @homework import so the logic can be
// exercised without a DOM.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/fractions.js"), "utf8");

const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

function gcd(a, b) {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
}

function simplifyFraction(num, den) {
    if (num === 0) return { num: 0, den: 1 };
    const divisor = gcd(num, den);
    const sign = den < 0 ? -1 : 1;
    return { num: (num / divisor) * sign, den: Math.abs(den) / divisor };
}

const ctx = createContext({
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Set,
    Map,
    parseInt,
    isNaN,
    gcd,
    lcm: (a, b) => (a === 0 || b === 0 ? 0 : Math.abs((a / gcd(a, b)) * b)),
    simplify: simplifyFraction,
    // pickRandom is imported from @homework in the real file; provide a real impl.
    pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],
    // Stubs for the remaining @homework imports — never called by pure functions.
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    parseStrictInt: (s) => {
        if (typeof s !== "string" && typeof s !== "number") return null;
        const str = String(s).trim();
        if (!/^-?\d+$/.test(str)) return null;
        return Number(str);
    },
    // Module-top references that the real file imports from @homework; we
    // don't render HTML in pure-logic tests, so these are inert stubs.
    fractionHtml: () => "",
    FRACTION_INPUT_HTML: "",
    // DOM stub — pure functions never call these.
    document: { getElementById: () => null, querySelector: () => null },
});

runInContext(patched, ctx);

export const { buildDeck } = ctx;
