// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    Checked, ExerciseInfo, exercise_breadcrumb, exercise_scaffold, practice_checkbox,
};
use crate::service::json_ld;
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "written-arithmetic",
    path: "/3/written-arithmetic",
    label: "cijfertrainer",
    icon: "✍️",
    code_label: "✍️",
    level: 3,
};
const DESCRIPTION: &str =
    "Leer kolomsgewijs optellen en aftrekken, stap voor stap met onthouden en lenen.";

crate::inline_style!(
    STYLE,
    "written_arithmetic.css",
    EXERCISES_WRITTEN_ARITHMETIC_CSS_HASH_B64
);
crate::inline_module_script!(
    SCRIPT,
    "written_arithmetic.js",
    EXERCISES_WRITTEN_ARITHMETIC_JS_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Werk van rechts naar links en controleer elk cijfer en elke overdracht.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "cijfertrainer — Oefeningen Basisschool",
            description: DESCRIPTION,
            og_path: INFO.path.into(),
            favicon_emoji: "✍️",
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
                        value = "1000",
                        checked? = true,
                    ),
                    " tot 1 000",
                ),
                label!(
                    input!(r#type = "radio", name = "maximum", value = "10000",),
                    " tot 10 000",
                ),
                label!(
                    input!(r#type = "radio", name = "maximum", value = "100000",),
                    " tot 100 000",
                ),
            ),
        ),
        fieldset!(
            legend!("Wat wil je oefenen?"),
            div!(
                class = "kinds",
                practice_checkbox("som", "optellen ➕", Checked::Yes),
                practice_checkbox("verschil", "aftrekken ➖", Checked::Yes),
            ),
        ),
        fieldset!(
            legend!("Moeilijkheid"),
            div!(
                class = "kinds",
                label!(
                    input!(
                        r#type = "radio",
                        name = "difficulty",
                        value = "mixed",
                        checked? = true,
                    ),
                    " gemengd",
                ),
                label!(
                    input!(
                        r#type = "radio",
                        name = "difficulty",
                        value = "without-transfer",
                    ),
                    " zonder onthouden of lenen",
                ),
                label!(
                    input!(
                        r#type = "radio",
                        name = "difficulty",
                        value = "with-transfer",
                    ),
                    " met onthouden of lenen",
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
                max = "100",
                value = "10",
                required? = true,
            ),
        ),
    )
}
