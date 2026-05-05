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
    // Include both real "fouts" (final answer wrong / skipped) and "trickies"
    // (eventually correct but only after one or more wrong attempts) — both
    // benefit from being practised again.
    const sessions = await listSessions(exerciseId, 25);
    const mistakes = [];
    const seen = new Set();
    for (const s of sessions) {
        for (const item of s.questions || []) {
            const isMistake = !item.correct || (item.attempts || 0) > 0;
            if (!isMistake) continue;
            const key = JSON.stringify(item.question);
            if (seen.has(key)) continue;
            seen.add(key);
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

// ---------- offline / service worker ----------

function setupOfflineIndicator() {
    const update = () => {
        document.body.classList.toggle("is-offline", !navigator.onLine);
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
}

function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker
        .register("/service-worker.js")
        .catch((err) => console.warn("sw register failed", err));
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
    return `
        <div class="cycle-row">
            <span class="cycle-num">ronde ${n}</span>
            <span class="cycle-score">${session.correct}/${session.total}</span>
            ${modeLabel}
            <span class="cycle-detail">${detail.join(" ")}</span>
        </div>
    `;
}

function renderTrickyList(session) {
    const wrong = (session.questions || []).filter((q) => !q.correct);
    const tricky = (session.questions || []).filter(
        (q) => q.correct && q.attempts > 0,
    );
    if (wrong.length === 0 && tricky.length === 0) return "";

    const li = (q, kind) => {
        const desc = q.label
            ? escapeHtml(q.label)
            : escapeHtml(JSON.stringify(q.question));
        if (kind === "wrong") {
            const attempts =
                q.attempts > 0
                    ? ` · ${q.attempts}× verkeerd geprobeerd`
                    : "";
            const skipped = q.skipped ? " · overgeslagen" : "";
            return `<li><span class="badge bad">fout</span> ${desc}${attempts}${skipped}</li>`;
        }
        return `<li><span class="badge tricky">${q.attempts}× fout vooraf</span> ${desc}</li>`;
    };
    const items = [
        ...wrong.map((q) => li(q, "wrong")),
        ...tricky.map((q) => li(q, "tricky")),
    ].join("");
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
 *   renderQuestion: (q, root, mode) => getAnswer
 *      mode = { kind: 'play' } | { kind: 'review', given, correct }
 *      For 'play', return a function that yields the user's answer
 *      (or null if unanswerable).
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

    const state = {
        config: null,
        deck: [],
        questions: [], // session log
        currentIndex: -1,
        currentQuestion: null,
        currentAttempts: 0,
        currentGiven: null,
        getAnswer: null,
        startedAt: 0,
        sessionId: null,
        mode: "normal", // 'normal' or 'mistakes'
        // Within a single user-perceived "run" (start until they go back to
        // setup), every completed session — including retry-mistakes loops —
        // is appended here so the finish page can show the whole arc.
        cycles: [],
    };

    function show(which) {
        setup.hidden = which !== "setup";
        play.hidden = which !== "play";
        result.hidden = which !== "result";
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
        } catch {}
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
        // A "normal" session starts a fresh run; a "mistakes" session is a
        // continuation of the current run, so cycles accumulate.
        if (state.mode !== "mistakes") state.cycles = [];
        show("play");
        nextQuestion();
    }

    function nextQuestion() {
        state.currentIndex += 1;
        if (state.currentIndex >= state.deck.length) {
            finish();
            return;
        }
        state.currentQuestion = state.deck[state.currentIndex];
        state.currentAttempts = 0;
        state.currentGiven = null;
        feedbackEl.textContent = " ";
        feedbackEl.classList.remove("is-bad");
        if (skipBtn) skipBtn.hidden = true;

        titleEl.textContent = `oefening ${state.currentIndex + 1} van ${state.deck.length}`;

        contentEl.innerHTML = "";
        state.getAnswer = spec.renderQuestion(state.currentQuestion, contentEl, {
            kind: "play",
        });

        const firstInput = contentEl.querySelector("input, [tabindex]");
        if (firstInput && typeof firstInput.focus === "function")
            firstInput.focus();
    }

    function recordOutcome(correct, given, skipped) {
        state.questions.push({
            question: state.currentQuestion,
            attempts: state.currentAttempts,
            skipped: !!skipped,
            given,
            correct,
            label: spec.describe ? spec.describe(state.currentQuestion) : null,
        });
    }

    function onWrongAttempt(given) {
        state.currentAttempts += 1;
        state.currentGiven = given;
        feedbackEl.textContent = `${randomAnimal()} probeer het nog eens.`;
        feedbackEl.classList.add("is-bad");
        if (skipBtn) skipBtn.hidden = false;
    }

    function onCorrect(given) {
        recordOutcome(true, given, false);
        nextQuestion();
    }

    function onSkip() {
        recordOutcome(false, state.currentGiven, true);
        nextQuestion();
    }

    function finish() {
        const total = state.questions.length;
        const correct = state.questions.filter((q) => q.correct).length;
        const session = {
            id: state.sessionId,
            exerciseId: spec.id,
            exerciseLabel: spec.label,
            mode: state.mode,
            config: state.config,
            startedAt: state.startedAt,
            finishedAt: Date.now(),
            total,
            correct,
            questions: state.questions,
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

        let html = `
            ${headline}
            <h3>${score} / ${total}${isMultiCycle ? ` <small class="muted">deze ronde</small>` : ""}</h3>
            ${isMultiCycle ? `<section class="result-cycles"><h3 class="section-title">Overzicht per ronde</h3>${cyclesList}</section>` : ""}
            ${trickyList}
            <div class="result-actions">
                ${reviewable ? `<button type="button" class="primary" id="review-button-repeat">🟢 oefen fouten opnieuw</button>` : ""}
                <button type="button" class="button-reset">🆕 nieuwe oefening</button>
            </div>
            ${reviewable ? `
                <h3 class="section-title">${randomAnimal()} bekijk goed</h3>
                <div class="button-pair">
                    <button type="button" id="review-button-back">⬅️ vorige</button>
                    <button type="button" id="review-button-next">volgende ➡️</button>
                </div>
                <div id="review"></div>
            ` : ""}
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
        if (confetti) {
            const active = score === total && total > 0;
            confetti.dataset.active = active ? "true" : "false";
            if (active && !confetti.dataset.started) {
                confetti.dataset.started = "1";
                startConfetti();
            }
        }

        if (!reviewable) return;
        let idx = 0;
        const reviewEl = document.getElementById("review");
        const backBtn = document.getElementById("review-button-back");
        const nextBtn = document.getElementById("review-button-next");
        const repeatBtn = document.getElementById("review-button-repeat");

        function renderItem() {
            const item = wrong[idx];
            reviewEl.innerHTML = "";
            const root = document.createElement("div");
            root.className = "box exercise-feedback";
            spec.renderQuestion(item.question, root, {
                kind: "review",
                given: item.given,
                correct: false,
            });
            reviewEl.appendChild(root);
            backBtn.disabled = idx === 0;
            nextBtn.disabled = idx === wrong.length - 1;
        }
        backBtn.addEventListener("click", () => {
            if (idx > 0) {
                idx -= 1;
                renderItem();
            }
        });
        nextBtn.addEventListener("click", () => {
            if (idx < wrong.length - 1) {
                idx += 1;
                renderItem();
            }
        });
        repeatBtn?.addEventListener("click", () => {
            const deck = shuffle(wrong.map((w) => w.question));
            startSession(deck, state.config, "mistakes");
        });
        renderItem();
    }

    // --- form wiring ---

    formSetup?.addEventListener("submit", (e) => {
        e.preventDefault();
        setError(null);
        let cfg;
        try {
            cfg = spec.readConfig(formSetup);
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
        const cfg = spec.readConfig(formSetup);
        startSession(shuffle(mistakes.slice()), cfg, "mistakes");
    });

    loadSavedConfig();
    show("setup");
    setupHistoryView();
}

// ---------- parent history view ----------

async function setupHistoryView() {
    const root = document.getElementById("history");
    if (!root) return;
    const exerciseId = root.dataset.exerciseId;
    if (!exerciseId) return;

    let list = root.querySelector(".history-list");
    if (!list) {
        list = document.createElement("div");
        list.className = "history-list";
        root.querySelector(".history-content").appendChild(list);
    }

    async function refresh() {
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
                const questions = s.questions || [];
                const wrong = questions.filter((q) => !q.correct);
                const tricky = questions.filter(
                    (q) => q.correct && q.attempts > 0,
                );
                let summary;
                if (wrong.length === 0 && tricky.length === 0) {
                    summary = "✨ alles vlekkeloos";
                } else {
                    const parts = [];
                    if (wrong.length > 0) {
                        parts.push(
                            `${wrong.length} fout${wrong.length === 1 ? "" : "en"}`,
                        );
                    }
                    if (tricky.length > 0) {
                        parts.push(
                            `${tricky.length} moeilijk${tricky.length === 1 ? "" : "e"}`,
                        );
                    }
                    summary = parts.join(" · ");
                }
                const itemHtml = (q, kind) => {
                    const desc = q.label
                        ? escapeHtml(q.label)
                        : escapeHtml(JSON.stringify(q.question));
                    if (kind === "wrong") {
                        const attempts =
                            q.attempts > 0
                                ? ` · ${q.attempts}× verkeerd geprobeerd`
                                : "";
                        const skipped = q.skipped ? " · overgeslagen" : "";
                        return `<li><span class="badge bad">fout</span> ${desc}${attempts}${skipped}</li>`;
                    }
                    return `<li><span class="badge tricky">${q.attempts}× fout vooraf</span> ${desc}</li>`;
                };
                const items = [
                    ...wrong.map((q) => itemHtml(q, "wrong")),
                    ...tricky.map((q) => itemHtml(q, "tricky")),
                ].join("");
                return `
                    <article class="history-session">
                        <div class="history-session-header">
                            <span>${formatDate(s.finishedAt || s.startedAt)}</span>
                            <span>${s.correct} / ${s.total}${
                                s.mode === "mistakes" ? " · foutenmodus" : ""
                            }</span>
                        </div>
                        <div class="history-mistakes">
                            <div>${summary}</div>
                            ${items ? `<ul>${items}</ul>` : ""}
                        </div>
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

export function startConfetti() {
    const canvas = document.getElementById("confetti");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = (canvas.width = window.innerWidth);
    let H = (canvas.height = window.innerHeight);
    const colors = [
        "#ff7336",
        "#f9e038",
        "#02cca4",
        "#383082",
        "#fed3f5",
        "#b1245a",
        "#f2733f",
    ];
    const N = 30;
    const parts = [];
    for (let i = 0; i < N; i++) {
        parts.push({
            x: Math.random() * W,
            y: Math.random() * H - H,
            r: 11 + Math.random() * 22,
            d: Math.random() * N + 11,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.floor(Math.random() * 33) - 11,
            tiltAngleInc: Math.random() * 0.07 + 0.05,
            tiltAngle: 0,
        });
    }
    function draw() {
        requestAnimationFrame(draw);
        ctx.clearRect(0, 0, W, H);
        for (let i = 0; i < N; i++) {
            const p = parts[i];
            ctx.beginPath();
            ctx.lineWidth = p.r / 2;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 3, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 5);
            ctx.stroke();
            p.tiltAngle += p.tiltAngleInc;
            p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
            p.tilt = Math.sin(p.tiltAngle - i / 3) * 15;
            if (p.x > W + 30 || p.x < -30 || p.y > H) {
                p.x = Math.random() * W;
                p.y = -30;
                p.tilt = Math.floor(Math.random() * 10) - 20;
            }
        }
    }
    window.addEventListener("resize", () => {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    });
    draw();
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

async function hydrateHomeStats() {
    const slots = document.querySelectorAll("[data-stats-for]");
    if (slots.length === 0) return;
    for (const slot of slots) {
        const id = slot.dataset.statsFor;
        const sessions = await listSessions(id, 5);
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
