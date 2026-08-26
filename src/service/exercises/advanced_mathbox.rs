// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend, p};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    Checked, ExerciseInfo, exercise_breadcrumb, exercise_scaffold, practice_checkbox,
    time_mode_fieldset,
};
use crate::service::json_ld;
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "advanced-mathbox",
    path: "/3/advanced-mathbox",
    label: "grote rekendoos",
    icon: "🧮",
    code_label: "🧮",
    level: 3,
};
const DESCRIPTION: &str = "Oefen rekenen met grotere natuurlijke getallen tot 10 000 of 100 000.";

crate::inline_style!(
    STYLE,
    "advanced_mathbox.css",
    EXERCISES_ADVANCED_MATHBOX_CSS_HASH_B64
);
crate::inline_module_script!(
    SCRIPT,
    "advanced_mathbox.js",
    EXERCISES_ADVANCED_MATHBOX_JS_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Oefen optellen, aftrekken, vermenigvuldigen en delen met grotere getallen.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "grote rekendoos — Oefeningen Basisschool",
            description: DESCRIPTION,
            og_path: INFO.path.into(),
            favicon_emoji: "🧮",
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
            legend!("Tot welk getal?"),
            div!(
                class = "kinds",
                label!(
                    input!(
                        r#type = "radio",
                        name = "maximum",
                        value = "10000",
                        checked? = true,
                    ),
                    " tot 10 000",
                ),
                label!(
                    input!(r#type = "radio", name = "maximum", value = "100000",),
                    " tot 100 000",
                ),
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
                max = "200",
                value = "10",
                required? = true,
            ),
        ),
        fieldset!(
            legend!("Wat wil je oefenen?"),
            div!(
                class = "kinds",
                practice_checkbox("som", "optellen ➕", Checked::Yes),
                practice_checkbox("verschil", "aftrekken ➖", Checked::Yes),
                practice_checkbox("vermenigvuldigen", "vermenigvuldigen ✖️", Checked::No),
                practice_checkbox("delen", "delen ➗", Checked::No),
            ),
            p!(
                class = "field-hint",
                "Vermenigvuldigen en delen gebeurt met één cijfer.",
            ),
        ),
        fieldset!(
            id = "division-options",
            hidden? = true,
            legend!("Bij delen"),
            label!(
                input!(
                    r#type = "checkbox",
                    id = "include-remainders",
                    name = "include-remainders",
                ),
                " ook delingen met rest",
            ),
        ),
        time_mode_fieldset(),
    )
}
