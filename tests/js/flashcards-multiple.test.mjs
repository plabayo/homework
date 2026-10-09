// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
    buildCombinedQuestions,
    buildDeckQuestions,
    groupQuestions,
    preparePracticeDeck,
    selectionExerciseId,
    validateDeckConfig,
    fillInState,
    renderFillInReview,
    exerciseSpec,
} from "./harness.mjs";

const seasons = {
    id: "seasons",
    name: "Seizoenen",
    mode: "one-sided",
    cards: ["lente", "zomer", "herfst", "winter"].map((front) => ({ front })),
    practice: { mode: "partial", count: 2, orderImportant: true },
};
const colors = {
    id: "colors",
    name: "Kleuren",
    mode: "one-sided",
    cards: ["rood", "groen"].map((front) => ({ front })),
    practice: {},
};
const words = {
    id: "words",
    name: "Frans",
    mode: "two-sided",
    cards: [
        { front: "chat", back: "kat" },
        { front: "salut", parts: ["hallo", "dag"] },
    ],
    practice: {},
};

test("combined generation preserves each deck's settings and source without changing stored decks", () => {
    const decks = [seasons, colors, words];
    const before = JSON.stringify(decks);
    const questions = buildCombinedQuestions(decks);
    assert.equal(questions.length, 6);
    assert.equal(questions.filter((q) => q.deckId === "seasons").length, 2);
    assert.equal(questions.filter((q) => q.deckId === "colors").length, 2);
    assert.equal(questions.filter((q) => q.kind === "multi-part").length, 1);
    const seasonQuestions = questions.filter((q) => q.deckId === "seasons");
    assert.equal(seasonQuestions[0].allCards.join(), "lente,zomer,herfst,winter");
    assert.ok(questions.every((q) => q.deckName));
    assert.equal(groupQuestions(questions).length, 4);
    assert.equal(JSON.stringify(decks), before);
});

test("fill-in progress is shared within a deck and isolated between decks, including reset", () => {
    const questions = buildCombinedQuestions([seasons, colors]);
    exerciseSpec.prepareDeck(questions, "normal");
    questions.forEach((q) => exerciseSpec.prepareQuestion(q));
    const a = questions.filter((q) => q.deckId === "seasons");
    const b = questions.filter((q) => q.deckId === "colors");
    const result = exerciseSpec.evaluateAnswer(a[0], "lente");
    assert.equal(result.correct, true);
    assert.equal(fillInState(a[1]).results[0], true);
    assert.equal(Object.keys(fillInState(b[0]).results).length, 0);
    exerciseSpec.evaluateSkip(b[0]);
    assert.equal(fillInState(b[1]).results[0], false);
    assert.equal(fillInState(a[0]).results[0], true);
    exerciseSpec.prepareDeck(questions, "normal");
    questions.forEach((q) => exerciseSpec.prepareQuestion(q));
    assert.equal(Object.keys(fillInState(a[0]).results).length, 0);
});

test("retry regroups interleaved grids, reveals unselected blanks, and leaves stored questions intact", () => {
    const questions = buildCombinedQuestions([seasons, colors, words]);
    const a = questions.filter((q) => q.deckId === "seasons");
    const b = questions.filter((q) => q.deckId === "colors");
    const word = questions.find((q) => q.kind === "two-sided");
    const retry = preparePracticeDeck([a[0], b[1], word, a[1]], "mistakes");
    assert.equal(retry.map((q) => q.deckId).join(), "seasons,seasons,colors,words");
    assert.equal(retry[0].blankIndices, retry[1].blankIndices);
    assert.equal(fillInState(retry[2]).blankIndices.join(), "1");
    assert.equal(b[1].blankIndices.join(), "0,1");
    retry.forEach((q) => exerciseSpec.prepareQuestion(q));
    assert.equal(exerciseSpec.evaluateAnswer(retry[2], "groen").correct, true);
    assert.equal(exerciseSpec.evaluateAnswer(retry[2], "rood").correct, false);
});

test("combined image, reverse and multi-part questions retain their behavior", () => {
    const questions = buildCombinedQuestions([
        {
            ...words,
            bidirectional: true,
            cards: [...words.cards, { wikimedia: "Cat.jpg", back: "kat", hint: "Een dier" }],
        },
    ]);
    assert.equal(questions.length, 3);
    const image = questions.find((q) => q.kind === "image");
    assert.equal(image.hint, "Een dier");
    assert.equal(exerciseSpec.evaluateAnswer(image, "kat").correct, true);
    for (const q of questions.filter((q) => q.kind !== "image")) {
        assert.ok(q.direction === "fwd" || q.direction === "bwd");
        if (q.direction === "bwd") assert.ok(["chat", "salut"].includes(q.back));
    }
});

test("selection history is order independent, unambiguous, and separate from single-deck history", () => {
    assert.equal(selectionExerciseId(["a", "b"], true), selectionExerciseId(["b", "a"], true));
    assert.notEqual(selectionExerciseId(["a-b", "c"], true), selectionExerciseId(["a", "b-c"], true));
    assert.notEqual(selectionExerciseId(["a"], true), selectionExerciseId(["a"], false));
    assert.equal(selectionExerciseId(["a"], false), "flashcards-a");
    assert.equal(selectionExerciseId([], false), "flashcards");
});

test("invalid or empty decks fail validation while legacy single-deck generation still works", () => {
    assert.ok(validateDeckConfig(null, {}));
    assert.ok(validateDeckConfig({ ...words, cards: [] }, {}));
    assert.ok(validateDeckConfig({ ...words, cards: [{ front: "missing" }] }, {}));
    assert.ok(validateDeckConfig(seasons, { fcMode: "partial", fcCount: 4 }));
    const questions = buildDeckQuestions(words, {});
    assert.equal(questions.length, 2);
    assert.ok(questions.every((q) => q.deckId === undefined));
});

test("out-of-order fill-in answers and skipped blanks retain the right retry identities", () => {
    const questions = buildCombinedQuestions([colors]);
    exerciseSpec.prepareDeck(questions, "normal");
    exerciseSpec.evaluateAnswer(questions[0], "groen");
    assert.equal(questions[0].index, 1);
    assert.equal(questions[0].front, "groen");
    exerciseSpec.evaluateSkip(questions[1]);
    assert.equal(questions[1].index, 0);
    assert.equal(questions[1].front, "rood");
    const before = JSON.stringify(questions[1]);
    const retry = exerciseSpec.prepareDeck([questions[1]], "mistakes");
    assert.equal(JSON.stringify(retry[0]), before, "runtime retry selection must not change persisted identity");
    assert.equal(fillInState(retry[0]).blankIndices.join(), "0");
});

test("wrong guesses keep the current blank open until the framework reveals the answer", () => {
    const questions = buildCombinedQuestions([colors]);
    exerciseSpec.prepareDeck(questions, "normal");
    assert.equal(exerciseSpec.evaluateAnswer(questions[0], "xyz").correct, false);
    assert.equal(Object.keys(fillInState(questions[0]).results).length, 0);
    renderFillInReview(questions[0], { innerHTML: "" });
    assert.equal(fillInState(questions[0]).results[0], false);
    assert.equal(exerciseSpec.evaluateAnswer(questions[1], "groen").correct, true);
});
