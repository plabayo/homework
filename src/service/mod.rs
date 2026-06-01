// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::{convert::Infallible, sync::Arc};

use rama::{
    Layer as _, Service,
    error::extra::OpaqueError,
    http::{
        Body, HeaderName, HeaderValue, Request, Response,
        headers::{
            ContentSecurityPolicy, SourceList, StrictTransportSecurity, XContentTypeOptions,
            exotic::XClacksOverhead,
        },
        layer::{
            map_response_body::MapResponseBodyLayer, match_redirect::UriMatchRedirectLayer,
            required_header::AddRequiredResponseHeadersLayer, set_header::SetResponseHeaderLayer,
            trace::TraceLayer,
        },
        service::{redirect::RedirectHttpToHttps, web::Router},
    },
    net::http::uri::UriMatchReplaceDomain,
};

mod assets;
pub mod csp;
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
            SetResponseHeaderLayer::if_not_present_typed(XContentTypeOptions::nosniff()),
            // No CorsLayer: this app is intentionally same-origin only. The
            // PWA manifest, icons, JS, and HTML are all loaded from this
            // origin; opening it up with `Access-Control-Allow-Origin: *`
            // would let arbitrary third-party origins embed and read our
            // assets in ways the privacy story doesn't promise.
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
/// NOTE: every HTML PAGE route that should work offline must also appear in
/// the PRECACHE list in `src/service/assets/service-worker.js`. Crawler-only
/// routes (`/robots.txt`, `/sitemap.xml`, `/.well-known/security.txt`) are
/// not intercepted by the service worker and don't need to be precached.
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
        .with_get("/icon.svg", assets::icon_svg)
        .with_get("/apple-touch-icon.png", assets::apple_touch_icon_png)
        .with_get("/icon-192.png", assets::icon_192_png)
        .with_get("/icon-512.png", assets::icon_512_png)
        .with_get("/robots.txt", assets::robots_txt)
        .with_get("/sitemap.xml", assets::sitemap_xml)
        .with_get("/.well-known/security.txt", assets::security_txt)
        .with_get("/1/mathbox", exercises::mathbox::handler)
        .with_get("/1/multiplications", exercises::multiplications::handler)
        .with_get("/1/thermometer", exercises::thermometer::handler)
        .with_get("/2/clock", exercises::clock::handler)
        .with_get("/2/digital-clock", exercises::digital_clock::handler)
        .with_get("/2/fractions", exercises::fractions::handler)
        .with_get("/2/percentages", exercises::percentages::handler)
        .with_get("/extra/flashcards", exercises::flashcards::handler)
        .with_not_found(pages::offline::not_found);

    let middlewares = (
        SetResponseHeaderLayer::if_not_present_typed(
            StrictTransportSecurity::excluding_subdomains_for_max_seconds(31536000),
        ),
        // CSP fallback: applied only to responses that didn't set their
        // own header. HTML pages all route through `layout::page()`, which
        // attaches a per-response CSP that whitelists exactly the inline
        // hashes that page emits — see `service::csp`. Static-asset routes
        // (`/theme.css`, icons, `/robots.txt` etc.) don't go through
        // `page()`; for them the deny-all baseline below is correct,
        // since none of them load other resources.
        SetResponseHeaderLayer::if_not_present_typed(
            ContentSecurityPolicy::empty()
                .with_default_src(SourceList::none())
                .with_frame_ancestors(SourceList::none()),
        ),
        // Don't leak the full URL to third parties on outbound link clicks;
        // only send the origin when crossing origins, and nothing when
        // downgrading to HTTP.
        SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ),
        // Disable powerful features we never use, in this document and any
        // iframe it embeds. `interest-cohort=()` opts out of FLoC/Topics.
        SetResponseHeaderLayer::if_not_present(
            HeaderName::from_static("permissions-policy"),
            HeaderValue::from_static(
                "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
            ),
        ),
        UriMatchRedirectLayer::permanent(UriMatchReplaceDomain::drop_prefix_www()),
    );

    Ok(apply_common_middleware(middlewares.into_layer(app)))
}
