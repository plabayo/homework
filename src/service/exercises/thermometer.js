import { runExercise } from "/homework.js";

// Geometry — works in viewBox (60 x 168). Tube is taller so each value gets
// more vertical space; bulb is small and subtle.
const VB = { w: 60, h: 168 };
const TUBE = { x: 24, w: 12, top: 8, bottom: 146 };
const BULB = { cx: 30, cy: 154, r: 9 };

function valueToY(value, vmin, vmax) {
    const range = vmax - vmin;
    const ratio = (vmax - value) / range;
    return TUBE.top + ratio * (TUBE.bottom - TUBE.top);
}

function yToValue(y, vmin, vmax) {
    const clampedY = Math.max(TUBE.top, Math.min(TUBE.bottom, y));
    const ratio = (clampedY - TUBE.top) / (TUBE.bottom - TUBE.top);
    return Math.round(vmax - ratio * (vmax - vmin));
}

function drawThermometer({ value, vmin, vmax, filled }) {
    const range = vmax - vmin;
    const minorStep = range <= 30 ? 1 : range <= 100 ? 5 : 10;
    const majorStep = range <= 30 ? 5 : range <= 100 ? 10 : 50;

    const ticks = [];
    const numbers = [];
    for (let v = vmin; v <= vmax; v += minorStep) {
        const y = valueToY(v, vmin, vmax);
        const major = v % majorStep === 0;
        const negative = v < 0;
        const tickLen = major ? 6 : 4;
        const x1 = TUBE.x + TUBE.w + 1;
        const x2 = x1 + tickLen;
        const cls = `tick${major ? " major" : ""}${negative ? " neg" : ""}`;
        ticks.push(
            `<line class="${cls}" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>`,
        );
        if (major) {
            numbers.push(
                `<text class="num${negative ? " neg" : ""}" x="${x2 + 2}" y="${y}">${v}</text>`,
            );
        }
    }

    // Continuous liquid column from tube bottom up to the current value.
    let liquid = "";
    if (filled) {
        const yVal = valueToY(value, vmin, vmax);
        liquid = `<rect class="liquid" x="${TUBE.x + 1.5}" y="${yVal}" width="${TUBE.w - 3}" height="${TUBE.bottom - yVal + 6}"/>`;
    }

    return `
        <div class="thermo" data-vmin="${vmin}" data-vmax="${vmax}">
            <svg viewBox="0 0 ${VB.w} ${VB.h}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <clipPath id="thermo-clip">
                        <rect x="${TUBE.x}" y="${TUBE.top}" width="${TUBE.w}" height="${TUBE.bottom - TUBE.top + 6}" rx="${TUBE.w / 2}" ry="${TUBE.w / 2}"/>
                    </clipPath>
                </defs>
                <circle class="bulb" cx="${BULB.cx}" cy="${BULB.cy}" r="${BULB.r}"/>
                ${filled ? `<circle class="bulb-fill" cx="${BULB.cx}" cy="${BULB.cy}" r="${BULB.r - 2.5}"/>` : ""}
                <rect class="glass" x="${TUBE.x}" y="${TUBE.top}" width="${TUBE.w}" height="${TUBE.bottom - TUBE.top}" rx="${TUBE.w / 2}" ry="${TUBE.w / 2}"/>
                <g clip-path="url(#thermo-clip)">${liquid}</g>
                <g>${ticks.join("")}</g>
                <g>${numbers.join("")}</g>
            </svg>
        </div>
    `;
}

function attachInteractive(root, q) {
    // Stable container; we replace inner HTML on every value change so listeners
    // bound to the container survive while the SVG itself is rebuilt.
    const container = root.querySelector(".thermo-svg-host");
    let current = 0;

    const render = () => {
        container.innerHTML = drawThermometer({
            value: current,
            vmin: q.vmin,
            vmax: q.vmax,
            filled: true,
        });
        const dec = root.querySelector("#thermo-dec");
        const inc = root.querySelector("#thermo-inc");
        if (dec) dec.disabled = current <= q.vmin;
        if (inc) inc.disabled = current >= q.vmax;
    };

    const setValue = (v) => {
        current = Math.max(q.vmin, Math.min(q.vmax, v));
        render();
    };

    container.classList.add("interactive");
    container.style.cursor = "pointer";
    container.addEventListener("click", (e) => {
        const svg = container.querySelector("svg");
        if (!svg) return;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const local = pt.matrixTransform(svg.getScreenCTM().inverse());
        if (local.y >= TUBE.top - 4 && local.y <= TUBE.bottom + 4) {
            setValue(yToValue(local.y, q.vmin, q.vmax));
        }
    });

    root.querySelector("#thermo-dec")?.addEventListener("click", (e) => {
        e.preventDefault();
        setValue(current - 1);
    });
    root.querySelector("#thermo-inc")?.addEventListener("click", (e) => {
        e.preventDefault();
        setValue(current + 1);
    });
    render();
    return () => current;
}

const KINDS = ["teken", "teken", "schrijf", "schrijf"];
function pickKind(allowed) {
    const list = allowed.length ? allowed : KINDS;
    return list[Math.floor(Math.random() * list.length)];
}

function buildDeck(cfg) {
    const deck = [];
    const seen = new Set();
    const tries = cfg.numExercises * 5 + 20;
    for (let i = 0; i < tries && deck.length < cfg.numExercises; i++) {
        const v =
            cfg.vmin + Math.floor(Math.random() * (cfg.vmax - cfg.vmin + 1));
        const kind = pickKind(cfg.kinds);
        const key = `${kind}:${v}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deck.push({
            kind,
            value: v,
            vmin: cfg.vmin,
            vmax: cfg.vmax,
            allowNegative: cfg.vmin < 0,
        });
    }
    return deck;
}

// Toggle the "diep onder 0" field whenever the negative checkbox changes.
const negCheckbox = document.getElementById("allow-negative");
const vminField = document.getElementById("vmin-neg-field");
function syncVminField() {
    if (vminField) vminField.hidden = !negCheckbox.checked;
}
negCheckbox?.addEventListener("change", syncVminField);

runExercise({
    id: "thermometer",
    label: "thermometer",
    loadConfig(form, saved) {
        if (saved.vmax) form.elements["vmax"].value = saved.vmax;
        if (saved.numExercises)
            form.elements["num-exercises"].value = saved.numExercises;
        if (typeof saved.allowNegative === "boolean")
            form.elements["allow-negative"].checked = saved.allowNegative;
        if (saved.vminNeg) form.elements["vmin-neg"].value = saved.vminNeg;
        if (Array.isArray(saved.kinds)) {
            form.querySelectorAll("input[name=tk]").forEach((cb) => {
                cb.checked = saved.kinds.includes(cb.value);
            });
        }
        syncVminField();
    },
    readConfig(form) {
        const vmax = Number(form.elements["vmax"].value);
        const numExercises = Number(form.elements["num-exercises"].value);
        const allowNegative = form.elements["allow-negative"].checked;
        const vminNeg = Number(form.elements["vmin-neg"].value);
        const kinds = [];
        form.querySelectorAll("input[name=tk]:checked").forEach((cb) =>
            kinds.push(cb.value),
        );
        return {
            vmax,
            vmin: allowNegative ? -Math.abs(vminNeg) : 0,
            allowNegative,
            vminNeg,
            numExercises,
            kinds: kinds.length ? kinds : ["teken", "schrijf"],
        };
    },
    validateConfig(cfg) {
        if (!cfg.numExercises || cfg.numExercises < 1)
            return "Geef een geldig aantal oefeningen op.";
        if (!cfg.vmax || cfg.vmax < 3) return "De bovengrens moet minstens 3 zijn.";
        if (cfg.allowNegative && cfg.vminNeg < 1)
            return "De ondergrens (negatieve waarde) moet minstens 1 zijn.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            const fb =
                q.kind === "teken"
                    ? "kleur de thermometer 🎨"
                    : "lees de temperatuur ✏️";
            root.innerHTML = `
                <h3>${fb}</h3>
                <div class="thermo-wrap">
                    ${drawThermometer({ value: q.value, vmin: q.vmin, vmax: q.vmax, filled: true })}
                    <p><span class="box split-part bad">${q.value}</span> <span>℃</span></p>
                </div>
            `;
            return;
        }
        const fb =
            q.kind === "teken"
                ? "kleur de thermometer 🎨"
                : "lees de temperatuur ✏️";
        document.getElementById("exercise-feedback").textContent = fb;
        if (q.kind === "teken") {
            root.innerHTML = `
                <div class="thermo-wrap">
                    <div class="thermo-svg-host"></div>
                    <p class="muted">Klik op de thermometer of gebruik de knoppen.</p>
                    <div class="button-pair">
                        <button type="button" id="thermo-dec" aria-label="omlaag">➖</button>
                        <button type="button" id="thermo-inc" aria-label="omhoog">➕</button>
                    </div>
                    <p>
                        Doel: <span class="box split-part">${q.value}</span> <span>℃</span>
                    </p>
                </div>
            `;
            return attachInteractive(root, q);
        } else {
            root.innerHTML = `
                <div class="thermo-wrap">
                    ${drawThermometer({ value: q.value, vmin: q.vmin, vmax: q.vmax, filled: true })}
                    <p class="thermo-input">
                        <input inputmode="numeric" pattern="-?[0-9]+" id="answer" min="${q.vmin}" max="${q.vmax}" required>
                        <span>℃</span>
                    </p>
                </div>
            `;
            const input = root.querySelector("#answer");
            return () => input.value;
        }
    },
    isCorrect(q, given) {
        const n = Number(given);
        if (Number.isNaN(n)) return false;
        return n === q.value;
    },
    describe(q) {
        return q.kind === "teken" ? `kleur tot ${q.value}℃` : `lees ${q.value}℃`;
    },
});
