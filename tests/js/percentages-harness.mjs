// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Loads the pure math/deck-building functions from percentages.js into a
// Node.js VM context, stripping the browser-only @homework import so the
// logic can be exercised without a DOM.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/percentages.js"), "utf8");

const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

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
    // pickRandom is imported from @homework in the real file; provide a real impl.
    pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],
    // Stubs for the remaining @homework imports — never called by pure functions.
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    // DOM stub — pure functions never call these.
    document: { getElementById: () => null, querySelector: () => null },
});

runInContext(patched, ctx);

export const { buildDeck, isCorrectAnswer, renderReview } = ctx;
