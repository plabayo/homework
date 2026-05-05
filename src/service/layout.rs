use rama::http::html::{
    IntoHtml, PreEscaped, a, body, canvas, div, h1, head, header, html, link, main, meta,
    noscript, p, script, style, title,
};
use rama::http::service::web::response::IntoResponse;

#[derive(Debug, Clone, Copy)]
pub struct PageMeta {
    pub title: &'static str,
    pub description: &'static str,
    pub og_path: &'static str,
    pub favicon_emoji: &'static str,
    pub show_confetti: bool,
}

impl Default for PageMeta {
    fn default() -> Self {
        Self {
            title: "Oefeningen Basisschool",
            description: "Gratis huiswerk middel voor de basisschool.",
            og_path: "/",
            favicon_emoji: "🏫",
            show_confetti: false,
        }
    }
}

/// Build a complete HTML page with the shared chrome.
///
/// `extra_style` and `extra_module_script` are raw CSS / JS source strings —
/// they go into `<style>` / `<script type="module">` verbatim (not HTML-escaped).
pub fn page(
    meta_data: PageMeta,
    extra_style: &str,
    body_content: impl IntoHtml,
    extra_module_script: &str,
) -> impl IntoResponse {
    let favicon_data = format!(
        "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%2210 0 100 100%22><text y=%22.90em%22 font-size=%2290%22>{}</text></svg>",
        meta_data.favicon_emoji,
    );
    let og_url = format!("https://elementary.training{}", meta_data.og_path);

    html!(
        head!(
            meta!(charset = "UTF-8"),
            meta!(name = "viewport", content = "width=device-width, initial-scale=1.0"),
            meta!(name = "color-scheme", content = "light dark"),
            meta!(name = "theme-color", content = "#2d6cdf"),
            meta!(name = "description", content = meta_data.description),
            title!(meta_data.title),
            link!(rel = "icon", href = favicon_data),
            link!(rel = "stylesheet", href = "/theme.css"),
            link!(rel = "manifest", href = "/manifest.webmanifest"),
            meta!("property" = "og:title", content = meta_data.title),
            meta!("property" = "og:locale", content = "nl_BE"),
            meta!("property" = "og:type", content = "website"),
            meta!("property" = "og:description", content = meta_data.description),
            meta!("property" = "og:site_name", content = "Oefeningen Basisschool"),
            meta!("property" = "og:url", content = og_url),
            meta!(
                "property" = "og:image",
                content = "https://elementary.training/img/social_preview.jpeg",
            ),
            if extra_style.is_empty() {
                style!(PreEscaped(""))
            } else {
                style!(PreEscaped(extra_style))
            },
        ),
        body!(
            canvas!(id = "confetti"),
            div!(
                class = "page",
                div!(
                    class = "offline-banner",
                    "📴 Offline modus — je gebruikt een opgeslagen versie.",
                ),
                main!(body_content),
            ),
            noscript!(p!(
                class = "box bad",
                "Deze website heeft JavaScript nodig om de oefeningen te doen.",
            )),
            script!(r#type = "module", src = "/homework.js"),
            if extra_module_script.is_empty() {
                script!(r#type = "module", PreEscaped(""))
            } else {
                script!(r#type = "module", PreEscaped(extra_module_script))
            },
        ),
    )
}

/// Standard page header with a 🏠 home link and centered title.
pub fn page_header(title_text: impl IntoHtml) -> impl IntoHtml {
    header!(
        class = "page-header",
        a!(
            class = "home-link",
            href = "/",
            "aria-label" = "thuispagina",
            "🏠",
        ),
        h1!(title_text),
    )
}
