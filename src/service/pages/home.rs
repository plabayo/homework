use rama::http::html::{IntoHtml, a, footer, h2, li, p, section, small, span, ul};
use rama::http::service::web::response::IntoResponse;

use crate::service::exercises::{ExerciseInfo, all_exercises, niveau_label};
use crate::service::layout::{PageMeta, page, page_header};

pub async fn home() -> impl IntoResponse {
    let body = page_body();

    page(
        PageMeta {
            title: "Oefeningen Basisschool",
            description: "Gratis huiswerk middel voor de basisschool.",
            og_path: "/".into(),
            favicon_emoji: "🏫",
        },
        "",
        body,
        "",
    )
}

fn page_body() -> impl IntoHtml {
    (
        page_header("Oefeningen Basisschool 🏫"),
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
        section!(
            class = "footer-block",
            h2!("Helpen of bijdragen 🤝"),
            p!(
                "Technisch onderlegd? We aanvaarden graag bijdragen aan ",
                a!(
                    class = "nowrap",
                    href = "https://github.com/plabayo/homework",
                    "github.com/plabayo/homework ⛰️",
                ),
                ". Feedback mag je sturen naar ",
                a!(
                    class = "nowrap",
                    href = "mailto:hello@plabayo.tech",
                    "hello@plabayo.tech ✉️",
                ),
                ".",
            ),
            p!(
                "Liever steunen? Trakteer ons op ",
                a!(
                    class = "nowrap",
                    href = "https://www.buymeacoffee.com/plabayo",
                    "een koffie ☕",
                ),
                " of word ",
                a!(
                    class = "nowrap",
                    href = "https://github.com/sponsors/plabayo",
                    "GitHub Sponsor 😻",
                ),
                ".",
            ),
        ),
    )
}

fn levels() -> impl IntoHtml {
    let mut levels: Vec<u8> = all_exercises().iter().map(|e| e.level).collect();
    levels.sort_unstable();
    levels.dedup();
    levels
        .into_iter()
        .map(|lvl| {
            let items: Vec<_> = all_exercises().iter().filter(|e| e.level == lvl).collect();
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
