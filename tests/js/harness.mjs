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
import * as flashcardData from "../../src/service/assets/flashcards-data.js";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/flashcards.js"), "utf8");

// Strip the @homework ES-module import — those exports are DOM-bound and not
// needed for the pure logic under test.
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@(?:homework|flashcards-data)["'];?\s*\n/gm,
    "// @homework import removed for pure-function testing\n",
);

// Minimal stubs so module-level declarations (including the IIFE at the
// bottom of flashcards.js that wires MutationObservers) do not throw.
// Matching functions never touch DOM; deck generation can read practice settings.
// Imported ESM helpers run outside the VM and cannot see its browser globals.
// Always inject storage: Node 22 has none, while newer Node may expose a real one.
export const storage = {
    values: new Map(),
    getItem(key) {
        return this.values.get(key) ?? null;
    },
    setItem(key, value) {
        this.values.set(key, String(value));
    },
    removeItem(key) {
        this.values.delete(key);
    },
};
let exerciseSpec;
const ctx = createContext({
    ...flashcardData,
    readPractice: (deck) => flashcardData.readPractice(deck, storage),
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
        addEventListener: () => {},
        removeEventListener: () => {},
    },
    // Stubbed window with no-op event-listener: flashcards.js registers a
    // `pagehide` handler at module init for blob-URL cleanup.
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    localStorage: storage,
    indexedDB: null,
    MutationObserver: class {
        observe() {}
        disconnect() {}
    },
    // @homework stubs — these names appear in flashcards.js after the import
    // is stripped. Capture the exercise spec for session-logic tests without
    // running the DOM-bound framework.
    clearLeaveGuard: () => {},
    escapeHtml: (s) => String(s),
    refreshLeaveGuards: () => {},
    runExercise: (spec) => {
        exerciseSpec = spec;
    },
    setLeaveGuard: () => {},
    shuffle: (arr) => arr,
});

runInContext(patched, ctx);

// Re-export the pure functions under test.
// All are top-level `function` declarations so they land on ctx directly.
export const {
    buildDeckQuestions,
    flashcardHistoryGroups,
    buildCombinedQuestions,
    groupQuestions,
    preparePracticeDeck,
    selectionExerciseId,
    validateDeckConfig,
    fillInState,
    renderFillInReview,
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

export { exerciseSpec };
