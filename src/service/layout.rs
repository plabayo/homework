// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::borrow::Cow;

use rama::http::headers::{CacheControl, HeaderMapExt};
use rama::http::html::{
    IntoHtml, PreEscaped, a, body, button, canvas, div, h1, head, header, html, link, main, meta,
    noscript, p, script, span, title,
};
use rama::http::service::web::response::IntoResponse;

use crate::utils::info::ASSET_VERSION;

#[derive(Debug, Clone)]
pub struct PageMeta {
    pub title: &'static str,
    pub description: &'static str,
    /// Path (and optional query string) used to build the canonical og:url.
    /// Most pages use a `&'static str` path; share links include a query string
    /// and pass an owned `String` via `Cow::Owned`.
    pub og_path: Cow<'static, str>,
    pub favicon_emoji: &'static str,
}

impl Default for PageMeta {
    fn default() -> Self {
        Self {
            title: "Oefeningen Basisschool",
            description: "Gratis huiswerk middel voor de basisschool.",
            og_path: Cow::Borrowed("/"),
            favicon_emoji: "🏫",
        }
    }
}

fn versioned_asset_url(path: &str) -> String {
    format!("{path}?v={ASSET_VERSION}")
}

fn shared_js_import_map(shared_js_url: &str) -> String {
    format!(r#"{{"imports":{{"@homework":"{shared_js_url}"}}}}"#)
}

/// Group the iOS / Android home-screen meta tags into one IntoHtml value
/// so the parent `head!` stays under the IntoHtml tuple-impl arity (36).
/// iOS does not accept SVG home-screen icons, so a real 180×180 PNG is
/// linked. `mobile-web-app-capable` covers Android/Chrome; the legacy
/// `apple-` prefixed one is still required for iOS Safari.
fn apple_pwa_metas(apple_touch_icon_url: &str) -> impl IntoHtml {
    (
        link!(rel = "apple-touch-icon", href = apple_touch_icon_url),
        meta!(name = "apple-mobile-web-app-capable", content = "yes"),
        meta!(name = "mobile-web-app-capable", content = "yes"),
        meta!(
            name = "apple-mobile-web-app-status-bar-style",
            content = "default"
        ),
        meta!(name = "apple-mobile-web-app-title", content = "Oefeningen"),
    )
}

/// Open Graph metadata block used for link previews when the URL is shared
/// in messaging apps and social networks. Grouped for the same reason as
/// `apple_pwa_metas`. Takes ownership of `og_url` because the html macros
/// move per-page strings into the rendered output.
fn open_graph_metas(meta_data: &PageMeta, og_url: String) -> impl IntoHtml {
    (
        meta!("property" = "og:title", content = meta_data.title),
        meta!("property" = "og:locale", content = "nl_BE"),
        meta!("property" = "og:type", content = "website"),
        meta!(
            "property" = "og:description",
            content = meta_data.description
        ),
        meta!(
            "property" = "og:site_name",
            content = "Oefeningen Basisschool"
        ),
        meta!("property" = "og:url", content = og_url),
        meta!(
            "property" = "og:image",
            content = "https://elementary.training/img/social_preview.jpeg",
        ),
    )
}

/// Build a complete HTML page with the shared chrome.
///
/// `extra_style` and `extra_module_script` are raw CSS / JS source strings —
/// they go into `<style>` / `<script type="module">` verbatim (not HTML-escaped).
/// `banner` is composed into the page body at the top; pass `()` (the unit
/// type, which `IntoHtml` treats as empty) when no banner is needed.
// HTML responses must always revalidate. The HTML embeds versioned asset
// URLs (`?v=<git-sha>`); if a browser holds on to an old HTML response via
// heuristic freshness it will keep loading the old assets too. Firefox is
// noticeably more aggressive about this than Safari, which made stale CSS
// look like a "Firefox-only" bug.
fn html_cache_control() -> CacheControl {
    CacheControl::new().with_no_cache()
}

pub fn page(
    meta_data: PageMeta,
    extra_style: &str,
    body_content: impl IntoHtml,
    extra_module_script: &str,
    banner: impl IntoHtml,
) -> impl IntoResponse {
    let favicon_data = format!(
        "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%2210 0 100 100%22><text y=%22.90em%22 font-size=%2290%22>{}</text></svg>",
        meta_data.favicon_emoji,
    );
    let og_url = format!("https://elementary.training{}", meta_data.og_path);
    let theme_css_url = versioned_asset_url("/theme.css");
    let manifest_url = versioned_asset_url("/manifest.webmanifest");
    let apple_touch_icon_url = versioned_asset_url("/apple-touch-icon.png");
    let shared_js_url = versioned_asset_url("/homework.js");
    let shared_js_import_map = shared_js_import_map(&shared_js_url);
    let markup = html!(
        lang = "nl-BE",
        "data-asset-version" = ASSET_VERSION,
        head!(
            PreEscaped(
                "<!-- Copyright (C) 2024-2026 Plabayo. License: https://github.com/plabayo/homework/blob/main/LICENSE Source-available; non-commercial use only. -->"
            ),
            meta!(charset = "UTF-8"),
            meta!(
                name = "viewport",
                content = "width=device-width, initial-scale=1.0"
            ),
            meta!(name = "color-scheme", content = "light dark"),
            // Tints the browser chrome on Android, iOS PWA, and Safari's
            // tab bar. Two variants so dark-mode users don't get the light
            // brand blue on a dark page. The dark value matches `--bg` in
            // theme.css; the light value is the primary accent.
            meta!(
                name = "theme-color",
                content = "#2d6cdf",
                media = "(prefers-color-scheme: light)"
            ),
            meta!(
                name = "theme-color",
                content = "#14171c",
                media = "(prefers-color-scheme: dark)"
            ),
            // Default indexing policy. Routes that should not be indexed
            // (404, /offline) override this via X-Robots-Tag on the
            // response; the more-restrictive directive wins.
            meta!(name = "robots", content = "index, follow"),
            meta!(name = "description", content = meta_data.description),
            title!(meta_data.title),
            link!(rel = "canonical", href = og_url.clone()),
            link!(rel = "icon", href = favicon_data),
            apple_pwa_metas(&apple_touch_icon_url),
            link!(rel = "stylesheet", href = theme_css_url),
            link!(rel = "manifest", href = manifest_url),
            open_graph_metas(&meta_data, og_url),
            PreEscaped(if extra_style.is_empty() {
                String::new()
            } else {
                format!("<style>{extra_style}</style>")
            }),
            // Apply stored theme override before first paint to avoid flash.
            PreEscaped(
                r#"<script>(function(){var t=localStorage.getItem('homework:theme');if(t)document.documentElement.style.colorScheme=t;})()</script>"#
            ),
        ),
        body!(
            canvas!(id = "confetti", "aria-hidden" = "true"),
            // Skip-link as the very first focusable element so keyboard
            // users can bypass the header (home link, page title, theme
            // toggle, language banner, offline banner) and land directly
            // on the main content. The link itself is visually hidden
            // until focused — see `.skip-link` in theme.css.
            a!(
                class = "skip-link",
                href = "#main-content",
                "spring naar inhoud"
            ),
            div!(
                class = "page",
                banner,
                div!(
                    class = "offline-banner",
                    "📴 Offline modus — je gebruikt een opgeslagen versie.",
                ),
                main!(id = "main-content", body_content),
            ),
            noscript!(p!(
                class = "box bad",
                "Deze website heeft JavaScript nodig om de oefeningen te doen.",
            )),
            script!(r#type = "importmap", PreEscaped(shared_js_import_map)),
            script!(r#type = "module", src = shared_js_url),
            PreEscaped(if extra_module_script.is_empty() {
                String::new()
            } else {
                format!(r#"<script type="module">{extra_module_script}</script>"#)
            }),
        ),
    );
    let mut res = markup.into_response();
    res.headers_mut().typed_insert(html_cache_control());
    res
}

/// Standard page header with a 🏠 home link, centered title, and theme toggle.
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
        button!(
            class = "theme-toggle",
            id = "theme-toggle",
            r#type = "button",
            "aria-label" = "Licht thema — klik voor donker",
            span!(id = "theme-toggle-icon", "aria-hidden" = "true", "☀️"),
        ),
    )
}
