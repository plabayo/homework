use rama::http::service::web::response::IntoResponse;
use rama::http::{
    Request, StatusCode,
    html::{a, p},
};

use crate::service::language_banner::lang_banner;
use crate::service::layout::{PageMeta, page, page_header};

pub async fn offline(req: Request) -> impl IntoResponse {
    let banner = lang_banner(req.headers());
    page(
        PageMeta {
            title: "Offline — Oefeningen Basisschool",
            description: "Je bent offline.",
            og_path: "/offline".into(),
            favicon_emoji: "📴",
        },
        "",
        (
            page_header("offline 📴"),
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
        "",
        banner,
    )
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
        "",
        (
            page_header("pagina niet gevonden 🔎"),
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
        "",
        banner,
    )
    .into_response();
    *res.status_mut() = StatusCode::NOT_FOUND;
    res
}
