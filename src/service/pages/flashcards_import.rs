// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{
    IntoHtml, a, button, code, dd, details, div, dl, dt, h2, h3, input, label, li, nav, p, pre,
    section, span, strong, summary, textarea, ul,
};
use rama::http::service::web::response::IntoResponse;

use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page, page_header};

crate::inline_style!(
    STYLE,
    "flashcards_import.css",
    PAGES_FLASHCARDS_IMPORT_CSS_HASH_B64
);
crate::inline_module_script!(
    SCRIPT,
    "flashcards_import.js",
    PAGES_FLASHCARDS_IMPORT_JS_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    page(
        PageMeta {
            title: "Flitskaarten importeren — Oefeningen Basisschool",
            description: "Importeer flitskaarten uit JSON. Met voorbeelden voor woorden, meerdere antwoorden, afbeeldingen en oefeninstellingen.",
            og_path: "/extra/flashcards/import".into(),
            favicon_emoji: "🃏",
            structured_data: None,
        },
        PageInlines {
            style: Some(&STYLE),
            module_script: Some(&SCRIPT),
            ..Default::default()
        },
        (
            page_header("Flitskaarten importeren"),
            div!(
                class = "fc-json-page",
                a!(href = "/extra/flashcards", "← Terug naar je decks"),
                p!(
                    class = "page-intro",
                    "Een deck gekregen of zelf een bestand gemaakt? Voeg je kaartjes toe en oefen meteen verder."
                ),
                import_form(),
                documentation(),
            ),
        ),
        lang_banner(req.headers()),
    )
}

fn import_form() -> impl IntoHtml {
    section!(
        class = "fc-json-upload",
        "aria-labelledby" = "fc-upload-title",
        h2!(id = "fc-upload-title", "Kies je JSON-bestand"),
        p!("Je bekijkt het deck eerst. Daarna kies je of je het wilt toevoegen."),
        div!(
            class = "fc-json-drop",
            id = "fc-drop-zone",
            label!(
                r#for = "fc-file",
                "Sleep een .json-bestand hierheen of kies een bestand"
            ),
            input!(
                r#type = "file",
                id = "fc-file",
                accept = ".json,application/json",
                "aria-describedby" = "fc-file-note"
            ),
        ),
        p!(
            id = "fc-file-note",
            class = "fc-json-note",
            "🔒 Je bestand blijft op dit toestel. Maximaal 5 MB."
        ),
        details!(
            id = "fc-paste-details",
            summary!("Of plak je JSON"),
            div!(
                class = "field",
                label!(r#for = "fc-json-text", "JSON van je deck"),
                textarea!(
                    id = "fc-json-text",
                    rows = "8",
                    spellcheck = "false",
                    autocomplete = "off"
                ),
            ),
            button!(
                r#type = "button",
                id = "fc-check-json",
                class = "default-button",
                "Bekijk deck"
            ),
        ),
        p!(
            id = "fc-import-error",
            class = "error-text",
            role = "alert",
            hidden? = true
        ),
        section!(
            id = "fc-import-preview",
            class = "fc-json-preview",
            hidden? = true,
            "aria-labelledby" = "fc-preview-name",
            h3!(id = "fc-preview-name", tabindex = "-1"),
            p!(id = "fc-preview-meta"),
            p!(id = "fc-preview-sample", class = "fc-json-note"),
            p!(
                id = "fc-preview-images",
                class = "fc-json-note",
                hidden? = true,
                "Afbeeldingen worden bij het openen van je deck gedownload. Zonder internet blijven nog niet opgeslagen afbeeldingen tijdelijk onbeschikbaar."
            ),
            p!(
                id = "fc-preview-incomplete",
                class = "fc-json-note",
                hidden? = true,
                "Dit deck bevat tekstkaartjes zonder antwoord. Vul die in via Bewerken voordat je oefent."
            ),
            p!(
                id = "fc-preview-conflict",
                hidden? = true,
                "Er bestaat al een deck met deze naam, maar met andere inhoud of instellingen. Kies zelf wat je wilt bewaren."
            ),
            div!(
                id = "fc-import-name-field",
                class = "field",
                hidden? = true,
                label!(r#for = "fc-import-name", "Naam voor nieuw deck"),
                input!(r#type = "text", id = "fc-import-name", autocomplete = "off"),
            ),
            import_actions(),
        ),
        p!(id = "fc-import-status", role = "status", hidden? = true),
        a!(
            id = "fc-open-deck",
            class = "default-button primary fc-json-open",
            href = "/extra/flashcards",
            hidden? = true,
            "Ga naar je deck →"
        ),
    )
}

fn import_actions() -> impl IntoHtml {
    div!(
        class = "button-row",
        button!(
            r#type = "button",
            id = "fc-confirm-import",
            class = "default-button primary",
            "Importeer deck"
        ),
        button!(
            r#type = "button",
            id = "fc-saveas-import",
            class = "default-button primary",
            hidden? = true,
            "Opslaan als nieuw"
        ),
        button!(
            r#type = "button",
            id = "fc-overwrite-import",
            class = "default-button",
            hidden? = true,
            "Vervang bestaand deck"
        ),
        button!(
            r#type = "button",
            id = "fc-cancel-import",
            class = "default-button",
            "Annuleer"
        ),
    )
}

fn example(id: &'static str, filename: &'static str, json: &'static str) -> impl IntoHtml {
    div!(
        class = "fc-json-example",
        div!(
            class = "fc-json-example-header",
            span!(filename),
            button!(
                r#type = "button",
                class = "fc-json-use",
                "data-example" = id,
                "Voorbeeld gebruiken ↑"
            ),
        ),
        pre!(code!(id = id, json)),
    )
}

fn documentation() -> impl IntoHtml {
    section!(
        id = "json-uitleg",
        class = "fc-json-docs",
        "aria-labelledby" = "fc-doc-title",
        h2!(id = "fc-doc-title", "Zo maak je een JSON-deck"),
        p!(
            "Begin klein. Je hebt alleen een naam en kaartjes nodig. Extra instellingen voeg je pas toe als je ze gebruikt."
        ),
        nav!(
            class = "fc-json-nav",
            "aria-label" = "In deze uitleg",
            a!(href = "#eenvoudig", "Eenvoudig beginnen"),
            a!(href = "#meerdere-antwoorden", "Meerdere antwoorden"),
            a!(href = "#afbeeldingen-hints", "Afbeeldingen en hints"),
            a!(href = "#instellingen", "Alle instellingen"),
        ),
        basic_examples(),
        multiple_answers(),
        extras(),
        defaults(),
        export_help(),
    )
}

fn basic_examples() -> impl IntoHtml {
    (
        section!(
            id = "eenvoudig",
            class = "fc-json-section",
            h3!("1. Kaartjes om uit het hoofd te leren"),
            p!(
                "Geef je deck een ",
                code!("name"),
                " en zet de woorden in ",
                code!("cards"),
                ". Meer hoeft niet. Handig voor de seizoenen, maanden of een lijst begrippen."
            ),
            example(
                "fc-example-simple",
                "seizoenen.json",
                r#"{
  "name": "Seizoenen",
  "cards": ["lente", "zomer", "herfst", "winter"]
}"#
            ),
            p!(
                class = "fc-json-tip",
                "De volgorde in het bestand blijft bewaard. Tijdens het oefenen worden de kaartjes standaard door elkaar gezet."
            ),
        ),
        section!(
            class = "fc-json-section",
            h3!("2. Een vraag en een antwoord"),
            p!(
                "Gebruik ",
                code!("front"),
                " voor de voorkant en ",
                code!("back"),
                " voor het antwoord. Flitskaarten herkent zo automatisch een deck met twee kanten."
            ),
            example(
                "fc-example-pairs",
                "franse-woordjes.json",
                r#"{
  "name": "Franse woordjes",
  "cards": [
    { "front": "chat", "back": "kat" },
    { "front": "chien", "back": "hond" }
  ]
}"#
            ),
        ),
    )
}

fn multiple_answers() -> impl IntoHtml {
    section!(
        id = "meerdere-antwoorden",
        class = "fc-json-section",
        h3!("3. Meerdere juiste antwoorden"),
        p!(
            "Zet meerdere antwoorden in ",
            code!("parts"),
            ", in plaats van ",
            code!("back"),
            ". Met ",
            code!("partsRequired"),
            " kies je hoeveel verschillende antwoorden nodig zijn."
        ),
        example(
            "fc-example-multiple",
            "meerdere-antwoorden.json",
            r#"{
  "name": "Meerdere antwoorden",
  "cards": [
    {
      "front": "Vormen van lopen",
      "parts": ["lopen", "liep", "gelopen"]
    },
    {
      "front": "Een ander woord voor fiets",
      "parts": ["rijwiel", "velo"],
      "partsRequired": 1
    },
    {
      "front": "Noem twee primaire kleuren",
      "parts": ["rood", "geel", "blauw"],
      "partsRequired": 2
    }
  ]
}"#
        ),
        ul!(
            li!(
                strong!("Geen partsRequired? "),
                "Alle onderdelen zijn nodig: lopen, liep én gelopen."
            ),
            li!(
                code!("partsRequired: 1"),
                " betekent dat één antwoord volstaat: rijwiel óf velo."
            ),
            li!(
                code!("partsRequired: 2"),
                " betekent twee verschillende antwoorden uit de lijst."
            ),
        ),
        p!(
            class = "fc-json-note",
            "De leerling mag de onderdelen in een andere volgorde geven. Gebruik getallen zonder aanhalingstekens."
        ),
    )
}

fn extras() -> impl IntoHtml {
    section!(
        id = "afbeeldingen-hints",
        class = "fc-json-section",
        h3!("4. Afbeeldingen, hints en twee richtingen"),
        p!("Deze extra’s zijn optioneel. Open wat je nodig hebt."),
        details!(
            summary!("Een afbeelding van Wikimedia Commons"),
            p!(
                "Gebruik ",
                code!("wikimedia"),
                " in plaats van ",
                code!("front"),
                ", met de volledige bestandstitel uit Commons. Vervang de voorbeeldtitel hieronder door de titel van je afbeelding."
            ),
            example(
                "fc-example-image",
                "dieren.json",
                r#"{
  "name": "Dieren",
  "cards": [
    {
      "wikimedia": "File:Jouw kattenfoto.jpg",
      "parts": ["kat", "poes"],
      "hint": "Dit dier miauwt."
    }
  ]
}"#
            ),
            p!(
                class = "fc-json-tip",
                "Bij afbeeldingen is één antwoord uit parts altijd genoeg. Laat partsRequired weg. Afbeeldingen worden via internet opgehaald en op je toestel bewaard voor offline gebruik."
            ),
            p!(
                "Tekst- en afbeeldingskaartjes mogen in hetzelfde deck staan. Afbeeldingen worden altijd als losse vragen geoefend."
            ),
        ),
        details!(
            summary!("Hints en omgekeerd oefenen"),
            p!(
                "Met ",
                code!("bidirectional: true"),
                " kan een tekstkaartje in beide richtingen gevraagd worden. Gebruik ",
                code!("hint"),
                " voor de normale vraag en ",
                code!("hintReverse"),
                " voor de omgekeerde vraag."
            ),
            example(
                "fc-example-hints",
                "met-hints.json",
                r#"{
  "name": "Franse woordjes",
  "bidirectional": true,
  "cards": [
    {
      "front": "chat",
      "back": "kat",
      "hint": "Dit dier miauwt.",
      "hintReverse": "Begint met ch."
    }
  ]
}"#
            ),
            p!(
                class = "fc-json-tip",
                "Bij meerdere onderdelen gebruikt een omgekeerde vraag het eerste onderdeel als voorkant. Afbeeldingen worden niet omgekeerd."
            ),
        ),
    )
}

fn default_row(name: &'static str, explanation: &'static str) -> impl IntoHtml {
    div!(dt!(code!(name)), dd!(explanation))
}

fn defaults() -> impl IntoHtml {
    section!(
        id = "instellingen",
        class = "fc-json-section",
        h3!("5. Laat standaardinstellingen gerust weg"),
        p!(
            "Je hoeft geen false, lege hints of standaardwaarden op te schrijven. Een export laat die ook weg."
        ),
        dl!(
            default_row(
                "version",
                "Standaard 1. Een export zet dit erbij, zodat het formaat herkenbaar blijft."
            ),
            default_row(
                "mode",
                "Automatisch one-sided voor losse woorden; two-sided zodra tekstkaartjes antwoorden hebben. Antwoorden bij afbeeldingen veranderen het decktype niet."
            ),
            default_row("bidirectional", "Standaard false: voorkant → antwoord."),
            default_row(
                "partsRequired",
                "Tekst: alle onderdelen. Afbeelding: één antwoord."
            ),
            default_row("hint / hintReverse", "Standaard geen hint."),
            default_row(
                "practice",
                "Standaard alles invullen, willekeurige volgorde en geen timer."
            ),
        ),
        details!(
            summary!("Oefeninstellingen meegeven"),
            p!(
                "Met practice neem je ook je oefeninstellingen mee. Dit voorbeeld toont twee lege vakjes, bewaart de volgorde en zet de timer aan."
            ),
            example(
                "fc-example-practice",
                "seizoenen-oefenen.json",
                r#"{
  "name": "Seizoenen",
  "cards": ["lente", "zomer", "herfst", "winter"],
  "practice": {
    "mode": "partial",
    "orderImportant": true,
    "timeMode": true
  }
}"#
            ),
            dl!(
                default_row(
                    "mode",
                    "all is standaard. partial laat een deel van de woorden zien; alleen voor one-sided decks met minstens twee tekstkaarten."
                ),
                default_row(
                    "count",
                    "Aantal lege vakjes bij partial. Standaard de helft, naar boven afgerond. Minstens 1; minstens één tekstkaart blijft zichtbaar."
                ),
                default_row(
                    "orderImportant",
                    "Standaard false. Met true blijven tekstkaarten in een one-sided deck in de volgorde van je bestand staan."
                ),
                default_row("timeMode", "Standaard false. Met true verschijnt de timer."),
                default_row(
                    "deadlineOn",
                    "Standaard false. Zet dit én timeMode aan voor een maximumtijd per oefening."
                ),
                default_row(
                    "deadlineSeconds",
                    "Standaard 10 bij een ingeschakelde maximumtijd. Kies een geheel getal van 1 tot 600."
                ),
            ),
        ),
    )
}

fn export_help() -> impl IntoHtml {
    section!(
        class = "fc-json-section",
        h3!("Een deck exporteren en delen"),
        p!(
            "Kies ",
            strong!("Exporteer JSON"),
            " bij je deck. Je krijgt een bestand dat je kunt bewaren, aanpassen of doorsturen. De ontvanger kan het bovenaan deze pagina importeren."
        ),
        p!(
            class = "fc-json-note",
            "Het bestand bevat je kaartjes en oefeninstellingen. Je oefengeschiedenis blijft op je toestel. Afbeeldingen worden als Commons-bestandstitel opgeslagen."
        ),
        details!(
            summary!("Lukt het importeren niet?"),
            ul!(
                li!("Gebruik dubbele aanhalingstekens en zet geen komma achter het laatste item."),
                li!("Elk deck heeft een naam en minstens één kaartje nodig."),
                li!("Gebruik per kaart front óf wikimedia, en back óf parts."),
                li!(
                    "Onbekende eigenschappen en ongeldige instellingen geven een foutmelding. Er worden geen kaartjes stilletjes overgeslagen."
                ),
                li!(
                    "Een foutmelding zoals cards[2].partsRequired wijst naar het derde kaartje: de telling begint bij 0."
                ),
            ),
            p!(
                "Bestaat de naam al? Je kiest zelf: het bestaande deck vervangen, als nieuw deck bewaren of annuleren."
            ),
        ),
    )
}
