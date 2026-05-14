// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::{convert::Infallible, sync::Arc};

use rama::{
    Layer as _, Service,
    error::extra::OpaqueError,
    http::{
        Body, HeaderName, HeaderValue, Request, Response,
        headers::{StrictTransportSecurity, exotic::XClacksOverhead},
        layer::{
            cors, map_response_body::MapResponseBodyLayer, match_redirect::UriMatchRedirectLayer,
            required_header::AddRequiredResponseHeadersLayer, set_header::SetResponseHeaderLayer,
            trace::TraceLayer,
        },
        service::{redirect::RedirectHttpToHttps, web::Router},
    },
    net::http::uri::UriMatchReplaceDomain,
};

mod assets;
mod exercises;
mod language_banner;
mod layout;
mod pages;

fn apply_common_middleware(
    service: impl Service<Request, Output = Response, Error = Infallible>,
) -> impl Service<Request, Output = Response, Error = Infallible> + Clone {
    Arc::new(
        (
            MapResponseBodyLayer::new(Body::new),
            TraceLayer::new_for_http(),
            SetResponseHeaderLayer::<XClacksOverhead>::if_not_present_default_typed(),
            AddRequiredResponseHeadersLayer::default(),
            SetResponseHeaderLayer::overriding(
                HeaderName::from_static("x-sponsored-by"),
                HeaderValue::from_static("fly.io"),
            ),
            SetResponseHeaderLayer::if_not_present(
                HeaderName::from_static("x-content-type-options"),
                HeaderValue::from_static("nosniff"),
            ),
            cors::CorsLayer::permissive(),
        )
            .into_layer(service),
    )
}

/// HTTP-only service: redirects every request to the HTTPS equivalent and
/// strips a leading `www.` from the host.
pub async fn load_http_redirect_service()
-> Result<impl Service<Request, Output = Response, Error = Infallible> + Clone, OpaqueError> {
    let app =
        RedirectHttpToHttps::new().with_rewrite_uri_rule(UriMatchReplaceDomain::drop_prefix_www());
    Ok(apply_common_middleware(app))
}

/// Full application service used on the HTTPS port (and on the plain-HTTP port
/// when TLS is disabled, e.g. in local development).
///
/// NOTE: every route registered here must also appear in the PRECACHE list in
/// `src/service/assets/service-worker.js` so the page works offline.
/// Similarly, every exercise route must be registered in
/// `src/service/exercises/mod.rs::all_exercises()` to appear in the catalogue.
pub async fn load_https_app_service()
-> Result<impl Service<Request, Output = Response, Error = Infallible> + Clone, OpaqueError> {
    let app = Router::new()
        .with_get("/", pages::home::home)
        .with_get("/about", pages::about::about)
        .with_get("/offline", pages::offline::offline)
        .with_get("/theme.css", assets::theme_css)
        .with_get("/homework.js", assets::homework_js)
        .with_get("/service-worker.js", assets::service_worker_js)
        .with_get("/manifest.webmanifest", assets::manifest)
        .with_get("/favicon.svg", assets::favicon_svg)
        .with_get("/1/mathbox", exercises::mathbox::handler)
        .with_get("/1/multiplications", exercises::multiplications::handler)
        .with_get("/1/thermometer", exercises::thermometer::handler)
        .with_get("/2/clock", exercises::clock::handler)
        .with_get("/2/digital-clock", exercises::digital_clock::handler)
        .with_get("/extra/flashcards", exercises::flashcards::handler)
        .with_not_found(pages::offline::not_found);

    let middlewares = (
        SetResponseHeaderLayer::if_not_present_typed(
            StrictTransportSecurity::excluding_subdomains_for_max_seconds(31536000),
        ),
        // img-src and connect-src are broad (https:) to accommodate external image CDNs
        // (Wikimedia Commons) and future map/API integrations without further changes.
        SetResponseHeaderLayer::overriding(
            HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static(
                "default-src 'self'; \
                 script-src 'self' 'unsafe-inline'; \
                 style-src 'self' 'unsafe-inline'; \
                 img-src 'self' https: data: blob:; \
                 connect-src 'self' https:; \
                 font-src 'self'; \
                 object-src 'none'; \
                 base-uri 'self'; \
                 form-action 'self'; \
                 frame-ancestors 'none'",
            ),
        ),
        UriMatchRedirectLayer::permanent(UriMatchReplaceDomain::drop_prefix_www()),
    );

    Ok(apply_common_middleware(middlewares.into_layer(app)))
}
