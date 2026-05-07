use rama::http::{
    HeaderValue,
    header::CONTENT_TYPE,
    service::web::response::{Css, IntoResponse, Script},
};

use crate::utils::info::ASSET_VERSION;

pub const THEME_CSS: &str = include_str!("assets/theme.css");
pub const HOMEWORK_JS: &str = include_str!("assets/homework.js");
pub const SERVICE_WORKER_JS: &str = include_str!("assets/service-worker.js");
pub const MANIFEST: &str = include_str!("assets/manifest.webmanifest");
pub const FAVICON_SVG: &str = include_str!("assets/favicon.svg");

pub async fn theme_css() -> impl IntoResponse {
    Css(THEME_CSS)
}

pub async fn homework_js() -> impl IntoResponse {
    Script(HOMEWORK_JS)
}

pub async fn service_worker_js() -> impl IntoResponse {
    Script(SERVICE_WORKER_JS)
}

pub async fn manifest() -> impl IntoResponse {
    let manifest = MANIFEST.replace(
        r#""/favicon.svg""#,
        &format!(r#""/favicon.svg?v={ASSET_VERSION}""#),
    );
    let mut res = manifest.into_response();
    res.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("application/manifest+json"),
    );
    res
}

pub async fn favicon_svg() -> impl IntoResponse {
    let mut res = FAVICON_SVG.into_response();
    res.headers_mut()
        .insert(CONTENT_TYPE, HeaderValue::from_static("image/svg+xml"));
    res
}
