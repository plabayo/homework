use clap::{Parser, command};
use std::time::Duration;

use rama::{
    Layer as _,
    error::{BoxError, ErrorContext as _},
    graceful::{self, ShutdownGuard},
    http::{server::HttpServer, tls::CertIssuerHttpClient},
    net::{
        socket::Interface,
        tls::server::{CacheKind, ServerAuth, ServerCertIssuerData, ServerConfig},
    },
    proxy::haproxy::server::HaProxyLayer,
    rt::Executor,
    tcp::server::TcpListener,
    telemetry::tracing,
    tls::boring::server::{TlsAcceptorData, TlsAcceptorLayer},
};

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
    /// the HTTP interface to bind to
    #[arg(long, default_value_t = Interface::default_ipv4(8080))]
    http: Interface,

    /// the HTTP interface to bind to
    #[arg(long)]
    https: Option<Interface>,
}

async fn run_server(cfg: Cli) -> Result<(), BoxError> {
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
    interface: Interface,
    https_enabled: bool,
) -> Result<(), BoxError> {
    let svc = self::service::load_https_service(https_enabled).await?;

    let http_server = HttpServer::auto(Executor::graceful(guard.clone())).service(svc);
    let tcp_server = HaProxyLayer::new().with_peek(true).into_layer(http_server);
    let tcp_listener = TcpListener::bind(interface.clone()).await?;

    guard.into_spawn_task_fn(async move |guard| {
        tracing::info!("http server ({interface}) up and running");
        tcp_listener.serve_graceful(guard, tcp_server).await;
    });

    Ok(())
}

async fn spawn_service_https(guard: ShutdownGuard, interface: Interface) -> Result<(), BoxError> {
    let issuer =
        CertIssuerHttpClient::try_from_env().context("create CertIssuerHttpClient from env")?;

    let executor = Executor::graceful(guard.clone());

    issuer.prefetch_certs_in_background(&executor);

    let tls_server_config = ServerConfig::new(ServerAuth::CertIssuer(ServerCertIssuerData {
        kind: issuer.into(),
        cache_kind: CacheKind::default(),
    }));

    let acceptor_data =
        TlsAcceptorData::try_from(tls_server_config).context("create acceptor data")?;

    let svc = self::service::load_https_service(true).await?;

    let http_server = HttpServer::auto(executor).service(svc);
    let tcp_server = (
        HaProxyLayer::new().with_peek(true),
        TlsAcceptorLayer::new(acceptor_data),
    )
        .into_layer(http_server);

    let tcp_listener = TcpListener::bind(interface.clone()).await?;

    guard.into_spawn_task_fn(async move |guard| {
        tracing::info!("http server ({interface}) up and running");
        tcp_listener.serve_graceful(guard, tcp_server).await;
    });

    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    utils::trace::init_tracing();

    let cli = Cli::parse();

    #[allow(clippy::exit)]
    match run_server(cli).await {
        Ok(()) => Ok(()),
        Err(err) => {
            eprintln!("🚩 exit with error: {err}");
            std::process::exit(1);
        }
    }
}
