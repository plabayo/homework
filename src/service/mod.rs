use std::{convert::Infallible, sync::Arc, time::Duration};

use rama::{
    Layer as _, Service,
    error::{ErrorContext as _, OpaqueError},
    http::{
        Body, HeaderName, HeaderValue, Request, Response,
        headers::StrictTransportSecurity,
        layer::{
            cors, map_response_body::MapResponseBodyLayer, match_redirect::UriMatchRedirectLayer,
            required_header::AddRequiredResponseHeadersLayer, set_header::SetResponseHeaderLayer,
            trace::TraceLayer,
        },
        service::{fs::DirectoryServeMode, redirect::RedirectHttpToHttps, web::Router},
    },
    net::http::uri::UriMatchReplaceRule,
    utils::include_dir::include_dir,
};

fn apply_common_middleware(
    service: impl Service<Request, Response = Response, Error = Infallible>,
) -> impl Service<Request, Response = Response, Error = Infallible> {
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
        .into_layer(service)
}

pub async fn load_http_service()
-> Result<impl Service<Request, Response = Response, Error = Infallible>, OpaqueError> {
    let app = RedirectHttpToHttps::new().with_match_replace_uri_rule(
        UriMatchReplaceRule::try_new("http://www.*", "https://www.$1")
            .context("create APEX to root uri replace rule")?,
    );
    Ok(apply_common_middleware(app))
}

pub async fn load_https_service()
-> Result<impl Service<Request, Response = Response, Error = Infallible>, OpaqueError> {
    let app = Router::new().dir_embed_with_serve_mode(
        "/",
        include_dir!("$CARGO_MANIFEST_DIR/src/service/legacy"),
        DirectoryServeMode::AppendIndexHtml,
    );

    let middlewares = UriMatchRedirectLayer::permanent(Arc::new(
        UriMatchReplaceRule::try_new("https://www.*", "https://$1")
            .context("create www to APEX redirect rule")?,
    ));

    Ok(apply_common_middleware(middlewares.into_layer(app)))
}
