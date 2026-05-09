// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::html::{IntoHtml, button, div, fieldset, form, input, label, legend, p, section};

pub mod clock;
pub mod digital_clock;
pub mod flashcards;
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
        flashcards::INFO,
    ]
}

pub fn niveau_label(level: u8) -> &'static str {
    match level {
        1 => "Niveau 1️⃣",
        2 => "Niveau 2️⃣",
        3 => "Niveau 3️⃣",
        10 => "Extra ✨",
        _ => "Niveau",
    }
}

/// Shared "time mode" fieldset. When enabled, the framework shows a session
/// timer during play and per-question elapsed time on the finish page; an
/// optional per-question deadline can also be set. The framework picks
/// these up automatically by ID — exercises just need to render the
/// fieldset somewhere in their setup form.
pub fn time_mode_fieldset() -> impl IntoHtml {
    fieldset!(
        legend!("Tijdsmodus ⏱️"),
        label!(
            input!(r#type = "checkbox", id = "time-mode", name = "time-mode",),
            " toon een timer en hoe lang elke oefening duurde",
        ),
        div!(
            id = "deadline-section",
            hidden? = true,
            label!(
                input!(
                    r#type = "checkbox",
                    id = "deadline-on",
                    name = "deadline-on",
                ),
                " ⏰ ook een maximumtijd per oefening",
            ),
            div!(
                id = "deadline-field",
                class = "field",
                hidden? = true,
                label!(r#for = "deadline-seconds", "Hoeveel seconden per oefening?",),
                input!(
                    inputmode = "numeric",
                    pattern = "[0-9]+",
                    id = "deadline-seconds",
                    name = "deadline-seconds",
                    min = "1",
                    max = "600",
                    value = "10",
                ),
            ),
        ),
    )
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
    setup_extra: impl IntoHtml,
) -> impl IntoHtml {
    (
        section!(
            id = "page-setup",
            p!(class = "page-intro", intro),
            form!(
                id = "form-setup",
                config_fields,
                p!(id = "config-error", class = "notice", hidden? = true),
                div!(
                    class = "button-row",
                    button!(r#type = "submit", class = "primary", "🟢 start met oefenen"),
                ),
            ),
            setup_extra,
            history_block(info),
        ),
        section!(
            id = "page-exercises",
            hidden? = true,
            div!(
                class = "exercise-meta",
                button!(
                    r#type = "button",
                    class = "button-reset",
                    "terug naar menu ↩️"
                ),
                p!(id = "exercise-title"),
                // Filled in by homework.js when the session uses time mode.
                p!(
                    id = "exercise-clock",
                    class = "exercise-clock",
                    hidden? = true
                ),
            ),
            div!(
                id = "exercise",
                class = "box",
                p!(
                    id = "exercise-feedback",
                    role = "status",
                    "aria-live" = "polite",
                    " "
                ),
                form!(
                    id = "form-exercise",
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
                class = "exercise-meta",
                button!(
                    r#type = "button",
                    class = "button-reset",
                    "terug naar menu ↩️"
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
