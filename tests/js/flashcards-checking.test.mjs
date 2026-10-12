// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// How flashcard answers are checked (lenient vs strict), the retry hint a
// strict near miss gets, and how a typed answer is shown against the card.

import { test } from "node:test";
import assert from "node:assert/strict";
import { answerChecking } from "../../src/service/assets/flashcards-data.js";
import {
    analyzeAnswer,
    answerDiffHtml,
    attemptHtml,
    buildDeckQuestions,
    classifyAnswerMatch,
    closestExpected,
    diffColumns,
    exerciseSpec,
    isSentence,
    matchAnswer,
    noteHintUsed,
    nudgeText,
    outcomeDetailHtml,
    storage,
    tryMatchParts,
} from "./harness.mjs";

// Values built inside the VM harness have their own Object prototype, which
// strict deep equality rejects; compare their plain JSON shape instead.
const same = (actual, expected, message) =>
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);

const LENIENT = answerChecking({});
const STRICT = answerChecking({ strict: true });
const DECKS_KEY = "homework_flashcard_decks";

const accepted = (given, expected, checking) => classifyAnswerMatch(given, expected, checking).accepted;
const exact = (given, expected, checking) => classifyAnswerMatch(given, expected, checking).exact;
const nudge = (given, expected, checking = STRICT) => {
    const match = classifyAnswerMatch(given, expected, checking);
    assert.equal(match.accepted, false, `${given} must not be accepted for ${expected}`);
    assert.ok(match.nudge, `${given} for ${expected} should get a pointed hint`);
    return nudgeText(match.nudge);
};

// Run `fn` with `decks` saved, as the app would have them in localStorage.
function withDecks(decks, fn) {
    storage.setItem(DECKS_KEY, JSON.stringify(decks));
    try {
        return fn();
    } finally {
        storage.removeItem(DECKS_KEY);
    }
}

function sessionQuestions(deck) {
    const questions = buildDeckQuestions(deck, {});
    exerciseSpec.prepareDeck(questions, "normal");
    for (const q of questions) exerciseSpec.prepareQuestion(q);
    return questions;
}

const french = (practice = {}) => ({
    id: "fr",
    name: "Frans",
    mode: "two-sided",
    cards: [{ front: "luisteren", back: "écouter", hint: "Begint met é." }],
    practice,
});

// ---------------------------------------------------------------------------
// Lenient checking: form never counts, a small typo is "bijna goed"
// ---------------------------------------------------------------------------

test("lenient: accents, capitals, punctuation and emoji never count", () => {
    for (const [given, expected] of [
        ["ecouter", "écouter"],
        ["ECOUTER", "écouter"],
        ["Brussel", "Brussel."],
        ["je m'appelle marie", "Je m'appelle Marie."],
        ["lente", "lente 🌸"],
        ["ou", "où"],
    ]) {
        assert.equal(exact(given, expected, LENIENT), true, `${given} = ${expected}`);
    }
});

test("lenient: a dropped comma still separates words", () => {
    assert.equal(exact("oui non", "oui, non", LENIENT), true);
    assert.equal(exact("oui,non", "oui, non", LENIENT), true);
});

test("lenient: a small typo is accepted as bijna goed, and only counts as a mistake on request", () => {
    same(classifyAnswerMatch("écoutez", "écouter", LENIENT), {
        accepted: true,
        exact: false,
        practiceAgain: false,
    });
    const counted = answerChecking({ nearMissIsMistake: true });
    same(classifyAnswerMatch("écoutez", "écouter", counted), {
        accepted: true,
        exact: false,
        practiceAgain: true,
    });
});

test("a different digit is a wrong answer, never a typo", () => {
    for (const checking of [LENIENT, STRICT]) {
        assert.equal(accepted("1831", "1830", checking), false);
        assert.equal(accepted("35", "3,5", checking), false);
        assert.equal(exact("3,5", "3,5", checking), true);
    }
    // The comma of a number is part of the number, also when punctuation is ignored.
    assert.equal(accepted("3 5", "3,5", LENIENT), false);
});

// ---------------------------------------------------------------------------
// Strict checking: the rules, and what they leave alone
// ---------------------------------------------------------------------------

test("strict: a missing accent is a near miss with a pointed hint", () => {
    assert.equal(nudge("ecouter", "écouter"), "bijna! kijk nog eens naar het accent.");
    assert.equal(nudge("ou", "où"), "bijna! kijk nog eens naar het accent.");
    assert.equal(nudge("a la maison", "à la maison"), "bijna! kijk nog eens naar het accent.");
    assert.equal(nudge("eleve", "élève"), "bijna! kijk nog eens naar de accenten.");
    assert.equal(exact("écouter", "écouter", STRICT), true);
});

test("strict: capitals and punctuation count in sentences only", () => {
    assert.equal(isSentence("Je m'appelle Marie."), true);
    assert.equal(isSentence("Comment ça va ?"), true);
    assert.equal(isSentence("« Oui ! »"), true);
    assert.equal(isSentence("écouter"), false);
    assert.equal(
        nudge("je m'appelle Marie", "Je m'appelle Marie."),
        "bijna! kijk nog eens naar de hoofdletter en het leesteken.",
    );
    assert.equal(nudge("Je m'appelle Marie", "Je m'appelle Marie."), "bijna! kijk nog eens naar het leesteken.");
    assert.equal(nudge("Je m'appelle marie.", "Je m'appelle Marie."), "bijna! kijk nog eens naar de hoofdletter.");
    // A single word keeps ignoring case and punctuation.
    assert.equal(exact("Écouter", "écouter", STRICT), true);
    assert.equal(exact("chien", "Chien", STRICT), true);
});

test("strict: everything at once is named in one hint", () => {
    assert.equal(
        nudge("je m'apelle marie", "Je m'appelle Marie."),
        "bijna! kijk nog eens naar de hoofdletters, het leesteken en de spelling.",
    );
});

test("strict: what a child cannot type never counts", () => {
    for (const [given, expected] of [
        ["Je m'appelle Marie.", "Je m’appelle Marie."],
        ["coeur", "cœur"],
        ["Comment ça va?", "Comment ça va ?"],
        ["Comment ça va ?", "Comment ça va?"],
        ["Je m'appelle Marie .", "Je m'appelle Marie."],
        ['Il dit "oui".', "Il dit « oui »."],
        ["Oui,je viens.", "Oui, je viens."],
        ["  écouter  ", "écouter"],
        ["Attends...", "Attends…"],
    ]) {
        assert.equal(exact(given, expected, STRICT), true, `${given} = ${expected}`);
    }
});

test("strict: a typo is a near miss the child fixes, not bijna goed", () => {
    assert.equal(nudge("écoutez", "écouter"), "bijna! kijk nog eens naar de spelling.");
    assert.equal(nudge("écoute", "écouter"), "bijna! kijk nog eens naar de spelling.");
    // Too far off is a plain wrong answer.
    same(classifyAnswerMatch("hond", "écouter", STRICT), {
        accepted: false,
        exact: false,
        practiceAgain: false,
    });
});

test("strict: only the chosen rules apply", () => {
    const accentsOnly = answerChecking({ strict: true, strictRules: ["accents"] });
    assert.equal(nudge("ecouter", "écouter", accentsOnly), "bijna! kijk nog eens naar het accent.");
    assert.equal(exact("je m'appelle marie", "Je m'appelle Marie.", accentsOnly), true);
    // Without the spelling rule a typo is bijna goed — and strict always counts it as a mistake.
    same(classifyAnswerMatch("écoutez", "écouter", accentsOnly), {
        accepted: true,
        exact: false,
        practiceAgain: true,
    });
    const capitalsOnly = answerChecking({ strict: true, strictRules: ["capitals"] });
    assert.equal(exact("ecouter", "écouter", capitalsOnly), true);
    assert.equal(nudge("je viens.", "Je viens.", capitalsOnly), "bijna! kijk nog eens naar de hoofdletter.");
});

test("strict: no partial-phrase fallback — the whole answer must be there", () => {
    assert.equal(accepted("farao", "de farao", LENIENT), true);
    assert.equal(classifyAnswerMatch("farao", "de farao", LENIENT).practiceAgain, true);
    assert.equal(accepted("farao", "de farao", STRICT), false);
});

// ---------------------------------------------------------------------------
// Several accepted answers
// ---------------------------------------------------------------------------

test("an exact answer wins over a near miss, whatever the order", () => {
    const result = matchAnswer("poes", ["poez", "poes"], LENIENT);
    assert.equal(result.expected, "poes");
    assert.equal(result.match.exact, true);
    const strictMiss = matchAnswer("ecouter", ["hond", "écouter"], STRICT);
    assert.equal(strictMiss.match, null);
    assert.equal(strictMiss.nudge.expected, "écouter");
    assert.equal(closestExpected("ecoutez", ["entendre", "écouter"], STRICT), "écouter");
});

test("multi-part: strict needs every part spelled right, lenient keeps its phrase fallback", () => {
    const parts = ["écouter", "entendre"];
    same(
        tryMatchParts("ecouter, entendre", parts, new Set(), STRICT).map((m) => m.part),
        ["entendre"],
    );
    same(
        tryMatchParts("ecouter, entendre", parts, new Set(), LENIENT).map((m) => m.part),
        ["écouter", "entendre"],
    );
    assert.equal(tryMatchParts("wachter zon", ["wachter van de zon"], new Set(), STRICT).length, 0);
});

// ---------------------------------------------------------------------------
// Showing what was typed against the card
// ---------------------------------------------------------------------------

const types = (given, expected, checking) =>
    diffColumns(analyzeAnswer(given, expected, checking)).map((column) => column.type);

test("comparison columns line each typed character up with the expected one", () => {
    same(types("ecoutez", "écouter", STRICT), [
        "changed",
        "same",
        "same",
        "same",
        "same",
        "same",
        "changed",
    ]);
    // Lenient folds the accent, so only the real typo is marked.
    same(types("ecoutez", "écouter", LENIENT), ["same", "same", "same", "same", "same", "same", "changed"]);
    same(types("ecoute", "écouter", STRICT).at(-1), "missing");
    same(types("ecouterr", "écouter", STRICT).filter((type) => type === "extra").length, 1);
    // œ typed as "oe" is one column, and it is the same letter.
    const columns = diffColumns(analyzeAnswer("coeurs", "cœur", STRICT));
    same(
        columns.map((column) => column.type),
        ["same", "same", "same", "same", "extra"],
    );
    same(columns[1].g, [1, 2]);
    // What does not count keeps its place without being marked.
    same(types("lent", "lente 🌸", LENIENT), ["same", "same", "same", "same", "missing", "ignored", "ignored"]);
});

// The two rows of each word block, as [typed, expected] HTML.
const wordRows = (html) =>
    [...html.matchAll(/<span class="fc-diff-word is-(\w+)"><span class="fc-diff-g">(.*?)<\/span><span class="fc-diff-e">(.*?)<\/span><\/span>(?=<span class="fc-diff-word|\s*<\/div>)/g)].map(
        ([, kind, g, e]) => ({ kind, g, e }),
    );
const mark = (text) => `<span class="fc-diff-mark">${text}</span>`;
const SLOT = '<span class="fc-diff-mark fc-diff-slot"></span>';

test("the comparison shows both rows without labelling mistakes, and escapes typed text", () => {
    const html = answerDiffHtml("ecoutez", "écouter", STRICT);
    assert.match(html, /class="fc-diff"/);
    assert.match(html, /jij/);
    assert.match(html, /juist/);
    assert.ok(!html.includes("spelfout") && !html.includes("accent"), "the marks speak for themselves");
    assert.match(html, /Jij typte “ecoutez”, juist is “écouter”\./);
    assert.equal(answerDiffHtml("écouter", "écouter", STRICT), "", "nothing to show for an exact answer");
    const hostile = answerDiffHtml('<img src=x onerror="alert(1)">', "écouter", STRICT);
    assert.ok(!hostile.includes("<img"));
    assert.ok(hostile.includes("&lt;img"));
    // Too far off to compare word by word: one replaced line.
    assert.match(answerDiffHtml("hond", "écouter", STRICT), /fc-diff-whole/);
});

test("a nearly right word marks only what is off, consecutive letters as one stretch", () => {
    same(wordRows(answerDiffHtml("ecoute", "écouter", STRICT)), [
        { kind: "near", g: `${mark("e")}coute${SLOT}`, e: `${mark("é")}coute${mark("r")}` },
    ]);
    same(wordRows(answerDiffHtml("ecoutzz", "ecouter", LENIENT)), [
        { kind: "near", g: `ecout${mark("zz")}`, e: `ecout${mark("er")}` },
    ]);
});

test("a word that is mostly wrong is marked whole, not letter by letter", () => {
    same(wordRows(answerDiffHtml("Elles aller", "elles vont", STRICT)), [
        { kind: "same", g: "Elles", e: "elles" },
        { kind: "replaced", g: mark("aller"), e: mark("vont") },
    ]);
});

test("a word or space left out shows as a slot, an extra word stands out alone", () => {
    same(wordRows(answerDiffHtml("je viens", "je ne viens pas", LENIENT)), [
        { kind: "same", g: "je", e: "je" },
        { kind: "missing", g: SLOT, e: mark("ne") },
        { kind: "same", g: "viens", e: "viens" },
        { kind: "missing", g: SLOT, e: mark("pas") },
    ]);
    // Words glued together: the first shows as left out, its letters as extra.
    same(wordRows(answerDiffHtml("jeviens bien", "je viens bien", LENIENT)), [
        { kind: "missing", g: SLOT, e: mark("je") },
        { kind: "near", g: `${mark("je")}viens`, e: "viens" },
        { kind: "same", g: "bien", e: "bien" },
    ]);
    same(wordRows(answerDiffHtml("je viens vite bien", "je viens bien", LENIENT)).map((word) => word.kind), [
        "same",
        "same",
        "extra",
        "same",
    ]);
});

test("the retry hint marks the child's own attempt without revealing the answer", () => {
    const html = attemptHtml("ecoutr", "écouter", STRICT);
    assert.equal(html, `<span class="fc-attempt" aria-hidden="true">${mark("e")}cout${SLOT}r</span>`);
    assert.ok(!html.includes("é"), "the expected letters stay hidden");
    assert.match(attemptHtml("je m'apelle marie", "Je m'appelle Marie.", STRICT), /\$|fc-diff-mark">j</);
});

// ---------------------------------------------------------------------------
// The exercise: evaluation per deck, outcomes, and their detail
// ---------------------------------------------------------------------------

test("a strict deck rejects a near miss with the hint and accepts the fix", () => {
    const deck = french({ strict: true });
    withDecks([deck], () => {
        const [q] = sessionQuestions(deck);
        const miss = exerciseSpec.evaluateAnswer(q, "ecouter");
        assert.equal(miss.correct, false);
        assert.equal(miss.feedback, "bijna! kijk nog eens naar het accent.");
        assert.match(miss.feedbackHtml, /class="fc-attempt"[^>]*><span class="fc-diff-mark">e<\/span>/);
        const fixed = exerciseSpec.evaluateAnswer(q, "écouter");
        assert.equal(fixed.correct, true);
        assert.equal(fixed.exact, true);
    });
});

test("each question follows its own deck's current checking settings", () => {
    const lenient = french();
    withDecks([lenient], () => {
        const [q] = sessionQuestions(lenient);
        assert.equal(exerciseSpec.evaluateAnswer(q, "ecouter").exact, true);
    });
    const strict = french({ strict: true });
    withDecks([strict], () => {
        const [q] = sessionQuestions(lenient);
        assert.equal(exerciseSpec.evaluateAnswer(q, "ecouter").correct, false, "a retry uses the settings of now");
    });
});

test("a strict fill-in nudges, and the fix fills the blank it was meant for", () => {
    const deck = { id: "days", name: "Jours", mode: "one-sided", cards: [{ front: "lundi" }, { front: "mercredi" }], practice: { strict: true } };
    withDecks([deck], () => {
        const questions = sessionQuestions(deck);
        const q = questions[0];
        const miss = exerciseSpec.evaluateAnswer(q, "mecredi");
        assert.equal(miss.correct, false);
        assert.equal(miss.feedback, "bijna! kijk nog eens naar de spelling.");
        const fixed = exerciseSpec.evaluateAnswer(q, "mercredi");
        assert.equal(fixed.correct, true);
        assert.equal(q.front, "mercredi");
    });
});

test("a strict multi-part card nudges per part and remembers the slip", () => {
    const deck = { id: "mp", name: "Vormen", mode: "two-sided", cards: [{ front: "luisteren", parts: ["écouter", "écoute"] }], practice: { strict: true } };
    withDecks([deck], () => {
        const [q] = sessionQuestions(deck);
        const miss = exerciseSpec.evaluateAnswer(q, "ecouter");
        assert.equal(miss.correct, false);
        assert.equal(miss.feedback, "bijna! kijk nog eens naar het accent.");
        assert.equal(exerciseSpec.evaluateAnswer(q, "écouter").partialCorrect, true);
        const done = exerciseSpec.evaluateAnswer(q, "écoute");
        assert.equal(done.correct, true);
        const outcome = { question: q, correct: true, exact: done.exact, attempts: 1, givens: ["ecouter", "écouter", "écoute"] };
        exerciseSpec.annotateOutcome(outcome);
        same(outcome.check.pairs, [{ given: "ecouter", expected: "écouter" }]);
    });
});

test("a multi-part card nearly right on an early step still comes back", () => {
    const deck = { id: "sfinx", name: "Sfinx", mode: "two-sided", cards: [{ front: "sfinx", parts: ["wachter van de zon", "half leeuw"] }] };
    withDecks([deck], () => {
        const [q] = sessionQuestions(deck);
        assert.equal(exerciseSpec.evaluateAnswer(q, "wachter zon").partialCorrect, true);
        const done = exerciseSpec.evaluateAnswer(q, "half leeuw");
        assert.equal(done.correct, true);
        assert.equal(done.practiceAgain, true, "the early near miss must send the card back");
    });
});

test("an outcome snapshots what to compare: the slip a child corrected, or the accepted near miss", () => {
    const deck = french({ strict: true });
    withDecks([deck], () => {
        const [q] = sessionQuestions(deck);
        const corrected = { question: q, correct: true, exact: true, attempts: 1, givens: ["ecouter", "écouter"] };
        exerciseSpec.annotateOutcome(corrected);
        same(corrected.check.pairs, [{ given: "ecouter", expected: "écouter" }]);
        assert.equal(corrected.check.checking.strict, true);
        const clean = { question: q, correct: true, exact: true, attempts: 0, givens: ["écouter"] };
        exerciseSpec.annotateOutcome(clean);
        same(clean.check.pairs, []);
        assert.equal(outcomeDetailHtml(clean), "");
        const wrong = { question: q, correct: false, exact: true, attempts: 3, givens: ["hond", "kat", "ecoutez"] };
        exerciseSpec.annotateOutcome(wrong);
        same(wrong.check.pairs, [{ given: "ecoutez", expected: "écouter" }]);
        const html = outcomeDetailHtml(wrong);
        assert.match(html, /fc-diff fc-diff-compact/);
        assert.match(html, /eerder: <s>hond<\/s>, <s>kat<\/s>/);
        assert.match(outcomeDetailHtml(corrected), /daarna zelf verbeterd/);
    });
});

test("an opened hint is shown, and counts as a mistake only when the deck says so", () => {
    for (const hintIsMistake of [false, true]) {
        const deck = french(hintIsMistake ? { hintIsMistake } : {});
        withDecks([deck], () => {
            const [q] = sessionQuestions(deck);
            noteHintUsed(q);
            const outcome = { question: q, correct: true, exact: true, attempts: 0, givens: ["écouter"], practiceAgain: false };
            exerciseSpec.annotateOutcome(outcome);
            assert.equal(outcome.check.hintUsed, true);
            assert.equal(outcome.practiceAgain, hintIsMistake);
            assert.equal(outcome.practiceLabel, hintIsMistake ? "hint gebruikt · opnieuw oefenen" : undefined);
            assert.match(outcomeDetailHtml(outcome), /hint gebruikt/);
            // A new session forgets the hint.
            exerciseSpec.prepareQuestion(q);
            const next = { question: q, correct: true, exact: true, attempts: 0, givens: ["écouter"] };
            exerciseSpec.annotateOutcome(next);
            assert.equal(next.check.hintUsed, undefined);
        });
    }
});

test("history saved before answers were compared still shows what was typed", () => {
    const q = { kind: "two-sided", front: "huis", back: "maison" };
    const html = outcomeDetailHtml({ question: q, correct: true, exact: false, attempts: 0, given: "maizon" });
    assert.match(html, /Jij typte “maizon”, juist is “maison”/);
    assert.equal(outcomeDetailHtml({ question: q, correct: true, exact: true, attempts: 0, given: "maison" }), "");
});
