# syntax=docker/dockerfile:1
FROM rust:1-trixie AS builder

RUN apt-get update && \
    apt-get install --no-install-recommends -y cmake clang

WORKDIR /usr/src/app
COPY . .
# Will build and cache the binary and dependent crates in release mode
RUN --mount=type=cache,target=/usr/local/cargo,from=rust:latest,source=/usr/local/cargo \
    --mount=type=cache,target=target \
    cargo build --release && \
    mkdir -p ./bin && mv ./target/release/homework ./bin/homework

# Runtime image
FROM debian:trixie-slim

RUN apt-get update && \
    apt-get install --no-install-recommends -y ca-certificates


WORKDIR /app

# Get compiled binaries from builder's cargo install directory
COPY --from=builder /usr/src/app/bin/homework /app/homework

# What HTTP/3 on Fly needs before the app starts (a no-op elsewhere): socket
# buffers big enough for rama's QUIC endpoint, and an IP for the
# `fly-global-services` bind Fly routes UDP replies through.
COPY --chmod=0755 <<'EOF' /app/entrypoint
#!/bin/sh
set -eu
# Fly VMs cap socket buffers at 208 KiB; rama's QUIC endpoint asks for 7 MiB.
if [ -n "${FLY_APP_NAME:-}" ]; then
    for limit in rmem_max wmem_max; do
        echo 7340032 > "/proc/sys/net/core/$limit" || echo "entrypoint: cannot raise net.core.$limit" >&2
    done
fi
# UDP must be bound to fly-global-services for Fly to route replies; the app takes an IP.
for arg do
    shift
    case "$arg" in
        fly-global-services:*)
            global=$(getent hosts fly-global-services | awk '{ print $1; exit }')
            set -- "$@" "${global:?fly-global-services does not resolve}:${arg#*:}" ;;
        *) set -- "$@" "$arg" ;;
    esac
done
exec /app/homework "$@"
EOF

# Run the app
ENTRYPOINT ["/app/entrypoint"]
