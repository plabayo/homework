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
    id: "mathbox",
    path: "/1/mathbox",
    label: "rekendoos",
    icon: "🔢",
    code_label: "➕➖✖️➗🟰",
    level: 1,
};
const DESCRIPTION: &str = "Oefen rekenkunde: som, verschil, splitsen, vermenigvuldigen, delen.";

crate::inline_style!(STYLE, "mathbox.css", EXERCISES_MATHBOX_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "mathbox.js", EXERCISES_MATHBOX_JS_HASH_B64);

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
            description: DESCRIPTION,
            og_path: INFO.path.into(),
            favicon_emoji: "🔢",
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
        div!(
            class = "field",
            label!(r#for = "count-until", "Tot welk getal wil je oefenen?"),
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
        fieldset!(
            class = "term-ranges",
            "aria-describedby" = "term-ranges-hint",
            legend!("Grenzen per getal (optioneel)"),
            p!(
                id = "term-ranges-hint",
                class = "field-hint",
                "De uitkomst blijft tot het getal hierboven. Laat een vakje leeg voor geen extra grens.",
            ),
            term_range("first", "Eerste getal"),
            term_range("second", "Tweede getal"),
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

/// One "van … tot …" row. The visible labels are short; the hidden prefix
/// keeps each input's accessible name unambiguous.
fn term_range(which: &'static str, name: &'static str) -> impl IntoHtml {
    let min_id = format!("min-{which}-term");
    let max_id = format!("max-{which}-term");
    div!(
        class = "field-row term-range",
        span!(class = "term-range-name", "aria-hidden" = "true", name),
        div!(
            class = "term-range-bounds",
            label!(
                r#for = min_id.clone(),
                span!(class = "visually-hidden", name, " "),
                "van",
            ),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]*",
                id = min_id.clone(),
                name = min_id,
                size = "4",
                placeholder = "0",
            ),
            label!(
                r#for = max_id.clone(),
                span!(class = "visually-hidden", name, " "),
                "tot",
            ),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]*",
                id = max_id.clone(),
                name = max_id,
                size = "4",
                placeholder = "max",
            ),
        ),
    )
}
