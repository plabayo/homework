// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::http::{
    HeaderValue,
    header::CONTENT_TYPE,
    headers::{CacheControl, HeaderMapExt},
    service::web::response::{Css, IntoResponse, Script},
};

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
    CacheControl::new()
        .with_public()
        .with_immutable()
        .with_max_age_seconds(31_536_000)
}

// The service worker script bootstraps everything else, so it must always be
// revalidated against the server — otherwise an update would be invisible
// until the browser's own SW-update heuristic fires.
fn cache_revalidate() -> CacheControl {
    CacheControl::new().with_no_cache()
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
    res.headers_mut().typed_insert(cache_revalidate());
    res
}

pub async fn manifest() -> impl IntoResponse {
    let mut res = MANIFEST_VERSIONED.into_response();
    let headers = res.headers_mut();
    headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/manifest+json"),
    );
    headers.typed_insert(cache_immutable());
    res
}

pub async fn favicon_svg() -> impl IntoResponse {
    let mut res = FAVICON_SVG.into_response();
    let headers = res.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/svg+xml"));
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_svg() -> impl IntoResponse {
    let mut res = ICON_SVG.into_response();
    let headers = res.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/svg+xml"));
    headers.typed_insert(cache_immutable());
    res
}

pub async fn apple_touch_icon_png() -> impl IntoResponse {
    let mut res = APPLE_TOUCH_ICON_PNG.into_response();
    let headers = res.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/png"));
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_192_png() -> impl IntoResponse {
    let mut res = ICON_192_PNG.into_response();
    let headers = res.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/png"));
    headers.typed_insert(cache_immutable());
    res
}

pub async fn icon_512_png() -> impl IntoResponse {
    let mut res = ICON_512_PNG.into_response();
    let headers = res.headers_mut();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("image/png"));
    headers.typed_insert(cache_immutable());
    res
}
