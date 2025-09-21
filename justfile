set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

export RUSTFLAGS := "-D warnings"
export RUSTDOCFLAGS := "-D rustdoc::broken-intra-doc-links"
export RUST_LOG := "info,homework=debug,rama_http=debug,rama_http_core=info"

fmt *ARGS:
	cargo fmt --all {{ARGS}}

sort:
	@cargo install cargo-sort
	cargo sort --grouped

lint: fmt sort

check:
	cargo check --all-targets --all-features

clippy:
	cargo clippy --all-targets --all-features

clippy-fix *ARGS:
	cargo clippy --all-targets --all-features --fix {{ARGS}}

doc:
	cargo doc --all-features --no-deps

test:
	cargo test --all-features

qq: lint check clippy doc

qa: qq test

run *ARGS:
	cargo run -- \
	    --bind 127.0.0.1:8080 --legacy-dir ./legacy/static {{ARGS}}

watch-run *ARGS:
	cargo watch -x \
	    'run -- --bind 127.0.0.1:8080 --legacy-dir ./legacy/static {{ARGS}}'

docker-build:
    docker build -t local/homework .

docker-run *ARGS:
    docker run \
        -p 8080:8080 \
        --rm local/homework:latest {{ARGS}}

docker *ARGS:
    just docker-build
    just docker-run {{ARGS}}

update-deps:
    cargo upgrade
    cargo upgrades
    cargo update

detect-unused-deps:
	@cargo install cargo-machete
	cargo machete --skip-target-dir

deploy:
    fly deploy

ssh:
    fly ssh console
