// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext, runInContext } from "node:vm";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "../../src/service/exercises/digital_clock.js"), "utf8");
const patched = src.replace(
    /^import\s*\{[^}]*\}\s*from\s*["']@homework["'];?\s*\n/m,
    "// @homework import removed for pure-function testing\n",
);

const minutesForStep = (step) => {
    const out = [];
    for (let value = 0; value < 60; value += step) out.push(value);
    return out;
};
const preciseTimePhrase = (h, m, s) => `${h} uur, ${m} minuten en ${s} seconden`;

const ctx = createContext({
    Array,
    Boolean,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Set,
    String,
    buildReviewOptionList: () => "",
    document: {
        getElementById: () => null,
    },
    dutchTimePhrase: (h, m) => `${h}:${m}`,
    dutchTimePhraseVariants: (h, m) => [`${h}:${m}`],
    escapeHtml: String,
    formatHHMM: (h, m) => `${h}:${m}`,
    formatHHMMSS: (h, m, s) => `${h}:${m}:${s}`,
    loadFields: () => {},
    makeFillValidator: () => () => null,
    minutesForStep,
    normalizePhrase: String,
    optionListHtml: () => "",
    parseStrictInt: Number,
    phraseFlipHtml: String,
    pickRandom: (values) => values[0],
    preciseTimePhrase,
    readFields: () => ({}),
    runExercise: () => {},
    shuffle: (values) => values,
    sizeFlip: () => {},
    wireOptions: () => {},
    wordOptionListHtml: () => "",
});

runInContext(patched, ctx);

export const { buildDeck, buildDistractors } = ctx;
