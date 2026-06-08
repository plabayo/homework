// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::borrow::Cow;

use rama::http::headers::{
    CacheControl, ContentSecurityPolicy, HashAlgorithm, HeaderMapExt, SourceExpression, SourceList,
};
use rama::http::protocols::html::{
    IntoHtml, PreEscaped, a, body, button, canvas, div, h1, head, header, html, link, main, meta,
    noscript, p, script, span, title,
};
use rama::http::service::web::response::IntoResponse;
use rama::net::Protocol;

use crate::service::csp::{
    self, InlineLdJson, InlineModuleScript, InlineSpeculationRules, InlineStyle,
};
use crate::utils::info::ASSET_VERSION;

/// All the optional inline-asset slots a page can fill. Bundled into one
/// struct so adding a future inline type (e.g. a CSP report endpoint
/// script) doesn't widen `page()`'s positional argument list.
///
/// Call-site idiom:
/// ```ignore
/// page(meta, PageInlines { style: Some(&STYLE), module_script: Some(&SCRIPT), ..Default::default() }, body, banner)
/// ```
#[derive(Default)]
pub struct PageInlines {
    pub style: Option<&'static InlineStyle>,
    pub module_script: Option<&'static InlineModuleScript>,
    pub speculation_rules: Option<&'static InlineSpeculationRules>,
    /// Per-page JSON-LD (`LearningResource`, `BreadcrumbList`, …). Site-wide
    /// `WebSite` / `EducationalOrganization` data is emitted unconditionally
    /// from `csp::SITE_LD_JSON` and doesn't go here.
    pub ld_json: Option<&'static InlineLdJson>,
}

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

/// Link-preview metadata for the URL when shared in messaging apps and
/// social networks. Open Graph (Facebook / iMessage / WhatsApp / Discord
/// / Mastodon) plus Twitter Card (X). Same data on both — Twitter's parser
/// also reads OG, but `summary_large_image` requires the explicit
/// `twitter:card` declaration. Grouped for the same arity reason as
/// `apple_pwa_metas`; takes ownership of `og_url` because the html macros
/// move per-page strings into the rendered output.
const SOCIAL_PREVIEW_IMAGE: &str = "https://elementary.training/img/social_preview.jpeg";

fn share_preview_metas(meta_data: &PageMeta, og_url: String) -> impl IntoHtml {
    (
        // Open Graph
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
        meta!("property" = "og:image", content = SOCIAL_PREVIEW_IMAGE),
        // Twitter Card
        meta!(name = "twitter:card", content = "summary_large_image"),
        meta!(name = "twitter:title", content = meta_data.title),
        meta!(
            name = "twitter:description",
            content = meta_data.description
        ),
        meta!(name = "twitter:image", content = SOCIAL_PREVIEW_IMAGE),
    )
}

/// Tell the browser to start fetching the always-needed render-blocking /
/// module-graph assets in parallel with HTML parsing. `preload` for the
/// stylesheet, `modulepreload` for the JS entry-point — both shave an
/// RTT off LCP on cold loads. `as="style"` is mandatory on preload links
/// or browsers warn and refuse to use the prefetched bytes.
///
/// Takes owned `String`s because the html macros move the values into the
/// markup, and the caller still needs the same URLs further down `head!`
/// (for the actual `<link rel="stylesheet">` / `<script src=...>` tags).
fn preload_links(theme_css_url: String, shared_js_url: String) -> impl IntoHtml {
    (
        link!(rel = "preload", href = theme_css_url, r#as = "style"),
        link!(rel = "modulepreload", href = shared_js_url),
    )
}

/// Build a complete HTML page with the shared chrome.
///
/// `extra_style` and `extra_module_script` are typed handles to
/// compile-time-static inlines declared via [`crate::inline_style!`] /
/// [`crate::inline_module_script!`]; their SHA-256 hashes — known at
/// build time and whitelisted in the per-response Content-Security-Policy
/// — are guaranteed by construction to match the bytes that end up in the
/// rendered `<style>` / `<script>` elements.
///
/// `banner` is composed into the page body at the top; pass `()` (the
/// unit type, which `IntoHtml` treats as empty) when no banner is needed.
// HTML responses must always revalidate. The HTML embeds versioned asset
// URLs (`?v=<git-sha>`); if a browser holds on to an old HTML response via
// heuristic freshness it will keep loading the old assets too. Firefox is
// noticeably more aggressive about this than Safari, which made stale CSS
// look like a "Firefox-only" bug.
fn html_cache_control() -> CacheControl {
    CacheControl::new().with_no_cache()
}

/// Build a `Content-Security-Policy` whose `script-src` / `style-src`
/// whitelist precisely the inline assets `page()` is about to render —
/// always [`csp::THEME_INIT`] plus any per-page extras. Every other
/// directive is locked to `'self'` (or `'none'` where loading is never
/// expected), so a successful injection has no source list to abuse.
fn build_csp(inlines: &PageInlines) -> ContentSecurityPolicy {
    // `'inline-speculation-rules'` is scoped to `<script type="speculationrules">`
    // blocks only — adding it doesn't loosen what other inlines may execute.
    // Cheap to add unconditionally so pages can grow speculation rules later
    // without revisiting CSP.
    let mut script_src = SourceList::self_origin()
        .with_hash(HashAlgorithm::Sha256, csp::THEME_INIT.hash_b64())
        .with_hash(HashAlgorithm::Sha256, csp::IMPORTMAP.hash_b64())
        .with_hash(HashAlgorithm::Sha256, csp::SITE_LD_JSON.hash_b64())
        .with(SourceExpression::InlineSpeculationRules);
    if let Some(s) = inlines.module_script {
        script_src = script_src.with_hash(HashAlgorithm::Sha256, s.hash_b64());
    }
    if let Some(s) = inlines.ld_json {
        script_src = script_src.with_hash(HashAlgorithm::Sha256, s.hash_b64());
    }

    let mut style_src = SourceList::self_origin();
    if let Some(s) = inlines.style {
        style_src = style_src.with_hash(HashAlgorithm::Sha256, s.hash_b64());
    }

    ContentSecurityPolicy::empty()
        .with_default_src(SourceList::self_origin())
        .with_script_src(script_src)
        .with_style_src(style_src)
        // img-src and connect-src remain broad (https:) for external image
        // CDNs (Wikimedia Commons) and any future map/API integrations.
        .with_img_src(
            SourceList::self_origin()
                .with_scheme(Protocol::HTTPS)
                .with_data()
                .with_blob(),
        )
        .with_connect_src(SourceList::self_origin().with_scheme(Protocol::HTTPS))
        .with_font_src(SourceList::self_origin())
        .with_object_src(SourceList::none())
        .with_base_uri(SourceList::self_origin())
        .with_form_action(SourceList::self_origin())
        .with_frame_ancestors(SourceList::none())
}

pub fn page(
    meta_data: PageMeta,
    inlines: PageInlines,
    body_content: impl IntoHtml,
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
            // Importmap MUST be emitted before the modulepreload link
            // below (and before any `<script type="module">` further down)
            // — once module loading starts the document leaves the "before
            // import maps" phase, after which any later importmap is
            // rejected by spec-strict browsers (Firefox refuses, the
            // bare-specifier `@homework` then fails to resolve).
            csp::IMPORTMAP.render(),
            preload_links(theme_css_url.clone(), shared_js_url.clone()),
            link!(rel = "stylesheet", href = theme_css_url),
            link!(rel = "manifest", href = manifest_url),
            share_preview_metas(&meta_data, og_url),
            inlines.style.map(InlineStyle::render),
            // Site-wide schema.org structured data (WebSite +
            // EducationalOrganization). Emitted unconditionally so
            // crawlers see the same publisher identity on every page.
            csp::SITE_LD_JSON.render(),
            // Per-page schema.org JSON-LD (LearningResource +
            // BreadcrumbList on exercise pages).
            inlines.ld_json.map(InlineLdJson::render),
            // Apply stored theme override before first paint to avoid flash.
            // Body lives in `assets/theme-init.js` so its SHA-256 (and the
            // matching CSP source) is computed by build.rs.
            csp::THEME_INIT.render(),
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
            // Importmap is in the head (see comment there) — it MUST be
            // declared before any module loading is triggered.
            script!(r#type = "module", src = shared_js_url),
            inlines.module_script.map(InlineModuleScript::render),
            inlines
                .speculation_rules
                .map(InlineSpeculationRules::render),
        ),
    );
    let mut res = markup.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(html_cache_control());
    // Per-response CSP whose script-src/style-src whitelist exactly the
    // inline hashes this page emitted — nothing more, nothing less.
    headers.typed_insert(build_csp(&inlines));
    res
}

/// The dark/light theme toggle. Shared between the wide page header (used
/// on home, about, privacy) and the compact exercise breadcrumb bar (used
/// on every exercise page). The IDs are load-bearing — `homework.js`
/// wires events on them by id, so the same toggle works wherever it
/// renders.
pub fn theme_toggle_button() -> impl IntoHtml {
    button!(
        class = "theme-toggle",
        id = "theme-toggle",
        r#type = "button",
        "aria-label" = "Licht thema — klik voor donker",
        span!(id = "theme-toggle-icon", "aria-hidden" = "true", "☀️"),
    )
}

/// Standard page header with a 🏠 home link, centered title, and theme
/// toggle. Used on the home / about / privacy pages where vertical space
/// is plentiful and a big title carries weight. Exercise pages skip this
/// in favour of the compact breadcrumb bar from
/// [`crate::service::exercises::exercise_breadcrumb`].
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
        theme_toggle_button(),
    )
}
