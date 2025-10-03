use std::{convert::Infallible, path::Path, time::Duration};

use rama::{
    Context, Layer as _, Service,
    error::{BoxError, ErrorContext as _, OpaqueError},
    http::{
        Body, BodyExtractExt, HeaderName, HeaderValue, Request, Response, StatusCode, header,
        headers::{Authorization, ContentType, StrictTransportSecurity},
        layer::{
            cors, map_response_body::MapResponseBodyLayer,
            required_header::AddRequiredResponseHeadersLayer, set_header::SetResponseHeaderLayer,
            trace::TraceLayer,
        },
        service::{
            client::HttpClientExt as _,
            web::{
                Router,
                response::{Headers, IntoResponse as _},
            },
        },
    },
    net::http::RequestContext,
    service::service_fn,
    telemetry::tracing,
};

mod legacy;

pub async fn load_https_service() -> impl Service<Request, Response = Response, Error = Infallible>
{
    let app = Router::new().sub("/", legacy::service());

    (
        MapResponseBodyLayer::new(Body::new),
        TraceLayer::new_for_http(),
        SetResponseHeaderLayer::if_not_present_typed(
            StrictTransportSecurity::excluding_subdomains(Duration::from_secs(31536000)),
        ),
        AddRequiredResponseHeadersLayer::default(),
        SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-sponsored-by"),
            HeaderValue::from_static("fly.io"),
        ),
        cors::CorsLayer::permissive(),
    )
        .into_layer(app)
}

pub async fn load_http_service() -> impl Service<Request, Response = Response, Error = Infallible> {
    (
        MapResponseBodyLayer::new(Body::new),
        TraceLayer::new_for_http(),
        AddRequiredResponseHeadersLayer::default(),
        SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-sponsored-by"),
            HeaderValue::from_static("fly.io"),
        ),
        cors::CorsLayer::permissive(),
    )
        .into_layer(service_fn(async |ctx: Context, req: Request| {
            // TODO: replace code like this in near future with better
            // functional approach of rama 0.3
            let req_ctx = match RequestContext::try_from((&ctx, &req)) {
                Ok(req_ctx) => req_ctx,
                Err(err) => {
                    tracing::error!("failed to get request ctx for insecure incoming req: {err}");
                    return Ok(StatusCode::BAD_GATEWAY.into_response());
                }
            };

            let host = &req_ctx.authority.host();
            let paq = req
                .uri()
                .path_and_query()
                .map(|paq| paq.as_str())
                .unwrap_or("/");

            let loc = format!("https://{host}{paq}");

            Ok(([(header::LOCATION, loc)], StatusCode::PERMANENT_REDIRECT).into_response())
        }))
}
