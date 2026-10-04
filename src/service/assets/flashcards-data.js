// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

// Version 1 defaults are part of the file format, independent of future GUI defaults.
export const DECKS_KEY = "homework_flashcard_decks";
export const LAST_DECK_KEY = "homework_fc_last_deck";

function fail(path, message) {
    throw new Error(`${path}: ${message}`);
}

function objectFields(value, allowed, path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "verwacht een JSON-object.");
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) fail(`${path}.${key}`, "onbekende eigenschap.");
    }
}

function textField(value, path, allowEmpty = false) {
    if (typeof value !== "string") fail(path, "verwacht tekst tussen dubbele aanhalingstekens.");
    const text = value.trim();
    if (!allowEmpty && !text) fail(path, "mag niet leeg zijn.");
    return text;
}

function booleanField(value, path) {
    if (value !== undefined && typeof value !== "boolean") fail(path, "verwacht true of false.");
    return value === true;
}

function integerField(value, min, max, path) {
    if (!Number.isInteger(value) || value < min || value > max) {
        fail(path, `verwacht een geheel getal van ${min} tot ${max}.`);
    }
    return value;
}

export function inferDeckMode(cards) {
    return cards.some((card) => !card.wikimedia && (card.back || card.parts?.length > 0)) ? "two-sided" : "one-sided";
}

function parseAnswers(raw, path) {
    if (raw.back !== undefined && raw.parts !== undefined) fail(path, "gebruik back óf parts, niet allebei.");
    if (raw.parts !== undefined) {
        if (!Array.isArray(raw.parts) || raw.parts.length === 0)
            fail(`${path}.parts`, "verwacht minstens één antwoord.");
        return raw.parts.map((part, i) => {
            const text = textField(part, `${path}.parts[${i}]`);
            if (/[\r\n]/.test(text)) fail(`${path}.parts[${i}]`, "zet elk onderdeel apart in de lijst.");
            return text;
        });
    }
    if (raw.back === undefined) return [];
    // Earlier shared decks used newlines in back; accept them as the editor does.
    return textField(raw.back, `${path}.back`)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function parseCard(raw, index) {
    const path = `cards[${index}]`;
    if (typeof raw === "string") return { front: textField(raw, path) };
    objectFields(raw, ["front", "wikimedia", "back", "parts", "partsRequired", "hint", "hintReverse"], path);
    if ((raw.front !== undefined) === (raw.wikimedia !== undefined)) fail(path, "gebruik front óf wikimedia.");
    const card =
        raw.wikimedia !== undefined
            ? { wikimedia: textField(raw.wikimedia, `${path}.wikimedia`) }
            : { front: textField(raw.front, `${path}.front`) };
    if (card.wikimedia && (!card.wikimedia.startsWith("File:") || !card.wikimedia.slice(5).trim())) {
        fail(`${path}.wikimedia`, "gebruik een Commons-bestandstitel, bijvoorbeeld File:Cat.jpg.");
    }
    const parts = parseAnswers(raw, path);
    if (new Set(parts).size !== parts.length)
        fail(`${path}.parts`, "hetzelfde onderdeel staat meer dan één keer in de lijst.");
    if (card.wikimedia && parts.length === 0) fail(path, "een afbeelding heeft minstens één antwoord nodig.");
    if (parts.length === 1) card.back = parts[0];
    if (parts.length > 1) card.parts = parts;
    if (raw.partsRequired !== undefined) {
        if (parts.length === 0) fail(`${path}.partsRequired`, "voeg eerst antwoorden toe.");
        const count = integerField(raw.partsRequired, 1, parts.length, `${path}.partsRequired`);
        if (card.wikimedia && count !== 1) fail(`${path}.partsRequired`, "bij afbeeldingen volstaat één antwoord.");
        if (!card.wikimedia && count < parts.length) card.partsRequired = count;
    }
    for (const key of ["hint", "hintReverse"]) {
        if (raw[key] !== undefined) {
            const hint = textField(raw[key], `${path}.${key}`, true);
            if (hint) card[key] = hint;
        }
    }
    return card;
}

export function normalizePractice(raw = {}, deck) {
    objectFields(raw, ["mode", "count", "orderImportant", "timeMode", "deadlineOn", "deadlineSeconds"], "practice");
    const textCount = deck.cards.filter((card) => !card.wikimedia).length;
    const practice = {};
    if (raw.mode !== undefined && raw.mode !== "all" && raw.mode !== "partial")
        fail("practice.mode", "kies all of partial.");
    if (raw.mode === "partial") {
        if (deck.mode !== "one-sided" || textCount < 2)
            fail("practice.mode", "partial vereist minstens twee tekstkaarten in een one-sided deck.");
        practice.mode = "partial";
        const defaultCount = Math.ceil(textCount / 2);
        const count =
            raw.count === undefined ? defaultCount : integerField(raw.count, 1, textCount - 1, "practice.count");
        if (count !== defaultCount) practice.count = count;
    } else if (raw.count !== undefined) {
        fail("practice.count", "gebruik count alleen bij mode partial.");
    }
    if (booleanField(raw.orderImportant, "practice.orderImportant")) {
        if (deck.mode !== "one-sided" || textCount === 0)
            fail("practice.orderImportant", "alleen voor tekstkaarten in een one-sided deck.");
        practice.orderImportant = true;
    }
    if (booleanField(raw.timeMode, "practice.timeMode")) practice.timeMode = true;
    if (booleanField(raw.deadlineOn, "practice.deadlineOn")) {
        if (!practice.timeMode) fail("practice.deadlineOn", "zet ook timeMode aan.");
        practice.deadlineOn = true;
    }
    if (raw.deadlineSeconds !== undefined) {
        const seconds = integerField(raw.deadlineSeconds, 1, 600, "practice.deadlineSeconds");
        if (!practice.deadlineOn) fail("practice.deadlineSeconds", "zet ook deadlineOn aan.");
        if (seconds !== 10) practice.deadlineSeconds = seconds;
    }
    return practice;
}

export function parseDeckData(raw) {
    objectFields(raw, ["version", "name", "cards", "mode", "bidirectional", "practice"], "deck");
    if (raw.version !== undefined && raw.version !== 1)
        fail("version", "deze versie wordt niet ondersteund; verwacht 1.");
    const name = textField(raw.name, "name");
    if (!Array.isArray(raw.cards) || raw.cards.length === 0) fail("cards", "voeg minstens één kaart toe.");
    const cards = raw.cards.map(parseCard);
    const mode = raw.mode === undefined ? inferDeckMode(cards) : raw.mode;
    if (mode !== "one-sided" && mode !== "two-sided") fail("mode", "kies one-sided of two-sided.");
    const bidirectional = booleanField(raw.bidirectional, "bidirectional");
    if (bidirectional && mode !== "two-sided") fail("bidirectional", "twee richtingen vereist mode two-sided.");
    for (const [i, card] of cards.entries()) {
        if (card.hintReverse && (card.wikimedia || !bidirectional))
            fail(`cards[${i}].hintReverse`, "alleen voor tekstkaarten met twee richtingen.");
    }
    const deck = { name, mode, bidirectional, cards };
    deck.practice = normalizePractice(raw.practice, deck);
    return deck;
}

export function parseDeckJson(text) {
    let raw;
    try {
        raw = JSON.parse(text.replace(/^\uFEFF/, ""));
    } catch {
        throw new Error("Dit is geen geldige JSON. Controleer de dubbele aanhalingstekens en komma’s.");
    }
    return parseDeckData(raw);
}

// Only known content fields cross the file/share boundary. Local ids, history,
// editor thumbnails and cache URLs never do. Also canonicalises legacy answers.
export function portableDeck(deck, practice = deck.practice) {
    const cards = deck.cards.map((raw) => {
        if (typeof raw === "string") return raw;
        const card = raw.wikimedia ? { wikimedia: raw.wikimedia } : { front: raw.front };
        if (raw.parts?.length > 0) card.parts = raw.parts;
        else if (raw.back) card.back = raw.back;
        if (raw.partsRequired != null) card.partsRequired = raw.partsRequired;
        if (raw.hint) card.hint = raw.hint;
        if (raw.hintReverse) card.hintReverse = raw.hintReverse;
        return card;
    });
    const clean = parseDeckData({
        name: deck.name,
        cards,
        mode: deck.mode,
        bidirectional: deck.bidirectional,
        practice,
    });
    const result = { version: 1, name: clean.name };
    if (clean.mode !== inferDeckMode(clean.cards)) result.mode = clean.mode;
    if (clean.bidirectional) result.bidirectional = true;
    result.cards = clean.cards.map((card) =>
        clean.mode === "one-sided" && Object.keys(card).length === 1 && card.front ? card.front : card,
    );
    if (Object.keys(clean.practice).length > 0) result.practice = clean.practice;
    return result;
}

export function deckContentKey(deck, practice = deck.practice) {
    return JSON.stringify(portableDeck(deck, practice));
}

export function practiceFromConfig(config, deck) {
    const raw = {};
    if (deck.mode === "one-sided" && deck.cards.some((card) => !card.wikimedia)) {
        if (config.fcMode === "partial") {
            raw.mode = "partial";
            raw.count = config.fcCount;
        }
        if (config.fcOrderImportant) raw.orderImportant = true;
    }
    if (config.timeMode) {
        raw.timeMode = true;
        if (config.deadlineOn) {
            raw.deadlineOn = true;
            raw.deadlineSeconds = config.deadlineSeconds;
        }
    }
    return normalizePractice(raw, deck);
}

export function practiceConfig(deck, practice = deck.practice || {}) {
    return {
        deckId: deck.id,
        fcMode: practice.mode || "all",
        fcCount: practice.count ?? Math.max(1, Math.ceil(deck.cards.filter((card) => !card.wikimedia).length / 2)),
        fcOrderImportant: practice.orderImportant === true,
        timeMode: practice.timeMode === true,
        deadlineOn: practice.deadlineOn === true,
        deadlineSeconds: practice.deadlineSeconds ?? 10,
    };
}

export function readStoredDecks(storage = localStorage) {
    const decks = JSON.parse(storage.getItem(DECKS_KEY) || "[]");
    if (!Array.isArray(decks))
        throw new Error("Je opgeslagen decks konden niet worden gelezen. Er is niets gewijzigd.");
    return decks;
}

export function readPractice(deck, storage = localStorage) {
    if (deck.practice) return deck.practice;
    // Before JSON import existed, practice settings lived only in the framework.
    try {
        const config = JSON.parse(storage.getItem(`homework:flashcards-${deck.id}`) || "{}");
        return practiceFromConfig(config || {}, { ...deck, mode: deck.mode || inferDeckMode(deck.cards) });
    } catch {
        return {};
    }
}

export function findImportMatch(incoming, decks, storage = localStorage) {
    const key = deckContentKey(incoming);
    const exact = decks.find((deck) => {
        try {
            return deckContentKey(deck, readPractice(deck, storage)) === key;
        } catch {
            return false;
        }
    });
    return { exact, conflict: decks.find((deck) => deck.name?.trim() === incoming.name) };
}

export function storeImportedDeck(incoming, { name = incoming.name, replaceId = null } = {}, storage = localStorage) {
    const clean = parseDeckData(portableDeck({ ...incoming, name }));
    const decks = readStoredDecks(storage);
    const index = replaceId ? decks.findIndex((deck) => deck.id === replaceId) : -1;
    if (replaceId && index < 0) throw new Error("Dit deck bestaat niet meer. Bekijk je import opnieuw.");
    const saved = {
        ...clean,
        id: index < 0 ? crypto.randomUUID() : replaceId,
        createdAt: index < 0 ? Date.now() : decks[index].createdAt,
    };
    if (index < 0) decks.push(saved);
    else decks[index] = saved;
    // One atomic write stores both deck and practice settings. A quota error
    // propagates to the UI; it must never report an import as successful.
    storage.setItem(DECKS_KEY, JSON.stringify(decks));
    try {
        storage.setItem(LAST_DECK_KEY, saved.id);
    } catch {
        // Selection is only a convenience; the caller also links by deck id.
    }
    return saved;
}

export function downloadDeck(deck, practice) {
    const json = `${JSON.stringify(portableDeck(deck, practice), null, 2)}\n`;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${
        deck.name
            .replace(/[^\p{L}\p{N}_-]+/gu, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "flitskaarten"
    }.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
