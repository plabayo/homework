// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    buildReviewOptionList,
    dutchTimePhrase,
    dutchTimePhraseVariants,
    escapeHtml,
    formatHHMM,
    formatHHMMSS,
    loadFields,
    makeFillValidator,
    minutesForStep,
    optionListHtml,
    parseStrictInt,
    phraseFlipHtml,
    pickRandom,
    preciseTimePhrase,
    readFields,
    runExercise,
    shuffle,
    sizeFlip,
    wireOptions,
    wordOptionListHtml,
} from "@homework";

// Maps granularity config keys to minute step sizes.
const GRAN_STEP = { hour: 60, half: 30, quarter: 15, five: 5, one: 1 };

function pickQuestionSecond(cfg) {
    if (!cfg.includeSeconds) return 0;
    return pickRandom(minutesForStep(Number(cfg.secondStep) || 5).filter((s) => s > 0));
}

function buildDeck(cfg) {
    const minutes = minutesForStep(GRAN_STEP[cfg.granularity] || 5);
    const allowed = [];
    for (let h = 0; h < 12; h++) {
        for (const m of minutes) {
            allowed.push({ h, m });
        }
    }
    // `dutchTimePhrase` now returns a spoken form for every minute (the
    // freeplay clock needs that) — but the *structured* exercises still
    // limit word-mode questions to 5-minute boundaries. Asking a kid to
    // disambiguate "drie over half acht" from "twee over half acht" in a
    // 4-way multiple-choice grid is needlessly hard; the 5-min set
    // already covers all the spoken-form vocabulary that matters
    // pedagogically.
    const isWordModeCandidate = (m) => m % 5 === 0;
    const wordsAllowed = allowed.filter((e) => isWordModeCandidate(e.m));

    const out = [];
    let bag = allowed.slice();
    shuffle(bag);
    let wordsBag = wordsAllowed.slice();
    shuffle(wordsBag);

    let safety = cfg.numExercises * 4 + 20;
    while (out.length < cfg.numExercises && safety-- > 0) {
        const kind = pickRandom(cfg.kinds.length > 0 ? cfg.kinds : ["lees", "zet"]);
        let entry;
        if (kind === "zet-woorden") {
            if (wordsBag.length === 0) wordsBag = shuffle(wordsAllowed.slice());
            if (wordsBag.length === 0) continue;
            entry = wordsBag.pop();
        } else {
            if (bag.length === 0) bag = shuffle(allowed.slice());
            entry = bag.pop();
        }
        out.push({
            kind,
            h: entry.h,
            m: entry.m,
            s: pickQuestionSecond(cfg),
            includeSeconds: !!cfg.includeSeconds,
            secondStep: Number(cfg.secondStep) || 5,
            granularity: cfg.granularity,
            answerMode: cfg.answerMode || "multiple",
            showNumbers: !cfg.hideNumbers,
            promptStyle:
                kind === "zet-woorden"
                    ? "words"
                    : kind === "zet" && isWordModeCandidate(entry.m) && Math.random() < 0.35
                      ? "words"
                      : "digits",
            choiceStyle:
                kind === "lees" &&
                (cfg.answerMode || "multiple") === "multiple" &&
                isWordModeCandidate(entry.m) &&
                Math.random() < 0.4
                    ? "words"
                    : "digits",
        });
    }
    return out;
}

function buildClockOptions(q, minStep) {
    const taken = new Set([`${q.h}:${q.m}:${q.s}`]);
    const out = [{ h: q.h, m: q.m, s: q.s }];
    const push = (h, m, s) => {
        const key = `${h}:${m}:${s}`;
        if (taken.has(key)) return;
        taken.add(key);
        out.push({ h, m, s });
    };
    if (q.includeSeconds) {
        const secondOffsets = shuffle([-2, -1, 1, 2]);
        for (const ds of secondOffsets) {
            push(q.h, q.m, (q.s + ds * (q.secondStep || 5) + 60) % 60);
            if (out.length >= 3) break;
        }
    }
    const offsets = [];
    for (let dh = -2; dh <= 2; dh++) {
        for (let dm = -3 * minStep; dm <= 3 * minStep; dm += minStep) {
            if (dh === 0 && dm === 0) continue;
            offsets.push({ dh, dm });
        }
    }
    shuffle(offsets);
    for (const { dh, dm } of offsets) {
        if (out.length >= 4) break;
        let h = (((q.h + dh) % 12) + 12) % 12;
        let m = q.m + dm;
        while (m < 0) {
            m += 60;
            h = (h + 11) % 12;
        }
        while (m >= 60) {
            m -= 60;
            h = (h + 1) % 12;
        }
        m = Math.round(m / minStep) * minStep;
        const secondOffsets = q.includeSeconds ? [-2, -1, 1, 2] : [0];
        const ds = pickRandom(secondOffsets) * (q.secondStep || 5);
        const s = q.includeSeconds ? (q.s + ds + 60) % 60 : 0;
        push(h, m, s);
    }
    return shuffle(out);
}

function buildWordOptions(q, minStep) {
    const seenTimes = new Set();
    const seenLabels = new Set();
    const out = [];
    const push = (h, m, s = 0) => {
        const canonical = q.includeSeconds ? preciseTimePhrase(h, m, s) : dutchTimePhrase(h, m);
        if (!canonical) return;
        const key = `${h}:${m}:${s}`;
        if (seenTimes.has(key) || seenLabels.has(canonical)) return;
        seenTimes.add(key);
        seenLabels.add(canonical);
        const variants = q.includeSeconds ? [canonical] : dutchTimePhraseVariants(h, m);
        // Stick to the canonical pair (variants[0] / variants[1]) so the
        // word-choice options always surface the most established two
        // wordings for the time — for m=20/25 that's the traditional
        // "voor half" / modern "over" pair; for m=5/10/15 it's the
        // standard / Flemish "na" pair.
        const showAlt = variants.length > 1 && Math.random() < 0.5;
        const label = showAlt ? variants[1] : variants[0];
        const altLabel = variants.length > 1 ? (showAlt ? variants[0] : variants[1]) : null;
        out.push({ h, m, s, label, altLabel, value: JSON.stringify({ h, m, s }) });
    };

    push(q.h, q.m, q.s);
    buildClockOptions(q, minStep).forEach((o) => {
        push(o.h, o.m, o.s);
    });

    if (out.length < 4) {
        const bag = [];
        for (let h = 0; h < 12; h++) {
            for (const m of [0, 15, 30, 45]) {
                if (h === q.h && m === q.m) continue;
                bag.push({ h, m });
            }
        }
        shuffle(bag);
        for (const o of bag) {
            push(o.h, o.m, 0);
            if (out.length >= 4) break;
        }
    }

    return shuffle(out.slice(0, 4));
}

// Hand lengths in viewBox units. Hands are drawn pointing straight up
// (12 o'clock) and rotated via CSS `transform`, so changes to the rotation
// can be smoothly tweened — the +/- buttons sweep the hand around the face
// instead of teleporting, and the hour hand drifts continuously as the
// minute hand crosses 12. transform-origin is set in CSS to the pivot.
const HAND_HOUR_LEN = 24;
const HAND_MINUTE_LEN = 36;
const HAND_SECOND_LEN = 39;

function clockSvg(h, m, opts) {
    const interactive = !!opts.interactive;
    const s = opts.s ?? 0;
    const showSeconds = !!opts.showSeconds;
    // Note: hand angles are NOT included in the markup string — see
    // `initClockHands` below.
    const num = (n) => {
        const angle = (n / 12) * 2 * Math.PI - Math.PI / 2;
        const r = 30;
        return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle), n };
    };
    const ticks = [];
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
        const major = i % 5 === 0;
        // longer minute marks: minor ticks span r=41..46 (5px), majors r=39..46 (7px)
        const r1 = major ? 39 : 41;
        const r2 = 46;
        ticks.push(
            `<line class="tick${major ? " major" : ""}" x1="${50 + r1 * Math.cos(angle)}" y1="${50 + r1 * Math.sin(angle)}" x2="${50 + r2 * Math.cos(angle)}" y2="${50 + r2 * Math.sin(angle)}" />`,
        );
    }
    const numbers = [];
    if (opts.showNumbers !== false) {
        for (let i = 1; i <= 12; i++) {
            const p = num(i);
            numbers.push(`<text class="num" x="${p.x}" y="${p.y}">${i}</text>`);
        }
    }
    const hourTip = 50 - HAND_HOUR_LEN;
    const minTip = 50 - HAND_MINUTE_LEN;
    const secondTip = 50 - HAND_SECOND_LEN;
    // Hand rotations are applied via `el.style.transform` after the
    // markup is inserted (see `initClockHands`). Doing it that way
    // instead of as `style="transform: rotate(…)"` attributes in the
    // string keeps the per-page Content-Security-Policy fully
    // hash-locked — no `'unsafe-inline'` on style-src or style-src-attr.
    return `
        <div class="clock${interactive ? " interactive" : ""}${showSeconds ? " has-seconds" : ""}" data-h="${h}" data-m="${m}" data-s="${s}">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle class="face" cx="50" cy="50" r="46" />
                ${ticks.join("")}
                ${numbers.join("")}
                <line class="hand-hour" x1="50" y1="50" x2="50" y2="${hourTip}" />
                <line class="hand-minute" x1="50" y1="50" x2="50" y2="${minTip}" />
                ${showSeconds ? `<line class="hand-second" x1="50" y1="50" x2="50" y2="${secondTip}" />` : ""}
                ${
                    interactive
                        ? `
                    <!-- Wider invisible hit-zones along each hand, plus a tip circle for easy grabbing.
                         They rotate alongside the visible hand so the hit area follows the visual. -->
                    <line class="hand-hit" data-hand="hour" x1="50" y1="50" x2="50" y2="${hourTip}" />
                    <circle class="hand-hit-tip" data-hand="hour" cx="50" cy="${hourTip}" r="8" />
                    <line class="hand-hit" data-hand="minute" x1="50" y1="50" x2="50" y2="${minTip}" />
                    <circle class="hand-hit-tip" data-hand="minute" cx="50" cy="${minTip}" r="8" />
                    ${
                        showSeconds
                            ? `<line class="hand-hit" data-hand="second" x1="50" y1="50" x2="50" y2="${secondTip}" />
                    <circle class="hand-hit-tip" data-hand="second" cx="50" cy="${secondTip}" r="8" />`
                            : ""
                    }
                `
                        : ""
                }
                <circle class="pivot" cx="50" cy="50" r="2.5" />
            </svg>
        </div>
    `;
}

/**
 * Rotate the hour/minute hands (and their interactive hit-targets) on
 * every `.clock` inside `container`. Call once after each `innerHTML`
 * assignment that contains a clockSvg() output. Reads the canonical
 * `data-h` / `data-m` attributes that `clockSvg` writes onto the `.clock`
 * div, so the angles always match the structural markup. CSS transitions
 * on freshly-inserted elements don't fire (no "before" value to animate
 * from), so the hands paint at their target angle on first frame.
 */
function initClockHands(container) {
    for (const clock of container.querySelectorAll(".clock")) {
        const h = Number(clock.dataset.h);
        const m = Number(clock.dataset.m);
        const s = Number(clock.dataset.s || 0);
        const secondAngle = (s / 60) * 360;
        const minuteProgress = (m + s / 60) / 60;
        const minuteAngle = minuteProgress * 360;
        const hourAngle = ((h % 12) / 12) * 360 + minuteProgress * 30;
        for (const el of clock.querySelectorAll(
            '.hand-hour, .hand-hit[data-hand="hour"], .hand-hit-tip[data-hand="hour"]',
        )) {
            el.style.transform = `rotate(${hourAngle}deg)`;
        }
        for (const el of clock.querySelectorAll(
            '.hand-minute, .hand-hit[data-hand="minute"], .hand-hit-tip[data-hand="minute"]',
        )) {
            el.style.transform = `rotate(${minuteAngle}deg)`;
        }
        for (const el of clock.querySelectorAll(
            '.hand-second, .hand-hit[data-hand="second"], .hand-hit-tip[data-hand="second"]',
        )) {
            el.style.transform = `rotate(${secondAngle}deg)`;
        }
    }
}

function attachInteractive(root, q, opts = {}) {
    const wrap = root.querySelector(".clock.interactive");
    const svg = wrap.querySelector("svg");
    const minHand = svg.querySelector(".hand-minute");
    const hourHand = svg.querySelector(".hand-hour");
    const secHand = svg.querySelector(".hand-second");
    const hitMin = svg.querySelector('.hand-hit[data-hand="minute"]');
    const hitHour = svg.querySelector('.hand-hit[data-hand="hour"]');
    const hitSec = svg.querySelector('.hand-hit[data-hand="second"]');
    const tipMin = svg.querySelector('.hand-hit-tip[data-hand="minute"]');
    const tipHour = svg.querySelector('.hand-hit-tip[data-hand="hour"]');
    const tipSec = svg.querySelector('.hand-hit-tip[data-hand="second"]');
    const minStep = GRAN_STEP[q.granularity] || 5;
    const secondStep = Number(q.secondStep) || 5;
    // Start at 06:00 — both hands sit on the 12/6 axis but on opposite ends,
    // so neither is hidden under the other and either can be grabbed.
    const state = { h: 6, m: 0, s: 0 };

    // Cumulative (un-modded) rotation degrees. Storing the running total
    // lets us pick the next angle as the *nearest* equivalent to the last
    // one (within ±180°), so wrapping from 55 → 0 minutes rotates 30°
    // forward (330° → 360°) instead of taking the long way back through
    // every previous tick.
    const cum = { hour: 0, min: 0, sec: 0 };
    const rotate = (el, deg) => {
        if (el) el.style.transform = `rotate(${deg}deg)`;
    };
    // Return `target` adjusted by ±360°*k so it's within ±180° of `prev`.
    const nearestAngle = (prev, target) => {
        const delta = ((((target - prev) % 360) + 540) % 360) - 180;
        return prev + delta;
    };
    const set = (rawH, rawM, rawS = state.s, snapMinute = true) => {
        const m = snapMinute ? (Math.round(rawM / minStep) * minStep + 60) % 60 : ((Math.round(rawM) % 60) + 60) % 60;
        const h = ((rawH % 12) + 12) % 12;
        const s = q.includeSeconds ? (Math.round(rawS / secondStep) * secondStep + 60) % 60 : 0;
        state.h = h;
        state.m = m;
        state.s = s;
        wrap.dataset.h = h;
        wrap.dataset.m = m;
        wrap.dataset.s = s;
        const secondAngle = (s / 60) * 360;
        const minuteProgress = (m + s / 60) / 60;
        const minuteAngle = minuteProgress * 360;
        // Hour angle includes the minute offset so the hour hand drifts
        // continuously between the numbers — a half-past-three has the
        // hour hand sitting between 3 and 4, not snapped to 3.
        const hourAngle = ((h % 12) / 12) * 360 + minuteProgress * 30;
        cum.min = nearestAngle(cum.min, minuteAngle);
        cum.hour = nearestAngle(cum.hour, hourAngle);
        cum.sec = nearestAngle(cum.sec, secondAngle);
        rotate(minHand, cum.min);
        rotate(hitMin, cum.min);
        rotate(tipMin, cum.min);
        rotate(hourHand, cum.hour);
        rotate(hitHour, cum.hour);
        rotate(tipHour, cum.hour);
        rotate(secHand, cum.sec);
        rotate(hitSec, cum.sec);
        rotate(tipSec, cum.sec);
        opts.onSet?.(state.h, state.m, state.s);
    };
    const shiftMinute = (delta) => {
        let h = state.h;
        let m = state.m + delta;
        if (m >= 60) {
            m -= 60;
            h = (h + 1) % 12;
        } else if (m < 0) {
            m += 60;
            h = (h + 11) % 12;
        }
        return { h, m };
    };
    const shiftSeconds = (delta) => {
        let { h, m } = state;
        let s = state.s + delta;
        if (s >= 60) {
            s -= 60;
            ({ h, m } = shiftMinute(1));
        } else if (s < 0) {
            s += 60;
            ({ h, m } = shiftMinute(-1));
        }
        set(h, m, s, false);
    };
    set(state.h, state.m, state.s);

    const pointToTime = (clientX, clientY) => {
        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        if (angle < 0) angle += 360;
        const minute = (angle / 360) * 60;
        return minute;
    };

    let dragging = null; // 'minute', 'hour', or 'second'

    const onDown = (e) => {
        e.preventDefault();
        const t = e.target;
        const hand =
            t.dataset?.hand ||
            (t.classList?.contains("hand-hour")
                ? "hour"
                : t.classList?.contains("hand-minute")
                  ? "minute"
                  : t.classList?.contains("hand-second")
                    ? "second"
                    : null);
        if (!hand) return;
        dragging = hand;
        // Disable the sweep transition while the user is actively dragging
        // — they want the hand under their finger right now, not 300ms
        // behind. The transition kicks back in for button presses.
        wrap.classList.add("dragging");
        onMove(e);
    };
    const onMove = (e) => {
        if (!dragging) return;
        const x = e.clientX ?? e.touches?.[0]?.clientX;
        const y = e.clientY ?? e.touches?.[0]?.clientY;
        if (x === undefined) return;
        const minute = pointToTime(x, y);
        if (dragging === "minute") {
            const m = Math.round(minute / minStep) * minStep;
            // adjust hour if minute wrapped
            let nh = state.h;
            const prevQuad = Math.floor(state.m / 15);
            const newQuad = Math.floor(((m + 60) % 60) / 15);
            if (prevQuad === 3 && newQuad === 0) nh = (state.h + 1) % 12;
            else if (prevQuad === 0 && newQuad === 3) nh = (state.h + 11) % 12;
            set(nh, (m + 60) % 60, state.s);
        } else if (dragging === "hour") {
            // dragging the hour hand: hour = round(angle / 30)
            const hourAngle = (minute / 60) * 360;
            const h = (Math.round(hourAngle / 30) + 12) % 12;
            set(h, state.m, state.s);
        } else {
            const s = (Math.round(minute / secondStep) * secondStep + 60) % 60;
            const prevQuad = Math.floor(state.s / 15);
            const newQuad = Math.floor(s / 15);
            let { h, m } = state;
            if (prevQuad === 3 && newQuad === 0) ({ h, m } = shiftMinute(1));
            else if (prevQuad === 0 && newQuad === 3) ({ h, m } = shiftMinute(-1));
            set(h, m, s, false);
        }
    };
    const onUp = () => {
        dragging = null;
        wrap.classList.remove("dragging");
    };

    svg.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // increment/decrement helpers
    const onHourInc = (e) => {
        e.preventDefault();
        set((state.h + 1) % 12, state.m, state.s);
    };
    const onHourDec = (e) => {
        e.preventDefault();
        set((state.h + 11) % 12, state.m, state.s);
    };
    const onMinInc = (e) => {
        e.preventDefault();
        const m = (state.m + minStep) % 60;
        const nh = m === 0 ? (state.h + 1) % 12 : state.h;
        set(nh, m, state.s);
    };
    const onMinDec = (e) => {
        e.preventDefault();
        let m = state.m - minStep;
        let nh = state.h;
        if (m < 0) {
            m += 60;
            nh = (state.h + 11) % 12;
        }
        set(nh, m, state.s);
    };
    const onSecInc = (e) => {
        e.preventDefault();
        shiftSeconds(secondStep);
    };
    const onSecDec = (e) => {
        e.preventDefault();
        shiftSeconds(-secondStep);
    };
    const hourIncBtn = opts.hourIncBtn ?? root.querySelector("#hour-inc");
    const hourDecBtn = opts.hourDecBtn ?? root.querySelector("#hour-dec");
    const minIncBtn = opts.minIncBtn ?? root.querySelector("#min-inc");
    const minDecBtn = opts.minDecBtn ?? root.querySelector("#min-dec");
    const secIncBtn = opts.secIncBtn ?? root.querySelector("#sec-inc");
    const secDecBtn = opts.secDecBtn ?? root.querySelector("#sec-dec");
    hourIncBtn?.addEventListener("click", onHourInc);
    hourDecBtn?.addEventListener("click", onHourDec);
    minIncBtn?.addEventListener("click", onMinInc);
    minDecBtn?.addEventListener("click", onMinDec);
    secIncBtn?.addEventListener("click", onSecInc);
    secDecBtn?.addEventListener("click", onSecDec);

    return {
        getAnswer: () => ({ h: state.h, m: state.m, s: state.s }),
        setSecondsVisible(visible) {
            q.includeSeconds = visible;
            wrap.classList.toggle("seconds-hidden", !visible);
            set(state.h, state.m, visible ? state.s : 0);
        },
        cleanup() {
            svg.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            hourIncBtn?.removeEventListener("click", onHourInc);
            hourDecBtn?.removeEventListener("click", onHourDec);
            minIncBtn?.removeEventListener("click", onMinInc);
            minDecBtn?.removeEventListener("click", onMinDec);
            secIncBtn?.removeEventListener("click", onSecInc);
            secDecBtn?.removeEventListener("click", onSecDec);
        },
    };
}

// Always render in 12-hour mode here — the analog face has no AM/PM, so the
// digital twin shown alongside it follows the same convention.
const timeLabel = (h, m, s = 0, includeSeconds = false) => (includeSeconds ? formatHHMMSS(h, m, s) : formatHHMM(h, m));
const phraseFor = (q, h = q.h, m = q.m, s = q.s) =>
    q.includeSeconds ? preciseTimePhrase(h, m, s) : dutchTimePhrase(h, m);

/** Render the exercise-feedback prompt for a "zet" or "zet-woorden" question. */
function renderZetFeedback(feedbackEl, q) {
    if (q.promptStyle !== "words") {
        feedbackEl.textContent = `zet de klok op ${timeLabel(q.h, q.m, q.s, q.includeSeconds)}`;
        return;
    }
    if (q.includeSeconds) {
        feedbackEl.textContent = `zet de klok op "${phraseFor(q)}"`;
        return;
    }
    const variants = dutchTimePhraseVariants(q.h, q.m);
    if (variants.length > 1) {
        // The flip widget surfaces the canonical pair (variants[0]/[1]).
        // For m=5/10/15 that's the Flemish "na" alternative; for m=20/25 it
        // stays the traditional "voor half" ↔ modern "over" pair the kids
        // most need to see side-by-side.
        const idx = Math.random() < 0.5 ? 0 : 1;
        feedbackEl.innerHTML = `zet de klok op "${phraseFlipHtml(variants[idx], variants[1 - idx])}"`;
        const flip = feedbackEl.querySelector(".phrase-flip");
        if (flip) sizeFlip(flip);
    } else {
        feedbackEl.textContent = `zet de klok op "${variants[0] ?? ""}"`;
    }
}

// The shared `.phrase-flip` and `.word-variant-peek` click handlers both
// live in homework.js — they're wired up globally, so this module no
// longer needs its own listener.

function renderClockReview(q, root, mode) {
    const phrase = phraseFor(q);
    if (q.kind === "lees") {
        const wordChoices = q.choiceStyle === "words" && !!phrase;
        let answerHtml;
        if (q._reviewOpts && q.answerMode === "multiple") {
            const givenObj = mode.given;
            answerHtml = buildReviewOptionList(
                q._reviewOpts,
                (o) => o.h === q.h && o.m === q.m && o.s === q.s,
                (o) =>
                    !!givenObj &&
                    o.h === Number(givenObj.h) &&
                    o.m === Number(givenObj.m) &&
                    o.s === Number(givenObj.s || 0),
            );
        } else {
            const answer = wordChoices ? phrase : timeLabel(q.h, q.m, q.s, q.includeSeconds);
            answerHtml = `<p class="time-readout bad">${escapeHtml(answer)}</p>`;
        }
        root.innerHTML = `
            ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers, showSeconds: q.includeSeconds, s: q.s })}
            ${wordChoices && q._reviewOpts ? '<p class="clock-choice-label">welke zin past bij deze klok?</p>' : ""}
            ${answerHtml}
        `;
        initClockHands(root);
    } else {
        const promptHtml = q.promptStyle === "words" && phrase ? `<p class="clock-choice-label">${phrase}</p>` : "";
        root.innerHTML = `
            ${promptHtml}
            ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers, showSeconds: q.includeSeconds, s: q.s })}
            <p class="time-readout bad">${timeLabel(q.h, q.m, q.s, q.includeSeconds)}</p>
        `;
        initClockHands(root);
    }
}

function renderClockLees(q, root, minStep) {
    document.getElementById("exercise-feedback").textContent = "lees de klok";
    if (q.answerMode === "fill") {
        root.innerHTML = `
            ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers, showSeconds: q.includeSeconds, s: q.s })}
            <div class="time-pair">
                <input inputmode="numeric" pattern="[0-9]+" id="answer-h" min="1" max="12" placeholder="uu" required aria-label="uur">
                <span>:</span>
                <input inputmode="numeric" pattern="[0-9]+" id="answer-m" min="0" max="59" step="${minStep}" placeholder="mm" required aria-label="minuten">
                ${
                    q.includeSeconds
                        ? `<span>:</span><input inputmode="numeric" pattern="[0-9]+" id="answer-s" min="0" max="59" step="${q.secondStep}" placeholder="ss" required aria-label="seconden">`
                        : ""
                }
            </div>
        `;
        initClockHands(root);
        const hh = root.querySelector("#answer-h");
        const mm = root.querySelector("#answer-m");
        const ss = root.querySelector("#answer-s");
        // Shared validator handles range validation, aria-describedby wiring,
        // invalid-state styling, and the clear-on-input listeners — same
        // accessible treatment digital_clock.js's fill mode gets. The analog
        // clock has no AM/PM, so we always run in 12-hour mode.
        return makeFillValidator({
            hourInput: hh,
            minuteInput: mm,
            secondInput: ss,
            use24h: false,
            feedbackEl: document.getElementById("exercise-feedback"),
        });
    }
    const wordChoices = q.choiceStyle === "words" && !!phraseFor(q);
    const options = wordChoices
        ? buildWordOptions(q, minStep)
        : buildClockOptions(q, minStep).map((o) => ({
              ...o,
              label: timeLabel(o.h, o.m, o.s, q.includeSeconds),
          }));
    q._reviewOpts = options.map((o) => ({ label: o.label, h: o.h, m: o.m, s: o.s }));
    root.innerHTML = `
        ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers, showSeconds: q.includeSeconds, s: q.s })}
        ${wordChoices ? '<p class="clock-choice-label">welke zin past bij deze klok?</p>' : ""}
        ${
            wordChoices
                ? wordOptionListHtml(options)
                : optionListHtml(
                      options,
                      (o) => o.label,
                      (o) => JSON.stringify({ h: o.h, m: o.m, s: o.s }),
                  )
        }
    `;
    initClockHands(root);
    const get = wireOptions(root);
    return () => {
        const s = get();
        if (!s) return null;
        try {
            return JSON.parse(s);
        } catch {
            return null;
        }
    };
}

function mountFreeplay() {
    const clockDiv = document.getElementById("freeplay-clock");
    if (!clockDiv) return;

    const pageSetup = document.getElementById("page-setup");
    const pageFreeplay = document.getElementById("page-freeplay");
    const openBtn = document.getElementById("freeplay-open");
    const backBtn = document.getElementById("freeplay-back");

    openBtn?.addEventListener("click", () => {
        pageSetup.hidden = true;
        pageFreeplay.hidden = false;
    });
    backBtn?.addEventListener("click", () => {
        pageFreeplay.hidden = true;
        pageSetup.hidden = false;
    });

    clockDiv.innerHTML = clockSvg(6, 0, { interactive: true, showSeconds: true, s: 0 });
    initClockHands(clockDiv);
    const clock = clockDiv.querySelector(".clock");
    clock.classList.add("seconds-hidden");

    const digitalEl = document.getElementById("freeplay-digital");
    const phraseEl = document.getElementById("freeplay-phrase");

    // Debounce phrase updates so rapid ± clicks (or fast drags) don't
    // strobe through 60 word swaps per second — meaningful both as a UX
    // smoothing AND as a photosensitivity safeguard. The digital readout
    // still updates instantly for tactile feedback; only the spoken
    // phrase waits for the kid to settle.
    let phraseTimer = null;
    const PHRASE_DEBOUNCE_MS = 180;
    let showSeconds = false;
    const renderPhrase = (h, m, s) => {
        if (showSeconds) {
            phraseEl.textContent = preciseTimePhrase(h, m, s);
            return;
        }
        const variants = dutchTimePhraseVariants(h, m);
        if (variants.length > 1) {
            // Keep the deterministic canonical pair (variants[0] ↔
            // variants[1]) so the flip widget always shows the two
            // most-established wordings for the current time.
            const idx = Math.random() < 0.5 ? 0 : 1;
            phraseEl.innerHTML = phraseFlipHtml(variants[idx], variants[1 - idx]);
            const flip = phraseEl.querySelector(".phrase-flip");
            if (flip) sizeFlip(flip);
        } else {
            phraseEl.textContent = variants[0] ?? "";
        }
    };

    const interactive = attachInteractive(
        clockDiv,
        // Free-mode runs at 1-minute precision: drag snaps to the nearest
        // whole minute and the ± buttons step by 1. Coarser granularities
        // are useful in the structured exercise modes (where they shape
        // the problem space) but unhelpful when a parent wants to point
        // at "13 over 7" while teaching.
        { granularity: "one", includeSeconds: true, secondStep: 1 },
        {
            onSet(h, m, s) {
                digitalEl.textContent = timeLabel(h, m, s, showSeconds);
                phraseEl.classList.add("is-updating");
                if (phraseTimer !== null) clearTimeout(phraseTimer);
                phraseTimer = setTimeout(() => {
                    phraseTimer = null;
                    renderPhrase(h, m, s);
                    phraseEl.classList.remove("is-updating");
                }, PHRASE_DEBOUNCE_MS);
            },
            hourIncBtn: document.getElementById("freeplay-hour-inc"),
            hourDecBtn: document.getElementById("freeplay-hour-dec"),
            minIncBtn: document.getElementById("freeplay-min-inc"),
            minDecBtn: document.getElementById("freeplay-min-dec"),
            secIncBtn: document.getElementById("freeplay-sec-inc"),
            secDecBtn: document.getElementById("freeplay-sec-dec"),
        },
    );
    const secondsToggle = document.getElementById("freeplay-seconds");
    const secondsControls = document.getElementById("freeplay-second-controls");
    secondsToggle?.addEventListener("change", () => {
        showSeconds = secondsToggle.checked;
        secondsControls.hidden = !showSeconds;
        interactive.setSecondsVisible(showSeconds);
    });
}

mountFreeplay();

const FIELDS = [
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "granularity", type: "radio", key: "granularity", default: "five" },
    { field: "ck", type: "checkboxes", key: "kinds" },
    { field: "answer", type: "radio", key: "answerMode", default: "multiple" },
    { field: "hide-numbers", type: "checkbox", key: "hideNumbers" },
    { field: "include-seconds", type: "checkbox", key: "includeSeconds" },
    { field: "second-step", type: "radio", key: "secondStep", default: "5" },
];

const setupForm = document.getElementById("form-setup");
const secondOptions = document.getElementById("second-options");
function syncSecondOptions(form = setupForm) {
    if (!form || !secondOptions) return;
    secondOptions.hidden = !form.elements["include-seconds"]?.checked;
}
setupForm?.elements["include-seconds"]?.addEventListener("change", () => syncSecondOptions());

runExercise({
    id: "clock",
    label: "analoge klok",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        syncSecondOptions(form);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (cfg.kinds.length === 0) return "Kies minstens één soort oefening.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        const minStep = GRAN_STEP[q.granularity] || 5;
        if (mode.kind === "review") {
            renderClockReview(q, root, mode);
            return;
        }
        if (q.kind === "lees") {
            return renderClockLees(q, root, minStep);
        }
        // q.kind === 'zet' or 'zet-woorden'
        renderZetFeedback(document.getElementById("exercise-feedback"), q);
        root.innerHTML = `
            ${clockSvg(0, 0, { interactive: true, showNumbers: q.showNumbers, showSeconds: q.includeSeconds, s: 0 })}
            <div class="clock-controls">
                <div class="clock-control-row">
                    <span class="label">uur</span>
                    <div class="button-pair">
                        <button type="button" class="default-button" id="hour-dec">➖</button>
                        <button type="button" class="default-button" id="hour-inc">➕</button>
                    </div>
                </div>
                ${
                    minStep < 60
                        ? `
                    <div class="clock-control-row">
                        <span class="label">minuut</span>
                        <div class="button-pair">
                            <button type="button" class="default-button" id="min-dec">➖</button>
                            <button type="button" class="default-button" id="min-inc">➕</button>
                        </div>
                    </div>
                `
                        : ""
                }
                ${
                    q.includeSeconds
                        ? `
                    <div class="clock-control-row">
                        <span class="label">seconde</span>
                        <div class="button-pair">
                            <button type="button" class="default-button" id="sec-dec">➖</button>
                            <button type="button" class="default-button" id="sec-inc">➕</button>
                        </div>
                    </div>
                `
                        : ""
                }
            </div>
        `;
        return attachInteractive(root, q);
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.kind === "lees") {
            const h = parseStrictInt(given.h);
            const m = parseStrictInt(given.m);
            const s = parseStrictInt(given.s ?? 0);
            return h !== null && m !== null && s !== null && h === q.h && m === q.m && s === q.s;
        }
        return given.h === q.h && given.m === q.m && given.s === q.s;
    },
    describe(q) {
        if (q.kind === "zet-woorden" || q.promptStyle === "words") {
            const phrase = phraseFor(q) || timeLabel(q.h, q.m, q.s, q.includeSeconds);
            return `zet "${phrase}"`;
        }
        return `${q.kind === "lees" ? "lees" : "zet"} ${timeLabel(q.h, q.m, q.s, q.includeSeconds)}`;
    },
});
