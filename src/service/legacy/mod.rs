use std::{convert::Infallible, path::Path};

use rama::{
    Service,
    http::{Request, Response, service::fs::ServeDir},
    utils::include_dir,
};

pub fn service() -> impl Service<Request, Response = Response, Error = Infallible> {
    ServeDir::new_embedded(include_dir::include_dir!(
        "$CARGO_MANIFEST_DIR/src/service/legacy/static"
    ))
    .with_directory_serve_mode(rama::http::service::fs::DirectoryServeMode::AppendIndexHtml)
}
