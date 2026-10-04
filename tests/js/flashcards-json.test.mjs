// Copyright (C) 2024-2026 Plabayo
// License: https://github.com/plabayo/homework/blob/main/LICENSE
// Source-available; non-commercial use only.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    DECKS_KEY, deckContentKey, findImportMatch, normalizePractice, parseDeckData,
    parseDeckJson, portableDeck, practiceConfig, practiceFromConfig, readPractice,
    readStoredDecks, storeImportedDeck,
} from "../../src/service/assets/flashcards-data.js";

function memoryStorage(entries = {}) {
    const items = new Map(Object.entries(entries));
    return {
        getItem: key => items.get(key) ?? null,
        setItem: (key, value) => items.set(key, value),
    };
}

const simple = { name: "Seizoenen", cards: ["lente", "zomer", "herfst", "winter"] };
const pairs = { name: "Woorden", cards: [{ front: "chat", back: "kat" }] };

test("minimal memory deck and all v1 defaults need no extra fields", () => {
    const deck = parseDeckData(simple);
    assert.equal(deck.mode, "one-sided");
    assert.equal(deck.bidirectional, false);
    assert.deepEqual(deck.practice, {});
    assert.deepEqual(deck.cards, simple.cards.map(front => ({ front })));
    assert.deepEqual(portableDeck(deck), { version: 1, ...simple });
});

test("answer arrays infer two-sided mode even without a back field", () => {
    const deck = parseDeckData({name:"Vormen",cards:[{front:"lopen",parts:["liep","gelopen"]}]});
    assert.equal(deck.mode, "two-sided");
    assert.equal(deck.cards[0].partsRequired, undefined);
});

test("image answers never change the memory deck mode", () => {
    const deck = parseDeckData({name:"Gemengd",cards:["lente",{wikimedia:"File:Cat.jpg",parts:["kat","poes"],hint:"Miauw"}]});
    assert.equal(deck.mode, "one-sided");
    const exported = portableDeck(deck);
    assert.deepEqual(exported.cards[1], deck.cards[1]);
    assert.deepEqual(parseDeckData(exported), deck);
});

test("single, all, any, and N answers round-trip with hints and both directions", () => {
    for (const bidirectional of [false, true]) {
        for (const required of [undefined, 1, 2, 3]) {
            const card = {front:"Vormen",parts:["lopen","liep","gelopen"],hint:"Drie vormen"};
            if (required !== undefined) card.partsRequired = required;
            if (bidirectional) card.hintReverse = "De vraag";
            const deck = parseDeckData({name:"Vormen",bidirectional,cards:[card]});
            const before = structuredClone(deck);
            const exported = portableDeck({...deck,id:"local-id",createdAt:100});
            assert.deepEqual(parseDeckData(exported), deck);
            assert.deepEqual(deck, before, "export must not mutate stored cards");
            assert.equal(exported.id, undefined);
            assert.equal(exported.createdAt, undefined);
            assert.equal(exported.mode, undefined);
            assert.equal(exported.bidirectional, bidirectional || undefined);
            assert.equal(exported.cards[0].partsRequired, required < 3 ? required : undefined);
        }
    }
});

test("canonical export preserves image parts/hints and strips editor-only fields", () => {
    const card = {wikimedia:"File:Cat.jpg",parts:["kat","poes"],hint:"Miauw",thumbUrl:"https://example.test/thumb"};
    const exported = portableDeck({name:"Dieren",mode:"two-sided",cards:[card]});
    assert.deepEqual(exported.cards, [{wikimedia:"File:Cat.jpg",parts:["kat","poes"],hint:"Miauw"}]);
    assert.equal(exported.mode, "two-sided", "explicit image-only mode must survive");
});

test("single-element parts and redundant defaults collapse on export", () => {
    const deck = parseDeckData({version:1,name:"Woorden",mode:"two-sided",bidirectional:false,cards:[{front:" chat ",parts:[" kat "],partsRequired:1,hint:""}]});
    assert.deepEqual(portableDeck(deck), {version:1,...pairs});
});

test("legacy newline answers survive and infer the correct deck mode", () => {
    const deck = parseDeckData({name:"Vormen",cards:[{front:"lopen",back:"liep\r\n\n gelopen"}]});
    assert.equal(deck.mode, "two-sided");
    assert.deepEqual(deck.cards[0], {front:"lopen",parts:["liep","gelopen"]});
});

test("JSON permits a UTF-8 BOM and keeps accents, punctuation and emoji", () => {
    const deck = parseDeckJson('\uFEFF'+JSON.stringify({name:"Français 🇫🇷",cards:[{front:"école",back:"school, gebouw"}]}));
    assert.equal(deck.name, "Français 🇫🇷");
    assert.equal(deck.cards[0].back, "school, gebouw");
    assert.throws(() => parseDeckJson('{"name":}'), /geldige JSON/);
});

test("incomplete two-sided GUI cards export without losing their explicit mode", () => {
    const deck = parseDeckData({name:"Nog afwerken",mode:"two-sided",cards:[{front:"vraag"}]});
    assert.equal(portableDeck(deck).mode, "two-sided");
    assert.deepEqual(parseDeckData(portableDeck(deck)), deck);
});

test("practice defaults are omitted and effective partial count is derived from text cards", () => {
    const deck = parseDeckData({...simple,cards:[...simple.cards,{wikimedia:"File:Cat.jpg",back:"kat"}],practice:{mode:"partial",count:2,orderImportant:false,timeMode:true,deadlineOn:true,deadlineSeconds:10}});
    assert.deepEqual(deck.practice,{mode:"partial",timeMode:true,deadlineOn:true});
    assert.equal(practiceConfig(deck).fcCount, 2);
    assert.equal(practiceConfig(deck).deadlineSeconds, 10);
    assert.deepEqual(parseDeckData(portableDeck(deck)), deck);
});

test("nondefault counts, order and deadlines round-trip", () => {
    const deck = parseDeckData({...simple,practice:{mode:"partial",count:1,orderImportant:true,timeMode:true,deadlineOn:true,deadlineSeconds:37}});
    assert.deepEqual(practiceFromConfig(practiceConfig(deck),deck),deck.practice);
    assert.deepEqual(portableDeck(deck).practice,deck.practice);
});

test("explicit GUI defaults collapse to an absent practice property", () => {
    const deck=parseDeckData({...simple,practice:{mode:"all",orderImportant:false,timeMode:false,deadlineOn:false}});
    assert.equal(portableDeck(deck).practice,undefined);
});

const invalidDecks = [
    [null,/deck/],
    [[],/deck/],
    [{...simple,version:2},/version/],
    [{...simple,version:"1"},/version/],
    [{...simple,mode:"random"},/mode/],
    [{...simple,bidirectional:"false"},/bidirectional/],
    [{...simple,bidirectional:true},/bidirectional/],
    [{...simple,name:" "},/name/],
    [{...simple,cards:[]},/cards/],
    [{...simple,practice:null},/practice/],
    [{...simple,practice:{mode:"partial",count:4}},/practice.count/],
    [{...simple,practice:{count:1}},/practice.count/],
    [{...simple,practice:{timeMode:true,deadlineOn:true,deadlineSeconds:0}},/practice.deadlineSeconds/],
    [{...simple,practice:{deadlineOn:true}},/practice.deadlineOn/],
    [{...simple,practice:{deadlineSeconds:10}},/practice.deadlineSeconds/],
    [{...pairs,practice:{mode:"partial"}},/practice.mode/],
    [{...pairs,practice:{orderImportant:true}},/practice.orderImportant/],
    [{...simple,practice:{unknown:true}},/practice.unknown/],
    [{...simple,unknown:true},/deck.unknown/],
];
for (const [deck,error] of invalidDecks) {
    test(`invalid deck rejects without coercion: ${JSON.stringify(deck)}`, () => assert.throws(() => parseDeckData(deck),error));
}

const invalidCards = [
    null, false, 5, [], " ", {}, {front:" "},
    {front:"vraag",back:42},
    {front:"vraag",back:"a",parts:["a","b"]},
    {front:"vraag",parts:[]},
    {front:"vraag",parts:["a",null]},
    {front:"vraag",parts:["a","a"]},
    {front:"vraag",parts:["a\nb"]},
    {front:"vraag",parts:["a","b"],partsRequired:0},
    {front:"vraag",parts:["a","b"],partsRequired:1.5},
    {front:"vraag",parts:["a","b"],partsRequired:"1"},
    {front:"vraag",parts:["a","b"],partsRequired:3},
    {front:"vraag",back:"a",hint:null},
    {front:"vraag",back:"a",hintReverse:"b"},
    {front:"vraag",answer:"a"},
    {wikimedia:"https://example.test/image.jpg",back:"kat"},
    {wikimedia:"File:",back:"kat"},
    {wikimedia:"File:Cat.jpg"},
    {wikimedia:"File:Cat.jpg",front:"kat",back:"kat"},
    {wikimedia:"File:Cat.jpg",parts:["kat","poes"],partsRequired:2},
];
for (const card of invalidCards) {
    test(`invalid card reports index: ${JSON.stringify(card)}`, () => {
        assert.throws(() => parseDeckData({...pairs,cards:[pairs.cards[0],card]}),/cards\[1\]/);
    });
}

test("prototype-like keys are rejected and never assigned to stored objects", () => {
    assert.throws(() => parseDeckJson('{"name":"a","cards":["a"],"__proto__":{"polluted":true}}'), /onbekende eigenschap/);
    assert.equal({}.polluted,undefined);
});

test("duplicate keys compare full image answers, hints and practice settings", () => {
    const original=parseDeckData({name:"Dieren",cards:[{wikimedia:"File:Cat.jpg",parts:["kat","poes"],hint:"Miauw"}]});
    const storage=memoryStorage();
    assert.equal(findImportMatch(original,[{...original,id:"a"}],storage).exact.id,"a");
    for(const changed of [
        {...original,cards:[{...original.cards[0],parts:["kat","huiskat"]}]},
        {...original,cards:[{...original.cards[0],hint:"Anders"}]},
        {...original,practice:{timeMode:true}},
    ]) {
        assert.notEqual(deckContentKey(changed),deckContentKey(original));
        assert.equal(findImportMatch(changed,[{...original,id:"a"}],storage).exact,undefined);
        assert.equal(findImportMatch(changed,[{...original,id:"a"}],storage).conflict.id,"a");
    }
});

test("import stores new IDs and settings in one write; replacement retains identity/history", () => {
    const storage=memoryStorage({"homework:flashcards-existing":JSON.stringify({timeMode:true})});
    const first=storeImportedDeck(parseDeckData(pairs),{},storage);
    assert.ok(first.id);
    assert.deepEqual(readStoredDecks(storage),[first]);
    const replacement=storeImportedDeck(parseDeckData({...pairs,practice:{timeMode:true}}),{replaceId:first.id},storage);
    assert.equal(replacement.id,first.id);
    assert.equal(replacement.createdAt,first.createdAt);
    assert.equal(readStoredDecks(storage).length,1);
    assert.deepEqual(readPractice(replacement,storage),{timeMode:true});
    assert.equal(storage.getItem("homework:flashcards-existing"),'{"timeMode":true}');
    assert.throws(()=>storeImportedDeck(first,{replaceId:"missing"},storage),/niet meer/);
});

test("failed atomic import leaves existing decks and settings untouched", () => {
    const storage=memoryStorage({[DECKS_KEY]:JSON.stringify([{...parseDeckData(pairs),id:"old"}])});
    const before=storage.getItem(DECKS_KEY);
    storage.setItem=()=>{throw new DOMException("full","QuotaExceededError");};
    assert.throws(()=>storeImportedDeck(parseDeckData(simple),{},storage),/full/);
    assert.equal(storage.getItem(DECKS_KEY),before);
});

test("unreadable stored collection must not be overwritten by import", () => {
    for (const raw of ['{}','null','oops']) {
        const storage=memoryStorage({[DECKS_KEY]:raw});
        assert.throws(()=>storeImportedDeck(parseDeckData(pairs),{},storage));
        assert.equal(storage.getItem(DECKS_KEY),raw);
    }
});

test("imported default settings override older locally saved timer settings", () => {
    const storage=memoryStorage({"homework:flashcards-a":JSON.stringify({timeMode:true,deadlineOn:true,deadlineSeconds:30})});
    assert.deepEqual(readPractice({...parseDeckData(pairs),id:"a"},storage),{});
    assert.deepEqual(readPractice({...pairs,mode:"two-sided",id:"a"},storage),{timeMode:true,deadlineOn:true,deadlineSeconds:30});
});

test("disabled GUI controls do not leak inactive settings into a file", () => {
    const deck=parseDeckData(pairs);
    assert.deepEqual(practiceFromConfig({fcMode:"partial",fcCount:999,fcOrderImportant:true,timeMode:false,deadlineOn:true,deadlineSeconds:999},deck),{});
    assert.throws(()=>normalizePractice({timeMode:true,deadlineOn:true,deadlineSeconds:600.5},deck),/geheel getal/);
});
