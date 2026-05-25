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

function dutchTimePhrase(h, m) {
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    switch (m) {
        case 0:
            return `${hourName(h12)} uur`;
        case 5:
            return `vijf over ${hourName(h12)}`;
        case 10:
            return `tien over ${hourName(h12)}`;
        case 15:
            return `kwart over ${hourName(h12)}`;
        case 20:
            return `tien voor half ${hourName(next)}`;
        case 25:
            return `vijf voor half ${hourName(next)}`;
        case 30:
            return `half ${hourName(next)}`;
        case 35:
            return `vijf over half ${hourName(next)}`;
        case 40:
            return `tien over half ${hourName(next)}`;
        case 45:
            return `kwart voor ${hourName(next)}`;
        case 50:
            return `tien voor ${hourName(next)}`;
        case 55:
            return `vijf voor ${hourName(next)}`;
        default:
            return null;
    }
}

function dutchTimePhraseVariants(h, m) {
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    let variants;
    switch (m) {
        case 20:
            variants = [`tien voor half ${hourName(next)}`, `twintig over ${hourName(h12)}`];
            break;
        case 25:
            variants = [`vijf voor half ${hourName(next)}`, `vijfentwintig over ${hourName(h12)}`];
            break;
        case 35:
            variants = [`vijf over half ${hourName(next)}`, `vijfentwintig voor ${hourName(next)}`];
            break;
        case 40:
            variants = [`tien over half ${hourName(next)}`, `twintig voor ${hourName(next)}`];
            break;
        default: {
            const p = dutchTimePhrase(h, m);
            variants = p !== null ? [p] : [];
        }
    }
    // Append the Flemish "na" alternative for simple "[count] over [hour]"
    // phrases — keeps this harness in sync with production homework.js.
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
