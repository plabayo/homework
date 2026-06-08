// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    Checked, ExerciseInfo, exercise_breadcrumb, exercise_scaffold, practice_checkbox,
    time_mode_fieldset,
};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "mathbox",
    path: "/1/mathbox",
    label: "rekendoos",
    icon: "🔢",
    code_label: "➕➖✖️➗🟰",
    level: 1,
};

crate::inline_style!(STYLE, "mathbox.css", EXERCISES_MATHBOX_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "mathbox.js", EXERCISES_MATHBOX_JS_HASH_B64);
crate::inline_ld_json!(LD_JSON, "mathbox.jsonld", EXERCISES_MATHBOX_JSONLD_HASH_B64);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "De digitale rekendoos: optellen, aftrekken, splitsen, vermenigvuldigen en delen.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "rekendoos — Oefeningen Basisschool",
            description: "Oefen rekenkunde: som, verschil, splitsen, vermenigvuldigen, delen.",
            og_path: INFO.path.into(),
            favicon_emoji: "🔢",
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

fn config_fields() -> impl IntoHtml {
    (
        div!(
            class = "field",
            label!(r#for = "count-until", "Tot hoeveel kan het kind al tellen?"),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]+",
                id = "count-until",
                name = "count-until",
                min = "3",
                max = "1000",
                value = "10",
                required? = true,
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
                practice_checkbox("splitsen", "splitsen 🔼", Checked::Yes),
                practice_checkbox("vermenigvuldigen", "vermenigvuldigen ✖️", Checked::No),
                practice_checkbox("delen", "delen ➗", Checked::No),
            ),
        ),
        time_mode_fieldset(),
    )
}
