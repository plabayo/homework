use std::{convert::Infallible, path::Path};

use rama::{
    Service,
    http::{Request, Response, service::fs::ServeDir},
};

pub fn service(path: &Path) -> impl Service<Request, Response = Response, Error = Infallible> {
    ServeDir::new(path)
        .with_directory_serve_mode(rama::http::service::fs::DirectoryServeMode::AppendIndexHtml)
}
