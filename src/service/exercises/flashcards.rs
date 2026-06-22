// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::borrow::Cow;

use rama::http::Request;
use rama::http::protocols::html::{div, input};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{
    ExerciseInfo, exercise_breadcrumb, exercise_scaffold, time_mode_fieldset,
};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "flashcards",
    path: "/extra/flashcards",
    label: "flitskaarten",
    icon: "🃏",
    code_label: "🃏",
    level: 10,
};

crate::inline_style!(STYLE, "flashcards.css", EXERCISES_FLASHCARDS_CSS_HASH_B64);
crate::inline_module_script!(SCRIPT, "flashcards.js", EXERCISES_FLASHCARDS_JS_HASH_B64);
crate::inline_ld_json!(
    LD_JSON,
    "flashcards.jsonld",
    EXERCISES_FLASHCARDS_JSONLD_HASH_B64
);

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    // rama's native `Uri` parses the query into key/value pairs (WHATWG /
    // form-urlencoded semantics), so we match the `import` key by name
    // rather than substring-scanning the raw query string.
    let is_import = req
        .uri()
        .query()
        .is_some_and(|q| q.pairs().any(|p| p.name_raw() == "import"));

    let (title, description) = if is_import {
        (
            "Importeer flitskaartjes deck — Oefeningen Basisschool",
            "Klik om een gedeeld flitskaartjes deck te importeren in jouw oefeningen app.",
        )
    } else {
        (
            "flitskaarten — Oefeningen Basisschool",
            "Maak je eigen flitskaartjes en oefen ze.",
        )
    };

    let og_path: Cow<'static, str> = if is_import {
        // Reconstruct the origin-form path+query from the native `Uri`
        // (`path_and_query()` is gone). `is_import` already guarantees a
        // non-empty query here; the empty-query arm keeps the original
        // `INFO.path` fallback defensively.
        let uri = req.uri();
        let query = uri.query_or_empty();
        if query.is_empty() {
            Cow::Borrowed(INFO.path)
        } else {
            Cow::Owned(format!("{}?{}", uri.path_or_root(), query))
        }
    } else {
        Cow::Borrowed(INFO.path)
    };

    let body = (
        exercise_breadcrumb(INFO),
        exercise_scaffold(
            INFO,
            "Maak je eigen kaartjes en oefen ze. Kies een deck hieronder of maak een nieuw deck aan.",
            config_fields(),
            (),
        ),
    );

    page(
        PageMeta {
            title,
            description,
            og_path,
            favicon_emoji: "🃏",
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

fn config_fields() -> impl rama::http::protocols::html::IntoHtml {
    (
        // Hidden input populated by JS when a deck is selected.
        input!(
            r#type = "hidden",
            id = "selected-deck-id",
            name = "selected-deck-id",
        ),
        // The deck management UI is rendered here entirely by flashcards.js.
        div!(id = "deck-manager"),
        time_mode_fieldset(),
    )
}
