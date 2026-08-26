// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend, p};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_breadcrumb, exercise_scaffold};
use crate::service::json_ld;
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "decimals",
    path: "/3/decimals",
    label: "kommatrainer",
    icon: "🔍",
    code_label: "🔍",
    level: 3,
};
const DESCRIPTION: &str =
    "Leer kommagetallen begrijpen, vergelijken, ordenen, plaatsen en afronden.";

crate::inline_style!(STYLE, "decimals.css", EXERCISES_DECIMALS_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "decimals.js", EXERCISES_DECIMALS_JS_HASH_B64);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Ontdek wat elk cijfer na de komma betekent.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "kommatrainer — Oefeningen Basisschool",
            description: DESCRIPTION,
            og_path: INFO.path.into(),
            favicon_emoji: "🔍",
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
            legend!("Tot hoeveel cijfers na de komma?"),
            div!(
                class = "kinds",
                label!(
                    input!(
                        r#type = "radio",
                        name = "precision",
                        value = "1",
                        checked? = true,
                    ),
                    " tienden (0,1)",
                ),
                label!(
                    input!(r#type = "radio", name = "precision", value = "2",),
                    " honderdsten (0,01)",
                ),
                label!(
                    input!(r#type = "radio", name = "precision", value = "3",),
                    " duizendsten (0,001)",
                ),
            ),
            p!(
                class = "field-hint",
                "Een hoger niveau mengt ook de eerdere stappen.",
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
    )
}
