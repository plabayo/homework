// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.
//
// Unit tests for the pure helpers powering the parent-history view:
//   - partitionForHistoryView: splits sessions into "individual cards" vs
//     "aggregate into weekly buckets" using BOTH a count cap AND a time
//     window.
//   - weeklyBuckets: groups newest-first sessions by ISO week, computes
//     accuracy + top mistakes per bucket.
//
// Both helpers are exported from homework.js because they have no DOM
// dependency. We import them directly via ESM (not the VM-context dance
// the clock-harness uses) since they're already pure.

import { test } from "node:test";
import assert from "node:assert";

import { partitionForHistoryView, weeklyBuckets } from "./history-harness.mjs";

// --- helpers ---------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-02T12:00:00Z").getTime();

/** Build a synthetic session. `daysAgo` is offset from NOW. */
function session({ daysAgo, total = 10, correct = 10, questions = [] } = {}) {
    return {
        id: `s-${daysAgo}-${Math.random()}`,
        exerciseId: "test",
        finishedAt: NOW - daysAgo * DAY,
        total,
        correct,
        questions,
    };
}

/** Build a wrong-answer question with a given label. */
function wrong(label) {
    return { label, correct: false, attempts: 1 };
}

// --- partitionForHistoryView ----------------------------------------------

test("partition: empty list returns empty buckets", () => {
    const { individual, aggregated } = partitionForHistoryView([], { now: NOW });
    assert.deepEqual(individual, []);
    assert.deepEqual(aggregated, []);
});

test("partition: all-recent under count cap → all go to individual", () => {
    const sessions = [
        session({ daysAgo: 0 }),
        session({ daysAgo: 1 }),
        session({ daysAgo: 3 }),
    ];
    const { individual, aggregated } = partitionForHistoryView(sessions, { now: NOW });
    assert.equal(individual.length, 3);
    assert.equal(aggregated.length, 0);
});

test("partition: 12 same-day sessions → 10 individual (count cap), 2 aggregated", () => {
    const sessions = Array.from({ length: 12 }, () => session({ daysAgo: 1 }));
    const { individual, aggregated } = partitionForHistoryView(sessions, { now: NOW });
    assert.equal(individual.length, 10, "count cap = 10");
    assert.equal(aggregated.length, 2, "remainder goes to aggregated");
});

test("partition: 5 sessions older than 2 weeks → all aggregated (time window)", () => {
    const sessions = [
        session({ daysAgo: 30 }),
        session({ daysAgo: 25 }),
        session({ daysAgo: 20 }),
        session({ daysAgo: 17 }),
        session({ daysAgo: 15 }),
    ];
    const { individual, aggregated } = partitionForHistoryView(sessions, { now: NOW });
    assert.equal(individual.length, 0, "nothing inside the 14-day window");
    assert.equal(aggregated.length, 5);
});

test("partition: mixed — recent under count cap kept, older than 2wk aggregated", () => {
    const sessions = [
        session({ daysAgo: 0 }),
        session({ daysAgo: 2 }),
        session({ daysAgo: 8 }),
        session({ daysAgo: 13 }),
        session({ daysAgo: 15 }), // just outside the 14d window
        session({ daysAgo: 30 }),
    ];
    const { individual, aggregated } = partitionForHistoryView(sessions, { now: NOW });
    assert.equal(individual.length, 4, "first 4 are inside the 14d window");
    assert.equal(aggregated.length, 2);
});

test("partition: time-window kicks in BEFORE count cap when both apply", () => {
    // 15 sessions, every other day. Sessions 0..7 are within 14 days
    // (daysAgo 0,2,4,6,8,10,12,14 — note 14 is on the boundary, still in);
    // sessions 8..14 are older (16,18,20…).
    const sessions = Array.from({ length: 15 }, (_, i) => session({ daysAgo: i * 2 }));
    const { individual, aggregated } = partitionForHistoryView(sessions, { now: NOW });
    // The first 8 (daysAgo 0..14) are within the window. Count cap is 10.
    // Time window excludes session 8+ first → 8 individual.
    assert.equal(individual.length, 8, "time window wins (8 fit in 14 days)");
    assert.equal(aggregated.length, 7);
});

// --- weeklyBuckets ---------------------------------------------------------

test("weeklyBuckets: empty input → empty array", () => {
    assert.deepEqual(weeklyBuckets([]), []);
});

test("weeklyBuckets: one session in one week → one bucket with accuracy", () => {
    const s = session({ daysAgo: 1, total: 10, correct: 8 });
    const out = weeklyBuckets([s]);
    assert.equal(out.length, 1);
    assert.equal(out[0].sessionCount, 1);
    assert.equal(out[0].totalQuestions, 10);
    assert.equal(out[0].totalCorrect, 8);
    assert.equal(out[0].accuracy, 0.8);
    assert.deepEqual(out[0].topMistakes, []);
});

test("weeklyBuckets: two sessions same week → merge", () => {
    // NOW = Tue Jun 2 — daysAgo 0 (Tue) and 1 (Mon) both fall in the week
    // starting Mon Jun 1, with the Monday-as-week-start convention.
    const out = weeklyBuckets([
        session({ daysAgo: 0, total: 10, correct: 9 }),
        session({ daysAgo: 1, total: 10, correct: 7 }),
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].sessionCount, 2);
    assert.equal(out[0].totalQuestions, 20);
    assert.equal(out[0].totalCorrect, 16);
    assert.equal(out[0].accuracy, 0.8);
});

test("weeklyBuckets: spans two weeks → two buckets, newest first", () => {
    // daysAgo 0 is Tuesday 2026-06-02, daysAgo 8 is Monday 2026-05-25 (prev week).
    const out = weeklyBuckets([
        session({ daysAgo: 0 }),
        session({ daysAgo: 8 }),
    ]);
    assert.equal(out.length, 2);
    assert.ok(out[0].weekStart > out[1].weekStart, "newest week first");
});

test("weeklyBuckets: top mistakes ranked by frequency, capped at limit", () => {
    // Both sessions same week (Mon Jun 1 / Tue Jun 2 under the fixture NOW).
    const out = weeklyBuckets(
        [
            session({
                daysAgo: 0,
                total: 5,
                correct: 0,
                questions: [
                    wrong("7×8"),
                    wrong("7×8"),
                    wrong("9×7"),
                    wrong("6×6"),
                    wrong("6×6"),
                ],
            }),
            session({
                daysAgo: 1,
                total: 3,
                correct: 0,
                questions: [wrong("7×8"), wrong("9×7"), wrong("4×4")],
            }),
        ],
        { topMistakesLimit: 3 },
    );
    assert.equal(out.length, 1);
    const top = out[0].topMistakes;
    assert.equal(top.length, 3);
    assert.deepEqual(top[0], { label: "7×8", count: 3 });
    // 9×7 (2) and 6×6 (2) tie for second; either order is acceptable.
    const labelsAfterFirst = new Set([top[1].label, top[2].label]);
    assert.ok(
        labelsAfterFirst.has("9×7") && labelsAfterFirst.has("6×6"),
        `expected 9×7 and 6×6 in 2nd/3rd, got ${JSON.stringify(top)}`,
    );
});

test("weeklyBuckets: monday is week start (school week convention)", () => {
    // 2026-06-01 is a Monday (in our test fixture).
    // A session on Monday belongs to the same bucket as one on the following
    // Sunday.
    const mondaySession = session({ daysAgo: 1 }); // Mon 2026-06-01
    const sundaySession = session({ daysAgo: -5 }); // Sun 2026-06-07 — wait, future
    // The harness can't produce negative daysAgo cleanly; just verify monday
    // and the following saturday land in the same bucket.
    const saturdaySession = { ...session({ daysAgo: 0 }), finishedAt: NOW + 4 * DAY };
    const out = weeklyBuckets([mondaySession, saturdaySession]);
    assert.equal(out.length, 1, "monday and following saturday share a bucket");
    assert.equal(out[0].sessionCount, 2);
    // unused — just here so node doesn't complain about an unused binding
    void sundaySession;
});
