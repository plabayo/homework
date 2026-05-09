import {
    dutchTimePhrase,
    load,
    normalizePhrase,
    optionListHtml,
    pad,
    pickRandom,
    read,
    runExercise,
    shuffle,
    wireOptions,
} from "@homework";

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

function minutesForGranularity(granularity) {
    switch (granularity) {
        case "uur":
            return [0];
        case "half":
            return [0, 30];
        case "kwart":
            return [0, 15, 30, 45];
        case "vijf":
            return [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        default:
            return [0, 15, 30, 45];
    }
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

runExercise({
    id: "digital-clock",
    label: "digitale klok",
    loadConfig(form, saved) {
        load.number(form, "num-exercises", saved.numExercises);
        load.radio(form, "granularity", saved.granularity);
        load.checkboxes(form, "dir", saved.directions);
        load.radio(form, "answer", saved.answerMode);
        load.checkbox(form, "use-24h", saved.use24h);
    },
    readConfig(form) {
        return {
            numExercises: read.number(form, "num-exercises"),
            granularity: read.radio(form, "granularity", "kwart"),
            directions: read.checkboxes(form, "dir"),
            answerMode: read.radio(form, "answer", "multiple"),
            use24h: read.checkbox(form, "use-24h"),
        };
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return "Geef een geldig aantal oefeningen op.";
        if (!cfg.directions.length) return "Kies minstens één oefen-richting.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            const dt = digitalLabel(q.h, q.m, q.use24h);
            const phrase = dutchTimePhrase(q.h, q.m) || dt;
            root.innerHTML = `
                <h3>${q.dir === "digital-to-words" ? "lees de digitale klok 🔢" : "schrijf de tijd in cijfers 🔢"}</h3>
                <div class="dclock">${dt}</div>
                <p class="bad box split-part" style="width:auto;padding:6px 12px">${phrase}</p>
            `;
            return;
        }
        const dt = digitalLabel(q.h, q.m, q.use24h);
        const correctPhrase = dutchTimePhrase(q.h, q.m);
        // Fill-in is only used for the words → digital direction. Going from
        // digital to free-typed Dutch phrases is too error-prone (typos,
        // alternative phrasings) so we always use multiple choice there.
        const fill = q.answerMode === "fill" && q.dir === "words-to-digital";

        if (q.dir === "digital-to-words") {
            document.getElementById("exercise-feedback").textContent = "lees de digitale klok 🔢";
            const distractors = buildDistractors(q, 3)
                .map((d) => dutchTimePhrase(d.h, d.m))
                .filter((p) => p && p !== correctPhrase);
            const options = shuffle([correctPhrase, ...distractors.slice(0, 3)]);
            root.innerHTML = `
                <div class="dclock">${dt}</div>
                <p class="dclock-label">welke zin past bij deze tijd?</p>
                ${optionListHtml(options, (o) => o)}
            `;
            return wireOptions(root);
        } else {
            // words → digital
            document.getElementById("exercise-feedback").textContent = fill
                ? "typ de tijd op de klok 🔢"
                : "kies de juiste tijd 🔢";
            if (fill) {
                root.innerHTML = `
                    <p class="dclock-label">${correctPhrase}</p>
                    <div class="dclock dclock-input">
                        <input class="dclock-field" id="answer-h" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                        <span class="dclock-colon">:</span>
                        <input class="dclock-field" id="answer-m" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                    </div>
                `;
                const hh = root.querySelector("#answer-h");
                const mm = root.querySelector("#answer-m");
                hh.addEventListener("input", () => {
                    if (hh.value.length >= 2) mm.focus();
                });
                return () => {
                    if (!hh.value || mm.value === "") return null;
                    const rawH = Number(hh.value);
                    const rawM = Number(mm.value);
                    const maxHour = q.use24h ? 23 : 12;
                    if (!Number.isInteger(rawH) || !Number.isInteger(rawM)) return null;
                    if (rawH < 0 || rawH > maxHour || rawM < 0 || rawM > 59) return null;
                    if (!q.use24h && rawH === 0) return null;
                    return JSON.stringify({
                        h: q.use24h ? rawH : rawH % 12,
                        m: rawM,
                    });
                };
            }
            const distractors = buildDistractors(q, 3);
            const options = shuffle([{ h: q.h, m: q.m }, ...distractors.slice(0, 3)]);
            root.innerHTML = `
                <p class="dclock-label">${correctPhrase}</p>
                ${optionListHtml(
                    options,
                    (o) => digitalLabel(o.h, o.m, q.use24h),
                    (o) => JSON.stringify(o),
                )}
            `;
            return wireOptions(root);
        }
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.dir === "digital-to-words") {
            return normalizePhrase(given) === normalizePhrase(dutchTimePhrase(q.h, q.m));
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
        const phrase = dutchTimePhrase(q.h, q.m);
        const dayPart = q.use24h && q.h >= 12 ? " ('s middags)" : "";
        return q.dir === "digital-to-words" ? `${dt} → ${phrase}${dayPart}` : `${phrase}${dayPart} → ${dt}`;
    },
});
