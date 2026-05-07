// Homework — shared client framework.
//
// Provides:
//   - runExercise(spec): drives the standard exercise flow
//     (configure -> play -> review-on-finish) and persists sessions
//     to IndexedDB so a parent can later inspect history and have
//     "practice mistakes" mode.
//   - mountHistory(rootEl, exerciseId): renders past sessions/mistakes
//     into the configure page for parents.
//   - service-worker registration + online/offline state on body.
//
// The page HTML is server-rendered via Rama's html! macro and provides
// the outer page chrome plus an exercise-specific configure form.
// This script wires up the rest at runtime.

const DB_NAME = "homework";
const DB_VERSION = 1;
const STORE = "sessions";

// ---------- IndexedDB helpers ----------

function openDb() {
    return new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
            reject(new Error("indexedDB not supported"));
            return;
        }
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                const store = db.createObjectStore(STORE, { keyPath: "id" });
                store.createIndex("by_exercise", "exerciseId");
                store.createIndex("by_finishedAt", "finishedAt");
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function withStore(mode, fn) {
    let db;
    try {
        db = await openDb();
    } catch {
        return null;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let result;
        Promise.resolve(fn(store))
            .then((r) => {
                result = r;
            })
            .catch(reject);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
    });
}

async function saveSession(session) {
    try {
        await withStore("readwrite", (store) => store.put(session));
    } catch (err) {
        console.warn("could not save session", err);
    }
}

async function listSessions(exerciseId, limit = 20) {
    try {
        return await withStore("readonly", (store) => {
            return new Promise((resolve, reject) => {
                const results = [];
                const idx = store.index("by_exercise");
                const req = idx.openCursor(IDBKeyRange.only(exerciseId), "prev");
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && results.length < limit) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        // Sort newest first
                        results.sort(
                            (a, b) => (b.finishedAt || 0) - (a.finishedAt || 0),
                        );
                        resolve(results);
                    }
                };
                req.onerror = () => reject(req.error);
            });
        }) ?? [];
    } catch {
        return [];
    }
}

async function recentMistakes(exerciseId, limit = 30) {
    // A question counts as a "recent mistake" if its MOST RECENT encounter
    // was a mistake — either wrong/skipped, or correct but only after one
    // or more wrong attempts. Once the child has answered it cleanly (correct
    // on the first try) it drops out of the deck, even if it was a mistake
    // long ago. listSessions returns newest-first, so the first encounter
    // of a question key wins.
    const sessions = await listSessions(exerciseId, 25);
    const mistakes = [];
    const seen = new Set();
    for (const s of sessions) {
        for (const item of s.questions || []) {
            const key = JSON.stringify(item.question);
            if (seen.has(key)) continue;
            seen.add(key);
            const isMistake = !item.correct || (item.attempts || 0) > 0;
            if (!isMistake) continue;
            mistakes.push(item.question);
            if (mistakes.length >= limit) return mistakes;
        }
    }
    return mistakes;
}

// ---------- helpers ----------

const ANIMALS = ["🐶", "🦊", "🦄", "🐭", "🐼", "🐣", "🦉", "🐯", "🦁", "🐸"];
function randomAnimal() {
    return ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
}

/** Zero-pad a number to 2 digits. */
export function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Read typed values out of a form.
 *   read.number(form, 'num-exercises')          → Number
 *   read.radio(form, 'granularity', 'five')     → string (fallback when nothing checked)
 *   read.checkboxes(form, 'kinds')              → string[]
 *   read.checkbox(form, 'use-24h')              → boolean
 */
export const read = {
    number:     (form, name)           => Number(form.elements[name]?.value),
    radio:      (form, name, fallback = '') =>
                    form.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback,
    checkboxes: (form, name)           =>
                    [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(cb => cb.value),
    checkbox:   (form, name)           => !!form.elements[name]?.checked,
};

/**
 * Restore saved config values back into form fields.
 * Every helper is a no-op when the saved value is null/undefined.
 *   load.number(form, 'num-exercises', saved.numExercises)
 *   load.radio(form, 'granularity', saved.granularity)
 *   load.checkboxes(form, 'kinds', saved.kinds)
 *   load.checkbox(form, 'use-24h', saved.use24h)
 */
export const load = {
    number(form, name, val) {
        if (val != null) form.elements[name].value = val;
    },
    radio(form, name, val) {
        if (val == null) return;
        const r = form.querySelector(`input[name="${name}"][value="${val}"]`);
        if (r) r.checked = true;
    },
    checkboxes(form, name, vals) {
        if (!Array.isArray(vals)) return;
        form.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
            cb.checked = vals.includes(cb.value);
        });
    },
    checkbox(form, name, val) {
        if (val != null && form.elements[name]) form.elements[name].checked = !!val;
    },
};

/** Dutch word for a clock hour (0/12 → "twaalf", 1 → "een", …). */
export function hourName(h) {
    const names = ['twaalf','een','twee','drie','vier','vijf','zes','zeven','acht','negen','tien','elf'];
    return names[((h % 12) + 12) % 12];
}

/**
 * Wire a group of `.option` buttons inside `scope` so only one can be
 * selected at a time. Returns a getter `() => string | null` that yields
 * the `data-value` of the selected button (URL-decoded), or null.
 */
export function wireOptions(scope) {
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
    return () => (chosen != null ? decodeURIComponent(chosen) : null);
}

export function shuffle(arr) {
    let i = arr.length;
    while (i > 0) {
        const j = Math.floor(Math.random() * i);
        i--;
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/** Pick a random element from a non-empty array. */
export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Normalise a Dutch phrase for fuzzy comparison (strip diacritics, collapse whitespace). */
export function normalizePhrase(s) {
    return String(s || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Standard Dutch time phrase for any 5-minute step (12-hour convention).
 * Returns null for times that don't land on a 5-minute boundary.
 */
export function dutchTimePhrase(h, m) {
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

/**
 * Build an option-list HTML string for multiple-choice exercises.
 * Pairs with wireOptions(). labelFn provides button text; valueFn provides
 * the encoded data-value (defaults to String).
 */
export function optionListHtml(options, labelFn, valueFn = String) {
    const btns = options
        .map((o) => `<button type="button" class="option" role="radio" aria-checked="false" data-value="${encodeURIComponent(valueFn(o))}">${escapeHtml(String(labelFn(o)))}</button>`)
        .join('');
    return `<div class="option-list" role="radiogroup">${btns}</div>`;
}

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxxxxxxxxxx".replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16),
    );
}

function formatDate(ts) {
    try {
        const d = new Date(ts);
        return d.toLocaleString("nl-BE", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function blurActiveElement() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && typeof active.blur === "function") {
        active.blur();
    }
}

function enableTouchSubmit(form) {
    if (!form) return;
    form.querySelectorAll('button[type="submit"]').forEach((btn) => {
        let lastTouchSubmitAt = 0;
        btn.addEventListener("pointerup", (e) => {
            if (e.pointerType !== "touch" || btn.disabled) return;
            e.preventDefault();
            blurActiveElement();
            lastTouchSubmitAt = Date.now();
            if (typeof form.requestSubmit === "function") {
                form.requestSubmit(btn);
                return;
            }
            form.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        btn.addEventListener("click", (e) => {
            if (Date.now() - lastTouchSubmitAt < 500) {
                e.preventDefault();
            }
        });
    });
}

// ---------- offline / service worker ----------

function setupOfflineIndicator() {
    const update = () => {
        document.body.classList.toggle("is-offline", !navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
}

function currentAssetVersion() {
    return document.documentElement.dataset.assetVersion || "dev";
}

function versionedAssetPath(path) {
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}v=${encodeURIComponent(currentAssetVersion())}`;
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker
        .register(versionedAssetPath("/service-worker.js"))
        .catch((err) => console.warn("sw register failed", err));
}

// ---------- mistake picker dialog ----------

/**
 * Show a modal picker so the user can curate which recent mistakes to
 * actually practise. By default everything is selected. Returns the
 * filtered question list, or null if the user cancelled.
 */
function pickMistakes(spec, mistakes) {
    return new Promise((resolve) => {
        const dlg = document.createElement("dialog");
        dlg.className = "mistake-picker";
        const items = mistakes
            .map((q, i) => {
                const desc = spec.describe
                    ? spec.describe(q)
                    : JSON.stringify(q);
                return `<li><label><input type="checkbox" data-i="${i}" checked> ${escapeHtml(desc)}</label></li>`;
            })
            .join("");
        dlg.innerHTML = `
            <form method="dialog" class="mistake-picker-form">
                <h2>Welke fouten herhalen?</h2>
                <p class="muted">${mistakes.length} oefening${mistakes.length === 1 ? "" : "en"} — vink uit wat je niet wil.</p>
                <label class="all-toggle"><input type="checkbox" id="picker-all" checked> alles in/uit</label>
                <ul class="picker-list">${items}</ul>
                <div class="button-row">
                    <button type="submit" value="cancel">annuleer</button>
                    <button type="submit" class="primary" value="start" id="picker-start">🟢 start</button>
                </div>
            </form>
        `;
        document.body.appendChild(dlg);
        const list = dlg.querySelectorAll("input[data-i]");
        const all = dlg.querySelector("#picker-all");
        const startBtn = dlg.querySelector("#picker-start");
        const syncStartEnabled = () => {
            startBtn.disabled = !Array.from(list).some((cb) => cb.checked);
        };
        all.addEventListener("change", () => {
            list.forEach((cb) => (cb.checked = all.checked));
            syncStartEnabled();
        });
        list.forEach((cb) =>
            cb.addEventListener("change", () => {
                all.checked = Array.from(list).every((c) => c.checked);
                syncStartEnabled();
            }),
        );
        dlg.addEventListener("close", () => {
            const action = dlg.returnValue;
            const selected = [];
            list.forEach((cb) => {
                if (cb.checked) selected.push(mistakes[Number(cb.dataset.i)]);
            });
            dlg.remove();
            resolve(action === "start" ? selected : null);
        });
        dlg.addEventListener("click", (e) => {
            if (e.target === dlg) dlg.close("cancel");
        });
        if (typeof dlg.showModal === "function") {
            dlg.showModal();
        } else {
            // Fallback: synthesise a non-modal show; resolve immediately if
            // <dialog> is not supported (very old browsers) — we just run
            // with the full list.
            dlg.remove();
            resolve(mistakes.slice());
        }
    });
}

// ---------- result page helpers ----------

function cycleSummaryLine(session, n) {
    const wrong = (session.questions || []).filter((q) => !q.correct).length;
    const tricky = (session.questions || []).filter(
        (q) => q.correct && q.attempts > 0,
    ).length;
    const modeLabel =
        session.mode === "mistakes" ? '<span class="cycle-mode">foutenmodus</span>' : "";
    const detail = [];
    if (wrong > 0) detail.push(`<span class="badge bad">${wrong} fout</span>`);
    if (tricky > 0) detail.push(`<span class="badge tricky">${tricky} moeilijk</span>`);
    if (detail.length === 0) detail.push('<span class="cycle-perfect">✨ vlekkeloos</span>');
    const time = session.timeMode && session.durationMs
        ? `<span class="cycle-time">⏱️ ${formatMillis(session.durationMs)}</span>`
        : "";
    return `
        <div class="cycle-row">
            <span class="cycle-num">ronde ${n}</span>
            <span class="cycle-score">${session.correct}/${session.total}</span>
            ${modeLabel}
            ${time}
            <span class="cycle-detail">${detail.join(" ")}</span>
        </div>
    `;
}

function formatMillis(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m${String(r).padStart(2, "0")}s`;
}

function splitQuestionOutcomes(session) {
    const questions = session.questions || [];
    return {
        wrong: questions.filter((q) => !q.correct),
        tricky: questions.filter((q) => q.correct && q.attempts > 0),
    };
}

function renderOutcomeItem(q, kind) {
    const desc = q.label
        ? escapeHtml(q.label)
        : escapeHtml(JSON.stringify(q.question));
    if (kind === "wrong") {
        const metaParts = [];
        if (q.attempts > 0) metaParts.push(`${q.attempts}×`);
        if (q.timedOut) metaParts.push("⏰ te traag");
        else if (q.skipped) metaParts.push("overgeslagen");
        const metaLine = metaParts.length
            ? `<span class="item-meta">${metaParts.join(" · ")}</span>`
            : "";
        return `<li class="item-wrong"><span class="item-desc">${desc}</span>${metaLine}</li>`;
    }
    return `<li class="item-tricky"><span class="item-desc">${desc}</span><span class="item-meta"><span class="badge tricky">${q.attempts}× fout vooraf</span></span></li>`;
}

function renderOutcomeItems({ wrong, tricky }) {
    return [
        ...wrong.map((q) => renderOutcomeItem(q, "wrong")),
        ...tricky.map((q) => renderOutcomeItem(q, "tricky")),
    ].join("");
}

function renderTrickyList(session) {
    const { wrong, tricky } = splitQuestionOutcomes(session);
    if (wrong.length === 0 && tricky.length === 0) return "";
    const items = renderOutcomeItems({ wrong, tricky });
    return `
        <section class="result-detail">
            <h3 class="section-title">Wat ging moeilijk</h3>
            <ul class="result-detail-list">${items}</ul>
        </section>
    `;
}

// ---------- main runner ----------

/**
 * spec = {
 *   id: string                                — unique exercise id (also storage key)
 *   label: string                             — human label (dutch)
 *   loadConfig?: (form, savedConfig) => void  — populate form from saved config
 *   readConfig: (form) => config              — read submitted form
 *   validateConfig?: (config) => string|null  — error message or null
 *   buildDeck: (config) => questions[]        — full deck for a session
 *   renderQuestion: (q, root, mode) => getAnswer | { getAnswer, cleanup }
 *      mode = { kind: 'play' } | { kind: 'review', given, correct }
 *      For 'play', return a function that yields the user's answer
 *      (or null if unanswerable). Interactive exercises may instead
 *      return { getAnswer, cleanup } to tear down global listeners.
 *   isCorrect: (q, given) => boolean
 *   describe?: (q) => string                  — short label for history
 * }
 */
export function runExercise(spec) {
    const setup = document.getElementById("page-setup");
    const play = document.getElementById("page-exercises");
    const result = document.getElementById("page-result");
    const formSetup = document.getElementById("form-setup");
    const formExercise = document.getElementById("form-exercise");
    const titleEl = document.getElementById("exercise-title");
    const feedbackEl = document.getElementById("exercise-feedback");
    const contentEl = document.getElementById("exercise-content");
    const skipBtn = document.getElementById("button-skip");
    const resultEl = document.getElementById("result");
    const errorEl = document.getElementById("config-error");

    const clockEl = document.getElementById("exercise-clock");
    const exerciseEl = document.getElementById("exercise");
    const state = {
        config: null,
        deck: [],
        questions: [], // session log
        currentIndex: -1,
        currentQuestion: null,
        currentAttempts: 0,
        currentGiven: null,
        getAnswer: null,
        currentCleanup: null,
        startedAt: 0,
        sessionId: null,
        mode: "normal", // 'normal' or 'mistakes'
        // Within a single user-perceived "run" (start until they go back to
        // setup), every completed session — including retry-mistakes loops —
        // is appended here so the finish page can show the whole arc.
        cycles: [],
        // Time-mode state
        questionStartedAt: 0,
        sessionTimerHandle: null,
        deadlineTimerHandle: null,
        // Consecutive first-try correct answers; drives the glow intensity.
        streak: 0,
    };

    function timeModeOn() {
        return !!state.config?.timeMode;
    }
    function deadlineSec() {
        return state.config?.deadlineSeconds || 0;
    }

    function formatDuration(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, "0")}`;
    }

    function updateClock() {
        if (!clockEl) return;
        const elapsed = formatDuration(Date.now() - state.startedAt);
        let html = `⏱️ ${elapsed}`;
        if (deadlineSec()) {
            const remain = Math.max(
                0,
                deadlineSec() * 1000 - (Date.now() - state.questionStartedAt),
            );
            const danger = remain < deadlineSec() * 250 ? " danger" : "";
            html += ` &nbsp; <span class="deadline${danger}">⏰ ${formatDuration(remain)}</span>`;
        }
        clockEl.innerHTML = html;
    }

    function startSessionTimer() {
        if (!timeModeOn() || !clockEl) return;
        clockEl.hidden = false;
        clearInterval(state.sessionTimerHandle);
        state.sessionTimerHandle = setInterval(updateClock, 250);
        updateClock();
    }
    function stopSessionTimer() {
        clearInterval(state.sessionTimerHandle);
        state.sessionTimerHandle = null;
        clearTimeout(state.deadlineTimerHandle);
        state.deadlineTimerHandle = null;
        if (clockEl) clockEl.hidden = true;
    }
    function startDeadline() {
        clearTimeout(state.deadlineTimerHandle);
        if (!timeModeOn() || !deadlineSec()) return;
        state.deadlineTimerHandle = setTimeout(() => {
            onDeadlineExpired();
        }, deadlineSec() * 1000);
    }

    function cleanupCurrentQuestion() {
        if (typeof state.currentCleanup === "function") {
            try {
                state.currentCleanup();
            } catch (err) {
                console.warn("question cleanup failed", err);
            }
        }
        state.currentCleanup = null;
        state.getAnswer = null;
    }

    function setQuestionController(controller) {
        if (typeof controller === "function") {
            state.getAnswer = controller;
            state.currentCleanup = null;
            return;
        }
        if (controller && typeof controller.getAnswer === "function") {
            state.getAnswer = controller.getAnswer;
            state.currentCleanup =
                typeof controller.cleanup === "function"
                    ? controller.cleanup
                    : null;
            return;
        }
        state.getAnswer = null;
        state.currentCleanup = null;
    }

    function show(which) {
        setup.hidden = which !== "setup";
        play.hidden = which !== "play";
        result.hidden = which !== "result";
        if (which !== "result") stopConfetti();
        if (which !== "play") stopSessionTimer();
        if (which !== "play") cleanupCurrentQuestion();
        if (which === "play") play.scrollIntoView({ behavior: "smooth" });
        if (which === "result") result.scrollIntoView({ behavior: "smooth" });
    }

    // --- setup ---

    function loadSavedConfig() {
        try {
            const saved = JSON.parse(
                localStorage.getItem("homework:" + spec.id) || "null",
            );
            if (saved && spec.loadConfig) spec.loadConfig(formSetup, saved);
            if (saved) {
                const tm = formSetup?.elements?.["time-mode"];
                if (tm && typeof saved.timeMode === "boolean")
                    tm.checked = saved.timeMode;
                const dOn = formSetup?.elements?.["deadline-on"];
                if (dOn && typeof saved.deadlineOn === "boolean")
                    dOn.checked = saved.deadlineOn;
                const ds = formSetup?.elements?.["deadline-seconds"];
                if (ds && saved.deadlineSeconds) ds.value = saved.deadlineSeconds;
            }
        } catch {}
        // Sync visibility of both nested toggles to whatever was restored.
        syncTimeModeFields();
    }

    // The time-mode block has two layers of disclosure:
    //   1. "time-mode" checkbox reveals the deadline-on checkbox
    //   2. "deadline-on" checkbox reveals the deadline-seconds input
    function syncTimeModeFields() {
        const tm = formSetup?.elements?.["time-mode"];
        const dOn = formSetup?.elements?.["deadline-on"];
        const section = document.getElementById("deadline-section");
        const field = document.getElementById("deadline-field");
        const timeOn = !!tm?.checked;
        if (section) section.hidden = !timeOn;
        if (!timeOn && dOn) dOn.checked = false;
        if (field) field.hidden = !(timeOn && dOn?.checked);
    }
    formSetup
        ?.elements?.["time-mode"]
        ?.addEventListener("change", syncTimeModeFields);
    formSetup
        ?.elements?.["deadline-on"]
        ?.addEventListener("change", syncTimeModeFields);

    // Augment whatever the exercise's readConfig returns with the shared
    // time-mode fields (read here, not in every exercise).
    function readConfigWithTimeMode(form) {
        const cfg = spec.readConfig(form);
        const tm = form.elements?.["time-mode"];
        const dOn = form.elements?.["deadline-on"];
        const ds = form.elements?.["deadline-seconds"];
        cfg.timeMode = !!tm?.checked;
        cfg.deadlineOn = !!(cfg.timeMode && dOn?.checked);
        cfg.deadlineSeconds =
            cfg.deadlineOn && ds?.value ? Number(ds.value) : 0;
        return cfg;
    }

    function persistConfig(cfg) {
        try {
            localStorage.setItem("homework:" + spec.id, JSON.stringify(cfg));
        } catch {}
    }

    function setError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg || "";
        errorEl.hidden = !msg;
    }

    // --- play ---

    function startSession(deck, config, mode) {
        state.config = config;
        state.deck = deck;
        state.questions = [];
        state.currentIndex = -1;
        state.startedAt = Date.now();
        state.sessionId = uuid();
        state.mode = mode || "normal";
        state.streak = 0;
        // A "normal" session starts a fresh run; a "mistakes" session is a
        // continuation of the current run, so cycles accumulate.
        if (state.mode !== "mistakes") state.cycles = [];
        show("play");
        startSessionTimer();
        nextQuestion();
    }

    function nextQuestion() {
        cleanupCurrentQuestion();
        state.currentIndex += 1;
        if (state.currentIndex >= state.deck.length) {
            finish();
            return;
        }
        state.currentQuestion = state.deck[state.currentIndex];
        state.currentAttempts = 0;
        state.currentGiven = null;
        state.questionStartedAt = Date.now();
        feedbackEl.textContent = " ";
        feedbackEl.classList.remove("is-bad");
        if (skipBtn) skipBtn.hidden = true;

        // Clean up any lock/animation state left over from a previous question.
        contentEl.classList.remove("locked", "is-wrong", "question-enter");
        const checkBtn = document.getElementById("button-check");
        if (checkBtn) checkBtn.hidden = false;
        document.getElementById("button-next")?.remove();

        titleEl.textContent = `oefening ${state.currentIndex + 1} van ${state.deck.length}`;

        contentEl.innerHTML = "";
        setQuestionController(
            spec.renderQuestion(state.currentQuestion, contentEl, {
                kind: "play",
            }),
        );
        // Label any unlabeled answer inputs so screen readers know their purpose.
        contentEl.querySelectorAll('input:not([aria-label]):not([aria-labelledby])').forEach((input) => {
            input.setAttribute('aria-label', 'jouw antwoord');
        });
        // Trigger entrance animation after content is in the DOM.
        void contentEl.offsetWidth;
        contentEl.classList.add("question-enter");

        startDeadline();
        updateClock();

        const firstInput = contentEl.querySelector("input, [tabindex]");
        if (firstInput && typeof firstInput.focus === "function")
            firstInput.focus();
    }

    function recordOutcome(correct, given, skipped, opts = {}) {
        state.questions.push({
            question: state.currentQuestion,
            attempts: state.currentAttempts,
            skipped: !!skipped,
            timedOut: !!opts.timedOut,
            elapsedMs: Date.now() - state.questionStartedAt,
            given,
            correct,
            label: spec.describe ? spec.describe(state.currentQuestion) : null,
        });
    }

    function onDeadlineExpired() {
        // Don't auto-advance — the kid should see the question they ran out
        // of time on, in a clearly-locked state. They tap "volgende" to move
        // on. The outcome is already recorded; the deadline timer is cleared
        // so the live countdown stops ticking.
        recordOutcome(false, state.currentGiven, true, { timedOut: true });
        clearTimeout(state.deadlineTimerHandle);
        state.deadlineTimerHandle = null;
        cleanupCurrentQuestion();

        contentEl.innerHTML = "";
        spec.renderQuestion(state.currentQuestion, contentEl, {
            kind: "review",
            given: state.currentGiven,
            correct: false,
        });
        state.streak = 0;
        contentEl.classList.add("locked");
        feedbackEl.textContent = "⏰ te traag";
        feedbackEl.classList.add("is-bad");

        const checkBtn = document.getElementById("button-check");
        if (checkBtn) checkBtn.hidden = true;
        if (skipBtn) skipBtn.hidden = true;
        const actions = formExercise.querySelector(".exercise-actions");
        if (actions && !document.getElementById("button-next")) {
            const next = document.createElement("button");
            next.type = "button";
            next.className = "primary";
            next.id = "button-next";
            next.textContent = "volgende ➡️";
            next.addEventListener("click", (e) => {
                e.preventDefault();
                nextQuestion();
            });
            actions.appendChild(next);
            next.focus();
        }
        updateClock();
    }

    function onWrongAttempt(given) {
        state.currentAttempts += 1;
        state.currentGiven = given;
        state.streak = 0;
        feedbackEl.textContent = `${randomAnimal()} probeer het nog eens.`;
        // Remove then re-add so the animation re-fires on repeated wrong answers.
        feedbackEl.classList.remove("is-bad");
        contentEl.classList.remove("is-wrong", "question-enter");
        void contentEl.offsetWidth; // one forced reflow re-arms both animations
        feedbackEl.classList.add("is-bad");
        contentEl.classList.add("is-wrong");
        if (skipBtn) skipBtn.hidden = false;
    }

    // Brief green glow on the exercise card; intensity scales with streak.
    function flashCorrect(streak) {
        if (!exerciseEl) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        exerciseEl.classList.remove("is-correct", "is-streak-mid", "is-streak-high");
        void exerciseEl.offsetWidth;
        exerciseEl.classList.add("is-correct");
        if (streak >= 5) exerciseEl.classList.add("is-streak-high");
        else if (streak >= 3) exerciseEl.classList.add("is-streak-mid");
        setTimeout(() => {
            exerciseEl.classList.remove("is-correct", "is-streak-mid", "is-streak-high");
        }, 450);
    }

    function onCorrect(given) {
        recordOutcome(true, given, false);
        if (state.currentAttempts === 0) state.streak++;
        else state.streak = 0;
        flashCorrect(state.streak);
        nextQuestion();
    }

    function onSkip() {
        state.streak = 0;
        recordOutcome(false, state.currentGiven, true);
        nextQuestion();
    }

    function finish() {
        stopSessionTimer();
        const total = state.questions.length;
        const correct = state.questions.filter((q) => q.correct).length;
        const finishedAt = Date.now();
        const session = {
            id: state.sessionId,
            exerciseId: spec.id,
            exerciseLabel: spec.label,
            mode: state.mode,
            config: state.config,
            startedAt: state.startedAt,
            finishedAt,
            total,
            correct,
            questions: state.questions,
            timeMode: !!state.config?.timeMode,
            durationMs: finishedAt - state.startedAt,
        };
        state.cycles.push(session);
        saveSession(session).then(() => {
            // Re-evaluate the parent history block (mistakes/clear buttons,
            // session list) so it's accurate when the user goes back to setup.
            setupHistoryView();
        });
        renderResult(session);
        show("result");
    }

    function renderResult(session) {
        const wrong = session.questions.filter((q) => !q.correct);
        const tricky = session.questions.filter(
            (q) => q.correct && q.attempts > 0,
        );
        const score = session.correct;
        const total = session.total;
        const cycleNum = state.cycles.length;
        const isMultiCycle = cycleNum > 1;

        const headline = isMultiCycle
            ? `<h2>🎉 ronde ${cycleNum} afgerond</h2>`
            : `<h2>🎉 klaar</h2>`;

        const cyclesList = state.cycles
            .map((c, i) => cycleSummaryLine(c, i + 1))
            .join("");

        const trickyList = renderTrickyList(session);

        const reviewable = wrong.length > 0;

        const sessionTime =
            session.timeMode && session.durationMs
                ? ` <small class="muted">in ⏱️ ${formatMillis(session.durationMs)}</small>`
                : "";
        let html = `
            ${headline}
            <h3>${score} / ${total}${isMultiCycle ? ` <small class="muted">deze ronde</small>` : ""}${sessionTime}</h3>
            ${isMultiCycle ? `<section class="result-cycles"><h3 class="section-title">Overzicht per ronde</h3>${cyclesList}</section>` : ""}
            <div class="result-actions">
                ${reviewable ? `<button type="button" class="primary" id="review-button-repeat">🟢 oefen fouten opnieuw</button>` : ""}
                <button type="button" class="button-reset">🆕 nieuwe oefening</button>
            </div>
            ${trickyList}
        `;
        resultEl.innerHTML = html;

        // hook up the freshly-rendered "🆕 nieuwe oefening" — the global
        // .button-reset listener was wired before this button existed.
        resultEl.querySelectorAll(".button-reset").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                show("setup");
            });
        });

        const confetti = document.getElementById("confetti");
        if (confetti) setConfettiActive(score === total && total > 0);

        if (!reviewable) return;

        const repeatBtn = document.getElementById("review-button-repeat");
        repeatBtn?.addEventListener("click", () => {
            const deck = shuffle(wrong.map((w) => w.question));
            startSession(deck, state.config, "mistakes");
        });
    }

    // --- form wiring ---

    formSetup?.addEventListener("submit", (e) => {
        e.preventDefault();
        setError(null);
        let cfg;
        try {
            cfg = readConfigWithTimeMode(formSetup);
        } catch (err) {
            setError(String(err.message || err));
            return;
        }
        if (spec.validateConfig) {
            const err = spec.validateConfig(cfg);
            if (err) {
                setError(err);
                return;
            }
        }
        persistConfig(cfg);
        const deck = spec.buildDeck(cfg);
        if (!deck || deck.length === 0) {
            setError("Geen oefeningen gegenereerd, controleer je instellingen.");
            return;
        }
        startSession(deck, cfg, "normal");
    });

    formExercise?.addEventListener("submit", (e) => {
        e.preventDefault();
        if (!state.getAnswer) return;
        const given = state.getAnswer();
        if (given === null || given === undefined || given === "") return;
        if (spec.isCorrect(state.currentQuestion, given)) {
            onCorrect(given);
        } else {
            onWrongAttempt(given);
        }
    });

    // skip is type=reset; intercept to log + advance
    skipBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        onSkip();
    });

    document.querySelectorAll(".button-reset").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            show("setup");
        });
    });

    // "practice mistakes" button exposed by mountHistory
    document.addEventListener("homework:practice-mistakes", async () => {
        const mistakes = await recentMistakes(spec.id, 30);
        if (mistakes.length === 0) {
            const sessions = await listSessions(spec.id, 1);
            if (sessions.length === 0) {
                setError(
                    "Nog niets om te herhalen 💪 maak eerst een oefening, daarna kan je hier de moeilijke vragen terugzien.",
                );
            } else {
                setError(
                    "Goed bezig 🎉 alle recente oefeningen zijn juist gemaakt — geen fouten om te herhalen.",
                );
            }
            return;
        }
        const picked = await pickMistakes(spec, mistakes);
        if (!picked || picked.length === 0) return;
        const cfg = readConfigWithTimeMode(formSetup);
        startSession(shuffle(picked.slice()), cfg, "mistakes");
    });

    loadSavedConfig();
    enableTouchSubmit(formSetup);
    enableTouchSubmit(formExercise);
    show("setup");
    setupHistoryView();
    // Allow exercise scripts to trigger a history refresh when the deck/variant changes.
    document.addEventListener("homework:refresh-history", setupHistoryView);
}

// ---------- parent history view ----------

async function setupHistoryView() {
    const root = document.getElementById("history");
    if (!root) return;
    if (!root.dataset.exerciseId) return;

    let list = root.querySelector(".history-list");
    if (!list) {
        list = document.createElement("div");
        list.className = "history-list";
        root.querySelector(".history-content").appendChild(list);
    }

    async function refresh() {
        const exerciseId = root.dataset.exerciseId;
        if (!exerciseId) return;
        const sessions = await listSessions(exerciseId, 20);
        const mistakes = await recentMistakes(exerciseId, 1);

        const practiceBtn = root.querySelector("[data-action='practice-mistakes']");
        const clearBtn = root.querySelector("[data-action='clear-history']");
        if (practiceBtn) practiceBtn.disabled = mistakes.length === 0;
        if (clearBtn) clearBtn.disabled = sessions.length === 0;

        if (sessions.length === 0) {
            list.innerHTML =
                '<p class="history-empty">Nog geen oefeningen gemaakt.</p>';
            return;
        }
        list.innerHTML = sessions
            .map((s) => {
                const { wrong, tricky } = splitQuestionOutcomes(s);
                const hasMistakes = wrong.length > 0 || tricky.length > 0;
                const items = renderOutcomeItems({ wrong, tricky });

                const scoreParts = [`${s.correct} / ${s.total}`];
                if (s.timeMode && s.durationMs)
                    scoreParts.push(`⏱️ ${formatMillis(s.durationMs)}`);
                if (s.config?.deadlineSeconds)
                    scoreParts.push(`⏰ ${s.config.deadlineSeconds}s`);
                if (s.mode === "mistakes") scoreParts.push("foutenmodus");

                return `
                    <article class="history-session">
                        <div class="history-session-header">
                            <span>${formatDate(s.finishedAt || s.startedAt)}</span>
                            <span>${scoreParts.join(" · ")}</span>
                        </div>
                        ${hasMistakes
                            ? `<ul class="result-detail-list history-detail-list">${items}</ul>`
                            : `<p class="history-perfect">✨ alles vlekkeloos</p>`
                        }
                    </article>
                `;
            })
            .join("");
    }

    refresh();

    if (root.dataset.bound === "true") return;
    root.dataset.bound = "true";

    const practiceBtn = root.querySelector("[data-action='practice-mistakes']");
    practiceBtn?.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("homework:practice-mistakes"));
    });

    const clearBtn = root.querySelector("[data-action='clear-history']");
    clearBtn?.addEventListener("click", async () => {
        if (
            !confirm(
                "Alle geschiedenis voor deze oefening wissen? Dit kan niet ongedaan worden gemaakt.",
            )
        )
            return;
        try {
            const exerciseId = root.dataset.exerciseId;
            await withStore("readwrite", (store) => {
                return new Promise((resolve, reject) => {
                    const idx = store.index("by_exercise");
                    const req = idx.openCursor(IDBKeyRange.only(exerciseId));
                    req.onsuccess = (e) => {
                        const c = e.target.result;
                        if (c) {
                            c.delete();
                            c.continue();
                        } else resolve();
                    };
                    req.onerror = () => reject(req.error);
                });
            });
        } catch {}
        refresh();
    });
}

// ---------- confetti ----------

const confettiState = {
    canvas: null,
    ctx: null,
    parts: [],
    rafId: 0,
    resizeHandler: null,
    running: false,
    width: 0,
    height: 0,
};

function setConfettiActive(active) {
    const canvas = document.getElementById("confetti");
    if (!canvas) return;
    if (!active) {
        stopConfetti();
        return;
    }
    canvas.dataset.active = "true";
    startConfetti();
}

export function startConfetti() {
    const canvas = document.getElementById("confetti");
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (confettiState.running) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    confettiState.canvas = canvas;
    confettiState.ctx = ctx;
    confettiState.running = true;
    canvas.dataset.active = "true";
    canvas.style.opacity = "1";
    const colors = [
        "#ff7336",
        "#f9e038",
        "#02cca4",
        "#383082",
        "#fed3f5",
        "#b1245a",
        "#f2733f",
    ];
    // Fewer particles on small screens; still a full celebratory burst.
    const N = window.innerWidth < 500 ? 40 : 60;
    const parts = [];
    const resize = () => {
        confettiState.width = canvas.width = window.innerWidth;
        confettiState.height = canvas.height = window.innerHeight;
    };
    confettiState.resizeHandler = resize;
    window.addEventListener("resize", resize);
    resize();
    for (let i = 0; i < N; i++) {
        const r = 8 + Math.random() * 16;
        const d = Math.random() * N + 11;
        parts.push({
            x: Math.random() * confettiState.width,
            y: Math.random() * confettiState.height - confettiState.height,
            r,
            vy: (Math.cos(d) + 3 + r / 2) / 2, // precomputed — no cos() in the draw loop
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: 0,
            tiltAngleInc: Math.random() * 0.07 + 0.05,
            tiltAngle: 0,
        });
    }
    confettiState.parts = parts;
    // Confetti bursts for TOTAL ms then fades out over FADE ms and stops.
    // No respawning — avoids an indefinite rAF loop draining the battery.
    const TOTAL = 4000;
    const FADE  = 700;
    const t0 = Date.now();
    function draw() {
        if (!confettiState.running) return;
        const elapsed = Date.now() - t0;
        if (elapsed >= TOTAL) {
            stopConfetti();
            return;
        }
        // Smooth opacity fade-out during the last FADE ms.
        canvas.style.opacity = elapsed < TOTAL - FADE
            ? "1"
            : String(1 - (elapsed - (TOTAL - FADE)) / FADE);
        confettiState.rafId = requestAnimationFrame(draw);
        ctx.clearRect(0, 0, confettiState.width, confettiState.height);
        for (let i = 0; i < N; i++) {
            const p = parts[i];
            ctx.beginPath();
            ctx.lineWidth = p.r / 2;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 3, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5);
            ctx.stroke();
            p.tiltAngle += p.tiltAngleInc;
            p.y += p.vy;
            p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;
        }
    }
    draw();
}

export function stopConfetti() {
    if (confettiState.rafId) {
        cancelAnimationFrame(confettiState.rafId);
        confettiState.rafId = 0;
    }
    if (confettiState.resizeHandler) {
        window.removeEventListener("resize", confettiState.resizeHandler);
        confettiState.resizeHandler = null;
    }
    if (confettiState.ctx && confettiState.canvas) {
        confettiState.ctx.clearRect(
            0,
            0,
            confettiState.canvas.width,
            confettiState.canvas.height,
        );
    }
    if (confettiState.canvas) {
        confettiState.canvas.dataset.active = "false";
    }
    confettiState.parts = [];
    confettiState.running = false;
}

// ---------- bootstrap ----------

// ---------- home page: hydrate per-exercise stats ----------

function relativeDate(ts) {
    if (!ts) return "";
    const diffMs = Date.now() - ts;
    const day = 24 * 60 * 60 * 1000;
    const days = Math.floor(diffMs / day);
    if (days <= 0) return "vandaag";
    if (days === 1) return "gisteren";
    if (days < 7) return `${days} dagen geleden`;
    if (days < 30) return `${Math.floor(days / 7)} weken geleden`;
    return formatDate(ts).split(" ")[0];
}

// Scan all sessions newest-first and return those whose exerciseId starts with `prefix`.
// Used as a fallback for exercises that store sessions under per-variant IDs
// (e.g. "flashcards-<deckId>") so the home page still shows stats for "flashcards".
async function listRecentWithPrefix(prefix, limit = 5) {
    try {
        return await withStore("readonly", (store) => {
            return new Promise((resolve, reject) => {
                const results = [];
                const idx = store.index("by_finishedAt");
                const req = idx.openCursor(null, "prev");
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) { resolve(results); return; }
                    if (cursor.value.exerciseId.startsWith(prefix)) {
                        results.push(cursor.value);
                        if (results.length >= limit) { resolve(results); return; }
                    }
                    cursor.continue();
                };
                req.onerror = () => reject(req.error);
            });
        });
    } catch {
        return [];
    }
}

async function hydrateHomeStats() {
    const slots = document.querySelectorAll("[data-stats-for]");
    if (slots.length === 0) return;
    for (const slot of slots) {
        const id = slot.dataset.statsFor;
        let sessions = await listSessions(id, 5);
        // Fallback: exercise may use per-variant IDs (e.g. "flashcards-<deckId>").
        if (sessions.length === 0) sessions = await listRecentWithPrefix(id + "-", 5);
        if (sessions.length === 0) {
            slot.textContent = "nog niet geoefend";
            continue;
        }
        const last = sessions[0];
        const score = `${last.correct}/${last.total}`;
        const when = relativeDate(last.finishedAt || last.startedAt);
        slot.textContent = `🎯 ${score} · ${when}`;
        if (last.correct === last.total && last.total > 0) {
            slot.dataset.best = "true";
        }
    }
}

// ---------- numeric input filter ----------
//
// `pattern` only validates on submit ("gebruik de gevraagde indeling" is
// the default Dutch failure message — clear as mud). Instead, intercept
// non-digits as the child types or pastes so the field can never hold
// anything invalid in the first place. Negative numbers are allowed when
// the field's `pattern` includes a `-` (e.g. the thermometer answer).
document.addEventListener("input", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.inputMode !== "numeric") return;
    const allowNeg = (t.pattern || "").includes("-");
    let v = t.value;
    v = allowNeg
        ? v.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "")
        : v.replace(/[^0-9]/g, "");
    if (v !== t.value) {
        const pos = t.selectionStart;
        t.value = v;
        try {
            const back = Math.max(0, (pos ?? v.length) - 1);
            t.setSelectionRange(back, back);
        } catch {}
    }
});

setupOfflineIndicator();
registerServiceWorker();
window.addEventListener("DOMContentLoaded", () => {
    hydrateHomeStats();
});
