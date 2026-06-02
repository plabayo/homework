// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::Request;
use rama::http::html::{IntoHtml, a, footer, h2, li, p, section, small, span, ul};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{EXERCISE_LEVELS, ExerciseInfo, all_exercises, niveau_label};
use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageInlines, PageMeta, page, page_header};

// Prefetch every exercise route from the home page. Bodies stay in the
// browser's per-document in-memory cache, so when the kid taps through
// to an exercise the HTML is already there. `eagerness: moderate` waits
// for hover / pointerdown — kid-friendly latency without burning data on
// just-scanning-the-page visits.
crate::inline_speculation_rules!(SPECULATION, "home_speculation.json");

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
        PageInlines {
            speculation_rules: Some(&SPECULATION),
            ..Default::default()
        },
        body,
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
            " · ",
            a!(href = "/privacy", "Privacy"),
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
                // `id="niveau-N"` is the anchor target for the matching
                // exercise-page breadcrumbs (and the BreadcrumbList JSON-LD
                // `item` URL); changing this format means updating every
                // exercises/*.jsonld breadcrumb URL.
                let anchor = format!("niveau-{lvl}");
                (
                    h2!(id = anchor, niveau_label(lvl)),
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
