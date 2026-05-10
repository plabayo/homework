// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Test harness: loads the pure matching/normalisation functions from
// flashcards.js into a Node.js VM context, bypassing the browser
// environment and the @homework ES-module import.
//
// Top-level `function` declarations in the script become properties of the
// context object and can be re-exported directly.  `const`/`let` bindings
// live in the script scope and are accessible only through their closures —
// that is fine because none of the pure functions we test need them exposed.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/flashcards.js"), "utf8");

// Strip the @homework ES-module import — those exports are DOM-bound and not
// needed for the pure logic under test.
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

// Minimal stubs so module-level declarations (including the IIFE at the
// bottom of flashcards.js that wires MutationObservers) do not throw.
// The pure functions under test never touch DOM or storage.
const ctx = createContext({
    // Standard JS built-ins
    Array,
    Object,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Set,
    Map,
    Symbol,
    Promise,
    Error,
    TypeError,
    RangeError,
    parseInt,
    isNaN,
    // Async primitives — referenced by some functions but never called during init
    setTimeout: () => 0,
    clearTimeout: () => {},
    // DOM stub — pure functions never call these; the stubs prevent
    // ReferenceErrors from the module-level IIFE and variable initialisers.
    document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { appendChild: () => {} },
        createElement: () => null,
    },
    window: null,
    localStorage: null,
    indexedDB: null,
    MutationObserver: class {
        observe() {}
        disconnect() {}
    },
    // @homework stubs — these names appear in flashcards.js after the import
    // is stripped.  runExercise is called once at end-of-file; making it a
    // no-op prevents any exercise-wiring code from running.
    clearLeaveGuard: () => {},
    escapeHtml: (s) => String(s),
    refreshLeaveGuards: () => {},
    runExercise: () => {},
    setLeaveGuard: () => {},
    shuffle: (arr) => arr,
});

runInContext(patched, ctx);

// Re-export the pure functions under test.
// All are top-level `function` declarations so they land on ctx directly.
export const {
    normalize,
    levenshtein,
    fuzzyEqual,
    phraseCoverageMatch,
    classifyAnswerMatch,
    splitAnswerTokens,
    tryMatchParts,
    cardParts,
    normalizeStoredCard,
    normalizeStoredDeck,
} = ctx;
