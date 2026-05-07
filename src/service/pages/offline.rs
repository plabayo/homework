use rama::http::html::{a, p};
use rama::http::service::web::response::IntoResponse;

use crate::service::layout::{PageMeta, page, page_header};

pub async fn offline() -> impl IntoResponse {
    page(
        PageMeta {
            title: "Offline — Oefeningen Basisschool",
            description: "Je bent offline.",
            og_path: "/offline".into(),
            favicon_emoji: "📴",
            show_confetti: false,
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
    )
}
