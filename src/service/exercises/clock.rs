// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{button, div, fieldset, input, label, legend, p, section, span};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_breadcrumb, exercise_scaffold};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "clock",
    path: "/2/clock",
    label: "analoge klok",
    icon: "🕐",
    code_label: "🕐",
    level: 2,
};

crate::inline_style!(STYLE, "clock.css", EXERCISES_CLOCK_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "clock.js", EXERCISES_CLOCK_JS_HASH_B64);
crate::inline_ld_json!(LD_JSON, "clock.jsonld", EXERCISES_CLOCK_JSONLD_HASH_B64);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        freeplay_section(),
        exercise_scaffold(
            INFO,
            "Leer de analoge klok lezen en zetten. Kies de oefen-type en de moeilijkheidsgraad.",
            config_fields(),
            freeplay_entry(),
        ),
    );

    page(
        PageMeta {
            title: "analoge klok — Oefeningen Basisschool",
            description: "Oefen het lezen en zetten van een analoge klok.",
            og_path: "/2/clock".into(),
            favicon_emoji: "🕐",
        },
        PageInlines {
            style: Some(&STYLE),
            module_script: Some(&SCRIPT),
            ld_json: Some(&LD_JSON),
            ..Default::default()
        },
        body,
        banner,
    )
}

fn config_fields() -> impl rama::http::protocols::html::IntoHtml {
    (
        div!(
            class = "field",
            label!(r#for = "num-exercises", "Hoeveel oefeningen?"),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]+",
                id = "num-exercises",
                name = "num-exercises",
                min = "1",
                max = "60",
                value = "10",
                required? = true,
            ),
        ),
        fieldset!(
            legend!("Hoe nauwkeurig?"),
            label!(
                input!(
                    r#type = "radio",
                    name = "granularity",
                    value = "hour",
                    checked? = true
                ),
                " volle uren (12:00)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "half"),
                " half uur (12:30)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "quarter"),
                " kwartier (12:15, 12:30, 12:45)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "five"),
                " vijf minuten",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "one"),
                " elke minuut (moeilijk)",
            ),
        ),
        fieldset!(
            legend!("Welke oefeningen?"),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "ck",
                    value = "lees",
                    checked? = true
                ),
                " lees de klok 🕐",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "ck",
                    value = "zet",
                    checked? = true
                ),
                " zet de klok vanuit een digitale tijd ⏰",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "ck",
                    value = "zet-woorden",
                    checked? = true
                ),
                " zet de klok vanuit woorden (\"kwart voor vier\") 💬",
            ),
        ),
        fieldset!(
            legend!("Hoe antwoord je bij \"lees de klok\"?"),
            label!(
                input!(
                    r#type = "radio",
                    name = "answer",
                    value = "multiple",
                    checked? = true
                ),
                " kies uit meerdere antwoorden",
            ),
            label!(
                input!(r#type = "radio", name = "answer", value = "fill"),
                " typ de tijd zelf in",
            ),
        ),
        fieldset!(
            legend!("Extra opties (gevorderd)"),
            label!(
                input!(r#type = "checkbox", name = "hide-numbers", value = "1",),
                " verberg de getallen op de wijzerplaat",
            ),
        ),
    )
}

fn freeplay_entry() -> impl rama::http::protocols::html::IntoHtml {
    div!(
        class = "freeplay-entry",
        p!(
            class = "freeplay-entry-hint",
            "Wil je de klok verkennen zonder oefeningen? Gebruik de vrije modus — handig om de klok samen uit te leggen.",
        ),
        button!(
            r#type = "button",
            id = "freeplay-open",
            class = "btn-lift",
            "🕐 vrij verkennen",
        ),
    )
}

fn freeplay_section() -> impl rama::http::protocols::html::IntoHtml {
    section!(
        id = "page-freeplay",
        hidden? = true,
        div!(
            class = "exercise-meta",
            button!(
                r#type = "button",
                id = "freeplay-back",
                class = "button-reset btn-lift",
                "terug naar menu ↩️",
            ),
            // Decorative title for the free-play page. Must NOT use the
            // `exercise-title` id — that one belongs to the play-page
            // scaffold (homework.js writes `oefening N van M` into it),
            // and two same-id elements in the DOM means the wrong one
            // wins via getElementById.
            p!(id = "freeplay-title", "vrij verkennen 🕐"),
        ),
        div!(id = "freeplay-clock"),
        div!(
            class = "freeplay-time",
            p!(class = "time-readout", id = "freeplay-digital", "06:00"),
            p!(class = "freeplay-phrase", id = "freeplay-phrase", "zes uur"),
        ),
        div!(
            class = "clock-controls",
            div!(
                class = "clock-control-row",
                span!(class = "label", "uur"),
                div!(
                    class = "button-pair",
                    button!(r#type = "button", id = "freeplay-hour-dec", "➖"),
                    button!(r#type = "button", id = "freeplay-hour-inc", "➕"),
                ),
            ),
            div!(
                class = "clock-control-row",
                span!(class = "label", "minuut"),
                div!(
                    class = "button-pair",
                    button!(r#type = "button", id = "freeplay-min-dec", "➖"),
                    button!(r#type = "button", id = "freeplay-min-inc", "➕"),
                ),
            ),
        ),
    )
}
