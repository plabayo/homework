// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend, p, span};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    Checked, ExerciseInfo, exercise_breadcrumb, exercise_scaffold, practice_checkbox,
    time_mode_fieldset,
};
use crate::service::json_ld;
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "fraction-sense",
    path: "/2/fraction-sense",
    label: "breukenwijzer",
    icon: "🧭",
    code_label: "🧭",
    level: 2,
};
const DESCRIPTION: &str =
    "Leer breuken herkennen, vergelijken, ordenen, gelijkwaardig maken en vereenvoudigen.";

crate::inline_style!(
    STYLE,
    "fraction_sense.css",
    EXERCISES_FRACTION_SENSE_CSS_HASH_B64
);
crate::inline_module_script!(
    SCRIPT,
    "fraction_sense.js",
    EXERCISES_FRACTION_SENSE_JS_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Ontdek wat breuken betekenen en hoe ze bij elkaar passen.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "breukenwijzer — Oefeningen Basisschool",
            description: DESCRIPTION,
            og_path: INFO.path.into(),
            favicon_emoji: "🧭",
            structured_data: Some(json_ld::exercise(INFO, DESCRIPTION)),
        },
        PageInlines {
            style: Some(&STYLE),
            module_script: Some(&SCRIPT),
            ..Default::default()
        },
        body,
        banner,
    )
}

fn config_fields() -> impl IntoHtml {
    (
        fieldset!(
            legend!("Wat wil je oefenen?"),
            div!(
                class = "kinds",
                practice_checkbox("recognize", "breuken herkennen", Checked::Yes),
                practice_checkbox("compare", "vergelijken en ordenen", Checked::Yes),
                practice_checkbox(
                    "equivalent",
                    "gelijkwaardig maken en vereenvoudigen",
                    Checked::Yes,
                ),
                practice_checkbox("improper", "breuken groter dan één", Checked::No),
            ),
        ),
        fieldset!(
            legend!("Welke noemers?"),
            div!(
                class = "denominator-levels",
                label!(
                    input!(r#type = "radio", name = "denominator-set", value = "small"),
                    span!("2, 3, 4, 5 en 6"),
                ),
                label!(
                    input!(
                        r#type = "radio",
                        name = "denominator-set",
                        value = "standard",
                        checked? = true,
                    ),
                    span!("ook 8, 9, 10 en 12"),
                ),
                label!(
                    input!(r#type = "radio", name = "denominator-set", value = "large"),
                    span!("ook 15, 20, 25, 50 en 100"),
                ),
            ),
            p!(
                class = "field-hint",
                "Elke volgende keuze bevat ook de vorige noemers.",
            ),
        ),
        fieldset!(
            legend!("Extra oefening"),
            label!(
                input!(
                    r#type = "checkbox",
                    id = "include-decimals",
                    name = "include-decimals",
                ),
                " breuken en kommagetallen omzetten (bijv. 3/4 = 0,75)",
            ),
        ),
        div!(
            class = "field",
            label!(r#for = "num-exercises", "Hoeveel oefeningen?"),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]+",
                id = "num-exercises",
                name = "num-exercises",
                min = "1",
                max = "100",
                value = "10",
                required? = true,
            ),
        ),
        time_mode_fieldset(),
    )
}
