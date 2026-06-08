set windows-shell := ["powershell.exe", "-NoLogo", "-ExecutionPolicy", "Bypass", "-Command"]

export RUSTFLAGS := "-D warnings"
export RUSTDOCFLAGS := "-D rustdoc::broken-intra-doc-links"
export RUST_LOG := "info,homework=debug,rama_http=debug,rama_http_core=info"

fmt *ARGS:
	cargo fmt --all {{ARGS}}
	just fmt-web

sort:
	@cargo install cargo-sort
	cargo sort --grouped

sort-check:
	@cargo install cargo-sort
	cargo sort --grouped --check

# Auto-format JS and CSS (writes in place)
fmt-web:
	npx --yes @biomejs/biome format --write src/service

fmt-check:
	cargo fmt --all --check

# Lint JS and CSS (report only, no writes)
lint-web:
	npx --yes @biomejs/biome lint src/service

# CI-style check: lint + format, no writes, warnings → errors
check-web:
	npx --yes @biomejs/biome ci --error-on-warnings src/service

# Verify every .rs/.css/.js source file starts with the copyright header
[unix]
check-copyright:
	#!/usr/bin/env sh
	missing=$(grep -rL "Copyright (C) 2024-2026 Plabayo" src/ tests/ \
	    --include="*.rs" --include="*.css" --include="*.js" \
	    --exclude-dir=fixtures 2>/dev/null)
	if [ -n "$missing" ]; then
	    echo "Missing copyright header in:"
	    echo "$missing"
	    exit 1
	fi
	echo "All source files have copyright headers."

[windows]
check-copyright:
	@$missing = Get-ChildItem -Recurse -Include "*.rs","*.css","*.js" -Path "src","tests" | \
	    Where-Object { $_.FullName -notmatch "\\fixtures\\" } | \
	    Where-Object { (Get-Content $_.FullName -Raw -Encoding UTF8) -notmatch "Copyright \(C\) 2024-2026 Plabayo" }; \
	if ($missing) { \
	    Write-Host "Missing copyright header in:"; \
	    $missing | ForEach-Object { Write-Host $_.FullName }; \
	    exit 1 \
	} else { Write-Host "All source files have copyright headers." }

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

# Run pure-logic JavaScript unit tests (no browser required)
test-js:
	node --test tests/js/*.test.mjs

# Local run uses 4 threads for speed. CI uses 1 (see CI.yml) to avoid port
# conflicts when multiple browser tests start servers concurrently.
test-e2e *ARGS:
	cargo test --test e2e -- --ignored --test-threads=4 {{ARGS}}

# Mirror what CI runs: single-threaded so port allocation and browser-driver
# startup never race. Use this before pushing if a `just test-e2e` pass on
# `--test-threads=4` looks fine — flakiness that only appears in CI almost
# always reproduces here.
test-e2e-ci *ARGS:
	cargo test --test e2e -- --ignored --test-threads=1 {{ARGS}}

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

# build, boot the server, and assert the
# Lighthouse a11y score is >= 0.9 on the home page and a representative
# exercise — exactly what the `lighthouse` CI job enforces. Unlike the
# `lighthouse` recipe above it manages the server itself, so it runs
# unattended as part of `qa-full`.
[unix]
lighthouse-ci:
	#!/usr/bin/env sh
	set -eu
	cargo build
	./target/debug/homework --http 127.0.0.1:8080 &
	pid=$!
	trap 'kill "$pid" 2>/dev/null || true' EXIT
	for _ in $(seq 1 20); do
	    if curl -sf http://127.0.0.1:8080/ >/dev/null 2>&1; then break; fi
	    sleep 0.5
	done
	for path in / /1/multiplications; do
	    score=$(npx --yes lighthouse@12 "http://127.0.0.1:8080${path}" \
	        --only-categories=accessibility --output=json \
	        --chrome-flags="--headless=new" --quiet 2>/dev/null \
	        | python3 -c "import json,sys; print(json.load(sys.stdin)['categories']['accessibility']['score'])")
	    echo "a11y ${path}: ${score}"
	    python3 -c "import sys; sys.exit(0 if float('${score}') >= 0.9 else 1)"
	done
	echo "Lighthouse accessibility >= 0.9 on / and /1/multiplications"

# `qq`/`qa`/`qa-full` mirror CI: they *check* formatting and dependency
# order — they never rewrite files. Run `just lint` first to auto-fix.
# This preserves the invariant that a green `just qa-full` means green CI.
qq: fmt-check sort-check check clippy doc check-web check-copyright

qa: qq test test-js

# Full pre-push gate. Uses CI's single-threaded e2e cadence and the
# Lighthouse a11y audit so it covers every gate CI runs before deploy.
[unix]
qa-full: qa test-e2e-ci lighthouse-ci

# Windows skips the self-managed Lighthouse gate (run `just lighthouse`
# against a `just run` server instead); everything else mirrors CI.
[windows]
qa-full: qa test-e2e-ci

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
