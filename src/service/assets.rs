// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::{
    headers::{CacheControl, ContentSecurityPolicy, ContentType, HeaderMapExt, SourceList},
    service::web::response::{Css, IntoResponse, Script},
};

use crate::service::exercises::all_exercises;
use crate::utils::info::ASSET_VERSION;

pub const THEME_CSS: &str = include_str!("assets/theme.css");
pub const HOMEWORK_JS: &str = include_str!("assets/homework.js");
pub const SERVICE_WORKER_JS: &str = include_str!("assets/service-worker.js");
pub const FAVICON_SVG: &str = include_str!("assets/favicon.svg");
// Geometric (no emoji-font dependency) icon used as the source for the PNG
// home-screen icons. iOS does not accept SVG for the home-screen icon, and
// Android's adaptive icons crop the corners — both reasons to ship sized
// PNGs alongside the inline emoji favicon.
pub const ICON_SVG: &str = include_str!("assets/icon.svg");
pub const APPLE_TOUCH_ICON_PNG: &[u8] = include_bytes!("assets/apple-touch-icon.png");
pub const ICON_192_PNG: &[u8] = include_bytes!("assets/icon-192.png");
pub const ICON_512_PNG: &[u8] = include_bytes!("assets/icon-512.png");
pub const ROBOTS_TXT: &str = include_str!("assets/robots.txt");
pub const SECURITY_TXT: &str = include_str!("assets/security.txt");

// Canonical absolute origin used in the sitemap. Hardcoded rather than
// derived from the request because crawlers index by this exact URL and
// `Host` headers in development would otherwise pollute it.
const CANONICAL_ORIGIN: &str = "https://elementary.training";

// Inject the asset-version query string into every icon URL the manifest
// references, in one compile-time pass. The escape dance (replace twice,
// pre-anchor each) is so a future `"/icon-192.png"` standalone usage
// elsewhere in the manifest doesn't also get rewritten.
const MANIFEST_VERSIONED: &str = const_format::str_replace!(
    const_format::str_replace!(
        const_format::str_replace!(
            include_str!("assets/manifest.webmanifest"),
            r#""/favicon.svg""#,
            const_format::concatcp!(r#""/favicon.svg?v="#, ASSET_VERSION, "\""),
        ),
        r#""/icon-192.png""#,
        const_format::concatcp!(r#""/icon-192.png?v="#, ASSET_VERSION, "\""),
    ),
    r#""/icon-512.png""#,
    const_format::concatcp!(r#""/icon-512.png?v="#, ASSET_VERSION, "\""),
);

// Static assets are served with a versioned URL (`?v=<git-sha>`), so the
// content for any given URL never changes — safe to cache forever. Without
// this, browsers fall back to heuristic freshness; Firefox is much more
// aggressive there than Safari and can hold on to the old HTML (with its
// old `?v=` references) for hours, so the cache-bust never gets a chance.
fn cache_immutable() -> CacheControl {
    CacheControl::immutable_one_year()
}

// The service worker script bootstraps everything else, so it must always be
// revalidated against the server — otherwise an update would be invisible
// until the browser's own SW-update heuristic fires.
fn cache_revalidate() -> CacheControl {
    CacheControl::no_cache()
}

// Discovery files (robots.txt, sitemap.xml, security.txt) are not
// fingerprinted in their URL, but they also rarely change. A short shared
// cache lets the CDN absorb crawler bursts without making content
// updates invisible for long.
fn cache_short_revalidate() -> CacheControl {
    CacheControl::short_shared_revalidate(3600)
}

pub async fn theme_css() -> impl IntoResponse {
    let mut res = Css(THEME_CSS).into_response();
    res.headers_mut().typed_insert(cache_immutable());
    res
}

pub async fn homework_js() -> impl IntoResponse {
    let mut res = Script(HOMEWORK_JS).into_response();
    res.headers_mut().typed_insert(cache_immutable());
    res
}

pub async fn service_worker_js() -> impl IntoResponse {
    let mut res = Script(SERVICE_WORKER_JS).into_response();
    let headers = res.headers_mut();
    headers.typed_insert(cache_revalidate());
    // CSP on a service-worker script's response governs what the worker
    // is allowed to do at runtime — importScripts(), fetch(), etc. The
    // global deny-all fallback in `service::mod` would block both, so we
    // emit a service-worker-specific policy that lets the SW fetch from
    // its own origin (needed to populate the offline pre-cache and to
    // serve the network-first HTML strategy) without granting it any
    // cross-origin reach. Wider than the strict deny-all but no looser
    // than what the SW genuinely requires.
    headers.typed_insert(
        ContentSecurityPolicy::empty()
            .with_default_src(SourceList::self_origin())
            .with_script_src(SourceList::self_origin())
            .with_connect_src(SourceList::self_origin())
            .with_object_src(SourceList::none())
            .with_frame_ancestors(SourceList::none()),
    );
    res
}

pub async fn manifest() -> impl IntoResponse {
    let mut res = MANIFEST_VERSIONED.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::manifest_json());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn favicon_svg() -> impl IntoResponse {
    let mut res = FAVICON_SVG.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::svg());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_svg() -> impl IntoResponse {
    let mut res = ICON_SVG.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::svg());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn apple_touch_icon_png() -> impl IntoResponse {
    let mut res = APPLE_TOUCH_ICON_PNG.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::png());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_192_png() -> impl IntoResponse {
    let mut res = ICON_192_PNG.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::png());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_512_png() -> impl IntoResponse {
    let mut res = ICON_512_PNG.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::png());
    headers.typed_insert(cache_immutable());
    res
}

pub async fn robots_txt() -> impl IntoResponse {
    let mut res = ROBOTS_TXT.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::text_utf8());
    headers.typed_insert(cache_short_revalidate());
    res
}

pub async fn security_txt() -> impl IntoResponse {
    let mut res = SECURITY_TXT.into_response();
    let headers = res.headers_mut();
    headers.typed_insert(ContentType::text_utf8());
    headers.typed_insert(cache_short_revalidate());
    res
}

/// Build the sitemap XML from the static page list plus the exercise
/// catalogue. We omit `<lastmod>` deliberately — there's no per-route
/// change tracking and crawlers fall back to other freshness signals.
fn build_sitemap_xml() -> String {
    // Static, indexable HTML routes. `/offline` is excluded because it's
    // a fallback page (also marked noindex via X-Robots-Tag).
    const STATIC_PATHS: &[&str] = &["/", "/about", "/privacy"];

    let mut xml = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for path in STATIC_PATHS {
        xml.push_str("  <url><loc>");
        xml.push_str(CANONICAL_ORIGIN);
        xml.push_str(path);
        xml.push_str("</loc></url>\n");
    }
    for info in all_exercises() {
        xml.push_str("  <url><loc>");
        xml.push_str(CANONICAL_ORIGIN);
        xml.push_str(info.path);
        xml.push_str("</loc></url>\n");
    }
    xml.push_str("</urlset>\n");
    xml
}

pub async fn sitemap_xml() -> impl IntoResponse {
    let mut res = build_sitemap_xml().into_response();
    let headers = res.headers_mut();
    // `ContentType::xml()` is `text/xml`; the sitemaps.org spec also accepts
    // `application/xml; charset=utf-8`, and that's what we emit. The explicit,
    // charset-bearing form keeps the generated XML's encoding declaration in
    // sync with what we tell the crawler.
    headers.typed_insert(ContentType::xml_utf8());
    headers.typed_insert(cache_short_revalidate());
    res
}
