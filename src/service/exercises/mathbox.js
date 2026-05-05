import { runExercise, shuffle } from "/homework.js";

function pickKind(kinds) {
    return kinds[Math.floor(Math.random() * kinds.length)];
}

function buildDeck(cfg) {
    const deck = [];
    const N = cfg.numExercises;
    while (deck.length < N) {
        const kind = pickKind(cfg.kinds);
        let a, b, answer;
        switch (kind) {
            case "som":
            case "splitsen":
                a = Math.floor(Math.random() * (cfg.countUntil + 1));
                b = Math.floor(Math.random() * (cfg.countUntil - a + 1));
                answer = a + b;
                break;
            case "verschil":
                a = Math.floor(Math.random() * (cfg.countUntil + 1));
                b = Math.floor(Math.random() * (a + 1));
                answer = a - b;
                break;
            case "vermenigvuldigen":
            case "delen": {
                let tries = 0;
                do {
                    a = Math.floor(
                        Math.random() *
                            Math.max(1, Math.floor(cfg.countUntil / 2) + 1),
                    );
                    b =
                        1 +
                        Math.floor(
                            Math.random() *
                                Math.max(1, Math.floor(cfg.countUntil / 2)),
                        );
                    answer = a * b;
                    tries++;
                } while (answer > cfg.countUntil && tries < 50);
                if (kind === "delen") {
                    const product = answer;
                    answer = a;
                    a = product;
                }
                break;
            }
        }
        const q = { kind, a, b, answer };
        // Splitsen also picks which side is hidden
        if (kind === "splitsen") q.hide = Math.random() < 0.5 ? "a" : "b";
        deck.push(q);
    }
    return deck;
}

function renderPlay(q) {
    switch (q.kind) {
        case "som":
            return {
                feedback: "maak de som ➕",
                html: `<p><span>${q.a} + ${q.b} =</span><input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required></p>`,
                expect: q.answer,
            };
        case "verschil":
            return {
                feedback: "maak het verschil ➖",
                html: `<p><span>${q.a} − ${q.b} =</span><input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required></p>`,
                expect: q.answer,
            };
        case "vermenigvuldigen":
            return {
                feedback: "maak de vermenigvuldiging ✖️",
                html: `<p><span>${q.a} × ${q.b} =</span><input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required></p>`,
                expect: q.answer,
            };
        case "delen":
            return {
                feedback: "maak de deling ➗",
                html: `<p><span>${q.a} ÷ ${q.b} =</span><input inputmode="numeric" pattern="[0-9]+" id="answer" min="0" max="100000" required></p>`,
                expect: q.answer,
            };
        case "splitsen": {
            const visibleVal = q.hide === "a" ? q.b : q.a;
            const expectVal = q.hide === "a" ? q.a : q.b;
            const inputCell = `<input inputmode="numeric" pattern="[0-9]+" id="answer" class="split-part" min="0" max="100000" size="3" required>`;
            const visibleCell = `<span class="box split-part">${visibleVal}</span>`;
            const left = q.hide === "a" ? inputCell : visibleCell;
            const right = q.hide === "a" ? visibleCell : inputCell;
            return {
                feedback: "maak de splitsing 🔼",
                html: `
                    <div class="split-stack">
                        <div class="split-top"><span class="box split-part">${q.answer}</span></div>
                        <svg class="split-legs" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                            <line x1="50" y1="2" x2="14" y2="28" />
                            <line x1="50" y1="2" x2="86" y2="28" />
                        </svg>
                        <div class="split-bottom">${left}${right}</div>
                    </div>
                `,
                expect: expectVal,
            };
        }
    }
}

function renderReview(q) {
    const fb = renderPlay(q).feedback;
    let body;
    switch (q.kind) {
        case "som":
            body = `<p><span>${q.a} + ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "verschil":
            body = `<p><span>${q.a} − ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "vermenigvuldigen":
            body = `<p><span>${q.a} × ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "delen":
            body = `<p><span>${q.a} ÷ ${q.b} = </span><span class="box bad split-part">${q.answer}</span></p>`;
            break;
        case "splitsen": {
            const a = `<span class="box split-part${q.hide === "a" ? " bad" : ""}">${q.a}</span>`;
            const b = `<span class="box split-part${q.hide === "b" ? " bad" : ""}">${q.b}</span>`;
            body = `
                <div class="split-stack">
                    <div class="split-top"><span class="box split-part">${q.answer}</span></div>
                    <svg class="split-legs" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
                        <line x1="50" y1="2" x2="14" y2="28" />
                        <line x1="50" y1="2" x2="86" y2="28" />
                    </svg>
                    <div class="split-bottom">${a}${b}</div>
                </div>
            `;
            break;
        }
    }
    return `<h3>${fb}</h3>${body}`;
}

runExercise({
    id: "mathbox",
    label: "rekendoos",
    loadConfig(form, saved) {
        if (saved.countUntil)
            form.elements["count-until"].value = saved.countUntil;
        if (saved.numExercises)
            form.elements["num-exercises"].value = saved.numExercises;
        if (Array.isArray(saved.kinds)) {
            form.querySelectorAll("input[name=practice]").forEach((cb) => {
                cb.checked = saved.kinds.includes(cb.value);
            });
        }
    },
    readConfig(form) {
        const countUntil = Number(form.elements["count-until"].value);
        const numExercises = Number(form.elements["num-exercises"].value);
        const kinds = [];
        form.querySelectorAll("input[name=practice]:checked").forEach((cb) =>
            kinds.push(cb.value),
        );
        return { countUntil, numExercises, kinds };
    },
    validateConfig(cfg) {
        if (!cfg.kinds.length)
            return "Gelieve minstens één soort oefening te selecteren.";
        if (!cfg.numExercises || cfg.numExercises < 1)
            return "Gelieve een geldig aantal oefeningen op te geven.";
        if (!cfg.countUntil || cfg.countUntil < 3)
            return "Tot hoeveel kan het kind tellen? Minimum 3.";
        return null;
    },
    buildDeck,
    renderQuestion(q, root, mode) {
        if (mode.kind === "review") {
            root.innerHTML = renderReview(q);
            return;
        }
        const r = renderPlay(q);
        document.getElementById("exercise-feedback").textContent = r.feedback;
        root.innerHTML = r.html;
        const input = root.querySelector("#answer");
        return () => input.value;
    },
    isCorrect(q, given) {
        const r = renderPlay(q);
        return Number(given) === r.expect;
    },
    describe(q) {
        switch (q.kind) {
            case "som":
                return `${q.a} + ${q.b} = ${q.answer}`;
            case "verschil":
                return `${q.a} − ${q.b} = ${q.answer}`;
            case "vermenigvuldigen":
                return `${q.a} × ${q.b} = ${q.answer}`;
            case "delen":
                return `${q.a} ÷ ${q.b} = ${q.answer}`;
            case "splitsen":
                return `${q.answer} = ${q.a} + ${q.b}`;
        }
    },
});
