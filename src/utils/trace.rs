// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::io::IsTerminal as _;

use rama::{
    error::{BoxError, ErrorContext as _},
    http::client::EasyHttpWebClient,
    net::client::pool::http::HttpPooledConnectorConfig,
    rt::Executor,
    telemetry::{
        opentelemetry::{
            KeyValue,
            collector::OtelExporter,
            sdk::{Resource, trace::SdkTracerProvider},
            trace::TracerProvider,
        },
        tracing::{
            self, layer,
            subscriber::{
                self, EnvFilter,
                filter::{Directive, LevelFilter},
                fmt,
                layer::SubscriberExt,
                util::SubscriberInitExt,
            },
        },
    },
};

pub fn init_tracing() {
    const DEFAULT_DIRECTIVE: LevelFilter = LevelFilter::INFO;

    if std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT").is_ok() {
        match init_structured(DEFAULT_DIRECTIVE) {
            Ok(()) => tracing::trace!("structured (OTEL) tracing init complete"),
            Err(err) => {
                init_default(DEFAULT_DIRECTIVE);
                tracing::warn!("structured (OTEL) tracing disabled: {err}");
            }
        }
    } else {
        init_default(DEFAULT_DIRECTIVE);
        tracing::trace!("default tracing init complete");
    }
}

fn init_default(default_directive: impl Into<Directive>) {
    subscriber::registry()
        .with(fmt::layer())
        .with(
            EnvFilter::builder()
                .with_default_directive(default_directive.into())
                .from_env_lossy(),
        )
        .init();
}

fn init_structured(default_directive: impl Into<Directive>) -> Result<(), BoxError> {
    let svc = EasyHttpWebClient::connector_builder()
        .with_default_transport_connector()
        .without_tls_proxy_support()
        .without_proxy_support()
        .with_tls_support_using_boringssl(None)
        .with_default_http_connector(Executor::default())
        .try_with_connection_pool(HttpPooledConnectorConfig::default())
        .context("build http exporter client service")?
        .build_client();
    let exporter = OtelExporter::from_env_http(svc).context("build OTLP HTTP span exporter")?;

    let provider = SdkTracerProvider::builder()
        .with_batch_exporter(exporter)
        .with_resource(
            Resource::builder()
                .with_attribute(KeyValue::new("service.name", "homework"))
                .build(),
        )
        .build();

    let tracer = provider.tracer("homework");
    let telemetry = layer().with_tracer(tracer);

    subscriber::registry()
        .with(telemetry)
        .with(
            subscriber::fmt::Layer::new()
                .with_ansi(std::io::stderr().is_terminal())
                .with_writer(std::io::stderr)
                .json()
                .flatten_event(true),
        )
        .with(
            EnvFilter::builder()
                .with_default_directive(default_directive.into())
                .from_env_lossy(),
        )
        .init();
    Ok(())
}
