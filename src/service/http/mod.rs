use std::{convert::Infallible, path::Path};

use rama::{
    Context, Layer as _, Service,
    error::{BoxError, ErrorContext as _, OpaqueError},
    http::{
        Body, BodyExtractExt, Request, Response, StatusCode, header,
        headers::{Authorization, ContentType},
        layer::{
            cors, map_response_body::MapResponseBodyLayer,
            required_header::AddRequiredResponseHeadersLayer, trace::TraceLayer,
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

pub async fn load_http_service(
    path: &Path,
) -> impl Service<Request, Response = Response, Error = Infallible> {
    let app = Router::new().sub("/", legacy::service(path));

    (
        MapResponseBodyLayer::new(Body::new),
        TraceLayer::new_for_http(),
        AddRequiredResponseHeadersLayer::default(),
        cors::CorsLayer::permissive(),
    )
        .into_layer(app)
}
