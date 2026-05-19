// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{IntoHtml, div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold, time_mode_fieldset};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "mathbox",
    path: "/1/mathbox",
    label: "rekendoos",
    icon: "🔢",
    code_label: "➕➖✖️➗🟰",
    level: 1,
};

const STYLE: &str = include_str!("mathbox.css");
const SCRIPT: &str = include_str!("mathbox.js");

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        page_header("rekendoos"),
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
            og_path: "/1/mathbox".into(),
            favicon_emoji: "🔢",
        },
        STYLE,
        body,
        SCRIPT,
        banner,
    )
}

fn kind_checkbox(value: &'static str, text: &'static str, default_on: bool) -> impl IntoHtml {
    let checked: Option<&'static str> = if default_on { Some("") } else { None };
    label!(
        input!(
            r#type = "checkbox",
            name = "practice",
            value = value,
            checked? = checked,
        ),
        " ",
        text,
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
                kind_checkbox("som", "optellen ➕", true),
                kind_checkbox("verschil", "aftrekken ➖", true),
                kind_checkbox("splitsen", "splitsen 🔼", true),
                kind_checkbox("vermenigvuldigen", "vermenigvuldigen ✖️", false),
                kind_checkbox("delen", "delen ➗", false),
            ),
        ),
        time_mode_fieldset(),
    )
}
