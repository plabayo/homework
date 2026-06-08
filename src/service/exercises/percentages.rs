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
    id: "percentages",
    path: "/2/percentages",
    label: "procenten",
    icon: "💯",
    code_label: "💯",
    level: 2,
};

crate::inline_style!(STYLE, "percentages.css", EXERCISES_PERCENTAGES_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "percentages.js", EXERCISES_PERCENTAGES_JS_HASH_B64);
crate::inline_ld_json!(
    LD_JSON,
    "percentages.jsonld",
    EXERCISES_PERCENTAGES_JSONLD_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Oefen met procenten: breuk naar procent, procent naar breuk, procent van een getal, en hoeveel procent.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "procenten — Oefeningen Basisschool",
            description: "Oefen met procenten: breuk naar procent, procent naar breuk, procent van een getal, en hoeveel procent.",
            og_path: INFO.path.into(),
            favicon_emoji: "💯",
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

fn difficulty_radio(value: &'static str, text: &'static str, checked: Checked) -> impl IntoHtml {
    label!(
        input!(
            r#type = "radio",
            name = "difficulty",
            value = value,
            checked? = checked.attr(),
        ),
        " ",
        text,
    )
}

fn config_fields() -> impl IntoHtml {
    (
        fieldset!(
            legend!("Moeilijkheidsgraad"),
            div!(
                class = "kinds",
                difficulty_radio("makkelijk", "makkelijk (10%, 20%, 25%, 50%)", Checked::Yes),
                difficulty_radio(
                    "gemiddeld",
                    "gemiddeld (ook 30%, 60%, 75%, 90%…)",
                    Checked::No
                ),
                difficulty_radio("moeilijk", "moeilijk (ook 5%, 15%, 35%…)", Checked::No),
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
                practice_checkbox("breuk-naar-procent", "breuk → procent 📊", Checked::Yes),
                practice_checkbox("procent-naar-breuk", "procent → breuk 🔣", Checked::Yes),
                practice_checkbox(
                    "procent-van-getal",
                    "procent van een getal 🔢",
                    Checked::Yes
                ),
                practice_checkbox("wat-procent", "hoeveel procent?", Checked::No),
            ),
        ),
        fieldset!(
            legend!("Extra opties"),
            // Cap on the "whole" used by procent-van-getal and hoeveel
            // procent. Leave blank to let the difficulty level pick a
            // sensible default (50 / 100 / 100).
            div!(
                class = "field",
                label!(
                    r#for = "max-whole",
                    "Grootste getal (laat leeg voor automatisch)",
                ),
                input!(
                    inputmode = "numeric",
                    pattern = "[0-9]*",
                    id = "max-whole",
                    name = "max-whole",
                    min = "10",
                    max = "1000",
                    placeholder = "automatisch",
                ),
            ),
            // The simplify-form checkbox is only relevant for the
            // procent-naar-breuk kind; its visibility is toggled by JS.
            div!(
                id = "simplified-section",
                label!(
                    input!(
                        r#type = "checkbox",
                        id = "require-simplified",
                        name = "require-simplified",
                    ),
                    " geef breuk altijd in vereenvoudigde vorm",
                ),
            ),
        ),
        time_mode_fieldset(),
    )
}
