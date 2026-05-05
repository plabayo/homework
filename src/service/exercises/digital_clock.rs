use rama::http::html::{div, fieldset, input, label, legend, p};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold};
use crate::service::layout::{PageMeta, page, page_header};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "digital-clock",
    path: "/2/digital-clock",
    label: "digitale klok",
    icon: "⏰",
    code_label: "⏰",
    level: 2,
};

const STYLE: &str = include_str!("digital_clock.css");
const SCRIPT: &str = include_str!("digital_clock.js");

pub async fn handler() -> impl IntoResponse {
    let body = (
        page_header("digitale klok ⏰"),
        exercise_scaffold(
            INFO,
            "Oefen de Nederlandse uitdrukkingen voor tijd: \"kwart over\", \"half\", \"kwart voor\", en het volle uur — vertaal tussen digitale tijd en woorden.",
            config_fields(),
        ),
    );

    page(
        PageMeta {
            title: "digitale klok — Oefeningen Basisschool",
            description: "Oefen Nederlandse tijduitdrukkingen: kwart over, half, kwart voor.",
            og_path: "/2/digital-clock",
            favicon_emoji: "⏰",
            show_confetti: true,
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
                max = "60",
                value = "10",
                required? = true,
            ),
        ),
        fieldset!(
            legend!("Welke tijden oefen je?"),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "kind",
                    value = "uur",
                    checked? = true
                ),
                " volle uren (5 uur)",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "kind",
                    value = "half",
                    checked? = true
                ),
                " halve uren (half 6)",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "kind",
                    value = "kwart",
                    checked? = true
                ),
                " kwartieren (kwart over / kwart voor)",
            ),
        ),
        fieldset!(
            legend!("Wat oefen je?"),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "dir",
                    value = "digital-to-words",
                    checked? = true
                ),
                " digitale tijd → in woorden",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "dir",
                    value = "words-to-digital",
                    checked? = true
                ),
                " in woorden → digitale tijd",
            ),
        ),
        fieldset!(
            legend!("Bij \"in woorden → digitale tijd\""),
            label!(
                input!(
                    r#type = "radio",
                    name = "answer",
                    value = "multiple",
                    checked? = true
                ),
                " kies uit meerdere antwoorden",
            ),
            label!(
                input!(r#type = "radio", name = "answer", value = "fill"),
                " typ de tijd zelf in op de klok",
            ),
            p!(
                class = "field-hint",
                "Bij \"digitale tijd → in woorden\" wordt altijd uit meerdere keuzes geantwoord — typen ",
                "van zinnen zoals \"half drie\" zou anders te vaak een typo geven.",
            ),
        ),
    )
}
