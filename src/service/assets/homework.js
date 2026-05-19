// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

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

// Single shared connection — opened once and reused for all operations.
// Reset on versionchange (another tab opened a higher-version DB) and on
// close (browser GC, quota eviction) so the next call opens a fresh handle
// instead of crashing every subsequent transaction with InvalidStateError.
let _dbPromise = null;
function openDb() {
    if (!("indexedDB" in window)) return Promise.reject(new Error("indexedDB not supported"));
    if (!_dbPromise) {
        _dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    const store = db.createObjectStore(STORE, { keyPath: "id" });
                    store.createIndex("by_exercise", "exerciseId");
                    store.createIndex("by_finishedAt", "finishedAt");
                }
            };
            req.onsuccess = () => {
                const db = req.result;
                // Another tab is upgrading the schema. Close so it can proceed
                // and force the next withStore() call to re-open with the new
                // version.
                db.onversionchange = () => {
                    db.close();
                    _dbPromise = null;
                };
                // UA closed the connection (quota eviction, etc.). Same drill.
                db.onclose = () => {
                    _dbPromise = null;
                };
                resolve(db);
            };
            req.onblocked = () => {
                // We're holding the old version open while another tab is
                // trying to upgrade. Clear the cached promise so a retry from
                // the caller opens a fresh handle.
                _dbPromise = null;
            };
            req.onerror = () => {
                _dbPromise = null; // allow retry on transient failure
                reject(req.error);
            };
        });
    }
    return _dbPromise;
}

async function withStore(mode, fn) {
    let db;
    try {
        db = await openDb();
    } catch {
        return null;
    }
    return new Promise((resolve, reject) => {
        let tx;
        try {
            tx = db.transaction(STORE, mode);
        } catch (e) {
            // db.transaction throws InvalidStateError if the connection is
            // closed (versionchange, quota eviction, …). Null the cached
            // promise so the next call re-opens.
            _dbPromise = null;
            reject(e);
            return;
        }
        const store = tx.objectStore(STORE);
        let result;
        let fnError = null;
        // Race the work against transaction completion explicitly. If fn
        // rejects, abort the tx and surface the error — the previous version
        // let tx.oncomplete win and silently dropped cursor errors.
        Promise.resolve()
            .then(() => fn(store))
            .then((r) => {
                result = r;
            })
            .catch((err) => {
                fnError = err;
                try {
                    tx.abort();
                } catch {}
            });
        tx.oncomplete = () => {
            if (fnError) reject(fnError);
            else resolve(result);
        };
        tx.onerror = () => reject(fnError || tx.error);
        tx.onabort = () => reject(fnError || tx.error || new Error("transaction aborted"));
    });
}

async function saveSession(session) {
    try {
        await withStore("readwrite", (store) => store.put(session));
    } catch (_err) {}
}

async function listSessions(exerciseId, limit = 20) {
    try {
        return (
            (await withStore("readonly", (store) => {
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
                            results.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
                            resolve(results);
                        }
                    };
                    req.onerror = () => reject(req.error);
                });
            })) ?? []
        );
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
            const isMistake = isPracticeMistake(item);
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
export function pad(n) {
    return String(n).padStart(2, "0");
}

/**
 * Read typed values out of a form.
 *   read.number(form, 'num-exercises')          → Number
 *   read.radio(form, 'granularity', 'five')     → string (fallback when nothing checked)
 *   read.checkboxes(form, 'kinds')              → string[]
 *   read.checkbox(form, 'use-24h')              → boolean
 */
export const read = {
    number: (form, name) => Number(form.elements[name]?.value),
    radio: (form, name, fallback = "") => form.querySelector(`input[name="${name}"]:checked`)?.value ?? fallback,
    checkboxes: (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((cb) => cb.value),
    checkbox: (form, name) => !!form.elements[name]?.checked,
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
        form.querySelectorAll(`input[name="${name}"]`).forEach((cb) => {
            cb.checked = vals.includes(cb.value);
        });
    },
    checkbox(form, name, val) {
        if (val != null && form.elements[name]) form.elements[name].checked = !!val;
    },
};

/**
 * Returns the explicit list of minute values for a given step size.
 *   minutesForStep(5)  → [0, 5, 10, …, 55]
 *   minutesForStep(15) → [0, 15, 30, 45]
 *   minutesForStep(60) → [0]
 */
export function minutesForStep(step) {
    const out = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
}

/**
 * Descriptor-driven form sync — keeps loadConfig and readConfig in sync.
 * Each descriptor: { field: string, type: 'number'|'radio'|'checkboxes'|'checkbox', key: string, default?: any }
 *
 * Usage:
 *   const FIELDS = [
 *     { field: 'num-exercises', type: 'number',    key: 'numExercises' },
 *     { field: 'granularity',   type: 'radio',     key: 'granularity', default: 'kwart' },
 *     { field: 'dir',           type: 'checkboxes', key: 'directions' },
 *     { field: 'use-24h',       type: 'checkbox',  key: 'use24h' },
 *   ];
 *   loadConfig(form, saved) { loadFields(form, FIELDS, saved); }
 *   readConfig(form)        { return readFields(form, FIELDS); }
 */
export function loadFields(form, fields, saved) {
    for (const f of fields) load[f.type](form, f.field, saved[f.key]);
}

export function readFields(form, fields) {
    const result = {};
    for (const f of fields) {
        result[f.key] = f.type === "radio" ? read.radio(form, f.field, f.default ?? "") : read[f.type](form, f.field);
    }
    return result;
}

/** Dutch word for a clock hour (0/12 → "twaalf", 1 → "een", …). */
export function hourName(h) {
    const names = ["twaalf", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien", "elf"];
    return names[((h % 12) + 12) % 12];
}

/**
 * Wire a group of `.option` buttons inside `scope` so only one can be
 * selected at a time. Returns a getter `() => string | null` that yields
 * the `data-value` of the selected button (URL-decoded), or null.
 */
export function wireOptions(scope) {
    let chosen = null;
    scope.querySelectorAll(".option").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            scope.querySelectorAll(".option").forEach((b) => {
                b.classList.remove("selected");
                b.setAttribute("aria-checked", "false");
            });
            btn.classList.add("selected");
            btn.setAttribute("aria-checked", "true");
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
    return (
        String(s)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            // Escape apostrophe too — current callers all use double-quoted
            // attributes, so a single quote in interpolated content isn't an
            // XSS vector today, but a future single-quoted attribute would be.
            .replaceAll("'", "&#39;")
    );
}

/** Pick a random element from a non-empty array. */
export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Strict non-negative integer parser. Returns `null` for anything other
 * than a plain decimal string of digits (and an optional leading "-" when
 * `allowNegative` is true). Rejects "1e2", " 5", "0x10", "5.", "", null,
 * NaN, objects, etc. — these would all sneak past a bare `Number(...)`
 * comparison and let the user "win" an exercise without actually typing
 * the expected answer.
 */
export function parseStrictInt(value, { allowNegative = false } = {}) {
    if (value === null || value === undefined) return null;
    const s = typeof value === "string" ? value : String(value);
    const re = allowNegative ? /^-?\d+$/ : /^\d+$/;
    if (!re.test(s)) return null;
    const n = Number(s);
    return Number.isInteger(n) ? n : null;
}

/** Normalise a Dutch phrase for fuzzy comparison (strip diacritics, collapse whitespace). */
export function normalizePhrase(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
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
        case 0:
            return `${hourName(h12)} uur`;
        case 5:
            return `vijf over ${hourName(h12)}`;
        case 10:
            return `tien over ${hourName(h12)}`;
        case 15:
            return `kwart over ${hourName(h12)}`;
        case 20:
            return `tien voor half ${hourName(next)}`;
        case 25:
            return `vijf voor half ${hourName(next)}`;
        case 30:
            return `half ${hourName(next)}`;
        case 35:
            return `vijf over half ${hourName(next)}`;
        case 40:
            return `tien over half ${hourName(next)}`;
        case 45:
            return `kwart voor ${hourName(next)}`;
        case 50:
            return `tien voor ${hourName(next)}`;
        case 55:
            return `vijf voor ${hourName(next)}`;
        default:
            return null;
    }
}

/**
 * All valid Dutch time phrases for a given 5-minute time (1 or 2 variants).
 * Traditional "half" form is always first; the modern direct form ("twintig
 * over", "vijfentwintig over/voor") is second when applicable (m=20/25/35/40).
 * Returns an empty array for times not on a 5-minute boundary.
 */
export function dutchTimePhraseVariants(h, m) {
    const h12 = ((h % 12) + 12) % 12;
    const next = (h12 + 1) % 12;
    switch (m) {
        case 20:
            return [`tien voor half ${hourName(next)}`, `twintig over ${hourName(h12)}`];
        case 25:
            return [`vijf voor half ${hourName(next)}`, `vijfentwintig over ${hourName(h12)}`];
        case 35:
            return [`vijf over half ${hourName(next)}`, `vijfentwintig voor ${hourName(next)}`];
        case 40:
            return [`tien over half ${hourName(next)}`, `twintig voor ${hourName(next)}`];
        default: {
            const p = dutchTimePhrase(h, m);
            return p !== null ? [p] : [];
        }
    }
}

/**
 * Build an option-list HTML string for multiple-choice exercises.
 * Pairs with wireOptions(). labelFn provides button text; valueFn provides
 * the encoded data-value (defaults to String).
 */
export function optionListHtml(options, labelFn, valueFn = String) {
    const btns = options
        .map(
            (o) =>
                `<button type="button" class="default-button option" role="radio" aria-checked="false" data-value="${encodeURIComponent(valueFn(o))}">${escapeHtml(String(labelFn(o)))}</button>`,
        )
        .join("");
    return `<div class="option-list" role="radiogroup">${btns}</div>`;
}

/**
 * Build an option-list of word-choice buttons that can each peek at an
 * alternate label via a small `↔` button. Used by the analog and digital
 * clock exercises so the kid can compare the two Dutch wordings of a
 * time (e.g. `vijf voor half twaalf` ↔ `vijfentwintig over elf`).
 *
 * options: array of `{ label, altLabel?, value }`. When `altLabel` is
 * absent the option renders as a plain button — same shape as
 * `optionListHtml`. The peek toggle (`.word-variant-peek`) is wired up
 * globally on the document below.
 */
export function wordOptionListHtml(options) {
    const items = options.map((o) => {
        const val = encodeURIComponent(o.value);
        const label = escapeHtml(String(o.label));
        const alt = o.altLabel ? escapeHtml(String(o.altLabel)) : null;
        if (!alt) {
            return `<button type="button" class="default-button option" role="radio" aria-checked="false" data-value="${val}">${label}</button>`;
        }
        // A visibility-hidden spacer stacks both labels in the same grid
        // cell so the button's intrinsic width fits whichever variant is
        // wider. The two faces sit absolutely over the spacer and crossfade
        // when `.flipped` toggles.
        return (
            `<div class="word-option-wrap">` +
            `<button type="button" class="default-button option word-option-btn" role="radio" aria-checked="false" data-value="${val}">` +
            `<span class="word-option-spacer" aria-hidden="true">` +
            `<span>${label}</span><span>${alt}</span>` +
            `</span>` +
            `<span class="word-option-face word-option-front">${label}</span>` +
            `<span class="word-option-face word-option-back" aria-hidden="true">${alt}</span>` +
            `</button>` +
            `<button type="button" class="word-variant-peek" aria-label="andere schrijfwijze">↔</button>` +
            `</div>`
        );
    });
    return `<div class="option-list" role="radiogroup">${items.join("")}</div>`;
}

/**
 * Build a disabled option-list for the review/answer state. Each option
 * should have a `.label` property for display. `isCorrectFn` and
 * `isGivenFn` receive the option object and return booleans:
 *   - correct → green `.review-correct` highlight
 *   - given (and wrong) → red `.review-wrong` highlight
 *   - otherwise → dimmed `.review-dim`
 */
export function buildReviewOptionList(options, isCorrectFn, isGivenFn) {
    const btns = options.map((o) => {
        const correct = isCorrectFn(o);
        const given = !correct && isGivenFn(o);
        const cls = correct ? "review-correct" : given ? "review-wrong" : "review-dim";
        return `<button type="button" class="default-button option ${cls}" disabled>${escapeHtml(o.label)}</button>`;
    });
    return `<div class="option-list">${btns.join("")}</div>`;
}

// Peek button toggles the adjacent option button's `.flipped` state so the
// alt label crossfades into view. Lives in the shared lib so any exercise
// rendering `wordOptionListHtml` gets the behaviour for free.
document.addEventListener("click", (e) => {
    const peek = e.target.closest?.(".word-variant-peek");
    if (!peek) return;
    const wrap = peek.closest(".word-option-wrap");
    if (wrap) wrap.classList.toggle("flipped");
});

/**
 * Inline phrase-flip widget: a tappable span that crossfades between two
 * wordings of the same time (or, in principle, any two strings). Used by
 * both clock exercises so the kid can peek at the alternate phrasing.
 *
 * Pair with sizeFlip(flip) called once the widget is in the live DOM so
 * the container width can transition smoothly between the two faces.
 *
 * Styling lives in theme.css under `.phrase-flip*`; the click/keydown
 * handlers are wired up globally on the document below.
 */
export function phraseFlipHtml(front, back) {
    return (
        `<span class="phrase-flip" tabindex="0" role="button" aria-pressed="false">` +
        `<span class="phrase-flip-inner">` +
        `<span class="phrase-flip-face phrase-flip-front">${escapeHtml(front)}</span>` +
        `<span class="phrase-flip-face phrase-flip-back">${escapeHtml(back)}</span>` +
        `</span></span>`
    );
}

/**
 * Measure both faces of a phrase-flip widget and store their pixel widths
 * as data attributes so toggling can transition the container width.
 * Must be called after the widget is inserted into the live DOM.
 */
export function sizeFlip(flip) {
    const inner = flip.querySelector(".phrase-flip-inner");
    const front = flip.querySelector(".phrase-flip-front");
    const back = flip.querySelector(".phrase-flip-back");
    if (!inner || !front || !back) return;
    const frontW = front.offsetWidth;
    const backW = back.offsetWidth;
    inner.dataset.frontW = frontW;
    inner.dataset.backW = backW;
    inner.style.width = `${frontW}px`;
}

function togglePhraseFlip(flip) {
    const flipped = flip.classList.toggle("flipped");
    flip.setAttribute("aria-pressed", String(flipped));
    const inner = flip.querySelector(".phrase-flip-inner");
    if (inner?.dataset.frontW) {
        inner.style.width = `${Number.parseFloat(flipped ? inner.dataset.backW : inner.dataset.frontW)}px`;
    }
}

// One global delegated listener handles every `.phrase-flip` widget on the
// page, including widgets injected dynamically into question content. Lives
// in the shared lib so both the analog and digital clock exercises get it
// for free.
document.addEventListener("click", (e) => {
    const flip = e.target.closest?.(".phrase-flip");
    if (flip) togglePhraseFlip(flip);
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const flip = e.target.closest?.(".phrase-flip");
    if (!flip) return;
    e.preventDefault();
    togglePhraseFlip(flip);
});

function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
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
            form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        });
        btn.addEventListener("click", (e) => {
            if (Date.now() - lastTouchSubmitAt < 500) {
                e.preventDefault();
            }
        });
    });
}

// ---------- leave guards ----------

const leaveGuards = new Map();
let leaveGuardSentinelArmed = false;
let suppressLeaveGuardPop = false;
let leaveGuardNavigationInProgress = false;
let leaveGuardDialogOpen = false;

function activeLeaveGuardEntry() {
    const entries = Array.from(leaveGuards.entries());
    for (let i = entries.length - 1; i >= 0; i--) {
        const [id, guard] = entries[i];
        if (!guard) continue;
        if (!guard.isActive || guard.isActive()) return { id, guard };
    }
    return null;
}

function pushLeaveGuardSentinel() {
    history.pushState({ ...(history.state || {}), __homeworkLeaveGuard: true }, "", location.href);
    leaveGuardSentinelArmed = true;
}

function syncLeaveGuardSentinel() {
    if (leaveGuardNavigationInProgress) return;
    const active = activeLeaveGuardEntry();
    if (active && !leaveGuardSentinelArmed) {
        pushLeaveGuardSentinel();
        return;
    }
    if (!active && leaveGuardSentinelArmed) {
        leaveGuardSentinelArmed = false;
        if (history.state?.__homeworkLeaveGuard) {
            suppressLeaveGuardPop = true;
            history.back();
        }
    }
}

export function setLeaveGuard(id, guard) {
    if (!id) return;
    leaveGuards.set(id, guard);
    syncLeaveGuardSentinel();
}

export function clearLeaveGuard(id) {
    if (!id) return;
    leaveGuards.delete(id);
    syncLeaveGuardSentinel();
}

export function refreshLeaveGuards() {
    syncLeaveGuardSentinel();
}

function getLeaveGuardDialogSpec(guard, reason) {
    if (typeof guard.getDialog === "function") return guard.getDialog(reason);
    return guard.dialog || null;
}

// Add `.is-leaving` to an element, wait for its CSS exit animation (capped
// by a fallback timer), then run `done`. Falls through instantly under
// `prefers-reduced-motion: reduce` where no animation is declared.
function leaveAnimated(el, done, fallbackMs = 220) {
    if (!el?.isConnected) {
        done();
        return;
    }
    let finished = false;
    const finish = () => {
        if (finished) return;
        finished = true;
        el.removeEventListener("animationend", finish);
        done();
    };
    el.addEventListener("animationend", finish, { once: true });
    el.classList.add("is-leaving");
    setTimeout(finish, fallbackMs);
}

let _dialogTitleSeq = 0;
function showLeaveGuardDialog(spec) {
    if (leaveGuardDialogOpen) return Promise.resolve("stay");
    leaveGuardDialogOpen = true;
    // Remember focus so we can restore it when the dialog closes — without
    // this, focus falls back to <body> and keyboard users lose their place.
    const prevFocus = document.activeElement;
    return new Promise((resolve) => {
        const dlg = document.createElement("dialog");
        dlg.className = "leave-guard-dialog";
        const titleId = `leave-guard-title-${++_dialogTitleSeq}`;
        // Wire ARIA: aria-modal is implicit on dialog.showModal() but we set
        // aria-labelledby explicitly so SRs announce the heading on open.
        dlg.setAttribute("aria-labelledby", titleId);
        const buttons = (spec.buttons || [])
            .map(
                (btn) => `
                <button
                    type="button"
                    class="${escapeHtml(`default-button ${btn.className || ""}`.trim())}"
                    data-choice="${escapeHtml(btn.value)}"
                    ${btn.autofocus ? "autofocus" : ""}
                    ${btn.id ? `id="${escapeHtml(btn.id)}"` : ""}
                >${escapeHtml(btn.label)}</button>
            `,
            )
            .join("");
        dlg.innerHTML = `
            <form method="dialog" class="leave-guard-form">
                <h2 id="${titleId}">${escapeHtml(spec.title || "Pagina verlaten?")}</h2>
                <p class="muted">${escapeHtml(spec.message || "")}</p>
                <div class="button-row">${buttons}</div>
            </form>
        `;
        document.body.appendChild(dlg);
        const close = (choice) => {
            leaveGuardDialogOpen = false;
            // Remove the dialog immediately on close. A CSS exit animation
            // doesn't run anyway — closed <dialog> elements get
            // `display: none` from the UA stylesheet — and leaving the
            // node around briefly causes id-collisions with the next
            // dialog (`getElementById` picks the stale one first).
            dlg.remove();
            // Restore focus to whatever was active before we opened the
            // dialog (typically the button that triggered it). If it's gone
            // from the DOM, skip silently.
            if (prevFocus && typeof prevFocus.focus === "function" && prevFocus.isConnected) {
                try {
                    prevFocus.focus({ preventScroll: true });
                } catch {}
            }
            resolve(choice || "stay");
        };
        dlg.addEventListener("close", () => close(dlg.returnValue));
        dlg.querySelectorAll("[data-choice]").forEach((btn) => {
            btn.addEventListener("click", () => dlg.close(btn.dataset.choice || "stay"));
        });
        dlg.addEventListener("click", (e) => {
            if (e.target === dlg) dlg.close("stay");
        });
        if (typeof dlg.showModal === "function") {
            dlg.showModal();
            return;
        }
        // Older browsers (iOS < 15.4) don't support <dialog>. Rather than
        // silently swallowing the prompt, fall back to a native confirm() —
        // ugly but functional. The "leave" choice is the most destructive
        // option in current call sites; treat OK as that.
        dlg.remove();
        const leaveBtn = (spec.buttons || []).find((b) => b.value && b.value !== "stay");
        const stayBtn = (spec.buttons || []).find((b) => b.value === "stay");
        const msg = [spec.title, spec.message].filter(Boolean).join("\n\n");
        const ok = window.confirm(
            `${msg}\n\nOK = ${leaveBtn?.label || "ja"}\nCancel = ${stayBtn?.label || "blijf hier"}`,
        );
        leaveGuardDialogOpen = false;
        resolve(ok ? leaveBtn?.value || "leave" : "stay");
    });
}

async function resolveLeaveGuard(reason) {
    const active = activeLeaveGuardEntry();
    if (!active) return true;
    const { guard } = active;
    const spec = getLeaveGuardDialogSpec(guard, reason);
    const choice = spec ? await showLeaveGuardDialog(spec) : "leave";
    if (!choice || choice === "stay") return false;

    leaveGuardNavigationInProgress = true;
    let allowed = true;
    try {
        if (typeof guard.onChoice === "function") {
            allowed = (await guard.onChoice(choice, reason)) !== false;
        }
    } finally {
        if (!allowed) leaveGuardNavigationInProgress = false;
    }
    if (!allowed) {
        syncLeaveGuardSentinel();
        return false;
    }
    leaveGuards.clear();
    return true;
}

function setupLeaveGuardNavigation() {
    window.addEventListener("beforeunload", (e) => {
        if (leaveGuardNavigationInProgress) return;
        const active = activeLeaveGuardEntry();
        if (!active) return;
        e.preventDefault();
        e.returnValue = active.guard.beforeUnloadMessage || "";
    });

    document.addEventListener(
        "click",
        (e) => {
            const link = e.target.closest(".home-link[href]");
            if (!link || leaveGuardNavigationInProgress) return;
            if (!activeLeaveGuardEntry()) return;
            e.preventDefault();
            void (async () => {
                const allowLeave = await resolveLeaveGuard("home");
                if (!allowLeave) return;
                window.location.href = link.href;
            })();
        },
        true,
    );

    window.addEventListener("popstate", () => {
        if (suppressLeaveGuardPop) {
            suppressLeaveGuardPop = false;
            return;
        }
        if (!leaveGuardSentinelArmed || leaveGuardNavigationInProgress) return;
        if (!activeLeaveGuardEntry()) {
            leaveGuardSentinelArmed = false;
            return;
        }
        leaveGuardSentinelArmed = false;
        void (async () => {
            const allowLeave = await resolveLeaveGuard("back");
            if (allowLeave) {
                history.back();
                return;
            }
            if (activeLeaveGuardEntry()) pushLeaveGuardSentinel();
        })();
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
    // When a new service worker activates it posts SW_ACTIVATED. Reload the
    // page so fresh HTML (with matching asset hashes) is loaded — but only
    // when the user is not in the middle of an active exercise session, AND
    // only on upgrades (hadController=true). A fresh install means the page
    // already loaded from the network so no reload is needed; reloading on
    // fresh installs also breaks e2e tests where every session starts clean.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("message", (e) => {
        if (e.data?.type !== "SW_ACTIVATED") return;
        if (!hadController) return;
        const exercisesSection = document.getElementById("page-exercises");
        if (!exercisesSection || exercisesSection.hidden) {
            location.reload();
        }
    });
    // `updateViaCache: 'none'` tells the browser to bypass its HTTP cache when
    // fetching the SW script (and its imports). Combined with the server's
    // `Cache-Control: no-cache` on /service-worker.js this gives Firefox no
    // chance to keep an old SW alive across deployments.
    navigator.serviceWorker
        .register(versionedAssetPath("/service-worker.js"), { updateViaCache: "none" })
        .catch((_err) => {});
}

// ---------- mistake picker dialog ----------

/**
 * Show a modal picker so the user can curate which recent mistakes to
 * actually practise. By default everything is selected. Returns the
 * filtered question list, or null if the user cancelled.
 */
function pickMistakes(spec, mistakes) {
    const prevFocus = document.activeElement;
    return new Promise((resolve) => {
        const dlg = document.createElement("dialog");
        dlg.className = "mistake-picker";
        const titleId = `picker-title-${++_dialogTitleSeq}`;
        dlg.setAttribute("aria-labelledby", titleId);
        const items = mistakes
            .map((q, i) => {
                const desc = spec.describe ? spec.describe(q) : JSON.stringify(q);
                return `<li><label><input type="checkbox" data-i="${i}" checked> ${escapeHtml(desc)}</label></li>`;
            })
            .join("");
        dlg.innerHTML = `
            <form method="dialog" class="mistake-picker-form">
                <h2 id="${titleId}">Welke fouten herhalen?</h2>
                <p class="muted">${mistakes.length} oefening${mistakes.length === 1 ? "" : "en"} — vink uit wat je niet wil.</p>
                <label class="all-toggle"><input type="checkbox" id="picker-all" checked> alles in/uit</label>
                <ul class="picker-list">${items}</ul>
                <div class="button-row">
                    <button type="submit" class="default-button" value="cancel">annuleer</button>
                    <button type="submit" class="default-button primary" value="start" id="picker-start">🟢 start</button>
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
            list.forEach((cb) => {
                cb.checked = all.checked;
            });
            syncStartEnabled();
        });
        list.forEach((cb) => {
            cb.addEventListener("change", () => {
                all.checked = Array.from(list).every((c) => c.checked);
                syncStartEnabled();
            });
        });
        dlg.addEventListener("close", () => {
            const action = dlg.returnValue;
            const selected = [];
            list.forEach((cb) => {
                if (cb.checked) selected.push(mistakes[Number(cb.dataset.i)]);
            });
            // Remove immediately — closed <dialog> elements are already
            // hidden by the UA stylesheet, and lingering in the DOM with
            // display:none causes id-collisions with the next dialog.
            dlg.remove();
            if (prevFocus && typeof prevFocus.focus === "function" && prevFocus.isConnected) {
                try {
                    prevFocus.focus({ preventScroll: true });
                } catch {}
            }
            resolve(action === "start" ? selected : null);
        });
        dlg.addEventListener("click", (e) => {
            if (e.target === dlg) dlg.close("cancel");
        });
        if (typeof dlg.showModal === "function") {
            dlg.showModal();
        } else {
            // Fallback for browsers without <dialog> (iOS < 15.4). Use a
            // native confirm so the parent at least knows the picker is
            // happening; OK runs with everything selected (current default),
            // Cancel aborts.
            dlg.remove();
            const ok = window.confirm(
                "Wil je de recente fouten opnieuw oefenen?\n\nOK = alle fouten\nCancel = annuleren",
            );
            resolve(ok ? mistakes.slice() : null);
        }
    });
}

// ---------- result page helpers ----------

function cycleSummaryLine(session, n) {
    const wrong = (session.questions || []).filter((q) => !q.correct).length;
    const tricky = (session.questions || []).filter((q) => q.correct && isPracticeMistake(q)).length;
    const modeLabel = session.mode === "mistakes" ? '<span class="cycle-mode">foutenmodus</span>' : "";
    const detail = [];
    if (wrong > 0) detail.push(`<span class="badge bad">${wrong} fout</span>`);
    if (tricky > 0) detail.push(`<span class="badge tricky">${tricky} moeilijk</span>`);
    if (detail.length === 0) detail.push('<span class="cycle-perfect">✨ vlekkeloos</span>');
    const time =
        session.timeMode && session.durationMs
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

function isPracticeMistake(q) {
    return !q.correct || (q.attempts || 0) > 0 || q.practiceAgain === true;
}

function splitQuestionOutcomes(session) {
    const questions = session.questions || [];
    return {
        wrong: questions.filter((q) => !q.correct),
        tricky: questions.filter((q) => q.correct && isPracticeMistake(q)),
    };
}

function renderOutcomeItem(q, kind) {
    const desc = q.label ? escapeHtml(q.label) : escapeHtml(JSON.stringify(q.question));
    if (kind === "wrong") {
        const metaParts = [];
        if (q.attempts > 0) metaParts.push(`${q.attempts}×`);
        if (q.timedOut) metaParts.push("⏰ te traag");
        else if (q.skipped) metaParts.push("overgeslagen");
        const metaLine = metaParts.length > 0 ? `<span class="item-meta">${metaParts.join(" · ")}</span>` : "";
        return `<li class="item-wrong"><span class="item-desc">${desc}</span>${metaLine}</li>`;
    }
    if (q.practiceAgain) {
        return `<li class="item-tricky"><span class="item-desc">${desc}</span><span class="item-meta"><span class="badge tricky">bijna goed · opnieuw oefenen</span></span></li>`;
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
 *   evaluateAnswer?: (q, given) => boolean | {
 *      correct: boolean, exact?: boolean, showReview?: boolean,
 *      practiceAgain?: boolean, feedback?: string,
 *      partialCorrect?: boolean   — when true the answer matched part of a
 *                                   multi-blank question; the question is
 *                                   re-rendered in place (state mutated by
 *                                   evaluateAnswer) without advancing the deck
 *   }
 *   evaluateSkip?: (q) => null | { skipRemainingFillIn?: boolean, feedback?: string }
 *   maxAttempts?: number                       — wrong attempts before answer is forced (default 3, 0 = no cap)
 *   isCorrect: (q, given) => boolean
 *   describe?: (q) => string                  — short label for history
 *   onBeforeReset?: () => void               — called before returning to setup (e.g. to clean up exercise-specific state)
 * }
 */
export function runExercise(spec) {
    const leaveGuardId = Symbol(`leave-guard:${spec.id}`);
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

    // Reusable deadline span — the earlier implementation appended a fresh
    // <span> every 250ms and never cleared the prior ones, accumulating
    // ~1200 stale nodes over a 5-minute session. Now we keep one node and
    // update its text/class.
    let _deadlineSpan = null;
    function updateClock() {
        if (!clockEl) return;
        const elapsed = formatDuration(Date.now() - state.startedAt);
        while (clockEl.firstChild) clockEl.removeChild(clockEl.firstChild);
        clockEl.appendChild(document.createTextNode(`⏱️ ${elapsed}`));
        if (deadlineSec()) {
            const remain = Math.max(0, deadlineSec() * 1000 - (Date.now() - state.questionStartedAt));
            const danger = remain < deadlineSec() * 250;
            if (!_deadlineSpan) _deadlineSpan = document.createElement("span");
            _deadlineSpan.className = danger ? "deadline danger" : "deadline";
            _deadlineSpan.textContent = `⏰ ${formatDuration(remain)}`;
            clockEl.appendChild(document.createTextNode("  "));
            clockEl.appendChild(_deadlineSpan);
        } else {
            _deadlineSpan = null;
        }
    }

    // Pause the 250ms timer while the tab is hidden — mobile browsers throttle
    // anyway, but pausing avoids wall-time drift when the tab comes back and
    // stops needless wake-ups during long backgrounded sessions.
    function _onVisibilityChange() {
        if (document.visibilityState === "hidden") {
            if (state.sessionTimerHandle) {
                clearInterval(state.sessionTimerHandle);
                state.sessionTimerHandle = null;
            }
        } else if (timeModeOn() && !play.hidden && !state.sessionTimerHandle) {
            state.sessionTimerHandle = setInterval(updateClock, 250);
            updateClock();
        }
    }
    document.addEventListener("visibilitychange", _onVisibilityChange);

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
        _deadlineSpan = null;
        if (clockEl) {
            while (clockEl.firstChild) clockEl.removeChild(clockEl.firstChild);
            clockEl.hidden = true;
        }
    }
    function startDeadline() {
        clearTimeout(state.deadlineTimerHandle);
        if (!timeModeOn() || !deadlineSec()) return;
        // Stash a token captured at scheduling time. If the user has moved
        // on (skip / volgende / correct) by the time the timeout fires,
        // state.currentQuestion has changed and we must NOT record an
        // outcome against the wrong question.
        const token = state.currentQuestion;
        state.deadlineTimerHandle = setTimeout(() => {
            if (state.currentQuestion !== token) return;
            onDeadlineExpired();
        }, deadlineSec() * 1000);
    }

    function cleanupCurrentQuestion() {
        if (typeof state.currentCleanup === "function") {
            try {
                state.currentCleanup();
            } catch (_err) {}
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
            state.currentCleanup = typeof controller.cleanup === "function" ? controller.cleanup : null;
            return;
        }
        state.getAnswer = null;
        state.currentCleanup = null;
    }

    let _hasShownOnce = false;
    function show(which) {
        setup.hidden = which !== "setup";
        play.hidden = which !== "play";
        result.hidden = which !== "result";
        if (which !== "result") stopConfetti();
        if (which !== "play") stopSessionTimer();
        if (which !== "play") cleanupCurrentQuestion();
        // Replay the page-in animation on whichever section just became
        // visible. The remove+reflow+re-add cycle restarts the CSS animation
        // so swapping setup ↔ play ↔ result always shows a fresh entrance.
        // Under reduced-motion the animation rule itself is absent, so the
        // class toggle is harmless. Skip the *initial* call: the setup page
        // is being set up by runExercise's bootstrap, no user-initiated
        // navigation has happened yet, and animating here makes axe/a11y
        // checks see the page mid-fade (with reduced effective contrast).
        const activeSection = which === "setup" ? setup : which === "play" ? play : result;
        if (activeSection && _hasShownOnce) {
            activeSection.classList.remove("section-enter");
            void activeSection.offsetWidth;
            activeSection.classList.add("section-enter");
        }
        _hasShownOnce = true;
        if (which === "play") play.scrollIntoView({ behavior: "smooth" });
        if (which === "result") result.scrollIntoView({ behavior: "smooth" });
        if (which === "play") {
            setLeaveGuard(leaveGuardId, {
                beforeUnloadMessage: "Je oefening is nog niet klaar.",
                // Only activate once the student has answered at least one question —
                // there is nothing to lose before that point.
                isActive() {
                    return state.questions.length > 0;
                },
                getDialog() {
                    return {
                        title: "Oefening stoppen?",
                        message: "De voltooide oefeningen worden opgeslagen, de rest wordt weggelaten.",
                        buttons: [
                            {
                                value: "stay",
                                label: "Blijf hier",
                                className: "primary",
                                id: "leave-stay",
                                autofocus: true,
                            },
                            { value: "leave", label: "Stop oefening", id: "leave-leave" },
                        ],
                    };
                },
                async onChoice(choice) {
                    if (choice === "leave") await persistCurrentSessionForLeave();
                },
            });
        } else {
            clearLeaveGuard(leaveGuardId);
        }
    }

    // --- setup ---

    function loadSavedConfig() {
        try {
            const raw = JSON.parse(localStorage.getItem(`homework:${spec.id}`) || "null");
            // Reject anything that isn't a plain object — a hand-edited
            // (or corrupted) localStorage entry would otherwise crash the
            // exercise's loadConfig on `saved.someField` access.
            const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
            if (saved && spec.loadConfig) spec.loadConfig(formSetup, saved);
            if (saved) {
                const tm = formSetup?.elements?.["time-mode"];
                if (tm && typeof saved.timeMode === "boolean") tm.checked = saved.timeMode;
                const dOn = formSetup?.elements?.["deadline-on"];
                if (dOn && typeof saved.deadlineOn === "boolean") dOn.checked = saved.deadlineOn;
                const ds = formSetup?.elements?.["deadline-seconds"];
                if (ds && typeof saved.deadlineSeconds === "number" && saved.deadlineSeconds > 0) {
                    ds.value = String(saved.deadlineSeconds);
                }
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
    formSetup?.elements?.["time-mode"]?.addEventListener("change", syncTimeModeFields);
    formSetup?.elements?.["deadline-on"]?.addEventListener("change", syncTimeModeFields);

    // Augment whatever the exercise's readConfig returns with the shared
    // time-mode fields (read here, not in every exercise).
    function readConfigWithTimeMode(form) {
        const cfg = spec.readConfig(form);
        const tm = form.elements?.["time-mode"];
        const dOn = form.elements?.["deadline-on"];
        const ds = form.elements?.["deadline-seconds"];
        cfg.timeMode = !!tm?.checked;
        cfg.deadlineOn = !!(cfg.timeMode && dOn?.checked);
        // Use parseStrictInt so "1e5" or " 30 " can't sneak past validation.
        // If parsing fails, treat as 0 (deadline off) rather than NaN.
        cfg.deadlineSeconds = cfg.deadlineOn && ds?.value ? (parseStrictInt(ds.value) ?? 0) : 0;
        return cfg;
    }

    function persistConfig(cfg) {
        try {
            localStorage.setItem(`homework:${spec.id}`, JSON.stringify(cfg));
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
        contentEl.classList.remove("locked", "is-wrong", "question-enter", "review-enter");
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
        contentEl.querySelectorAll("input:not([aria-label]):not([aria-labelledby])").forEach((input) => {
            input.setAttribute("aria-label", "jouw antwoord");
        });
        // Focus the first input before the entrance animation starts so the
        // browser sees a fully-visible element (opacity: 1) at focus time.
        // Adding question-enter immediately after would set opacity to 0 via
        // the animation's fill-mode:both, which causes some browsers to silently
        // skip the focus call.
        const firstInput = contentEl.querySelector("input, [tabindex]");
        if (firstInput && typeof firstInput.focus === "function") firstInput.focus();

        // Trigger entrance animation after content is in the DOM.
        void contentEl.offsetWidth;
        contentEl.classList.add("question-enter");

        startDeadline();
        updateClock();
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
            exact: opts.exact !== false,
            practiceAgain: !!opts.practiceAgain,
            label: spec.describe ? spec.describe(state.currentQuestion) : null,
        });
        // Arm the browser-back sentinel the moment the first answer is recorded
        // so the popstate guard works for the rest of the session.
        if (state.questions.length === 1) refreshLeaveGuards();
    }

    function showAdvanceButton() {
        const actions = formExercise.querySelector(".exercise-actions");
        if (!actions || document.getElementById("button-next")) return;
        const next = document.createElement("button");
        next.type = "button";
        next.className = "default-button primary btn-lift";
        next.id = "button-next";
        next.textContent = "volgende ➡️";
        next.addEventListener("click", (e) => {
            e.preventDefault();
            nextQuestion();
        });
        actions.appendChild(next);
        next.focus();
    }

    function showReviewState({ given, correct, feedback, bad = false }) {
        clearTimeout(state.deadlineTimerHandle);
        state.deadlineTimerHandle = null;
        cleanupCurrentQuestion();

        contentEl.innerHTML = "";
        spec.renderQuestion(state.currentQuestion, contentEl, {
            kind: "review",
            given,
            correct,
        });
        contentEl.classList.add("locked");
        void contentEl.offsetWidth;
        contentEl.classList.add("review-enter");
        feedbackEl.textContent = feedback || "Bekijk het juiste antwoord.";
        feedbackEl.classList.toggle("is-bad", bad);

        const checkBtn = document.getElementById("button-check");
        if (checkBtn) checkBtn.hidden = true;
        if (skipBtn) skipBtn.hidden = true;
        showAdvanceButton();
        updateClock();
    }

    function normalizeAnswerEvaluation(q, given) {
        const result = spec.evaluateAnswer ? spec.evaluateAnswer(q, given) : spec.isCorrect(q, given);
        if (typeof result === "boolean") return { correct: result };
        return result && typeof result === "object" ? result : { correct: false };
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
        state.streak = 0;
        showReviewState({
            given: state.currentGiven,
            correct: false,
            feedback: "⏰ te traag",
            bad: true,
        });
    }

    function onWrongAttempt(given) {
        state.currentAttempts += 1;
        state.currentGiven = given;
        state.streak = 0;

        // Once the attempt cap is reached, stop accepting guesses and show the
        // correct answer so the child learns rather than keeps guessing blindly.
        const maxAttempts = spec.maxAttempts ?? 3;
        if (maxAttempts > 0 && state.currentAttempts >= maxAttempts) {
            recordOutcome(false, given, false);
            showReviewState({ given, correct: false });
            return;
        }

        if (!feedbackEl.classList.contains("is-bad")) {
            feedbackEl.dataset.assignment = feedbackEl.textContent;
        }
        const assignment = (feedbackEl.dataset.assignment || "").trim();
        if (assignment) {
            feedbackEl.textContent = assignment;
            const hint = document.createElement("small");
            hint.textContent = `${randomAnimal()} probeer het nog eens.`;
            feedbackEl.append(document.createElement("br"), hint);
        } else {
            feedbackEl.textContent = `${randomAnimal()} probeer het nog eens.`;
        }
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

    function onCorrect(given, opts = {}) {
        recordOutcome(true, given, false, opts);
        if (opts.showReview) {
            state.streak = 0;
            showReviewState({
                given,
                correct: true,
                feedback: opts.feedback,
            });
            return;
        }
        if (state.currentAttempts === 0 && opts.exact !== false) state.streak++;
        else state.streak = 0;
        flashCorrect(state.streak);
        nextQuestion();
    }

    function onSkip() {
        state.streak = 0;
        recordOutcome(false, state.currentGiven, true);
        const skipEval = spec.evaluateSkip ? spec.evaluateSkip(state.currentQuestion) : null;
        // Fill-in "stop oefening": batch-record all remaining blanks of this card
        // as skipped, then advance to the next question (which cascades to finish
        // when none remain). No review screen — the child chose to end the session.
        if (skipEval?.skipRemainingFillIn) {
            const anchor = state.currentQuestion.blankIndices;
            while (state.currentIndex + 1 < state.deck.length) {
                const next = state.deck[state.currentIndex + 1];
                if (next.kind !== "fill-in" || next.blankIndices !== anchor) break;
                state.currentIndex++;
                state.questions.push({
                    question: next,
                    attempts: 0,
                    skipped: true,
                    timedOut: false,
                    elapsedMs: 0,
                    given: null,
                    correct: false,
                    exact: false,
                    practiceAgain: false,
                    label: spec.describe ? spec.describe(next) : null,
                });
            }
            nextQuestion();
            return;
        }
        // For all other question kinds (two-sided, multi-part, etc.): show the
        // correct answer so the child learns what they missed.
        showReviewState({ given: state.currentGiven, correct: false, feedback: skipEval?.feedback });
    }

    function finishPartial() {
        finish();
    }

    function buildCurrentSession() {
        const total = state.questions.length;
        if (total === 0) return null;
        const correct = state.questions.filter((q) => q.correct).length;
        const finishedAt = Date.now();
        return {
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
    }

    // Persist the current run when the student abandons via home/back
    // navigation. Without this, choosing "Stop oefening" on the leave-guard
    // dialog drops the answered questions on the floor — they never reach
    // IndexedDB, so the history block is empty when the student returns.
    async function persistCurrentSessionForLeave() {
        const session = buildCurrentSession();
        if (!session) return;
        await saveSession(session);
        await setupHistoryView();
    }

    function finish() {
        stopSessionTimer();
        const session = buildCurrentSession();
        if (!session) {
            show("setup");
            return;
        }
        state.cycles.push(session);
        saveSession(session).then(() => {
            // Re-evaluate the parent history block (mistakes/clear buttons,
            // session list) so it's accurate when the user goes back to setup.
            setupHistoryView();
        });
        renderResult(session);
        show("result");
        // Broadcast the structured session so exercises can react (e.g.
        // flashcards' perfect-score wave) without scraping the result DOM
        // with a MutationObserver.
        document.dispatchEvent(
            new CustomEvent("homework:session-finished", {
                detail: {
                    exerciseId: session.exerciseId,
                    correct: session.correct,
                    total: session.total,
                    mode: session.mode,
                },
            }),
        );
    }

    function renderResult(session) {
        const score = session.correct;
        const total = session.total;
        const cycleNum = state.cycles.length;
        const isMultiCycle = cycleNum > 1;

        // Tone the headline emoji to the score — a party popper after a 0/3
        // run feels off. 100% gets the celebration, partial gets a positive
        // but more measured cue, and a zero score is neutral (kid still
        // showed up, no need to rub it in).
        const ratio = total > 0 ? score / total : 0;
        let emoji;
        if (score === total && total > 0) emoji = "🎉";
        else if (ratio >= 0.8) emoji = "🌟";
        else if (ratio >= 0.5) emoji = "👍";
        else if (score > 0) emoji = "💪";
        else emoji = "";
        const emojiPrefix = emoji ? `${emoji} ` : "";

        const headline = isMultiCycle
            ? `<h2>${emojiPrefix}ronde ${cycleNum} afgerond</h2>`
            : `<h2>${emojiPrefix}klaar</h2>`;

        const cyclesList = state.cycles.map((c, i) => cycleSummaryLine(c, i + 1)).join("");

        const trickyList = renderTrickyList(session);

        const reviewable = session.questions.some(isPracticeMistake);

        const sessionTime =
            session.timeMode && session.durationMs
                ? ` <small class="muted">in ⏱️ ${formatMillis(session.durationMs)}</small>`
                : "";
        const html = `
            ${headline}
            <h3>${score} / ${total}${isMultiCycle ? ` <small class="muted">deze ronde</small>` : ""}${sessionTime}</h3>
            ${isMultiCycle ? `<section class="result-cycles"><h3 class="section-title">Overzicht per ronde</h3>${cyclesList}</section>` : ""}
            <div class="result-actions">
                ${reviewable ? `<button type="button" class="default-button primary btn-lift" id="review-button-repeat">🟢 oefen fouten opnieuw</button>` : ""}
                <button type="button" class="default-button button-reset btn-lift">🆕 nieuwe oefening</button>
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
            const deck = shuffle(session.questions.filter(isPracticeMistake).map((q) => q.question));
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
        const evaluation = normalizeAnswerEvaluation(state.currentQuestion, given);
        if (evaluation.partialCorrect) {
            // A part matched but the card is not done yet.  Re-render the same
            // question in place (its state was mutated by evaluateAnswer) so the
            // user sees the newly matched parts without advancing the queue.
            contentEl.classList.remove("is-wrong", "question-enter");
            feedbackEl.textContent = " ";
            feedbackEl.classList.remove("is-bad");
            contentEl.innerHTML = "";
            setQuestionController(spec.renderQuestion(state.currentQuestion, contentEl, { kind: "play" }));
            void contentEl.offsetWidth;
            contentEl.classList.add("question-enter");
            return;
        }
        if (evaluation.correct) {
            onCorrect(given, evaluation);
        } else {
            onWrongAttempt(given);
        }
    });

    // skip is type=reset; intercept to log + advance
    skipBtn?.addEventListener("click", (e) => {
        e.preventDefault();
        const confirmSpec = spec.skipConfirmDialog ? spec.skipConfirmDialog(state.currentQuestion) : null;
        if (confirmSpec) {
            void showLeaveGuardDialog(confirmSpec).then((choice) => {
                if (choice === "stop") onSkip();
            });
            return;
        }
        onSkip();
    });

    document.querySelectorAll(".button-reset").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!play.hidden && state.questions.length > 0) {
                void showLeaveGuardDialog({
                    title: "Oefening stoppen?",
                    message: "De voltooide oefeningen worden opgeslagen, de rest wordt weggelaten.",
                    buttons: [
                        {
                            value: "stay",
                            label: "Blijf hier",
                            className: "primary",
                            id: "stop-stay",
                            autofocus: true,
                        },
                        { value: "stop", label: "Stop oefening", id: "stop-confirm" },
                    ],
                }).then((choice) => {
                    if (choice === "stop") finishPartial();
                });
            } else {
                spec.onBeforeReset?.();
                show("setup");
            }
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
                setError("Goed bezig 🎉 alle recente oefeningen zijn juist gemaakt — geen fouten om te herhalen.");
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
            list.innerHTML = '<p class="history-empty">Nog geen oefeningen gemaakt.</p>';
            return;
        }
        list.innerHTML = sessions
            .map((s) => {
                const { wrong, tricky } = splitQuestionOutcomes(s);
                const hasMistakes = wrong.length > 0 || tricky.length > 0;
                const items = renderOutcomeItems({ wrong, tricky });

                const scoreParts = [`${s.correct} / ${s.total}`];
                if (s.timeMode && s.durationMs) scoreParts.push(`⏱️ ${formatMillis(s.durationMs)}`);
                if (s.config?.deadlineSeconds) scoreParts.push(`⏰ ${s.config.deadlineSeconds}s`);
                if (s.mode === "mistakes") scoreParts.push("foutenmodus");

                return `
                    <article class="history-session">
                        <div class="history-session-header">
                            <span>${formatDate(s.finishedAt || s.startedAt)}</span>
                            <span>${scoreParts.join(" · ")}</span>
                        </div>
                        ${
                            hasMistakes
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
        if (!confirm("Alle geschiedenis voor deze oefening wissen? Dit kan niet ongedaan worden gemaakt.")) return;
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
    const colors = ["#ff7336", "#f9e038", "#02cca4", "#383082", "#fed3f5", "#b1245a", "#f2733f"];
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
    const FADE = 700;
    const t0 = Date.now();
    function draw() {
        if (!confettiState.running) return;
        const elapsed = Date.now() - t0;
        if (elapsed >= TOTAL) {
            stopConfetti();
            return;
        }
        // Smooth opacity fade-out during the last FADE ms.
        canvas.style.opacity = elapsed < TOTAL - FADE ? "1" : String(1 - (elapsed - (TOTAL - FADE)) / FADE);
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
        confettiState.ctx.clearRect(0, 0, confettiState.canvas.width, confettiState.canvas.height);
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
                    if (!cursor) {
                        resolve(results);
                        return;
                    }
                    if (cursor.value.exerciseId.startsWith(prefix)) {
                        results.push(cursor.value);
                        if (results.length >= limit) {
                            resolve(results);
                            return;
                        }
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
    await Promise.all(
        [...slots].map(async (slot) => {
            const id = slot.dataset.statsFor;
            let sessions = await listSessions(id, 5);
            // Fallback: exercise may use per-variant IDs (e.g. "flashcards-<deckId>").
            if (sessions.length === 0) sessions = await listRecentWithPrefix(`${id}-`, 5);
            if (sessions.length === 0) {
                slot.textContent = "nog niet geoefend";
                return;
            }
            const last = sessions[0];
            const score = `${last.correct}/${last.total}`;
            const when = relativeDate(last.finishedAt || last.startedAt);
            slot.textContent = `🎯 ${score} · ${when}`;
            if (last.correct === last.total && last.total > 0) {
                slot.dataset.best = "true";
            }
        }),
    );
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
    v = allowNeg ? v.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "") : v.replace(/[^0-9]/g, "");
    if (v !== t.value) {
        const pos = t.selectionStart;
        t.value = v;
        try {
            const back = Math.max(0, (pos ?? v.length) - 1);
            t.setSelectionRange(back, back);
        } catch {}
    }
});

// ---------- theme toggle ----------

function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    const icon = document.getElementById("theme-toggle-icon");
    if (!btn || !icon) return;

    function apply(dark) {
        const scheme = dark ? "dark" : "light";
        document.documentElement.style.colorScheme = scheme;
        localStorage.setItem("homework:theme", scheme);
        icon.textContent = dark ? "🌙" : "☀️";
        btn.setAttribute("aria-label", dark ? "Donker thema — klik voor licht" : "Licht thema — klik voor donker");
    }

    // Initialise icon to match whatever is already applied (by the inline
    // anti-FOUC script or the OS default).
    const stored = localStorage.getItem("homework:theme");
    const dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    apply(dark);

    btn.addEventListener("click", () => {
        const currentlyDark = document.documentElement.style.colorScheme === "dark";
        apply(!currentlyDark);
    });
}

// ---------- language banner ----------

function setupLangBanner() {
    const banner = document.getElementById("lang-banner");
    if (!banner) return;
    // On cached/offline pages the server-rendered banner might be stale:
    // remove it immediately if the user already dismissed it in a live session.
    if (document.cookie.split(";").some((c) => c.trim() === "lang_ok=1")) {
        banner.remove();
        return;
    }
    const btn = document.getElementById("lang-banner-dismiss");
    btn?.addEventListener("click", () => {
        document.cookie = `lang_ok=1; path=/; max-age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        leaveAnimated(banner, () => banner.remove(), 200);
    });
}

setupOfflineIndicator();
setupLeaveGuardNavigation();
registerServiceWorker();
setupLangBanner();
setupThemeToggle();
window.addEventListener("DOMContentLoaded", () => {
    hydrateHomeStats();
});
