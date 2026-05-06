import { runExercise, shuffle } from '/homework.js';

// Dutch time expression utilities. Covers every 5-minute step that has a
// standard Flemish/Dutch idiom:
//
//   :00  X uur
//   :05  vijf over X
//   :10  tien over X
//   :15  kwart over X
//   :20  tien voor half (X+1)
//   :25  vijf voor half (X+1)
//   :30  half (X+1)
//   :35  vijf over half (X+1)
//   :40  tien over half (X+1)
//   :45  kwart voor (X+1)
//   :50  tien voor (X+1)
//   :55  vijf voor (X+1)

function pad(n) { return String(n).padStart(2, '0'); }

function hourName(h) {
    const names = ['twaalf','een','twee','drie','vier','vijf','zes','zeven','acht','negen','tien','elf'];
    return names[((h % 12) + 12) % 12];
}

function digitalLabel(h, m) {
    // h is the raw hour we generated. In 12-hour mode we render h=0 as 12;
    // in 24-hour mode we keep the literal 0..23 so the LED display reads
    // 14:30 for "half drie 's middags".
    if (h >= 13) return `${pad(h)}:${pad(m)}`;
    if (h === 0) return `12:${pad(m)}`;
    return `${pad(h)}:${pad(m)}`;
}

function dutchPhrase(h, m) {
    // Dutch time expressions are 12-hour by convention — 14:30 is still
    // "half drie", just in the afternoon. So we mod-12 before naming.
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    switch (m) {
        case 0:  return `${hourName(h12)} uur`;
        case 5:  return `vijf over ${hourName(h12)}`;
        case 10: return `tien over ${hourName(h12)}`;
        case 15: return `kwart over ${hourName(h12)}`;
        case 20: return `tien voor half ${hourName(next)}`;
        case 25: return `vijf voor half ${hourName(next)}`;
        case 30: return `half ${hourName(next)}`;
        case 35: return `vijf over half ${hourName(next)}`;
        case 40: return `tien over half ${hourName(next)}`;
        case 45: return `kwart voor ${hourName(next)}`;
        case 50: return `tien voor ${hourName(next)}`;
        case 55: return `vijf voor ${hourName(next)}`;
        default: return null;
    }
}

function minutesForGranularity(granularity) {
    switch (granularity) {
        case "uur":   return [0];
        case "half":  return [0, 30];
        case "kwart": return [0, 15, 30, 45];
        case "vijf":  return [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
        default:      return [0, 15, 30, 45];
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
        dir: cfg.directions[Math.floor(Math.random() * cfg.directions.length)],
        answerMode: cfg.answerMode || 'multiple',
        use24h: !!cfg.use24h,
        granularity: cfg.granularity,
        h, m,
    }));
}

function normalizePhrase(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')   // strip diacritics
        .replace(/\s+/g, ' ')
        .trim();
}

function buildDistractors(q, n) {
    // Plausible wrong options. We keep distractors in the same half-day as
    // the question (AM or PM in 24h mode) so a 14:30 question doesn't get
    // a 02:30 sibling shown — that's not a "wrong answer" since it's the
    // same Dutch phrase; it would just confuse the kid.
    const minutes = minutesForGranularity(q.granularity);
    const hourMax = q.use24h ? 24 : 12;
    const hourBase = q.use24h && q.h >= 12 ? 12 : 0;
    const wrap = (h) =>
        q.use24h
            ? (((h - hourBase) % 12) + 12) % 12 + hourBase
            : ((h % 12) + 12) % 12;
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
    id: 'digital-clock',
    label: 'digitale klok',
    loadConfig(form, saved) {
        if (saved.numExercises) form.elements['num-exercises'].value = saved.numExercises;
        if (saved.granularity) {
            const r = form.querySelector(`input[name=granularity][value="${saved.granularity}"]`);
            if (r) r.checked = true;
        }
        if (Array.isArray(saved.directions)) {
            form.querySelectorAll('input[name=dir]').forEach((cb) => {
                cb.checked = saved.directions.includes(cb.value);
            });
        }
        if (saved.answerMode) {
            const r = form.querySelector(`input[name=answer][value="${saved.answerMode}"]`);
            if (r) r.checked = true;
        }
        if (typeof saved.use24h === 'boolean') {
            const cb = form.elements['use-24h'];
            if (cb) cb.checked = saved.use24h;
        }
    },
    readConfig(form) {
        const numExercises = Number(form.elements['num-exercises'].value);
        const granularity = (form.querySelector('input[name=granularity]:checked') || {}).value || 'kwart';
        const directions = [];
        form.querySelectorAll('input[name=dir]:checked').forEach((cb) => directions.push(cb.value));
        const answerMode = (form.querySelector('input[name=answer]:checked') || {}).value || 'multiple';
        const use24h = !!form.elements['use-24h']?.checked;
        return { numExercises, granularity, directions, answerMode, use24h };
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return 'Geef een geldig aantal oefeningen op.';
        if (!cfg.directions.length) return 'Kies minstens één oefen-richting.';
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === 'review') {
            const dt = digitalLabel(q.h, q.m);
            const phrase = dutchPhrase(q.h, q.m) || dt;
            root.innerHTML = `
                <h3>${q.dir === 'digital-to-words' ? 'lees de digitale klok 🔢' : 'schrijf de tijd in cijfers 🔢'}</h3>
                <div class="dclock">${dt}</div>
                <p class="bad box split-part" style="width:auto;padding:6px 12px">${phrase}</p>
            `;
            return;
        }
        const dt = digitalLabel(q.h, q.m);
        const correctPhrase = dutchPhrase(q.h, q.m);
        // Fill-in is only used for the words → digital direction. Going from
        // digital to free-typed Dutch phrases is too error-prone (typos,
        // alternative phrasings) so we always use multiple choice there.
        const fill = q.answerMode === 'fill' && q.dir === 'words-to-digital';

        if (q.dir === 'digital-to-words') {
            document.getElementById('exercise-feedback').textContent = 'lees de digitale klok 🔢';
            const distractors = buildDistractors(q, 3)
                .map((d) => dutchPhrase(d.h, d.m))
                .filter((p) => p && p !== correctPhrase);
            const options = shuffle([correctPhrase, ...distractors.slice(0, 3)]);
            root.innerHTML = `
                <div class="dclock">${dt}</div>
                <p class="dclock-label">welke zin past bij deze tijd?</p>
                <div class="option-list" role="radiogroup">
                    ${options.map((o) => `<button type="button" class="option" role="radio" aria-checked="false" data-value="${encodeURIComponent(o)}">${o}</button>`).join('')}
                </div>
            `;
            return wireOptions(root);
        } else {
            // words → digital
            document.getElementById('exercise-feedback').textContent = fill
                ? 'typ de tijd op de klok 🔢'
                : 'kies de juiste tijd 🔢';
            if (fill) {
                root.innerHTML = `
                    <p class="dclock-label">${correctPhrase}</p>
                    <div class="dclock dclock-input">
                        <input class="dclock-field" id="answer-h" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                        <span class="dclock-colon">:</span>
                        <input class="dclock-field" id="answer-m" maxlength="2" inputmode="numeric" pattern="[0-9]+" placeholder="--" autocomplete="off" required>
                    </div>
                `;
                const hh = root.querySelector('#answer-h');
                const mm = root.querySelector('#answer-m');
                hh.addEventListener('input', () => {
                    if (hh.value.length >= 2) mm.focus();
                });
                return () => {
                    if (!hh.value || mm.value === '') return null;
                    return JSON.stringify({ h: Number(hh.value) % 12, m: Number(mm.value) });
                };
            }
            const distractors = buildDistractors(q, 3);
            const options = shuffle([{ h: q.h, m: q.m }, ...distractors.slice(0, 3)]);
            root.innerHTML = `
                <p class="dclock-label">${correctPhrase}</p>
                <div class="option-list" role="radiogroup">
                    ${options.map((o) => `<button type="button" class="option" role="radio" aria-checked="false" data-value="${encodeURIComponent(JSON.stringify(o))}">${digitalLabel(o.h, o.m)}</button>`).join('')}
                </div>
            `;
            return wireOptions(root);
        }

        function wireOptions(scope) {
            let chosen = null;
            scope.querySelectorAll('.option').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    scope.querySelectorAll('.option').forEach((b) => {
                        b.classList.remove('selected');
                        b.setAttribute('aria-checked', 'false');
                    });
                    btn.classList.add('selected');
                    btn.setAttribute('aria-checked', 'true');
                    chosen = btn.dataset.value;
                });
            });
            return () => (chosen ? decodeURIComponent(chosen) : null);
        }
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.dir === 'digital-to-words') {
            return normalizePhrase(given) === normalizePhrase(dutchPhrase(q.h, q.m));
        }
        try {
            const obj = JSON.parse(given);
            const h = Number(obj.h);
            const m = Number(obj.m);
            // For multiple choice we generated only same-half-day distractors,
            // so a strict match works. For fill-in we accept any hour that
            // shares the question's mod-12 (so "half drie" → 02:30 and 14:30
            // are both fine), since both genuinely describe the same phrase.
            if (q.answerMode === 'fill') {
                return h % 12 === q.h % 12 && m === q.m;
            }
            return h === q.h && m === q.m;
        } catch {
            return false;
        }
    },
    describe(q) {
        const dt = digitalLabel(q.h, q.m);
        const phrase = dutchPhrase(q.h, q.m);
        const dayPart = q.use24h && q.h >= 12 ? " ('s middags)" : "";
        return q.dir === 'digital-to-words'
            ? `${dt} → ${phrase}${dayPart}`
            : `${phrase}${dayPart} → ${dt}`;
    },
});
