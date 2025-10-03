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

# Run the app
ENTRYPOINT ["/app/homework"]
