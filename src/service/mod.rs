use std::{convert::Infallible, sync::Arc, time::Duration};

use rama::{
    Layer as _, Service,
    combinators::Either3,
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

#[derive(Debug, Clone, Copy)]
pub enum ServiceMode {
    Http,
    HttpOnly,
    Https,
}

pub async fn load_http_service(
    mode: ServiceMode,
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
        UriMatchRedirectLayer::permanent(Arc::new(match mode {
            ServiceMode::Https => Either3::A(
                UriMatchReplaceRule::try_new("https://www.*", "https://$1")
                    .context("create www to APEX redirect rule")?,
            ),
            ServiceMode::Http => Either3::B([
                UriMatchReplaceRule::try_new("http://www.*", "https://$1")
                    .context("create www to APEX + https upgrade redirect rule")?,
                UriMatchReplaceRule::http_to_https(),
            ]),
            ServiceMode::HttpOnly => Either3::C(
                UriMatchReplaceRule::try_new("http://www.*", "http://$1")
                    .context("create www to APEX redirect rule")?,
            ),
        })),
    )
        .into_layer(app))
}
