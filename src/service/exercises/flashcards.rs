// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::borrow::Cow;

use rama::http::Request;
use rama::http::html::{div, input};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, exercise_scaffold, time_mode_fieldset};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

pub const INFO: ExerciseInfo = ExerciseInfo {
    id: "flashcards",
    path: "/extra/flashcards",
    label: "flitskaarten",
    icon: "🃏",
    code_label: "🃏",
    level: 10,
};

const STYLE: &str = include_str!("flashcards.css");
const SCRIPT: &str = include_str!("flashcards.js");

pub async fn handler(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let is_import = req
        .uri()
        .query()
        .is_some_and(|q| q.split('&').any(|p| p.starts_with("import=")));

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
        let path_and_query = req
            .uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/extra/flashcards");
        Cow::Owned(path_and_query.to_owned())
    } else {
        Cow::Borrowed("/extra/flashcards")
    };

    let body = (
        page_header("flitskaarten"),
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
        STYLE,
        body,
        SCRIPT,
        banner,
    )
}

fn config_fields() -> impl rama::http::html::IntoHtml {
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
