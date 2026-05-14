// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{IntoHtml, div, fieldset, input, label, legend, span};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold, time_mode_fieldset};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "fractions",
    path: "/2/fractions",
    label: "breukendoos",
    icon: "🔣",
    code_label: "➕➖✖️➗",
    level: 2,
};

const STYLE: &str = include_str!("fractions.css");
const SCRIPT: &str = include_str!("fractions.js");

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = (
        page_header("breukendoos 🔣"),
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
            og_path: "/2/fractions".into(),
            favicon_emoji: "🔣",
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

fn den_chip(value: &'static str, default_on: bool) -> impl IntoHtml {
    let checked: Option<&'static str> = if default_on { Some("") } else { None };
    label!(
        class = "den-chip",
        input!(
            r#type = "checkbox",
            name = "denominators",
            value = value,
            checked? = checked,
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
                den_chip("2", true),
                den_chip("3", true),
                den_chip("4", true),
                den_chip("5", false),
                den_chip("6", true),
                den_chip("7", false),
                den_chip("8", false),
                den_chip("9", false),
                den_chip("10", false),
                den_chip("11", false),
                den_chip("12", false),
                span!(class = "den-chip-sep"),
                den_chip("15", false),
                den_chip("20", false),
                den_chip("25", false),
                den_chip("50", false),
                den_chip("100", false),
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
                kind_checkbox("breuk-van-getal", "breuk van getal", true),
                kind_checkbox("optellen", "optellen ➕", true),
                kind_checkbox("aftrekken", "aftrekken ➖", true),
                kind_checkbox("vermenigvuldigen", "vermenigvuldigen ✖️", false),
                kind_checkbox("delen", "delen ➗", false),
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
