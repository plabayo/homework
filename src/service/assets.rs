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

// Favicon URL with version query baked in at compile time — no per-request allocation.
const MANIFEST_VERSIONED: &str = const_format::str_replace!(
    include_str!("assets/manifest.webmanifest"),
    r#""/favicon.svg""#,
    const_format::concatcp!(r#""/favicon.svg?v="#, ASSET_VERSION, "\""),
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
