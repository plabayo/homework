// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use clap::{Parser, value_parser};
use std::{sync::Arc, time::Duration};

use rama::{
    Layer as _,
    combinators::Either,
    error::{BoxError, ErrorContext as _},
    graceful::{self, ShutdownGuard},
    http::{
        BodyLimitLayer,
        core::h3::connection::Config as Http3Config,
        headers::{AltSvc, AlternativeService},
        layer::{
            body_limit::BodyLimitLayer as RequestBodyLimitLayer, set_header::SetResponseHeaderLayer,
        },
        server::HttpServer,
        tls::CertIssuerHttpClient,
    },
    layer::AddInputExtensionLayer,
    net::{Protocol, address::SocketAddress, tls::ApplicationProtocol},
    proxy::haproxy::server::HaProxyLayer,
    quic::{
        Endpoint, MtuDiscoveryConfig, ServerConfig, TransportConfig,
        tls::{BoringTlsProvider, TlsOptions},
    },
    rt::Executor,
    tcp::server::TcpListener,
    telemetry::tracing,
    tls::{
        boring::server::{BoringServerConfigExt as _, ServerCertIssuerData, TlsAcceptorLayer},
        server::{LeafCertRequest, ServerAuthData, TlsServerConfig},
    },
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

    /// the UDP interface to serve HTTP/3 on, next to `--https`; HTTPS
    /// responses then advertise it with `Alt-Svc`. Its port must be the one
    /// clients reach, as `Alt-Svc` names only the port.
    #[arg(long, requires = "https")]
    h3: Option<SocketAddress>,

    /// the largest UDP payload HTTP/3 path MTU discovery probes for (default
    /// 1452). Lower it where the network drops larger datagrams silently.
    #[arg(long, requires = "h3", value_parser = value_parser!(u16).range(1200..))]
    h3_mtu_upper_bound: Option<u16>,

    /// serve `--https` (and `--h3`) with a self-signed `localhost`
    /// certificate instead of the ACME issuer: for local development and
    /// tests only.
    #[arg(long, requires = "https", hide = true)]
    self_signed: bool,
}

async fn run_server(cfg: Cli) -> Result<(), BoxError> {
    // Shutdown::default() already listens for SIGINT and (on Unix) SIGTERM
    // via tokio-graceful's `default_signal()`, so spawning our own signal
    // handler here is unnecessary — but the dependency on that detail is
    // load-bearing for graceful Fly deploys, so this comment is the
    // contract.
    let shutdown = graceful::Shutdown::default();

    spawn_service_http(shutdown.guard(), cfg.http, cfg.https.is_some()).await?;
    let h3_endpoint = match cfg.https {
        Some(https_bind) => spawn_service_https(shutdown.guard(), https_bind, &cfg).await?,
        None => None,
    };

    let result = shutdown.shutdown_with_limit(Duration::from_secs(3)).await;
    // A QUIC peer gets no reset from an exited process, it would wait out
    // its idle timeout. HTTP/3 has drained (or run out of time) by now, so
    // tell any peers left that we are gone.
    if let Some(endpoint) = h3_endpoint {
        _ = tokio::time::timeout(Duration::from_secs(1), endpoint.shutdown()).await;
    }
    result?;
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
    cfg: &Cli,
) -> Result<Option<Endpoint>, BoxError> {
    let executor = Executor::graceful(guard.clone());

    let tls_server_config = if cfg.self_signed {
        let auth = ServerAuthData::new_self_signed_leaf(LeafCertRequest::default())
            .context("generate self-signed localhost certificate")?;
        TlsServerConfig::new().with_server_auth(auth)
    } else {
        let issuer = CertIssuerHttpClient::try_from_env(executor.clone())
            .context("create CertIssuerHttpClient from env")?;

        // Cap the prefetch at 10 seconds. A slow or hung ACME endpoint must
        // not be allowed to block server startup indefinitely — if prefetch
        // is slow we just skip it and let real connections trigger issuance.
        if (tokio::time::timeout(Duration::from_secs(10), issuer.prefetch_certs()).await).is_err() {
            tracing::warn!(
                "certificate prefetch timed out after 10s; continuing without warm cache"
            );
        }

        TlsServerConfig::new().with_cert_issuer(ServerCertIssuerData::new(issuer))
    }
    .with_alpn_http_auto();

    let h3_endpoint = match cfg.h3 {
        Some(h3_bind) => {
            Some(bind_http3(h3_bind, &tls_server_config, cfg.h3_mtu_upper_bound).await?)
        }
        None => None,
    };
    // Browsers always start over TCP; `Alt-Svc` tells them HTTP/3 is on
    // offer so their next requests to this origin can switch to it.
    let alt_svc = h3_endpoint
        .as_ref()
        .map(|endpoint| -> Result<AltSvc, BoxError> {
            let port = endpoint
                .local_addr()
                .context("HTTP/3 endpoint address")?
                .port();
            Ok(AltSvc::new(AlternativeService::new(
                ApplicationProtocol::HTTP_3,
                port,
            )?))
        })
        .transpose()?;

    let svc = (
        AddInputExtensionLayer::new(Protocol::HTTPS),
        alt_svc.map(SetResponseHeaderLayer::overriding_typed),
    )
        .into_layer(self::service::load_https_app_service().await?);

    if let Some(endpoint) = h3_endpoint.clone() {
        // The TCP stack caps request bodies at the connection; QUIC has no
        // such layer, so cap them per request instead.
        let h3_server = HttpServer::new_http3(executor.clone())
            .service(RequestBodyLimitLayer::new(REQUEST_BODY_LIMIT).into_layer(svc.clone()));
        let local_addr = endpoint.local_addr().context("HTTP/3 endpoint address")?;
        let exec = executor.clone();
        executor.spawn_task(async move {
            tracing::info!("http/3 server ({local_addr}) up and running");
            endpoint.serve(exec, Arc::new(h3_server)).await;
        });
    }

    let http_server = HttpServer::auto(executor.clone()).service(svc);
    // Session resumption lets a returning device (often on a flaky mobile
    // connection) skip the full handshake. Tickets are stateless: the
    // server stores nothing, and their keys live only in this process, so
    // a restart or another Fly machine just falls back to a full handshake.
    // Certificates are still resolved per connection by the issuer, so
    // ACME renewals keep working with the shared TLS context this enables.
    let tcp_server = (
        BodyLimitLayer::request_only(REQUEST_BODY_LIMIT),
        HaProxyLayer::new().with_peek(true),
        TlsAcceptorLayer::new(tls_server_config).with_session_resumption(true),
    )
        .into_layer(http_server);

    let tcp_listener = TcpListener::bind_address(interface, executor).await?;

    guard.into_spawn_task_fn(async move |_guard| {
        tracing::info!("https server ({interface}) up and running");
        tcp_listener.serve(tcp_server).await;
    });

    Ok(h3_endpoint)
}

/// Bind QUIC on `interface` for HTTP/3, presenting the identity of `tls`
/// (the ACME issuer's certificates included) and offering only `h3`.
///
/// The endpoint runs on an executor without the shutdown guard: one that
/// carried it would close every connection as soon as shutdown starts,
/// before HTTP/3 could drain its requests.
async fn bind_http3(
    interface: SocketAddress,
    tls: &TlsServerConfig,
    mtu_upper_bound: Option<u16>,
) -> Result<Endpoint, BoxError> {
    let tls = tls
        .clone()
        .with_alpn([ApplicationProtocol::HTTP_3].into_iter().collect());
    let mut transport = TransportConfig::default();
    Http3Config::default()
        .configure_transport(&mut transport)
        .context("HTTP/3 transport limits")?;
    if let Some(upper_bound) = mtu_upper_bound {
        transport
            .set_mtu_discovery_config(MtuDiscoveryConfig::default().with_upper_bound(upper_bound));
    }
    let mut config = ServerConfig::try_from_rama_tls_with_provider(
        &tls,
        TlsOptions::default(),
        &BoringTlsProvider,
    )
    .context("QUIC TLS server config")?;
    config.set_transport_config(Arc::new(transport));
    Endpoint::build(Executor::new())
        .with_server_config(config)
        .bind_address(interface)
        .await
        .context("bind QUIC endpoint for HTTP/3")
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
