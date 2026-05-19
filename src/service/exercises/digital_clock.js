// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import {
    buildReviewOptionList,
    dutchTimePhrase,
    dutchTimePhraseVariants,
    escapeHtml,
    loadFields,
    minutesForStep,
    normalizePhrase,
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

/**
 * Build the HTML for the prompt phrase shown to the child in the
 * "words → digital" direction. When the time has two Dutch variants
 * (`tien voor half ...` ↔ `twintig over ...`, etc.) we render the
 * phrase-flip widget so the child can peek at the alternate wording —
 * same affordance as the analog-clock exercise. Otherwise plain text.
 */
function promptPhraseHtml(q, correctPhrase) {
    const variants = dutchTimePhraseVariants(q.h, q.m);
    const alt = variants.length > 1 ? variants.find((v) => v !== correctPhrase) : null;
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

function digitalLabel(h, m, use24h) {
    // In 12-hour mode render h=0 as 12 (noon/midnight shows "12:xx").
    // In 24-hour mode keep the raw value so midnight shows "00:xx".
    const display = !use24h && h === 0 ? 12 : h;
    return `${pad(display)}:${pad(m)}`;
}

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
    return slice.map(({ h, m }) => ({
        // direction: 'digital-to-words' or 'words-to-digital'
        dir: pickRandom(cfg.directions),
        answerMode: cfg.answerMode || "multiple",
        use24h: !!cfg.use24h,
        granularity: cfg.granularity,
        h,
        m,
        phraseVariant: pickRandom(dutchTimePhraseVariants(h, m)) || dutchTimePhrase(h, m),
    }));
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
    taken.add(`${q.h % 12}:${q.m}`); // exclude same-phrase too
    const variants = [];
    for (let dh = -3; dh <= 3; dh++) {
        for (const m of minutes) {
            const h = wrap(q.h + dh);
            if (h >= hourMax) continue;
            variants.push({ h, m });
        }
    }
    shuffle(variants);
    const out = [];
    for (const v of variants) {
        const key = `${v.h % 12}:${v.m}`;
        if (taken.has(key)) continue;
        taken.add(key);
        out.push(v);
        if (out.length >= n) break;
    }
    return out;
}

function renderDigitalClockReview(q, root, mode) {
    const dt = digitalLabel(q.h, q.m, q.use24h);
    const phrase = dutchTimePhrase(q.h, q.m) || dt;
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
            answerHtml = `<p class="bad box split-part" style="width:auto;padding:6px 12px">${escapeHtml(phrase)}</p>`;
        }
        root.innerHTML = `
            <div class="dclock">${dt}</div>
            <p class="dclock-label">welke zin past bij deze tijd?</p>
            ${answerHtml}
        `;
        return;
    }
    const correctPhrase = q.phraseVariant || dutchTimePhrase(q.h, q.m);
    if (q.answerMode === "fill") {
        root.innerHTML = `
            <p class="dclock-label">${correctPhrase}</p>
            <p class="bad box split-part" style="width:auto;padding:6px 12px">${dt}</p>
        `;
        return;
    }
    let answerHtml;
    if (q._reviewOpts) {
        let givenH = null,
            givenM = null;
        try {
            const g = JSON.parse(mode.given);
            givenH = g.h;
            givenM = g.m;
        } catch {}
        answerHtml = buildReviewOptionList(
            q._reviewOpts,
            (o) => o.h === q.h && o.m === q.m,
            (o) => givenH !== null && o.h === givenH && o.m === givenM,
        );
    } else {
        answerHtml = `<p class="bad box split-part" style="width:auto;padding:6px 12px">${dt}</p>`;
    }
    root.innerHTML = `
        <p class="dclock-label">${correctPhrase}</p>
        ${answerHtml}
    `;
}

function makeClockFillGetter(hh, mm, q, feedbackEl) {
    const showInvalidFeedback = () => {
        if (!feedbackEl) return;
        // Stash the assignment text on first switch into the bad state so the
        // input-listeners can restore it when the child fixes their typing.
        // Use a dedicated flag to avoid stomping on wrong-attempt feedback
        // (which also uses is-bad + dataset.assignment).
        if (feedbackEl.dataset.invalidInput !== "1") {
            feedbackEl.dataset.assignment = feedbackEl.textContent;
            feedbackEl.dataset.invalidInput = "1";
        }
        const hourRange = q.use24h ? "0–23" : "1–12";
        feedbackEl.textContent = `Geef een geldige tijd in (uren: ${hourRange}, minuten: 00–59).`;
        feedbackEl.classList.add("is-bad");
    };
    return () => {
        hh.classList.remove("is-invalid");
        mm.classList.remove("is-invalid");
        if (!hh.value || mm.value === "") return null;
        const rawH = Number(hh.value);
        const rawM = Number(mm.value);
        const maxHour = q.use24h ? 23 : 12;
        const minHour = q.use24h ? 0 : 1;
        let invalid = false;
        if (!Number.isInteger(rawH) || rawH < minHour || rawH > maxHour) {
            hh.classList.add("is-invalid");
            invalid = true;
        }
        if (!Number.isInteger(rawM) || rawM < 0 || rawM > 59) {
            mm.classList.add("is-invalid");
            invalid = true;
        }
        if (invalid) {
            showInvalidFeedback();
            return null;
        }
        return JSON.stringify({ h: q.use24h ? rawH : rawH % 12, m: rawM });
    };
}

const FIELDS = [
    { field: "num-exercises", type: "number", key: "numExercises" },
    { field: "granularity", type: "radio", key: "granularity", default: "kwart" },
    { field: "dir", type: "checkboxes", key: "directions" },
    { field: "answer", type: "radio", key: "answerMode", default: "multiple" },
    { field: "use-24h", type: "checkbox", key: "use24h" },
];

runExercise({
    id: "digital-clock",
    label: "digitale klok",
    loadConfig(form, saved) {
        loadFields(form, FIELDS, saved);
    },
    readConfig(form) {
        return readFields(form, FIELDS);
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (cfg.directions.length === 0) return "Kies minstens één oefen-richting.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            renderDigitalClockReview(q, root, mode);
            return;
        }
        const dt = digitalLabel(q.h, q.m, q.use24h);
        const correctPhrase = q.phraseVariant || dutchTimePhrase(q.h, q.m);
        // Fill-in is only used for the words → digital direction. Going from
        // digital to free-typed Dutch phrases is too error-prone (typos,
        // alternative phrasings) so we always use multiple choice there.
        const fill = q.answerMode === "fill" && q.dir === "words-to-digital";

        if (q.dir === "digital-to-words") {
            document.getElementById("exercise-feedback").textContent = "lees de digitale klok 🔢";
            // For each option, pick the "other" Dutch variant (if any) as
            // the peek label so the kid can compare "vijf voor half twaalf"
            // with "vijfentwintig over elf" before committing. The button's
            // submitted value stays the front-face phrase, so peeking is a
            // pure preview — it doesn't change what gets answered.
            const altOf = (phrase, h, m) => {
                const variants = dutchTimePhraseVariants(h, m);
                return variants.length > 1 ? variants.find((v) => v !== phrase) : null;
            };
            const correctOpt = {
                label: correctPhrase,
                altLabel: altOf(correctPhrase, q.h, q.m),
                value: correctPhrase,
            };
            const distractorOpts = buildDistractors(q, 3)
                .map((d) => {
                    const front = dutchTimePhrase(d.h, d.m);
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
                <div class="dclock">${dt}</div>
                <p class="dclock-label">welke zin past bij deze tijd?</p>
                ${wordOptionListHtml(options)}
            `;
            return wireOptions(root);
        } else {
            // words → digital
            document.getElementById("exercise-feedback").textContent = fill
                ? "typ de tijd op de klok 🔢"
                : "kies de juiste tijd 🔢";
            if (fill) {
                const maxHourHint = q.use24h ? "0–23" : "1–12";
                root.innerHTML = `
                    <p class="dclock-label">${promptPhraseHtml(q, correctPhrase)}</p>
                    <div class="dclock dclock-input">
                        <input class="dclock-field" id="answer-h" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                        <span class="dclock-colon">:</span>
                        <input class="dclock-field" id="answer-m" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                    </div>
                    <small class="muted">${maxHourHint} : 00–59</small>
                `;
                sizeQuestionFlip(root);
                const hh = root.querySelector("#answer-h");
                const mm = root.querySelector("#answer-m");
                const feedbackEl = document.getElementById("exercise-feedback");
                // Only clear the validation message, not wrong-attempt feedback —
                // the latter is its own user-visible signal and shouldn't vanish
                // the moment the child starts retyping.
                const clearInvalidFeedback = () => {
                    if (!feedbackEl || feedbackEl.dataset.invalidInput !== "1") return;
                    feedbackEl.dataset.invalidInput = "";
                    const assignment = feedbackEl.dataset.assignment;
                    if (assignment) feedbackEl.textContent = assignment;
                    feedbackEl.classList.remove("is-bad");
                };
                hh.addEventListener("input", () => {
                    hh.classList.remove("is-invalid");
                    clearInvalidFeedback();
                    if (hh.value.length >= 2) mm.focus();
                });
                mm.addEventListener("input", () => {
                    mm.classList.remove("is-invalid");
                    clearInvalidFeedback();
                });
                return makeClockFillGetter(hh, mm, q, feedbackEl);
            }
            const distractors = buildDistractors(q, 3);
            const options = shuffle([{ h: q.h, m: q.m }, ...distractors.slice(0, 3)]);
            q._reviewOpts = options.map((o) => ({ label: digitalLabel(o.h, o.m, q.use24h), h: o.h, m: o.m }));
            root.innerHTML = `
                <p class="dclock-label">${promptPhraseHtml(q, correctPhrase)}</p>
                ${optionListHtml(
                    options,
                    (o) => digitalLabel(o.h, o.m, q.use24h),
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
            return normalizePhrase(given) === normalizePhrase(q.phraseVariant || dutchTimePhrase(q.h, q.m));
        }
        try {
            const obj = JSON.parse(given);
            const h = Number(obj.h);
            const m = Number(obj.m);
            // For multiple choice we generated only same-half-day distractors,
            // so a strict match works. For fill-in we accept any hour that
            // shares the question's mod-12 (so "half drie" → 02:30 and 14:30
            // are both fine), since both genuinely describe the same phrase.
            if (q.answerMode === "fill") {
                return h % 12 === q.h % 12 && m === q.m;
            }
            return h === q.h && m === q.m;
        } catch {
            return false;
        }
    },
    describe(q) {
        const dt = digitalLabel(q.h, q.m, q.use24h);
        const phrase = q.phraseVariant || dutchTimePhrase(q.h, q.m);
        const dayPart = q.use24h && q.h >= 12 ? " ('s middags)" : "";
        return q.dir === "digital-to-words" ? `${dt} → ${phrase}${dayPart}` : `${phrase}${dayPart} → ${dt}`;
    },
});
