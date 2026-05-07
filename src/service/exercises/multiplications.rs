use rama::http::html::{div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold, time_mode_fieldset};
use crate::service::layout::{PageMeta, page, page_header};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "multiplications",
    path: "/1/multiplications",
    label: "maaltafels",
    icon: "✖️",
    code_label: "✖️",
    level: 1,
};

const STYLE: &str = include_str!("multiplications.css");
const SCRIPT: &str = include_str!("multiplications.js");

pub async fn handler() -> impl IntoResponse {
    let body = (
        page_header("maaltafels ✖️"),
        exercise_scaffold(
            INFO,
            "Oefen hier de maaltafels. Kies hoeveel oefeningen en welke tafels.",
            config_fields(),
        ),
    );

    page(
        PageMeta {
            title: "maaltafels — Oefeningen Basisschool",
            description: "Oefen de maaltafels van 1 tot en met 10.",
            og_path: "/1/multiplications".into(),
            favicon_emoji: "✖️",
        },
        STYLE,
        body,
        SCRIPT,
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
