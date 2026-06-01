// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{IntoHtml, a, footer, h2, li, p, section, small, span, ul};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{EXERCISE_LEVELS, ExerciseInfo, all_exercises, niveau_label};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

pub async fn home(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let body = page_body();

    page(
        PageMeta {
            title: "Oefeningen Basisschool",
            description: "Gratis huiswerk middel voor de basisschool.",
            og_path: "/".into(),
            favicon_emoji: "🏫",
        },
        None,
        body,
        None,
        banner,
    )
}

fn page_body() -> impl IntoHtml {
    (
        page_header("Oefeningen Basisschool"),
        section!(
            class = "page-intro",
            p!("Kies een oefening en ga meteen aan de slag.",),
        ),
        levels(),
        site_footer(),
    )
}

fn site_footer() -> impl IntoHtml {
    footer!(
        class = "site-footer",
        p!(small!(
            "© 2024–2026 ",
            a!(href = "https://plabayo.tech", "Plabayo"),
            " · door ouders, voor ouders · ",
            a!(href = "/about", "Over ons"),
        )),
    )
}

fn levels() -> impl IntoHtml {
    let exercises = all_exercises();
    EXERCISE_LEVELS
        .iter()
        .filter_map(|&lvl| {
            let items: Vec<_> = exercises.iter().filter(|e| e.level == lvl).collect();
            (!items.is_empty()).then(|| {
                (
                    h2!(niveau_label(lvl)),
                    ul!(
                        class = "exercise-list",
                        items
                            .iter()
                            .map(|e| li!(exercise_link(e)))
                            .collect::<Vec<_>>(),
                    ),
                )
            })
        })
        .collect::<Vec<_>>()
}

fn exercise_link(info: &ExerciseInfo) -> impl IntoHtml {
    a!(
        href = info.path,
        "data-exercise-id" = info.id,
        span!(class = "icon", "aria-hidden" = "true", info.icon),
        span!(
            class = "exercise-meta",
            span!(class = "exercise-label", info.label),
            small!(class = "exercise-stats", "data-stats-for" = info.id, " "),
        ),
    )
}
