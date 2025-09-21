use clap::{Parser, command};
use std::{
    os,
    path::{Path, PathBuf},
    process::exit,
    time::Duration,
};
use tokio::{sync::oneshot, time::Instant};

use rama::{
    Context, Layer as _,
    error::{BoxError, ErrorContext as _, OpaqueError},
    graceful::{self, ShutdownGuard},
    http::{layer::trace::TraceLayer, server::HttpServer, service::web::WebService},
    net::{
        address::{Domain, SocketAddress},
        socket::Interface,
    },
    rt::Executor,
    tcp::server::TcpListener,
    telemetry::tracing::{self, instrument::WithSubscriber},
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
    bind: Interface,

    #[arg(long, default_value = "./legacy/static")]
    legacy_dir: PathBuf,
}

async fn run_server(cfg: Cli) -> Result<(), BoxError> {
    let shutdown = graceful::Shutdown::default();

    spawn_service_http(shutdown.guard(), cfg.bind, &cfg.legacy_dir).await?;

    shutdown.shutdown_with_limit(Duration::from_secs(3)).await?;
    Ok(())
}

#[allow(clippy::exit)]
async fn spawn_service_http(
    guard: ShutdownGuard,
    interface: Interface,
    legacy_dir: &Path,
) -> Result<(), BoxError> {
    let svc = self::service::load_http_service(legacy_dir).await;

    let http_server = HttpServer::auto(Executor::graceful(guard.clone())).service(svc);
    let tcp_listener = TcpListener::bind(interface.clone()).await?;

    guard.into_spawn_task_fn(async move |guard| {
        tracing::info!("http server ({interface}) up and running");
        tcp_listener.serve_graceful(guard, http_server).await;
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
