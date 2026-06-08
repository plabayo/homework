// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::protocols::html::{IntoHtml, div, fieldset, input, label, legend, span};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    Checked, ExerciseInfo, exercise_breadcrumb, exercise_scaffold, practice_checkbox,
    time_mode_fieldset,
};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "fractions",
    path: "/2/fractions",
    label: "breukendoos",
    icon: "🔣",
    code_label: "➕➖✖️➗",
    level: 2,
};

crate::inline_style!(STYLE, "fractions.css", EXERCISES_FRACTIONS_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "fractions.js", EXERCISES_FRACTIONS_JS_HASH_B64);
crate::inline_ld_json!(
    LD_JSON,
    "fractions.jsonld",
    EXERCISES_FRACTIONS_JSONLD_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Oefen met breuken: een breuk van een getal nemen, optellen, aftrekken, vermenigvuldigen en delen.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title: "breukendoos — Oefeningen Basisschool",
            description: "Oefen met breuken: van een getal nemen, optellen, aftrekken, vermenigvuldigen en delen.",
            og_path: INFO.path.into(),
            favicon_emoji: "🔣",
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

fn den_chip(value: &'static str, checked: Checked) -> impl IntoHtml {
    label!(
        class = "den-chip",
        input!(
            r#type = "checkbox",
            name = "denominators",
            value = value,
            checked? = checked.attr(),
        ),
        value,
    )
}

fn config_fields() -> impl IntoHtml {
    (
        fieldset!(
            legend!("Noemers"),
            div!(
                class = "denominator-chips",
                den_chip("2", Checked::Yes),
                den_chip("3", Checked::Yes),
                den_chip("4", Checked::Yes),
                den_chip("5", Checked::No),
                den_chip("6", Checked::Yes),
                den_chip("7", Checked::No),
                den_chip("8", Checked::No),
                den_chip("9", Checked::No),
                den_chip("10", Checked::No),
                den_chip("11", Checked::No),
                den_chip("12", Checked::No),
                span!(class = "den-chip-sep"),
                den_chip("15", Checked::No),
                den_chip("20", Checked::No),
                den_chip("25", Checked::No),
                den_chip("50", Checked::No),
                den_chip("100", Checked::No),
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
                practice_checkbox("breuk-van-getal", "breuk van getal", Checked::Yes),
                practice_checkbox("optellen", "optellen ➕", Checked::Yes),
                practice_checkbox("aftrekken", "aftrekken ➖", Checked::Yes),
                practice_checkbox("vermenigvuldigen", "vermenigvuldigen ✖️", Checked::No),
                practice_checkbox("delen", "delen ➗", Checked::No),
            ),
        ),
        fieldset!(
            id = "extra-opties",
            legend!("Extra opties"),
            label!(
                input!(
                    r#type = "checkbox",
                    id = "mixed-denominators",
                    name = "mixed-denominators",
                ),
                " ongelijke noemers bij optellen/aftrekken",
            ),
        ),
        time_mode_fieldset(),
    )
}
