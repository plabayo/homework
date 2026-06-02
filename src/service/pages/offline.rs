// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::headers::{HeaderMapExt, XRobotsTag, x_robots_tag::RobotsTag};
use rama::http::service::web::response::IntoResponse;
use rama::http::{
    Request, Response, StatusCode,
    html::{a, p},
};

use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

// Both the offline fallback and the 404 page render the shared chrome with
// the global `<meta name="robots" content="index, follow">`. Override it
// per-response via X-Robots-Tag so crawlers don't index these dead-ends
// (the more-restrictive directive wins when both are present). `follow`
// is the default — emitting bare `noindex` is semantically equivalent to
// the previous `noindex, follow`.
fn set_noindex(res: &mut Response) {
    res.headers_mut()
        .typed_insert(XRobotsTag::new(RobotsTag::new_no_index()));
}

pub async fn offline(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let mut res = page(
        PageMeta {
            title: "Offline — Oefeningen Basisschool",
            description: "Je bent offline.",
            og_path: "/offline".into(),
            favicon_emoji: "📴",
        },
        None,
        (
            page_header("offline"),
            p!(
                class = "box",
                "We konden de gevraagde pagina niet ophalen omdat je offline bent ",
                "of de server niet bereikbaar is.",
            ),
            p!(
                "Probeer het later nog eens, of ga terug naar ",
                a!(href = "/", "de thuispagina"),
                ". Eerder geopende oefeningen zijn meestal nog te gebruiken.",
            ),
        ),
        None,
        None,
        banner,
    )
    .into_response();
    set_noindex(&mut res);
    res
}

pub async fn not_found(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    let mut res = page(
        PageMeta {
            title: "Pagina Niet Gevonden — Oefeningen Basisschool",
            description: "Deze pagina bestaat niet.",
            og_path: "/404".into(),
            favicon_emoji: "🔎",
        },
        None,
        (
            page_header("pagina niet gevonden"),
            p!(
                class = "box",
                "De gevraagde pagina bestaat niet of is verplaatst.",
            ),
            p!(
                "Ga terug naar ",
                a!(href = "/", "de thuispagina"),
                " om een oefening te kiezen.",
            ),
        ),
        None,
        None,
        banner,
    )
    .into_response();
    *res.status_mut() = StatusCode::NOT_FOUND;
    set_noindex(&mut res);
    res
}
