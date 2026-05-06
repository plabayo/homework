import { runExercise, shuffle, pad, hourName, wireOptions, read, load, pickRandom, dutchTimePhrase, optionListHtml } from '/homework.js';

// Granularity helpers
const GRAN = {
    hour: 60,
    half: 30,
    quarter: 15,
    five: 5,
    one: 1,
};

function buildDeck(cfg) {
    const minStep = GRAN[cfg.granularity] || 5;
    const allowed = [];
    for (let h = 0; h < 12; h++) {
        for (let m = 0; m < 60; m += minStep) {
            allowed.push({ h, m });
        }
    }
    // Times that have a Dutch-phrase form (volle uur/half/kwart).
    const wordsAllowed = allowed.filter(
        (e) => e.m === 0 || e.m === 15 || e.m === 30 || e.m === 45,
    );

    const out = [];
    let bag = allowed.slice();
    shuffle(bag);
    let wordsBag = wordsAllowed.slice();
    shuffle(wordsBag);

    let safety = cfg.numExercises * 4 + 20;
    while (out.length < cfg.numExercises && safety-- > 0) {
        const kind = pickRandom(cfg.kinds.length ? cfg.kinds : ['lees', 'zet']);
        let entry;
        if (kind === 'zet-woorden') {
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
            answerMode: cfg.answerMode || 'multiple',
            promptStyle:
                kind === 'zet-woorden'
                    ? 'words'
                    : kind === 'zet' && dutchTimePhrase(entry.h, entry.m) && Math.random() < 0.35
                        ? 'words'
                        : 'digits',
            choiceStyle:
                kind === 'lees' &&
                (cfg.answerMode || 'multiple') === 'multiple' &&
                dutchTimePhrase(entry.h, entry.m) &&
                Math.random() < 0.4
                    ? 'words'
                    : 'digits',
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
        let h = ((q.h + dh) % 12 + 12) % 12;
        let m = q.m + dm;
        while (m < 0) { m += 60; h = (h + 11) % 12; }
        while (m >= 60) { m -= 60; h = (h + 1) % 12; }
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
        const label = dutchTimePhrase(h, m);
        if (!label) return;
        const key = `${h}:${m}`;
        if (seenTimes.has(key) || seenLabels.has(label)) return;
        seenTimes.add(key);
        seenLabels.add(label);
        out.push({ h, m, label });
    };

    push(q.h, q.m);
    buildClockOptions(q, minStep).forEach((o) => push(o.h, o.m));

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
        ticks.push(`<line class="tick${major ? ' major' : ''}" x1="${50 + r1 * Math.cos(angle)}" y1="${50 + r1 * Math.sin(angle)}" x2="${50 + r2 * Math.cos(angle)}" y2="${50 + r2 * Math.sin(angle)}" />`);
    }
    const numbers = [];
    for (let i = 1; i <= 12; i++) {
        const p = num(i);
        numbers.push(`<text class="num" x="${p.x}" y="${p.y}">${i}</text>`);
    }
    // hour hand length 24, minute hand length 36
    const hr = (deg, len) => {
        const a = (deg - 90) * Math.PI / 180;
        return { x2: 50 + len * Math.cos(a), y2: 50 + len * Math.sin(a) };
    };
    const hh = hr(hourAngle, 24);
    const mm = hr(minuteAngle, 36);
    return `
        <div class="clock${interactive ? ' interactive' : ''}" data-h="${h}" data-m="${m}">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle class="face" cx="50" cy="50" r="46" />
                ${ticks.join('')}
                ${numbers.join('')}
                <line class="hand-hour" x1="50" y1="50" x2="${hh.x2}" y2="${hh.y2}" />
                <line class="hand-minute" x1="50" y1="50" x2="${mm.x2}" y2="${mm.y2}" />
                ${interactive ? `
                    <!-- Wider invisible hit-zones for grabbing each hand. -->
                    <line class="hand-hit" data-hand="hour"   x1="50" y1="50" x2="${hh.x2}" y2="${hh.y2}" />
                    <line class="hand-hit" data-hand="minute" x1="50" y1="50" x2="${mm.x2}" y2="${mm.y2}" />
                ` : ''}
                <circle class="pivot" cx="50" cy="50" r="2.5" />
            </svg>
        </div>
    `;
}

function attachInteractive(root, q) {
    const wrap = root.querySelector('.clock.interactive');
    const svg = wrap.querySelector('svg');
    const minHand = svg.querySelector('.hand-minute');
    const hourHand = svg.querySelector('.hand-hour');
    const hitMin = svg.querySelector('.hand-hit[data-hand="minute"]');
    const hitHour = svg.querySelector('.hand-hit[data-hand="hour"]');
    const minStep = GRAN[q.granularity] || 5;
    // Start at 06:00 — both hands sit on the 12/6 axis but on opposite ends,
    // so neither is hidden under the other and either can be grabbed.
    const state = { h: 6, m: 0 };

    const set = (h, m) => {
        // wrap
        m = ((Math.round(m / minStep) * minStep) + 60) % 60;
        h = ((h % 12) + 12) % 12;
        state.h = h; state.m = m;
        wrap.dataset.h = h;
        wrap.dataset.m = m;
        const minuteAngle = (m / 60) * 360;
        const hourAngle = ((h % 12) / 12) * 360 + (m / 60) * 30;
        const setHand = (els, deg, len) => {
            const a = (deg - 90) * Math.PI / 180;
            const x2 = 50 + len * Math.cos(a);
            const y2 = 50 + len * Math.sin(a);
            for (const el of els) {
                if (!el) continue;
                el.setAttribute('x2', x2);
                el.setAttribute('y2', y2);
            }
        };
        setHand([minHand, hitMin], minuteAngle, 36);
        setHand([hourHand, hitHour], hourAngle, 24);
    };
    set(state.h, state.m);

    const pointToTime = (clientX, clientY) => {
        const rect = svg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = clientX - cx;
        const dy = clientY - cy;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;
        if (angle < 0) angle += 360;
        const minute = (angle / 360) * 60;
        return minute;
    };

    let dragging = null; // 'minute' or 'hour'

    const onDown = (e) => {
        e.preventDefault();
        const t = e.target;
        // The wide invisible hit-zones carry data-hand. Fall back to the
        // visible hand class for a direct hit, otherwise default to the
        // minute hand (most common case for free clicks on the face).
        const hand =
            (t.dataset && t.dataset.hand) ||
            (t.classList && t.classList.contains('hand-hour') ? 'hour' :
             t.classList && t.classList.contains('hand-minute') ? 'minute' :
             null);
        dragging = hand || 'minute';
        onMove(e);
    };
    const onMove = (e) => {
        if (!dragging) return;
        const x = e.clientX ?? e.touches?.[0]?.clientX;
        const y = e.clientY ?? e.touches?.[0]?.clientY;
        if (x === undefined) return;
        const minute = pointToTime(x, y);
        if (dragging === 'minute') {
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
    const onUp = () => { dragging = null; };

    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // increment/decrement helpers
    root.querySelector('#hour-inc')?.addEventListener('click', (e) => { e.preventDefault(); set((state.h + 1) % 12, state.m); });
    root.querySelector('#hour-dec')?.addEventListener('click', (e) => { e.preventDefault(); set((state.h + 11) % 12, state.m); });
    root.querySelector('#min-inc')?.addEventListener('click', (e) => {
        e.preventDefault();
        const m = (state.m + minStep) % 60;
        const nh = m === 0 ? (state.h + 1) % 12 : state.h;
        set(nh, m);
    });
    root.querySelector('#min-dec')?.addEventListener('click', (e) => {
        e.preventDefault();
        let m = state.m - minStep;
        let nh = state.h;
        if (m < 0) { m += 60; nh = (state.h + 11) % 12; }
        set(nh, m);
    });

    return () => ({ h: state.h, m: state.m });
}

function timeLabel(h, m) {
    const hh = h === 0 ? 12 : h;
    return `${pad(hh)}:${pad(m)}`;
}

runExercise({
    id: 'clock',
    label: 'analoge klok',
    loadConfig(form, saved) {
        load.number(form, 'num-exercises', saved.numExercises);
        load.radio(form, 'granularity', saved.granularity);
        load.checkboxes(form, 'ck', saved.kinds);
        load.radio(form, 'answer', saved.answerMode);
    },
    readConfig(form) {
        return {
            numExercises: read.number(form, 'num-exercises'),
            granularity:  read.radio(form, 'granularity', 'five'),
            kinds:        read.checkboxes(form, 'ck'),
            answerMode:   read.radio(form, 'answer', 'multiple'),
        };
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1) return 'Gelieve een geldig aantal oefeningen op te geven.';
        if (!cfg.kinds.length) return 'Kies minstens één oefen-type.';
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        const minStep = GRAN[q.granularity] || 5;
        if (mode.kind === 'review') {
            const fb = q.kind === 'lees' ? 'lees de klok 🕐' : 'zet de klok ⏰';
            root.innerHTML = `
                <h3>${fb}</h3>
                ${clockSvg(q.h, q.m, { interactive: false })}
                <p class="time-readout bad">${timeLabel(q.h, q.m)}</p>
            `;
            return;
        }
        if (q.kind === 'lees') {
            document.getElementById('exercise-feedback').textContent = 'lees de klok 🕐';
            if (q.answerMode === 'fill') {
                // child types the time
                root.innerHTML = `
                    ${clockSvg(q.h, q.m, { interactive: false })}
                    <div class="time-pair">
                        <input inputmode="numeric" pattern="[0-9]+" id="answer-h" min="1" max="12" placeholder="uu" required>
                        <span>:</span>
                        <input inputmode="numeric" pattern="[0-9]+" id="answer-m" min="0" max="59" step="${minStep}" placeholder="mm" required>
                    </div>
                `;
                const hh = root.querySelector('#answer-h');
                const mm = root.querySelector('#answer-m');
                return () => {
                    if (!hh.value || mm.value === '') return null;
                    let h = Number(hh.value);
                    if (h === 12) h = 0;
                    return { h, m: Number(mm.value) };
                };
            }
            // multiple-choice mode: pick the correct time from 4 plausible options
            const wordChoices = q.choiceStyle === 'words' && !!dutchTimePhrase(q.h, q.m);
            const options = wordChoices
                ? buildWordOptions(q, minStep)
                : buildClockOptions(q, minStep).map((o) => ({
                    ...o,
                    label: timeLabel(o.h, o.m),
                }));
            root.innerHTML = `
                ${clockSvg(q.h, q.m, { interactive: false })}
                ${wordChoices ? '<p class="clock-choice-label">welke zin past bij deze klok?</p>' : ''}
                ${optionListHtml(options, (o) => o.label, (o) => JSON.stringify({ h: o.h, m: o.m }))}
            `;
            const get = wireOptions(root);
            return () => { const s = get(); return s ? JSON.parse(s) : null; };
        } else {
            // q.kind === 'zet' or 'zet-woorden'
            const promptText = q.promptStyle === 'words'
                ? `zet de klok op "${dutchTimePhrase(q.h, q.m)}" ⏰`
                : `zet de klok op ${timeLabel(q.h, q.m)} ⏰`;
            document.getElementById('exercise-feedback').textContent = promptText;
            root.innerHTML = `
                ${clockSvg(0, 0, { interactive: true })}
                <div class="clock-controls">
                    <div class="clock-control-row">
                        <span class="label">uur</span>
                        <div class="button-pair">
                            <button type="button" id="hour-dec">➖</button>
                            <button type="button" id="hour-inc">➕</button>
                        </div>
                    </div>
                    ${minStep < 60 ? `
                        <div class="clock-control-row">
                            <span class="label">minuut</span>
                            <div class="button-pair">
                                <button type="button" id="min-dec">➖</button>
                                <button type="button" id="min-inc">➕</button>
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
            return attachInteractive(root, q);
        }
    },
    isCorrect(q, given) {
        if (!given) return false;
        if (q.kind === 'lees') {
            return Number(given.h) === q.h && Number(given.m) === q.m;
        }
        return given.h === q.h && given.m === q.m;
    },
    describe(q) {
        if (q.kind === 'zet-woorden' || q.promptStyle === 'words') {
            const phrase = dutchTimePhrase(q.h, q.m) || timeLabel(q.h, q.m);
            return `zet "${phrase}"`;
        }
        return `${q.kind === 'lees' ? 'lees' : 'zet'} ${timeLabel(q.h, q.m)}`;
    },
});
