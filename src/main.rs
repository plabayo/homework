// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use clap::Parser;
use std::time::Duration;

use rama::{
    Layer as _,
    combinators::Either,
    error::{BoxError, ErrorContext as _},
    graceful::{self, ShutdownGuard},
    http::{BodyLimitLayer, server::HttpServer, tls::CertIssuerHttpClient},
    layer::AddInputExtensionLayer,
    net::{
        Protocol,
        address::SocketAddress,
        tls::{
            ApplicationProtocol,
            server::{CacheKind, ServerAuth, ServerCertIssuerData, ServerConfig},
        },
    },
    proxy::haproxy::server::HaProxyLayer,
    rt::Executor,
    tcp::server::TcpListener,
    telemetry::tracing,
    tls::boring::server::{TlsAcceptorData, TlsAcceptorLayer},
};

// All routes are GET-only and the handlers ignore the body. 64 KiB is more
// than generous for any legitimate request and prevents a hostile client
// from streaming gigabytes into our trace logs.
const REQUEST_BODY_LIMIT: usize = 64 * 1024;

pub mod service;
pub mod utils;

#[cfg(target_family = "unix")]
#[global_allocator]
static ALLOC: jemallocator::Jemalloc = jemallocator::Jemalloc;

#[cfg(target_os = "windows")]
#[global_allocator]
static ALLOC: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[derive(Debug, Parser)]
#[command(name = "homework")]
#[command(bin_name = "homework")]
#[command(version, about, long_about = None)]
struct Cli {
    /// the plain-HTTP interface to bind to (used for redirect-to-https when
    /// `--https` is set; otherwise it serves the full app, for local dev).
    #[arg(long, default_value_t = SocketAddress::default_ipv4(8080))]
    http: SocketAddress,

    /// the HTTPS interface to bind to (optional; requires the ACME env vars
    /// consumed by `rama::http::tls::CertIssuerHttpClient::try_from_env`).
    #[arg(long)]
    https: Option<SocketAddress>,
}

async fn run_server(cfg: Cli) -> Result<(), BoxError> {
    // Shutdown::default() already listens for SIGINT and (on Unix) SIGTERM
    // via tokio-graceful's `default_signal()`, so spawning our own signal
    // handler here is unnecessary — but the dependency on that detail is
    // load-bearing for graceful Fly deploys, so this comment is the
    // contract.
    let shutdown = graceful::Shutdown::default();

    spawn_service_http(shutdown.guard(), cfg.http, cfg.https.is_some()).await?;
    if let Some(https_bind) = cfg.https {
        spawn_service_https(shutdown.guard(), https_bind).await?;
    }

    shutdown.shutdown_with_limit(Duration::from_secs(3)).await?;
    Ok(())
}

async fn spawn_service_http(
    guard: ShutdownGuard,
    interface: SocketAddress,
    https_enabled: bool,
) -> Result<(), BoxError> {
    let svc = if https_enabled {
        Either::A(self::service::load_http_redirect_service().await?)
    } else {
        Either::B(self::service::load_https_app_service().await?)
    };

    let exec = Executor::graceful(guard.clone());
    let http_server = HttpServer::auto(exec.clone()).service(svc);
    // `with_peek(true)` makes the layer auto-detect a PROXY header and fall
    // through to plain HTTP when there isn't one, so the same binary serves
    // Fly's edge (which prepends the header) and a bare `just run` locally.
    // Any client-claimed source IP from PROXY is treated like any other
    // client-claimed identity (X-Forwarded-For etc.) — trust depends on
    // whether the operator put a trusted L4 proxy in front, not on the
    // layer.
    let tcp_server = (
        BodyLimitLayer::request_only(REQUEST_BODY_LIMIT),
        HaProxyLayer::new().with_peek(true),
    )
        .into_layer(http_server);
    let tcp_listener = TcpListener::bind_address(interface, exec).await?;

    guard.into_spawn_task_fn(async move |_guard| {
        tracing::info!("http server ({interface}) up and running");
        tcp_listener.serve(tcp_server).await;
    });

    Ok(())
}

async fn spawn_service_https(
    guard: ShutdownGuard,
    interface: SocketAddress,
) -> Result<(), BoxError> {
    let executor = Executor::graceful(guard.clone());

    let issuer = CertIssuerHttpClient::try_from_env(executor.clone())
        .context("create CertIssuerHttpClient from env")?;

    // Cap the prefetch at 10 seconds. A slow or hung ACME endpoint must not
    // be allowed to block server startup indefinitely — if prefetch is slow
    // we just skip it and let real connections trigger issuance.
    if (tokio::time::timeout(Duration::from_secs(10), issuer.prefetch_certs()).await).is_err() {
        tracing::warn!("certificate prefetch timed out after 10s; continuing without warm cache");
    }

    let tls_server_config = ServerConfig {
        application_layer_protocol_negotiation: Some(vec![
            ApplicationProtocol::HTTP_2,
            ApplicationProtocol::HTTP_11,
        ]),
        ..ServerConfig::new(ServerAuth::CertIssuer(ServerCertIssuerData {
            kind: issuer.into(),
            cache_kind: CacheKind::default(),
        }))
    };

    let acceptor_data =
        TlsAcceptorData::try_from(tls_server_config).context("create acceptor data")?;

    let svc = AddInputExtensionLayer::new(Protocol::HTTPS)
        .into_layer(self::service::load_https_app_service().await?);

    let http_server = HttpServer::auto(executor.clone()).service(svc);
    let tcp_server = (
        BodyLimitLayer::request_only(REQUEST_BODY_LIMIT),
        HaProxyLayer::new().with_peek(true),
        TlsAcceptorLayer::new(acceptor_data),
    )
        .into_layer(http_server);

    let tcp_listener = TcpListener::bind_address(interface, executor).await?;

    guard.into_spawn_task_fn(async move |_guard| {
        tracing::info!("https server ({interface}) up and running");
        tcp_listener.serve(tcp_server).await;
    });

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    utils::trace::init_tracing();

    let cli = Cli::parse();

    // Return the error from main rather than std::process::exit() so
    // destructors — including the graceful guard's spawned-task cleanup —
    // get a chance to run. Rust's `Termination` impl prints the error and
    // exits with code 1 on its own; no extra eprintln necessary (and a
    // duplicate print clutters log collectors).
    run_server(cli).await
}
