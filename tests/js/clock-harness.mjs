// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Loads the deck-building logic from clock.js into a Node.js VM context,
// stripping the @homework ES-module import so the pure functions can run
// without a DOM or the shared homework.js runtime.
//
// The handful of helpers clock.js imports from @homework that are actually
// used during deck construction (dutchTimePhrase, dutchTimePhraseVariants,
// minutesForStep, pickRandom, shuffle) are stubbed below with real
// implementations mirroring homework.js — that way buildDeck is exercised
// against the same phrase set the production code uses. If dutchTimePhrase
// ever grows new variants in homework.js the matching stub here needs to
// follow (and a dedicated harness for homework.js would be welcome).

import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/clock.js"), "utf8");

const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

// ---- Stubs for the @homework helpers used by buildDeck ---------------------

const HOUR_NAMES = [
    "twaalf",
    "een",
    "twee",
    "drie",
    "vier",
    "vijf",
    "zes",
    "zeven",
    "acht",
    "negen",
    "tien",
    "elf",
];
const hourName = (h) => HOUR_NAMES[((h % 12) + 12) % 12];

// Kept in sync with `dutchTimePhrase` / `dutchTimePhraseVariants` in
// src/service/assets/homework.js — including 1-minute precision support
// for the freeplay clock.
const MINUTE_NAMES = [
    "nul",
    "een",
    "twee",
    "drie",
    "vier",
    "vijf",
    "zes",
    "zeven",
    "acht",
    "negen",
    "tien",
    "elf",
    "twaalf",
    "dertien",
    "veertien",
    "vijftien",
    "zestien",
    "zeventien",
    "achttien",
    "negentien",
    "twintig",
    "eenentwintig",
    "tweeëntwintig",
    "drieëntwintig",
    "vierentwintig",
    "vijfentwintig",
    "zesentwintig",
    "zevenentwintig",
    "achtentwintig",
    "negenentwintig",
    "dertig",
];
const minuteName = (n) => MINUTE_NAMES[n];

function dutchTimePhrase(h, m) {
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    if (m === 0) return `${hourName(h12)} uur`;
    if (m === 15) return `kwart over ${hourName(h12)}`;
    if (m === 30) return `half ${hourName(next)}`;
    if (m === 45) return `kwart voor ${hourName(next)}`;
    if (m >= 1 && m <= 14) return `${minuteName(m)} over ${hourName(h12)}`;
    if (m >= 16 && m <= 29) return `${minuteName(30 - m)} voor half ${hourName(next)}`;
    if (m >= 31 && m <= 44) return `${minuteName(m - 30)} over half ${hourName(next)}`;
    if (m >= 46 && m <= 59) return `${minuteName(60 - m)} voor ${hourName(next)}`;
    return null;
}

function dutchTimePhraseVariants(h, m) {
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    const primary = dutchTimePhrase(h, m);
    const variants = primary !== null ? [primary] : [];

    if (m >= 16 && m <= 29) {
        variants.push(`${minuteName(m)} over ${hourName(h12)}`);
    } else if (m >= 31 && m <= 44) {
        variants.push(`${minuteName(60 - m)} voor ${hourName(next)}`);
    }

    const expanded = [];
    for (const phrase of variants) {
        expanded.push(phrase);
        if (phrase.includes(" over ") && !phrase.includes(" over half ")) {
            const na = phrase.replace(" over ", " na ");
            if (!expanded.includes(na)) expanded.push(na);
        }
    }
    return expanded;
}

function minutesForStep(step) {
    const out = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
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
    // @homework stubs:
    dutchTimePhrase,
    dutchTimePhraseVariants,
    minutesForStep,
    pickRandom: (arr) => arr[Math.floor(Math.random() * arr.length)],
    // Identity shuffle keeps the test deterministic — order is irrelevant for
    // the properties under test (which question kinds / minute values appear).
    shuffle: (arr) => arr,
    // The rest are not exercised by buildDeck but the import binding must
    // resolve to something callable.
    optionListHtml: () => "",
    pad: (n, w) => String(n).padStart(w, "0"),
    loadFields: () => {},
    readFields: () => ({}),
    runExercise: () => {},
    wireOptions: () => {},
    // DOM stub — pure functions never hit these; the stubs only exist so
    // module-level references don't throw during runInContext (clock.js
    // registers a delegated click listener for the phrase-flip widget).
    document: {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
    },
});

runInContext(patched, ctx);

export const { buildDeck } = ctx;
// Re-export helpers too — tests can use these directly without
// re-implementing them.
export { dutchTimePhrase, dutchTimePhraseVariants };
