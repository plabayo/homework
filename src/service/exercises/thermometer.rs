use rama::http::html::{div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold};
use crate::service::layout::{PageMeta, page, page_header};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "thermometer",
    path: "/1/thermometer",
    label: "thermometer",
    icon: "🌡️",
    code_label: "🌡️",
    level: 1,
};

const STYLE: &str = include_str!("thermometer.css");
const SCRIPT: &str = include_str!("thermometer.js");

pub async fn handler() -> impl IntoResponse {
    let body = (
        page_header("thermometer 🌡️"),
        exercise_scaffold(
            INFO,
            "Leer werken met een analoge thermometer: kleur of lees de temperatuur. Optioneel ook met negatieve temperaturen.",
            config_fields(),
        ),
    );

    page(
        PageMeta {
            title: "thermometer — Oefeningen Basisschool",
            description: "Oefen het lezen en kleuren van een analoge thermometer.",
            og_path: "/1/thermometer".into(),
            favicon_emoji: "🌡️",
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
            label!(r#for = "vmax", "Bovengrens (hoogste temperatuur)"),
            input!(
                inputmode = "numeric",
                pattern = "[0-9]+",
                id = "vmax",
                name = "vmax",
                min = "3",
                max = "100",
                value = "20",
                required? = true,
            ),
        ),
        fieldset!(
            legend!("Negatieve temperaturen"),
            label!(
                input!(
                    r#type = "checkbox",
                    id = "allow-negative",
                    name = "allow-negative"
                ),
                " ook onder 0 °C oefenen ❄️",
            ),
            div!(
                id = "vmin-neg-field",
                class = "field",
                hidden? = true,
                label!(
                    r#for = "vmin-neg",
                    "Hoe diep onder 0 mag de thermometer gaan?"
                ),
                input!(
                    inputmode = "numeric",
                    pattern = "[0-9]+",
                    id = "vmin-neg",
                    name = "vmin-neg",
                    min = "1",
                    max = "50",
                    value = "10",
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
        fieldset!(
            legend!("Welke types?"),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "tk",
                    value = "teken",
                    checked? = true
                ),
                " kleur de thermometer 🎨",
            ),
            label!(
                input!(
                    r#type = "checkbox",
                    name = "tk",
                    value = "schrijf",
                    checked? = true
                ),
                " lees de temperatuur ✏️",
            ),
        ),
    )
}
