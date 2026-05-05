import { runExercise, shuffle } from '/homework.js';

// Dutch time expression utilities. We support these standard expressions:
//   - "X uur"           for HH:00
//   - "kwart over X"    for HH:15
//   - "half (X+1)"      for HH:30
//   - "kwart voor (X+1)"for HH:45
//
// (5/10/20/25 minute expressions like "tien voor half drie" are intentionally
// left out for simplicity — they can be added later as a harder mode.)

function pad(n) { return String(n).padStart(2, '0'); }

function hourName(h) {
    const names = ['twaalf','een','twee','drie','vier','vijf','zes','zeven','acht','negen','tien','elf'];
    return names[((h % 12) + 12) % 12];
}

function digitalLabel(h, m) {
    const hh = h === 0 ? 12 : h;
    return `${pad(hh)}:${pad(m)}`;
}

function dutchPhrase(h, m) {
    if (m === 0) return `${hourName(h)} uur`;
    if (m === 15) return `kwart over ${hourName(h)}`;
    if (m === 30) return `half ${hourName(h + 1)}`;
    if (m === 45) return `kwart voor ${hourName(h + 1)}`;
    return null;
}

function buildDeck(cfg) {
    // Allowed minutes per granularity setting (mirrors what dutchPhrase covers)
    const minutes = [];
    if (cfg.kinds.includes('uur')) minutes.push(0);
    if (cfg.kinds.includes('half')) minutes.push(30);
    if (cfg.kinds.includes('kwart')) minutes.push(15, 45);

    const candidates = [];
    for (let h = 0; h < 12; h++) {
        for (const m of minutes) candidates.push({ h, m });
    }
    shuffle(candidates);
    const slice = candidates.slice(0, cfg.numExercises);
    return slice.map(({ h, m }) => ({
        // direction: 'digital-to-words' or 'words-to-digital'
        dir: cfg.directions[Math.floor(Math.random() * cfg.directions.length)],
        answerMode: cfg.answerMode || 'multiple',
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
    // Generate plausible wrong options around q.
    const taken = new Set();
    const correct = JSON.stringify({ h: q.h, m: q.m });
    taken.add(correct);
    const out = [];
    const variants = [];
    for (let dh = -2; dh <= 2; dh++) {
        for (const dm of [-30, -15, 0, 15, 30, 45]) {
            const h = ((q.h + dh) % 12 + 12) % 12;
            let m = q.m + dm;
            if (m < 0 || m > 45) continue;
            if (![0, 15, 30, 45].includes(m)) continue;
            variants.push({ h, m });
        }
    }
    shuffle(variants);
    for (const v of variants) {
        const key = JSON.stringify(v);
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
        if (Array.isArray(saved.kinds)) {
            form.querySelectorAll('input[name=kind]').forEach((cb) => {
                cb.checked = saved.kinds.includes(cb.value);
            });
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
    },
    readConfig(form) {
        const numExercises = Number(form.elements['num-exercises'].value);
        const kinds = [];
        form.querySelectorAll('input[name=kind]:checked').forEach((cb) => kinds.push(cb.value));
        const directions = [];
        form.querySelectorAll('input[name=dir]:checked').forEach((cb) => directions.push(cb.value));
        const answerMode = (form.querySelector('input[name=answer]:checked') || {}).value || 'multiple';
        return { numExercises, kinds, directions, answerMode };
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return 'Geef een geldig aantal oefeningen op.';
        if (!cfg.kinds.length) return 'Kies minstens één soort tijd.';
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
            // Both multiple-choice (full phrase) and fill-in (typed phrase)
            // funnel through here as a string. Normalize both before compare.
            return normalizePhrase(given) === normalizePhrase(dutchPhrase(q.h, q.m));
        }
        try {
            const obj = JSON.parse(given);
            return Number(obj.h) === q.h && Number(obj.m) === q.m;
        } catch {
            return false;
        }
    },
    describe(q) {
        const dt = digitalLabel(q.h, q.m);
        const phrase = dutchPhrase(q.h, q.m);
        return q.dir === 'digital-to-words' ? `${dt} → ${phrase}` : `${phrase} → ${dt}`;
    },
});
