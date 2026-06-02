// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::html::{
    IntoHtml, a, button, div, fieldset, form, input, label, legend, li, nav, ol, p, section, span,
};

pub mod clock;
pub mod digital_clock;
pub mod flashcards;
pub mod fractions;
pub mod mathbox;
pub mod multiplications;
pub mod percentages;
pub mod thermometer;

#[derive(Debug, Clone, Copy)]
pub struct ExerciseInfo {
    pub id: &'static str,
    pub path: &'static str,
    pub label: &'static str,
    pub icon: &'static str,
    /// Short emoji sequence used as a compact visual code for the exercise,
    /// e.g. displayed in share links or notifications. May equal `icon`.
    pub code_label: &'static str,
    pub level: u8,
}

/// All exercises in catalogue order.
///
/// NOTE: every entry here must also have a matching route in
/// `src/service/mod.rs::load_https_app_service()` and an entry in the
/// PRECACHE list in `src/service/assets/service-worker.js`.
static ALL_EXERCISES: &[ExerciseInfo] = &[
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
    fractions::INFO,
    percentages::INFO,
    flashcards::INFO,
];

pub fn all_exercises() -> &'static [ExerciseInfo] {
    ALL_EXERCISES
}

/// Level values in the order they are displayed on the home page.
///
/// NOTE: when a new level is added, add it here AND add a matching arm to
/// `niveau_label()` below.
pub const EXERCISE_LEVELS: &[u8] = &[1, 2, 10];

pub fn niveau_label(level: u8) -> &'static str {
    match level {
        1 => "Niveau 1️⃣",
        2 => "Niveau 2️⃣",
        3 => "Niveau 3️⃣",
        10 => "Extra ✨",
        _ => "Niveau",
    }
}

/// Plain-text breadcrumb label for the middle item ("Niveau 1" / "Niveau 2"
/// / "Extra"). Mirrors `niveau_label()` minus the trailing emoji digit, so
/// it can be paired with the per-exercise BreadcrumbList JSON-LD bodies
/// (which use the same plain wording).
pub fn breadcrumb_level_label(level: u8) -> &'static str {
    match level {
        1 => "Niveau 1",
        2 => "Niveau 2",
        3 => "Niveau 3",
        10 => "Extra",
        _ => "Niveau",
    }
}

/// Visible breadcrumb shown on every exercise page, above the `<h1>`:
///
///   🏠 home › Niveau 2 › analoge klok
///
/// The middle item anchors back to the level section on the home page
/// (`/#niveau-2`); the leaf carries `aria-current="page"` so screen
/// readers announce it as the current location, not a link.
pub fn exercise_breadcrumb(info: ExerciseInfo) -> impl IntoHtml {
    let niveau_anchor = format!("/#niveau-{}", info.level);
    let niveau_label = breadcrumb_level_label(info.level);
    nav!(
        class = "breadcrumb",
        "aria-label" = "kruimelpad",
        ol!(
            li!(a!(
                href = "/",
                span!(class = "icon", "aria-hidden" = "true", "🏠 "),
                "home"
            )),
            li!(a!(href = niveau_anchor, niveau_label)),
            li!("aria-current" = "page", info.label),
        ),
    )
}

/// Shared "time mode" fieldset. When enabled, the framework shows a session
/// timer during play and per-question elapsed time on the finish page; an
/// optional per-question deadline can also be set. The framework picks
/// these up automatically by ID — exercises just need to render the
/// fieldset somewhere in their setup form.
pub fn time_mode_fieldset() -> impl IntoHtml {
    fieldset!(
        legend!("Tijdsmodus"),
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
                // Browser autofill dropdowns offering previously-typed values
                // are noise for a learning app — kids should think, not pick
                // from a history list.
                autocomplete = "off",
                config_fields,
                // role=alert + aria-live=assertive so the validation error
                // is announced as soon as setError() reveals it. Hidden
                // until populated; the framework toggles `hidden` via JS.
                p!(
                    id = "config-error",
                    class = "notice",
                    role = "alert",
                    "aria-live" = "assertive",
                    hidden? = true
                ),
                div!(
                    class = "button-row",
                    button!(
                        r#type = "submit",
                        class = "default-button primary btn-lift",
                        "🟢 start met oefenen"
                    ),
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
                    class = "default-button button-reset btn-lift",
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
                    autocomplete = "off",
                    div!(id = "exercise-content"),
                    div!(
                        class = "exercise-actions",
                        button!(
                            r#type = "submit",
                            id = "button-check",
                            class = "default-button primary btn-lift",
                            "👉 antwoord",
                        ),
                        button!(
                            r#type = "reset",
                            id = "button-skip",
                            class = "default-button btn-lift",
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
                    class = "default-button button-reset btn-lift",
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
                    class = "default-button btn-lift",
                    "data-action" = "practice-mistakes",
                    disabled? = true,
                    "🔁 oefen recente fouten",
                ),
                button!(
                    r#type = "button",
                    class = "default-button btn-lift",
                    "data-action" = "clear-history",
                    disabled? = true,
                    "🗑️ geschiedenis wissen",
                ),
            ),
        ),
    )
}
