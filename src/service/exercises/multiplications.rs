// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    ExerciseInfo, exercise_breadcrumb, exercise_scaffold, time_mode_fieldset,
};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "multiplications",
    path: "/1/multiplications",
    label: "maaltafels",
    icon: "✖️",
    code_label: "✖️",
    level: 1,
};

crate::inline_style!(
    STYLE,
    "multiplications.css",
    EXERCISES_MULTIPLICATIONS_CSS_HASH_B64
);
crate::inline_module_script!(
    SCRIPT,
    "multiplications.js",
    EXERCISES_MULTIPLICATIONS_JS_HASH_B64
);
crate::inline_ld_json!(
    LD_JSON,
    "multiplications.jsonld",
    EXERCISES_MULTIPLICATIONS_JSONLD_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Oefen hier de maaltafels. Kies hoeveel oefeningen en welke tafels.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "maaltafels — Oefeningen Basisschool",
            description: "Oefen de maaltafels van 1 tot en met 10.",
            og_path: "/1/multiplications".into(),
            favicon_emoji: "✖️",
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

fn config_fields() -> impl rama::http::html::IntoHtml {
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
                max = "200",
                value = "10",
                required? = true,
            ),
        ),
        fieldset!(
            legend!("Welke maaltafels?"),
            div!(
                id = "tables",
                (1u32..=10)
                    .map(|t| label!(
                        input!(
                            r#type = "checkbox",
                            id = format!("table-{t}"),
                            "data-table" = t,
                        ),
                        " tafel ",
                        t,
                    ))
                    .collect::<Vec<_>>(),
            ),
            label!(
                input!(r#type = "checkbox", id = "select-all"),
                " selecteer alle tafels van 1 tot en met 10",
            ),
        ),
        time_mode_fieldset(),
    )
}
