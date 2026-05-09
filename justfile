set windows-shell := ["powershell.exe", "-NoLogo", "-ExecutionPolicy", "Bypass", "-Command"]

export RUSTFLAGS := "-D warnings"
export RUSTDOCFLAGS := "-D rustdoc::broken-intra-doc-links"
export RUST_LOG := "info,homework=debug,rama_http=debug,rama_http_core=info"

fmt *ARGS:
	cargo fmt --all {{ARGS}}

sort:
	@cargo install cargo-sort
	cargo sort --grouped

[unix]
_ensure-biome:
	@which biome >/dev/null 2>&1 || npm install -g @biomejs/biome

[windows]
_ensure-biome:
	@if (-not (Get-Command biome -ErrorAction SilentlyContinue)) { npm install -g @biomejs/biome }

# Auto-format JS and CSS (writes in place)
fmt-web:
	just _ensure-biome
	biome format --write src/service

# Lint JS and CSS (report only, no writes)
lint-web:
	just _ensure-biome
	biome lint src/service

# CI-style check: lint + format, no writes, warnings → errors
check-web:
	just _ensure-biome
	biome ci src/service

lint: fmt sort fmt-web

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

test-e2e *ARGS:
	cargo test --test e2e -- --ignored --test-threads=4 {{ARGS}}

# Lighthouse accessibility audit — requires the server to be running (`just run` in another terminal)
[unix]
lighthouse URL="http://localhost:8080":
	npx --yes lighthouse@12 {{URL}} \
		--only-categories=accessibility \
		--output=json \
		--chrome-flags="--headless=new" \
		--quiet \
		| python3 -c "import json,sys; a=json.load(sys.stdin)['categories']['accessibility']; print('score:', a['score'], '('+a['title']+')')"

[windows]
lighthouse URL="http://localhost:8080":
	$b = @( \
	    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", \
	    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", \
	    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" \
	) | Where-Object { Test-Path $_ } | Select-Object -First 1; \
	if (-not $b) { Write-Error 'No Chrome or Edge found'; exit 1 }; \
	$r = npx --yes lighthouse@12 {{URL}} --only-categories=accessibility --output=json "--chrome-path=$b" "--chrome-flags=--headless=new" --quiet 2>$null | Out-String | ConvertFrom-Json; \
	Write-Host "score: $($r.categories.accessibility.score) ($($r.categories.accessibility.title))"

qq: lint check clippy doc check-web

qa: qq test

qa-full: qa test-e2e

run *ARGS:
	cargo run -- \
	    --http 127.0.0.1:8080 \
		{{ARGS}}

watch-run *ARGS:
	cargo watch -x \
	    'run -- --http 127.0.0.1:8080 {{ARGS}}'

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
    @cargo install cargo-edit --locked
    cargo upgrade && cargo update

detect-unused-deps:
	@cargo install cargo-machete
	cargo machete --skip-target-dir

deploy:
    fly deploy

ssh:
    fly ssh console
