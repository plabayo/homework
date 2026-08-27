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
    normalizePhrase,
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

/**
 * Build the HTML for the prompt phrase shown to the child in the
 * "words → digital" direction. When the time has two Dutch variants
 * (`tien voor half ...` ↔ `twintig over ...`, etc.) we render the
 * phrase-flip widget so the child can peek at the alternate wording —
 * same affordance as the analog-clock exercise. Otherwise plain text.
 */
function promptPhraseHtml(q, correctPhrase) {
    if (q.includeSeconds) return correctPhrase;
    const variants = dutchTimePhraseVariants(q.h, q.m);
    // pickRandom (not .find) so the third variant — typically the Flemish
    // "na" form — is reachable in the flip widget instead of being stuck
    // behind the first non-matching wording.
    const others = variants.filter((v) => v !== correctPhrase);
    const alt = others.length > 0 ? pickRandom(others) : null;
    return alt ? phraseFlipHtml(correctPhrase, alt) : correctPhrase;
}

/** After the prompt is mounted in the DOM, measure both phrase-flip faces. */
function sizeQuestionFlip(root) {
    const flip = root.querySelector(".phrase-flip");
    if (flip) sizeFlip(flip);
}

// Dutch time expression utilities. Covers every 5-minute step that has a
// standard Flemish/Dutch idiom:
//
//   :00  X uur          :30  half (X+1)
//   :05  vijf over X    :35  vijf over half (X+1)
//   :10  tien over X    :40  tien over half (X+1)
//   :15  kwart over X   :45  kwart voor (X+1)
//   :20  tien voor half :50  tien voor (X+1)
//   :25  vijf voor half :55  vijf voor (X+1)

// Keep the positional clock-label arguments readable at call sites while
// selecting HH:MM or HH:MM:SS centrally.
const digitalLabel = (h, m, s, use24h, includeSeconds) =>
    includeSeconds ? formatHHMMSS(h, m, s, { use24h }) : formatHHMM(h, m, { use24h });

// Maps granularity config keys to minute step sizes.
const GRAN_STEP = { uur: 60, half: 30, kwart: 15, vijf: 5 };

function minutesForGranularity(granularity) {
    return minutesForStep(GRAN_STEP[granularity] || 15);
}

function buildDeck(cfg) {
    const minutes = minutesForGranularity(cfg.granularity);
    const hourMax = cfg.use24h ? 24 : 12;
    const candidates = [];
    for (let h = 0; h < hourMax; h++) {
        for (const m of minutes) candidates.push({ h, m });
    }
    shuffle(candidates);
    const slice = candidates.slice(0, cfg.numExercises);
    return slice.map(({ h, m }) => {
        const s = cfg.includeSeconds
            ? pickRandom(minutesForStep(Number(cfg.secondStep) || 5).filter((value) => value > 0))
            : 0;
        return {
            // direction: 'digital-to-words' or 'words-to-digital'
            dir: pickRandom(cfg.directions),
            answerMode: cfg.answerMode || "multiple",
            use24h: !!cfg.use24h,
            granularity: cfg.granularity,
            h,
            m,
            s,
            includeSeconds: !!cfg.includeSeconds,
            secondStep: Number(cfg.secondStep) || 5,
            phraseVariant: cfg.includeSeconds
                ? preciseTimePhrase(h, m, s, { use24h: !!cfg.use24h })
                : pickRandom(dutchTimePhraseVariants(h, m)) || dutchTimePhrase(h, m),
        };
    });
}

function buildDistractors(q, n) {
    // Plausible wrong options. We keep distractors in the same half-day as
    // the question (AM or PM in 24h mode) so a 14:30 question doesn't get
    // a 02:30 sibling shown — that's not a "wrong answer" since it's the
    // same Dutch phrase; it would just confuse the kid.
    const minutes = minutesForGranularity(q.granularity);
    const hourMax = q.use24h ? 24 : 12;
    const hourBase = q.use24h && q.h >= 12 ? 12 : 0;
    const wrap = (h) => (q.use24h ? ((((h - hourBase) % 12) + 12) % 12) + hourBase : ((h % 12) + 12) % 12);
    const taken = new Set();
    const keyOf = (h, m, s) => (q.includeSeconds ? `${h % 12}:${m}:${s}` : `${h % 12}:${m}`);
    taken.add(keyOf(q.h, q.m, q.s)); // exclude same-phrase too
    const variants = [];
    const seconds = q.includeSeconds ? minutesForStep(q.secondStep || 5).filter((s) => s > 0) : [0];
    for (let dh = -3; dh <= 3; dh++) {
        for (const m of minutes) {
            const h = wrap(q.h + dh);
            if (h >= hourMax) continue;
            for (const s of seconds) variants.push({ h, m, s });
        }
    }
    shuffle(variants);
    const out = [];
    if (q.includeSeconds) {
        for (const s of shuffle(seconds.filter((s) => s !== q.s))) {
            const key = keyOf(q.h, q.m, s);
            if (taken.has(key)) continue;
            taken.add(key);
            out.push({ h: q.h, m: q.m, s });
            if (out.length >= Math.min(2, n)) break;
        }
    }
    for (const v of variants) {
        const key = keyOf(v.h, v.m, v.s);
        if (taken.has(key)) continue;
        taken.add(key);
        out.push(v);
        if (out.length >= n) break;
    }
    return out;
}

function renderDigitalClockReview(q, root, mode) {
    const dt = digitalLabel(q.h, q.m, q.s, q.use24h, q.includeSeconds);
    const phrase = q.includeSeconds
        ? preciseTimePhrase(q.h, q.m, q.s, { use24h: q.use24h })
        : dutchTimePhrase(q.h, q.m) || dt;
    if (q.dir === "digital-to-words") {
        let answerHtml;
        if (q._reviewOpts) {
            const givenPhrase = mode.given;
            answerHtml = buildReviewOptionList(
                q._reviewOpts,
                (o) => normalizePhrase(o.value) === normalizePhrase(phrase),
                (o) => !!givenPhrase && normalizePhrase(o.value) === normalizePhrase(givenPhrase),
            );
        } else {
            answerHtml = `<p class="bad box split-part split-part--phrase">${escapeHtml(phrase)}</p>`;
        }
        root.innerHTML = `
            <div class="dclock${q.includeSeconds ? " has-seconds" : ""}">${dt}</div>
            <p class="dclock-label">welke zin past bij deze tijd?</p>
            ${answerHtml}
        `;
        return;
    }
    const correctPhrase = q.phraseVariant || dutchTimePhrase(q.h, q.m);
    if (q.answerMode === "fill") {
        root.innerHTML = `
            <p class="dclock-label">${correctPhrase}</p>
            <p class="bad box split-part split-part--phrase">${dt}</p>
        `;
        return;
    }
    let answerHtml;
    if (q._reviewOpts) {
        let givenH = null,
            givenM = null,
            givenS = null;
        try {
            const g = JSON.parse(mode.given);
            givenH = g.h;
            givenM = g.m;
            givenS = g.s ?? 0;
        } catch {}
        answerHtml = buildReviewOptionList(
            q._reviewOpts,
            (o) => o.h === q.h && o.m === q.m && o.s === q.s,
            (o) => givenH !== null && o.h === givenH && o.m === givenM && o.s === givenS,
        );
    } else {
        answerHtml = `<p class="bad box split-part split-part--phrase">${dt}</p>`;
    }
    root.innerHTML = `
        <p class="dclock-label">${correctPhrase}</p>
        ${answerHtml}
    `;
}

// Returns a per-render getter that reads `hh:mm` or `hh:mm:ss`, validates the
// ranges with full a11y feedback, and serialises the result for isCorrect.
function makeClockFillGetter(hh, mm, ss, q, feedbackEl) {
    const validate = makeFillValidator({
        hourInput: hh,
        minuteInput: mm,
        secondInput: ss,
        use24h: q.use24h,
        feedbackEl,
    });
    return () => {
        const v = validate();
        return v ? JSON.stringify(v) : null;
    };
}

const FIELDS = [
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "granularity", type: "radio", key: "granularity", default: "kwart" },
    { field: "dir", type: "checkboxes", key: "directions" },
    { field: "answer", type: "radio", key: "answerMode", default: "multiple" },
    { field: "use-24h", type: "checkbox", key: "use24h" },
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
    id: "digital-clock",
    label: "digitale klok",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
        syncSecondOptions(form);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (cfg.directions.length === 0) return "Kies minstens één richting.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            renderDigitalClockReview(q, root, mode);
            return;
        }
        const dt = digitalLabel(q.h, q.m, q.s, q.use24h, q.includeSeconds);
        const correctPhrase =
            q.phraseVariant ||
            (q.includeSeconds ? preciseTimePhrase(q.h, q.m, q.s, { use24h: q.use24h }) : dutchTimePhrase(q.h, q.m));
        // Fill-in is only used for the words → digital direction. Going from
        // digital to free-typed Dutch phrases is too error-prone (typos,
        // alternative phrasings) so we always use multiple choice there.
        const fill = q.answerMode === "fill" && q.dir === "words-to-digital";

        if (q.dir === "digital-to-words") {
            document.getElementById("exercise-feedback").textContent = "lees de digitale klok";
            // For each option, pick the "other" Dutch variant (if any) as
            // the peek label so the kid can compare "vijf voor half twaalf"
            // with "vijfentwintig over elf" before committing. The button's
            // submitted value stays the front-face phrase, so peeking is a
            // pure preview — it doesn't change what gets answered.
            const altOf = (phrase, h, m) => {
                if (q.includeSeconds) return null;
                const variants = dutchTimePhraseVariants(h, m);
                const others = variants.filter((v) => v !== phrase);
                // pickRandom so the Flemish "na" variant (variants[2] for
                // m=20/25) is reachable through the peek widget.
                return others.length > 0 ? pickRandom(others) : null;
            };
            const correctOpt = {
                label: correctPhrase,
                altLabel: altOf(correctPhrase, q.h, q.m),
                value: correctPhrase,
            };
            const distractorOpts = buildDistractors(q, 3)
                .map((d) => {
                    const front = q.includeSeconds
                        ? preciseTimePhrase(d.h, d.m, d.s, { use24h: q.use24h })
                        : dutchTimePhrase(d.h, d.m);
                    if (!front || front === correctPhrase) return null;
                    return {
                        label: front,
                        altLabel: altOf(front, d.h, d.m),
                        value: front,
                    };
                })
                .filter(Boolean)
                .slice(0, 3);
            const options = shuffle([correctOpt, ...distractorOpts]);
            q._reviewOpts = options.map((o) => ({ label: o.label, value: o.value }));
            root.innerHTML = `
                <div class="dclock${q.includeSeconds ? " has-seconds" : ""}">${dt}</div>
                <p class="dclock-label">welke zin past bij deze tijd?</p>
                ${wordOptionListHtml(options)}
            `;
            return wireOptions(root);
        } else {
            // words → digital
            document.getElementById("exercise-feedback").textContent = fill
                ? "typ de tijd op de klok"
                : "kies de juiste tijd";
            if (fill) {
                const maxHourHint = q.use24h ? "0–23" : "1–12";
                root.innerHTML = `
                    <p class="dclock-label">${promptPhraseHtml(q, correctPhrase)}</p>
                    <div class="dclock dclock-input${q.includeSeconds ? " has-seconds" : ""}">
                        <input class="dclock-field" id="answer-h" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required aria-label="uur">
                        <span class="dclock-colon">:</span>
                        <input class="dclock-field" id="answer-m" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required aria-label="minuten">
                        ${
                            q.includeSeconds
                                ? `<span class="dclock-colon">:</span>
                        <input class="dclock-field" id="answer-s" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required aria-label="seconden">`
                                : ""
                        }
                    </div>
                    <small class="muted">${maxHourHint} : 00–59${q.includeSeconds ? " : 00–59" : ""}</small>
                `;
                sizeQuestionFlip(root);
                const hh = root.querySelector("#answer-h");
                const mm = root.querySelector("#answer-m");
                const ss = root.querySelector("#answer-s");
                const feedbackEl = document.getElementById("exercise-feedback");
                // `makeFillValidator` (via makeClockFillGetter) takes care of
                // describedby + the clear-on-input listener + autofocus from
                // hh→mm, so this branch only has to wire the JSON return shape.
                return makeClockFillGetter(hh, mm, ss, q, feedbackEl);
            }
            const distractors = buildDistractors(q, 3);
            const options = shuffle([{ h: q.h, m: q.m, s: q.s }, ...distractors.slice(0, 3)]);
            q._reviewOpts = options.map((o) => ({
                label: digitalLabel(o.h, o.m, o.s, q.use24h, q.includeSeconds),
                h: o.h,
                m: o.m,
                s: o.s,
            }));
            root.innerHTML = `
                <p class="dclock-label">${promptPhraseHtml(q, correctPhrase)}</p>
                ${optionListHtml(
                    options,
                    (o) => digitalLabel(o.h, o.m, o.s, q.use24h, q.includeSeconds),
                    (o) => JSON.stringify(o),
                )}
            `;
            sizeQuestionFlip(root);
            return wireOptions(root);
        }
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.dir === "digital-to-words") {
            // Accept ANY valid Dutch wording for this time — including the
            // Flemish "na" alternative — not just the one variant we picked
            // for the prompt. Otherwise a Flemish-speaking kid who picks the
            // "na" option for a question prompted with the "over" form would
            // be marked wrong even though the answer is correct.
            const norm = normalizePhrase(given);
            if (q.includeSeconds) return norm === normalizePhrase(q.phraseVariant);
            const variants = dutchTimePhraseVariants(q.h, q.m);
            return variants.some((v) => normalizePhrase(v) === norm);
        }
        try {
            const obj = JSON.parse(given);
            const h = parseStrictInt(obj?.h, { allowNegative: true });
            const m = parseStrictInt(obj?.m);
            const s = parseStrictInt(obj?.s ?? 0);
            if (h === null || m === null || s === null) return false;
            // For multiple choice we generated only same-half-day distractors,
            // so a strict match works. For fill-in we accept any hour that
            // shares the question's mod-12 (so "half drie" → 02:30 and 14:30
            // are both fine), since both genuinely describe the same phrase.
            if (q.answerMode === "fill") {
                return h % 12 === q.h % 12 && m === q.m && s === q.s;
            }
            return h === q.h && m === q.m && s === q.s;
        } catch {
            return false;
        }
    },
    describe(q) {
        const dt = digitalLabel(q.h, q.m, q.s, q.use24h, q.includeSeconds);
        const phrase =
            q.phraseVariant ||
            (q.includeSeconds ? preciseTimePhrase(q.h, q.m, q.s, { use24h: q.use24h }) : dutchTimePhrase(q.h, q.m));
        const dayPart = q.use24h && q.h >= 12 ? " ('s middags)" : "";
        return q.dir === "digital-to-words" ? `${dt} → ${phrase}${dayPart}` : `${phrase}${dayPart} → ${dt}`;
    },
});
