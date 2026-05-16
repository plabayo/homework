// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    dutchTimePhrase,
    dutchTimePhraseVariants,
    loadFields,
    minutesForStep,
    optionListHtml,
    pad,
    phraseFlipHtml,
    pickRandom,
    readFields,
    runExercise,
    shuffle,
    sizeFlip,
    wireOptions,
    wordOptionListHtml,
} from "@homework";

// Maps granularity config keys to minute step sizes.
const GRAN_STEP = { hour: 60, half: 30, quarter: 15, five: 5, one: 1 };

function buildDeck(cfg) {
    const minutes = minutesForStep(GRAN_STEP[cfg.granularity] || 5);
    const allowed = [];
    for (let h = 0; h < 12; h++) {
        for (const m of minutes) {
            allowed.push({ h, m });
        }
    }
    // Every 5-minute boundary has a Dutch phrasing (vijf over, tien voor
    // half, kwart over, …), and four of them — xx:20, xx:25, xx:35, xx:40 —
    // even have two valid variants that drive the phrase-flip widget. So
    // any time that `dutchTimePhrase` accepts is fair game for the
    // "zet de klok vanuit woorden" prompt at finer granularities.
    const wordsAllowed = allowed.filter((e) => dutchTimePhrase(e.h, e.m) !== null);

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
            granularity: cfg.granularity,
            answerMode: cfg.answerMode || "multiple",
            showNumbers: !cfg.hideNumbers,
            promptStyle:
                kind === "zet-woorden"
                    ? "words"
                    : kind === "zet" && dutchTimePhrase(entry.h, entry.m) && Math.random() < 0.35
                      ? "words"
                      : "digits",
            choiceStyle:
                kind === "lees" &&
                (cfg.answerMode || "multiple") === "multiple" &&
                dutchTimePhrase(entry.h, entry.m) &&
                Math.random() < 0.4
                    ? "words"
                    : "digits",
        });
    }
    return out;
}

function buildClockOptions(q, minStep) {
    const taken = new Set([`${q.h}:${q.m}`]);
    const out = [{ h: q.h, m: q.m }];
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
        const key = `${h}:${m}`;
        if (taken.has(key)) continue;
        taken.add(key);
        out.push({ h, m });
    }
    return shuffle(out);
}

function buildWordOptions(q, minStep) {
    const seenTimes = new Set();
    const seenLabels = new Set();
    const out = [];
    const push = (h, m) => {
        const canonical = dutchTimePhrase(h, m);
        if (!canonical) return;
        const key = `${h}:${m}`;
        if (seenTimes.has(key) || seenLabels.has(canonical)) return;
        seenTimes.add(key);
        seenLabels.add(canonical);
        const variants = dutchTimePhraseVariants(h, m);
        // Randomly pick which variant is front so the classic form isn't always first.
        const showAlt = variants.length > 1 && Math.random() < 0.5;
        const label = showAlt ? variants[1] : variants[0];
        const altLabel = variants.length > 1 ? (showAlt ? variants[0] : variants[1]) : null;
        out.push({ h, m, label, altLabel, value: JSON.stringify({ h, m }) });
    };

    push(q.h, q.m);
    buildClockOptions(q, minStep).forEach((o) => {
        push(o.h, o.m);
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
            push(o.h, o.m);
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

function clockSvg(h, m, opts) {
    const interactive = !!opts.interactive;
    const minuteAngle = (m / 60) * 360;
    const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
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
    return `
        <div class="clock${interactive ? " interactive" : ""}" data-h="${h}" data-m="${m}">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle class="face" cx="50" cy="50" r="46" />
                ${ticks.join("")}
                ${numbers.join("")}
                <line class="hand-hour" style="transform: rotate(${hourAngle}deg)"
                      x1="50" y1="50" x2="50" y2="${hourTip}" />
                <line class="hand-minute" style="transform: rotate(${minuteAngle}deg)"
                      x1="50" y1="50" x2="50" y2="${minTip}" />
                ${
                    interactive
                        ? `
                    <!-- Wider invisible hit-zones along each hand, plus a tip circle for easy grabbing.
                         They rotate alongside the visible hand so the hit area follows the visual. -->
                    <line class="hand-hit" data-hand="hour" style="transform: rotate(${hourAngle}deg)"
                          x1="50" y1="50" x2="50" y2="${hourTip}" />
                    <circle class="hand-hit-tip" data-hand="hour" style="transform: rotate(${hourAngle}deg)"
                            cx="50" cy="${hourTip}" r="8" />
                    <line class="hand-hit" data-hand="minute" style="transform: rotate(${minuteAngle}deg)"
                          x1="50" y1="50" x2="50" y2="${minTip}" />
                    <circle class="hand-hit-tip" data-hand="minute" style="transform: rotate(${minuteAngle}deg)"
                            cx="50" cy="${minTip}" r="8" />
                `
                        : ""
                }
                <circle class="pivot" cx="50" cy="50" r="2.5" />
            </svg>
        </div>
    `;
}

function attachInteractive(root, q, opts = {}) {
    const wrap = root.querySelector(".clock.interactive");
    const svg = wrap.querySelector("svg");
    const minHand = svg.querySelector(".hand-minute");
    const hourHand = svg.querySelector(".hand-hour");
    const hitMin = svg.querySelector('.hand-hit[data-hand="minute"]');
    const hitHour = svg.querySelector('.hand-hit[data-hand="hour"]');
    const tipMin = svg.querySelector('.hand-hit-tip[data-hand="minute"]');
    const tipHour = svg.querySelector('.hand-hit-tip[data-hand="hour"]');
    const minStep = GRAN_STEP[q.granularity] || 5;
    // Start at 06:00 — both hands sit on the 12/6 axis but on opposite ends,
    // so neither is hidden under the other and either can be grabbed.
    const state = { h: 6, m: 0 };

    // Cumulative (un-modded) rotation degrees. Storing the running total
    // lets us pick the next angle as the *nearest* equivalent to the last
    // one (within ±180°), so wrapping from 55 → 0 minutes rotates 30°
    // forward (330° → 360°) instead of taking the long way back through
    // every previous tick.
    const cum = { hour: 0, min: 0 };
    const rotate = (el, deg) => {
        if (el) el.style.transform = `rotate(${deg}deg)`;
    };
    // Return `target` adjusted by ±360°*k so it's within ±180° of `prev`.
    const nearestAngle = (prev, target) => {
        const delta = ((((target - prev) % 360) + 540) % 360) - 180;
        return prev + delta;
    };
    const set = (rawH, rawM) => {
        const m = (Math.round(rawM / minStep) * minStep + 60) % 60;
        const h = ((rawH % 12) + 12) % 12;
        state.h = h;
        state.m = m;
        wrap.dataset.h = h;
        wrap.dataset.m = m;
        const minuteAngle = (m / 60) * 360;
        // Hour angle includes the minute offset so the hour hand drifts
        // continuously between the numbers — a half-past-three has the
        // hour hand sitting between 3 and 4, not snapped to 3.
        const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
        cum.min = nearestAngle(cum.min, minuteAngle);
        cum.hour = nearestAngle(cum.hour, hourAngle);
        rotate(minHand, cum.min);
        rotate(hitMin, cum.min);
        rotate(tipMin, cum.min);
        rotate(hourHand, cum.hour);
        rotate(hitHour, cum.hour);
        rotate(tipHour, cum.hour);
        opts.onSet?.(state.h, state.m);
    };
    set(state.h, state.m);

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

    let dragging = null; // 'minute' or 'hour'

    const onDown = (e) => {
        e.preventDefault();
        const t = e.target;
        const hand =
            t.dataset?.hand ||
            (t.classList?.contains("hand-hour") ? "hour" : t.classList?.contains("hand-minute") ? "minute" : null);
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
            set(nh, (m + 60) % 60);
        } else {
            // dragging the hour hand: hour = round(angle / 30)
            const hourAngle = (minute / 60) * 360;
            const h = (Math.round(hourAngle / 30) + 12) % 12;
            set(h, state.m);
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
        set((state.h + 1) % 12, state.m);
    };
    const onHourDec = (e) => {
        e.preventDefault();
        set((state.h + 11) % 12, state.m);
    };
    const onMinInc = (e) => {
        e.preventDefault();
        const m = (state.m + minStep) % 60;
        const nh = m === 0 ? (state.h + 1) % 12 : state.h;
        set(nh, m);
    };
    const onMinDec = (e) => {
        e.preventDefault();
        let m = state.m - minStep;
        let nh = state.h;
        if (m < 0) {
            m += 60;
            nh = (state.h + 11) % 12;
        }
        set(nh, m);
    };
    const hourIncBtn = opts.hourIncBtn ?? root.querySelector("#hour-inc");
    const hourDecBtn = opts.hourDecBtn ?? root.querySelector("#hour-dec");
    const minIncBtn = opts.minIncBtn ?? root.querySelector("#min-inc");
    const minDecBtn = opts.minDecBtn ?? root.querySelector("#min-dec");
    hourIncBtn?.addEventListener("click", onHourInc);
    hourDecBtn?.addEventListener("click", onHourDec);
    minIncBtn?.addEventListener("click", onMinInc);
    minDecBtn?.addEventListener("click", onMinDec);

    return {
        getAnswer: () => ({ h: state.h, m: state.m }),
        cleanup() {
            svg.removeEventListener("pointerdown", onDown);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            hourIncBtn?.removeEventListener("click", onHourInc);
            hourDecBtn?.removeEventListener("click", onHourDec);
            minIncBtn?.removeEventListener("click", onMinInc);
            minDecBtn?.removeEventListener("click", onMinDec);
        },
    };
}

function timeLabel(h, m) {
    const hh = h === 0 ? 12 : h;
    return `${pad(hh)}:${pad(m)}`;
}

/** Render the exercise-feedback prompt for a "zet" or "zet-woorden" question. */
function renderZetFeedback(feedbackEl, q) {
    if (q.promptStyle !== "words") {
        feedbackEl.textContent = `zet de klok op ${timeLabel(q.h, q.m)} ⏰`;
        return;
    }
    const variants = dutchTimePhraseVariants(q.h, q.m);
    if (variants.length > 1) {
        const idx = Math.random() < 0.5 ? 0 : 1;
        feedbackEl.innerHTML = `zet de klok op "${phraseFlipHtml(variants[idx], variants[1 - idx])}" ⏰`;
        const flip = feedbackEl.querySelector(".phrase-flip");
        if (flip) sizeFlip(flip);
    } else {
        feedbackEl.textContent = `zet de klok op "${variants[0] ?? ""}" ⏰`;
    }
}

// The shared `.phrase-flip` and `.word-variant-peek` click handlers both
// live in homework.js — they're wired up globally, so this module no
// longer needs its own listener.

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

    clockDiv.innerHTML = clockSvg(6, 0, { interactive: true });

    const digitalEl = document.getElementById("freeplay-digital");
    const phraseEl = document.getElementById("freeplay-phrase");

    attachInteractive(
        clockDiv,
        { granularity: "five" },
        {
            onSet(h, m) {
                digitalEl.textContent = timeLabel(h, m);
                const variants = dutchTimePhraseVariants(h, m);
                if (variants.length > 1) {
                    const idx = Math.random() < 0.5 ? 0 : 1;
                    phraseEl.innerHTML = phraseFlipHtml(variants[idx], variants[1 - idx]);
                    const flip = phraseEl.querySelector(".phrase-flip");
                    if (flip) sizeFlip(flip);
                } else {
                    phraseEl.textContent = variants[0] ?? "";
                }
            },
            hourIncBtn: document.getElementById("freeplay-hour-inc"),
            hourDecBtn: document.getElementById("freeplay-hour-dec"),
            minIncBtn: document.getElementById("freeplay-min-inc"),
            minDecBtn: document.getElementById("freeplay-min-dec"),
        },
    );
}

mountFreeplay();

const FIELDS = [
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "granularity", type: "radio", key: "granularity", default: "five" },
    { field: "ck", type: "checkboxes", key: "kinds" },
    { field: "answer", type: "radio", key: "answerMode", default: "multiple" },
    { field: "hide-numbers", type: "checkbox", key: "hideNumbers" },
];

runExercise({
    id: "clock",
    label: "analoge klok",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return "Gelieve een geldig aantal oefeningen op te geven.";
        if (cfg.kinds.length === 0) return "Kies minstens één oefen-type.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        const minStep = GRAN_STEP[q.granularity] || 5;
        if (mode.kind === "review") {
            const fb = q.kind === "lees" ? "lees de klok 🕐" : "zet de klok ⏰";
            root.innerHTML = `
                <h3>${fb}</h3>
                ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers })}
                <p class="time-readout bad">${timeLabel(q.h, q.m)}</p>
            `;
            return;
        }
        if (q.kind === "lees") {
            document.getElementById("exercise-feedback").textContent = "lees de klok 🕐";
            if (q.answerMode === "fill") {
                // child types the time
                root.innerHTML = `
                    ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers })}
                    <div class="time-pair">
                        <input inputmode="numeric" pattern="[0-9]+" id="answer-h" min="1" max="12" placeholder="uu" required>
                        <span>:</span>
                        <input inputmode="numeric" pattern="[0-9]+" id="answer-m" min="0" max="59" step="${minStep}" placeholder="mm" required>
                    </div>
                `;
                const hh = root.querySelector("#answer-h");
                const mm = root.querySelector("#answer-m");
                return () => {
                    if (!hh.value || mm.value === "") return null;
                    let h = Number(hh.value);
                    if (h === 12) h = 0;
                    return { h, m: Number(mm.value) };
                };
            }
            // multiple-choice mode: pick the correct time from 4 plausible options
            const wordChoices = q.choiceStyle === "words" && !!dutchTimePhrase(q.h, q.m);
            const options = wordChoices
                ? buildWordOptions(q, minStep)
                : buildClockOptions(q, minStep).map((o) => ({
                      ...o,
                      label: timeLabel(o.h, o.m),
                  }));
            root.innerHTML = `
                ${clockSvg(q.h, q.m, { interactive: false, showNumbers: q.showNumbers })}
                ${wordChoices ? '<p class="clock-choice-label">welke zin past bij deze klok?</p>' : ""}
                ${
                    wordChoices
                        ? wordOptionListHtml(options)
                        : optionListHtml(
                              options,
                              (o) => o.label,
                              (o) => JSON.stringify({ h: o.h, m: o.m }),
                          )
                }
            `;
            const get = wireOptions(root);
            return () => {
                const s = get();
                return s ? JSON.parse(s) : null;
            };
        } else {
            // q.kind === 'zet' or 'zet-woorden'
            renderZetFeedback(document.getElementById("exercise-feedback"), q);
            root.innerHTML = `
                ${clockSvg(0, 0, { interactive: true, showNumbers: q.showNumbers })}
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
                </div>
            `;
            return attachInteractive(root, q);
        }
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.kind === "lees") {
            return Number(given.h) === q.h && Number(given.m) === q.m;
        }
        return given.h === q.h && given.m === q.m;
    },
    describe(q) {
        if (q.kind === "zet-woorden" || q.promptStyle === "words") {
            const phrase = dutchTimePhrase(q.h, q.m) || timeLabel(q.h, q.m);
            return `zet "${phrase}"`;
        }
        return `${q.kind === "lees" ? "lees" : "zet"} ${timeLabel(q.h, q.m)}`;
    },
});
