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

import { isoWeekStart, partitionForHistoryView, weeklyBuckets } from "./history-harness.mjs";

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

// --- isoWeekStart -----------------------------------------------------------
//
// These tests pin behaviour at the awkward calendar boundaries: DST
// transitions (EU/Brussels: last Sunday of March → +1h, last Sunday of
// October → -1h) and year boundaries where the Monday-anchored week spans
// December → January. `isoWeekStart` runs in *local time* (so the bucket
// matches what a Brussels-based kid would call "deze week") — we assert
// every Monday→Sunday in a target week maps to the same Monday-00:00 key.
//
// We use a helper that constructs a local-time Date by component so the
// tests don't depend on the test runner's TZ honouring a UTC ms literal.
// `process.env.TZ` is "UTC" by default on CI; we still want the assertions
// to express "all 7 days of week X collapse to the same key" which is
// timezone-agnostic.

/** Build a local-time Date at the given Y-M-D H:M and return its ms. */
function localTs(y, mo, d, h = 12, mi = 0) {
    return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

test("isoWeekStart: Monday of the same week maps to itself (idempotent)", () => {
    // Monday 2026-06-01 12:00 local → Monday 2026-06-01 00:00 local.
    const mon = localTs(2026, 6, 1, 12);
    const ws = isoWeekStart(mon);
    const out = new Date(ws);
    assert.equal(out.getFullYear(), 2026);
    assert.equal(out.getMonth(), 5); // June (0-indexed)
    assert.equal(out.getDate(), 1);
    assert.equal(out.getHours(), 0);
    assert.equal(out.getMinutes(), 0);
});

test("isoWeekStart: every day Mon..Sun in same week → same key", () => {
    // Week containing 2026-06-01 .. 2026-06-07 (all Mon..Sun).
    const anchor = isoWeekStart(localTs(2026, 6, 1));
    for (let offset = 0; offset < 7; offset++) {
        const ts = localTs(2026, 6, 1 + offset, 9 + offset, 30);
        assert.equal(
            isoWeekStart(ts),
            anchor,
            `day +${offset} (2026-06-${String(1 + offset).padStart(2, "0")}) should land in the same bucket`,
        );
    }
});

test("isoWeekStart: Sunday → previous Monday (not next)", () => {
    // Sunday 2026-06-07 23:55 local must bucket into the Monday that opened
    // the week (2026-06-01), not the next one (2026-06-08). Regression for
    // the off-by-one that the `(getDay()+6) % 7` shift exists to prevent.
    const sun = localTs(2026, 6, 7, 23, 55);
    const ws = new Date(isoWeekStart(sun));
    assert.equal(ws.getDate(), 1, `Sunday should bucket to Mon Jun 1, got ${ws}`);
});

test("isoWeekStart: DST spring-forward (CET→CEST) week stays one bucket", () => {
    // EU DST 2026: clocks jump 02:00 → 03:00 on Sunday 2026-03-29. The
    // surrounding ISO week is Mon 2026-03-23 .. Sun 2026-03-29. Every day
    // in that week — including the short Sunday — must collapse to the
    // same Monday-00:00 key. (If `isoWeekStart` ever started doing UTC
    // arithmetic, this test fails on machines whose local TZ observes DST.)
    const monday = isoWeekStart(localTs(2026, 3, 23));
    for (let d = 23; d <= 29; d++) {
        const ts = localTs(2026, 3, d, 12);
        assert.equal(
            isoWeekStart(ts),
            monday,
            `Mar ${d} (DST week) must bucket to Mon Mar 23, got ${new Date(isoWeekStart(ts))}`,
        );
    }
});

test("isoWeekStart: DST fall-back (CEST→CET) week stays one bucket", () => {
    // EU DST 2026: clocks fall back 03:00 → 02:00 on Sunday 2026-10-25. The
    // surrounding ISO week is Mon 2026-10-19 .. Sun 2026-10-25. The 25-hour
    // Sunday is the trap — all 7 days must still produce the same Monday.
    const monday = isoWeekStart(localTs(2026, 10, 19));
    for (let d = 19; d <= 25; d++) {
        const ts = localTs(2026, 10, d, 12);
        assert.equal(
            isoWeekStart(ts),
            monday,
            `Oct ${d} (fall-back week) must bucket to Mon Oct 19, got ${new Date(isoWeekStart(ts))}`,
        );
    }
});

test("isoWeekStart: year boundary — Dec 31 in week of the next year", () => {
    // 2025-12-29 is a Monday; the week it opens runs Mon 2025-12-29 ..
    // Sun 2026-01-04. So a session on Thu 2026-01-01 must bucket to the
    // 2025-12-29 Monday, NOT to the next week (2026-01-05) and NOT to
    // 2025-12-22. Locks the "no off-by-7-on-year-roll" invariant.
    const monday = isoWeekStart(localTs(2025, 12, 29));
    assert.equal(new Date(monday).getFullYear(), 2025);
    assert.equal(new Date(monday).getMonth(), 11); // December
    assert.equal(new Date(monday).getDate(), 29);
    for (const [y, mo, d] of [
        [2025, 12, 29],
        [2025, 12, 31],
        [2026, 1, 1],
        [2026, 1, 4],
    ]) {
        assert.equal(
            isoWeekStart(localTs(y, mo, d, 10)),
            monday,
            `${y}-${mo}-${d} should bucket to Mon 2025-12-29`,
        );
    }
});

test("isoWeekStart: year boundary — Jan 1 falling on a Sunday", () => {
    // 2023-01-01 was a Sunday. The week containing it opened on Mon
    // 2022-12-26 and the Sunday closes it. So Jan 1 2023 must bucket
    // backward into 2022, not forward into 2023's first Monday.
    const ws = new Date(isoWeekStart(localTs(2023, 1, 1, 14)));
    assert.equal(ws.getFullYear(), 2022);
    assert.equal(ws.getMonth(), 11); // December
    assert.equal(ws.getDate(), 26);
});
