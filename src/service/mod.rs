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
        service::{fs::DirectoryServeMode, web::Router},
    },
    net::http::uri::UriMatchReplaceRule,
    utils::include_dir::include_dir,
};

pub async fn load_https_service(
    https_enabled: bool,
) -> Result<impl Service<Request, Response = Response, Error = Infallible>, OpaqueError> {
    let app = Router::new().dir_embed_with_serve_mode(
        "/",
        include_dir!("$CARGO_MANIFEST_DIR/src/service/legacy"),
        DirectoryServeMode::AppendIndexHtml,
    );

    Ok((
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
        if https_enabled {
            Some(UriMatchRedirectLayer::permanent(Arc::new([
                UriMatchReplaceRule::http_to_https(),
                UriMatchReplaceRule::try_new("https://www.*", "https://$1")
                    .context("create www to APEX redirect rule")?,
            ])))
        } else {
            None
        },
    )
        .into_layer(app))
}
