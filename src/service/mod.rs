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
            cors::CorsLayer::permissive(),
        )
            .into_layer(service),
    )
}

pub async fn load_http_service()
-> Result<impl Service<Request, Output = Response, Error = Infallible> + Clone, OpaqueError> {
    let app =
        RedirectHttpToHttps::new().with_rewrite_uri_rule(UriMatchReplaceDomain::drop_prefix_www());
    Ok(apply_common_middleware(app))
}

pub async fn load_https_service()
-> Result<impl Service<Request, Output = Response, Error = Infallible> + Clone, OpaqueError> {
    let app = Router::new()
        .with_get("/", pages::home::home)
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
        .with_not_found(pages::offline::offline);

    let middlewares = (
        SetResponseHeaderLayer::if_not_present_typed(
            StrictTransportSecurity::excluding_subdomains_for_max_seconds(31536000),
        ),
        UriMatchRedirectLayer::permanent(UriMatchReplaceDomain::drop_prefix_www()),
    );

    Ok(apply_common_middleware(middlewares.into_layer(app)))
}
