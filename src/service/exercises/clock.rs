use rama::http::html::{div, fieldset, input, label, legend};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold};
use crate::service::layout::{PageMeta, page, page_header};

const INFO: ExerciseInfo = ExerciseInfo {
    id: "clock",
    path: "/2/clock",
    label: "analoge klok",
    icon: "🕐",
    code_label: "🕐",
    level: 2,
};

const STYLE: &str = include_str!("clock.css");
const SCRIPT: &str = include_str!("clock.js");


pub async fn handler() -> impl IntoResponse {
    let body = (
        page_header("analoge klok 🕐"),
        exercise_scaffold(
            INFO,
            "Leer de analoge klok lezen en zetten. Kies de oefen-type en de moeilijkheidsgraad.",
            config_fields(),
        ),
    );

    page(
        PageMeta {
            title: "analoge klok — Oefeningen Basisschool",
            description: "Oefen het lezen en zetten van een analoge klok.",
            og_path: "/2/clock",
            favicon_emoji: "🕐",
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
            legend!("Hoe nauwkeurig?"),
            label!(
                input!(r#type = "radio", name = "granularity", value = "hour", checked? = true),
                " volle uren (12:00)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "half"),
                " half uur (12:30)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "quarter"),
                " kwartier (12:15, 12:30, 12:45)",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "five"),
                " vijf minuten",
            ),
            label!(
                input!(r#type = "radio", name = "granularity", value = "one"),
                " elke minuut (moeilijk)",
            ),
        ),
        fieldset!(
            legend!("Welke oefeningen?"),
            label!(
                input!(r#type = "checkbox", name = "ck", value = "lees", checked? = true),
                " lees de klok 🕐",
            ),
            label!(
                input!(r#type = "checkbox", name = "ck", value = "zet", checked? = true),
                " zet de klok vanuit een digitale tijd ⏰",
            ),
            label!(
                input!(r#type = "checkbox", name = "ck", value = "zet-woorden"),
                " zet de klok vanuit woorden (\"kwart voor vier\") 💬",
            ),
        ),
        fieldset!(
            legend!("Hoe antwoord je bij \"lees de klok\"?"),
            label!(
                input!(r#type = "radio", name = "answer", value = "multiple", checked? = true),
                " kies uit meerdere antwoorden",
            ),
            label!(
                input!(r#type = "radio", name = "answer", value = "fill"),
                " typ de tijd zelf in",
            ),
        ),
    )
}
