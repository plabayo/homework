use rama::http::html::{IntoHtml, button, div, form, h3, p, section};

pub mod clock;
pub mod digital_clock;
pub mod mathbox;
pub mod multiplications;
pub mod thermometer;

#[derive(Debug, Clone, Copy)]
pub struct ExerciseInfo {
    pub id: &'static str,
    pub path: &'static str,
    pub label: &'static str,
    pub icon: &'static str,
    pub code_label: &'static str,
    pub level: u8,
}

pub fn all_exercises() -> &'static [ExerciseInfo] {
    &[
        ExerciseInfo {
            id: "mathbox",
            path: "/1/mathbox",
            label: "rekendoos",
            icon: "🔢",
            code_label: "➕➖✖️➗🟰",
            level: 1,
        },
        ExerciseInfo {
            id: "multiplications",
            path: "/1/multiplications",
            label: "maaltafels",
            icon: "✖️",
            code_label: "✖️",
            level: 1,
        },
        ExerciseInfo {
            id: "thermometer",
            path: "/1/thermometer",
            label: "thermometer",
            icon: "🌡️",
            code_label: "🌡️",
            level: 1,
        },
        ExerciseInfo {
            id: "clock",
            path: "/2/clock",
            label: "analoge klok",
            icon: "🕐",
            code_label: "🕐",
            level: 2,
        },
        ExerciseInfo {
            id: "digital-clock",
            path: "/2/digital-clock",
            label: "digitale klok",
            icon: "⏰",
            code_label: "⏰",
            level: 2,
        },
    ]
}

pub fn niveau_label(level: u8) -> &'static str {
    match level {
        1 => "Niveau 1️⃣",
        2 => "Niveau 2️⃣",
        3 => "Niveau 3️⃣",
        _ => "Niveau",
    }
}

/// Render the shared exercise scaffold:
///   - configure section with the given form fields
///   - empty play section (filled in by `homework.js`)
///   - empty result section (filled in by `homework.js`)
///   - history block for parents (also filled in by JS)
pub fn exercise_scaffold(
    info: ExerciseInfo,
    intro: impl IntoHtml,
    config_fields: impl IntoHtml,
) -> impl IntoHtml {
    (
        section!(
            id = "page-setup",
            p!(class = "page-intro", intro),
            form!(
                id = "form-setup",
                action = "javascript:void(0)",
                config_fields,
                p!(id = "config-error", class = "notice", hidden? = true),
                div!(
                    class = "button-row",
                    button!(r#type = "submit", class = "primary", "🟢 start met oefenen"),
                ),
            ),
            history_block(info),
        ),
        section!(
            id = "page-exercises",
            hidden? = true,
            div!(
                class = "button-row",
                button!(
                    r#type = "button",
                    class = "button-reset",
                    "begin opnieuw ↩️"
                ),
            ),
            p!(id = "exercise-title"),
            div!(
                id = "exercise",
                class = "box",
                h3!(id = "exercise-feedback", " "),
                form!(
                    id = "form-exercise",
                    action = "javascript:void(0)",
                    div!(id = "exercise-content"),
                    div!(
                        class = "exercise-actions",
                        button!(
                            r#type = "submit",
                            id = "button-check",
                            class = "primary",
                            "👉 antwoord",
                        ),
                        button!(
                            r#type = "reset",
                            id = "button-skip",
                            hidden? = true,
                            "🤷 weet het niet",
                        ),
                    ),
                ),
            ),
        ),
        section!(
            id = "page-result",
            hidden? = true,
            div!(
                class = "button-row",
                button!(
                    r#type = "button",
                    class = "button-reset",
                    "begin opnieuw ↩️"
                ),
            ),
            div!(id = "result"),
        ),
    )
}

fn history_block(info: ExerciseInfo) -> impl IntoHtml {
    section!(
        id = "history",
        class = "history",
        "data-exercise-id" = info.id,
        div!(
            class = "history-content",
            p!(
                class = "history-intro",
                "Hieronder staan de laatste oefensessies voor ",
                info.label,
                ". Open een sessie om te zien welke vragen moeilijk waren.",
            ),
            div!(
                class = "button-row",
                button!(
                    r#type = "button",
                    "data-action" = "practice-mistakes",
                    disabled? = true,
                    "🔁 oefen recente fouten",
                ),
                button!(
                    r#type = "button",
                    "data-action" = "clear-history",
                    disabled? = true,
                    "🗑️ geschiedenis wissen",
                ),
            ),
        ),
    )
}
