// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Test harness for the pure helpers in homework.js (partitionForHistoryView,
// weeklyBuckets). homework.js is an ES module that touches `document`,
// `localStorage`, and `indexedDB` at top level; direct `import` from Node
// blows up. Same pattern as `harness.mjs` for flashcards: load source as
// text, strip the `export` keywords (so the declarations land on the VM
// context), stub the browser globals, run in a vm context, re-export.

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/assets/homework.js"), "utf8");

// Convert ES-module exports into bare declarations so they land on the VM
// context object instead of being held inside the module's own scope.
const patched = src
    // `export [async] function foo() {}` → drop `export `
    .replace(/^export\s+(async\s+)?function\s/gm, "$1function ")
    .replace(/^export\s+const\s/gm, "const ")
    .replace(/^export\s+\{[^}]*\};?\s*$/gm, "// stripped re-export");

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
    Symbol,
    Promise,
    Error,
    TypeError,
    RangeError,
    parseInt,
    isNaN,
    setTimeout: () => 0,
    clearTimeout: () => {},
    // Minimal browser-globals stubs. The functions we test never touch them,
    // but module-level initialisers in homework.js read them.
    document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { appendChild: () => {}, classList: { toggle: () => {} } },
        createElement: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        documentElement: { style: {}, classList: { toggle: () => {} } },
    },
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    navigator: { onLine: true },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
    },
    indexedDB: undefined,
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    MutationObserver: class {
        observe() {}
        disconnect() {}
    },
    CustomEvent: class CustomEvent {
        constructor(t, d) {
            this.type = t;
            this.detail = d;
        }
    },
    history: { pushState: () => {}, replaceState: () => {}, back: () => {}, state: null },
    location: { href: "http://test/" },
    console,
});

runInContext(patched, ctx);

export const { partitionForHistoryView, weeklyBuckets, isoWeekStart } = ctx;
