// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeckQuestions, buildCombinedQuestions, flashcardHistoryGroups, exerciseSpec, storage } from "./harness.mjs";
import { renderHistoryGroups } from "./history-harness.mjs";

const words = { id: "words", name: "Frans", mode: "two-sided", cards: [{ front: "chat", back: "kat" }] };
const colors = { id: "colors", name: "Kleuren", mode: "one-sided", cards: [{ front: "rood" }, { front: "groen" }] };
const outcome = (question, props = {}) => ({ question, label: exerciseSpec.describe(question), correct: true, attempts: 0, ...props });

test("single-deck questions snapshot their source without adding a practice label", () => {
    const q = buildDeckQuestions(words, {})[0];
    assert.equal(q.historySource.id, words.id);
    assert.equal(q.historySource.name, "Frans");
    assert.equal(exerciseSpec.describe(q), "chat → kat");
    const session = { questions: [outcome(q)] };
    assert.equal(flashcardHistoryGroups(session, [{ ...words, name: "Renamed" }])[0].name, "Frans");
    assert.equal(flashcardHistoryGroups(session, [])[0].name, "Frans");
});

test("combined history counts practiced blanks, excludes hints and unvisited decks, and preserves order", () => {
    const questions = buildCombinedQuestions([words, { ...colors, practice: { mode: "partial", count: 1 } }]);
    const session = { config: { deckIds: ["words", "colors", "unvisited"] }, questions: questions.map((q) => outcome(q)) };
    const groups = flashcardHistoryGroups(session, []);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].name, "Frans");
    assert.equal(groups[1].questions.length, 1, "only the tested blank counts, not both source cards");
    assert.equal(groups[0].questions[0].label, "chat → kat");
    assert.equal(session.questions[0].label, "Frans: chat → kat", "rendering must not mutate saved labels");
    assert.equal(flashcardHistoryGroups({ ...session, questions: session.questions.slice(0, 1) }, []).length, 1);
});

test("legacy history uses stored multi-deck names, current single-deck names, or an honest fallback", () => {
    const oldQuestion = { kind: "two-sided", front: "chat", back: "kat" };
    const old = { exerciseId: "flashcards-words", questions: [outcome(oldQuestion)] };
    assert.equal(flashcardHistoryGroups(old, [words])[0].name, "Frans (huidige naam)");
    assert.equal(flashcardHistoryGroups(old, [])[0].name, "Onbekend deck");
    assert.equal(flashcardHistoryGroups({ config: { deckId: "words" }, questions: old.questions }, [words])[0].name, "Frans (huidige naam)");
    const mixed = { questions: [outcome({ ...oldQuestion, deckId: "words", deckName: "Saved name" })] };
    assert.equal(flashcardHistoryGroups(mixed, [words])[0].name, "Saved name");
    assert.equal(flashcardHistoryGroups(mixed, [])[0].questions[0].label, "chat → kat");
});

test("same-named decks remain separate and empty historical sessions remain renderable", () => {
    const qs = buildCombinedQuestions([words, { ...words, id: "other" }]);
    assert.equal(flashcardHistoryGroups({ questions: qs.map((q) => outcome(q)) }, []).length, 2);
    assert.equal(flashcardHistoryGroups({}, []).length, 0);
    assert.equal(renderHistoryGroups([]), "");
});

test("history renders all outcomes with text statuses and escapes deck and question text", () => {
    const question = buildDeckQuestions(words, {})[0];
    const html = renderHistoryGroups([{ name: '<img src=x onerror="alert(1)">', questions: [
        outcome(question, { label: "<script>bad</script>" }),
        outcome(question, { attempts: 2 }),
        outcome(question, { practiceAgain: true }),
        outcome(question, { correct: false, skipped: true }),
        outcome(question, { correct: false, timedOut: true }),
        outcome(question, { correct: false, attempts: 3 }),
    ] }]);
    assert.equal((html.match(/<li /g) || []).length, 6);
    for (const text of ["6 oefenvragen", "✓ goed", "2× fout vooraf", "bijna goed", "overgeslagen", "te traag", "niet goed"]) {
        assert.ok(html.includes(text), text);
    }
    assert.ok(!html.includes("<img"));
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
});

test("image history identifies the card and every expected answer part", () => {
    const q = buildDeckQuestions({ ...words, cards: [{ wikimedia: "Cat.jpg", parts: ["kat", "chat"] }] }, {})[0];
    assert.equal(exerciseSpec.describe(q), "[🖼️ Cat.jpg] → [kat / chat]");
    assert.equal(q.historySource.name, "Frans");
});

test("combined generation reads legacy practice settings from injected storage", () => {
    const key = "homework:flashcards-colors";
    storage.setItem(key, JSON.stringify({ fcMode: "partial", fcCount: 1, fcOrderImportant: true }));
    try {
        const qs = buildCombinedQuestions([colors]);
        assert.equal(qs.length, 1);
        assert.equal(qs[0].allCards.length, 2);
    } finally {
        storage.removeItem(key);
    }
});
