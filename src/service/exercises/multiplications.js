import { load, read, runExercise, shuffle } from "@homework";

function getSelectedTables(form) {
    const list = [];
    form.querySelectorAll("#tables input[type=checkbox]").forEach((cb) => {
        if (cb.checked) list.push(Number(cb.dataset.table));
    });
    return list.sort((a, b) => a - b);
}

function buildDeck(cfg) {
    const deck = [];
    for (const t of cfg.tables) {
        for (let f = 1; f <= 10; f++) {
            deck.push({ a: t, b: f, answer: t * f });
        }
    }
    shuffle(deck);
    return deck.slice(0, cfg.numExercises);
}

function bindSelectAll(form) {
    const all = form.querySelector("#select-all");
    const boxes = () => Array.from(form.querySelectorAll("#tables input[type=checkbox]"));
    all.addEventListener("change", () => {
        boxes().forEach((cb) => {
            cb.checked = all.checked;
        });
    });
    form.querySelector("#tables").addEventListener("change", () => {
        const all = form.querySelector("#select-all");
        const bs = boxes();
        all.checked = bs.length > 0 && bs.every((cb) => cb.checked);
    });
}

const form = document.getElementById("form-setup");
bindSelectAll(form);

runExercise({
    id: "multiplications",
    label: "maaltafels",
    loadConfig(form, saved) {
        load.number(form, "num-exercises", saved.numExercises);
        if (Array.isArray(saved.tables)) {
            saved.tables.forEach((t) => {
                const cb = form.querySelector(`input[data-table="${t}"]`);
                if (cb) cb.checked = true;
            });
        }
        const all = form.querySelector("#select-all");
        const bs = Array.from(form.querySelectorAll("#tables input[type=checkbox]"));
        all.checked = bs.length > 0 && bs.every((cb) => cb.checked);
    },
    readConfig(form) {
        return {
            numExercises: read.number(form, "num-exercises"),
            tables: getSelectedTables(form),
        };
    },
    validateConfig(cfg) {
        if (!cfg.tables.length) return "Gelieve minstens één maaltafel te selecteren.";
        if (!cfg.numExercises || cfg.numExercises < 1) return "Gelieve een geldig aantal oefeningen op te geven.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = `
                <h3>maak de vermenigvuldiging ✖️</h3>
                <p>
                    <span>${q.a} × ${q.b} = </span>
                    <span class="box bad split-part">${q.answer}</span>
                </p>
            `;
            return;
        }
        root.innerHTML = `
            <p>
                <span>${q.a} × ${q.b} =</span>
                <input inputmode="numeric" pattern="[0-9]+" id="answer" name="answer" min="0" max="1000" required>
            </p>
        `;
        const input = root.querySelector("#answer");
        return () => input.value;
    },
    isCorrect(q, given) {
        return Number(given) === q.answer;
    },
    describe(q) {
        return `${q.a} × ${q.b} = ${q.answer}`;
    },
});
