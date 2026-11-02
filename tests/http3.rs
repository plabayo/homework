// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

//! HTTP/3 next to HTTPS: the TCP side advertises it with `Alt-Svc`, and the
//! QUIC side serves the same app.

// The HTTP/3-capable client is a deep stack of connector types.
#![recursion_limit = "256"]

mod support;

use std::time::Duration;

use rama::{
    http::{
        Body, StatusCode, Version,
        body::util::BodyExt as _,
        client::{EasyHttpConnectorBuilder, Http3Connector},
        header::ALT_SVC,
        service::client::HttpClientExt as _,
    },
    rt::Executor,
    tls::client::{ServerVerifyMode, TlsClientConfig},
};
use support::app::TestApp;

type TestResult<T> = Result<T, Box<dyn std::error::Error + Send + Sync>>;

const TIMEOUT: Duration = Duration::from_secs(10);

#[tokio::test(flavor = "multi_thread")]
async fn https_advertises_and_serves_http3() -> TestResult<()> {
    let app = TestApp::spawn_https_h3()?;
    let url = format!("https://localhost:{}/", app.port());

    // The server's certificate is self-signed for `localhost`.
    let tls = TlsClientConfig::new().with_server_verify(ServerVerifyMode::Disable);
    let exec = Executor::default();
    let h3 = Http3Connector::builder(exec.clone())
        .with_tls_config(tls.clone())
        .build()
        .await?;
    let client = EasyHttpConnectorBuilder::new()
        .with_default_transport_connector()
        .with_default_dns_connector()
        .without_tls_proxy_support()
        .without_proxy_support()
        .with_tls_support_using_boringssl(tls)
        .with_default_http_connector(exec)
        .with_http3_support(h3)
        .with_default_connection_pool()
        .without_alt_svc()
        .build_client();

    // Browsers always start over TCP: that response must offer HTTP/3 on
    // the same port.
    let tcp = client.get(&url).send_with_timeout(TIMEOUT).await?;
    assert_eq!(tcp.status(), StatusCode::OK);
    assert_ne!(tcp.version(), Version::HTTP_3);
    let alt_svc = tcp
        .headers()
        .get(ALT_SVC)
        .ok_or("HTTPS response has no Alt-Svc header")?
        .to_str()?
        .to_owned();
    assert!(
        alt_svc.contains(&format!("h3=\":{}\"", app.port())),
        "unexpected Alt-Svc: {alt_svc}"
    );

    let quic = client
        .get(&url)
        .version(Version::HTTP_3)
        .body(Body::empty())
        .send_with_timeout(TIMEOUT)
        .await?;
    assert_eq!(quic.version(), Version::HTTP_3);
    assert_eq!(quic.status(), StatusCode::OK);
    let html = String::from_utf8(quic.into_body().collect().await?.to_bytes().to_vec())?;
    assert!(
        html.contains("<!DOCTYPE html>"),
        "not the home page: {html:.200}"
    );

    Ok(())
}
