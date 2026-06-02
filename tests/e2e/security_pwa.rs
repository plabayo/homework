// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// Regression tests for the security + PWA fixes documented in the
// audit: PWA icons present, iOS standalone meta tags, no permissive CORS,
// digital-clock validation a11y, and leave-guard dialog ARIA + iOS
// <dialog>-fallback behaviour. See the NOTE further down for why the
// 64 KiB body limit isn't e2e-tested.

use super::helpers::{click, inject_deck, set_checkbox, set_input_value, wait_for_css};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver};

/// Run a `fetch(url)` in the page context and return (status, content-type,
/// Access-Control-Allow-Origin) so we can assert against the response without
/// pulling in a separate HTTP client.
///
/// WebDriver's async script API requires the script to call the callback
/// passed as the final argument — `return` doesn't resolve the promise.
async fn fetch_meta(driver: &WebDriver, url: &str) -> TestResult<(u16, String, String)> {
    let script = format!(
        r#"
        const cb = arguments[arguments.length - 1];
        fetch({url:?}, {{ cache: "no-store" }}).then(res => {{
            cb([res.status, res.headers.get("content-type") || "", res.headers.get("access-control-allow-origin") || ""]);
        }}).catch(err => {{
            cb([0, "", String(err && err.message || err)]);
        }});
        "#,
        url = url,
    );
    let result = driver.execute_async(script, vec![]).await?.json().clone();
    let arr = result.as_array().ok_or("fetch_meta: expected an array")?;
    let status = arr[0].as_u64().ok_or("status")? as u16;
    let ct = arr[1].as_str().unwrap_or("").to_owned();
    let acao = arr[2].as_str().unwrap_or("").to_owned();
    Ok((status, ct, acao))
}

/// Fetch a URL and return (status, body, content-security-policy header).
/// Used by the CSP regression tests below.
async fn fetch_csp(driver: &WebDriver, url: &str) -> TestResult<(u16, String, String)> {
    let script = format!(
        r#"
        const cb = arguments[arguments.length - 1];
        fetch({url:?}, {{ cache: "no-store" }}).then(async res => {{
            const body = await res.text();
            cb([res.status, body, res.headers.get("content-security-policy") || ""]);
        }}).catch(err => {{
            cb([0, "", String(err && err.message || err)]);
        }});
        "#,
        url = url,
    );
    let result = driver.execute_async(script, vec![]).await?.json().clone();
    let arr = result.as_array().ok_or("fetch_csp: expected an array")?;
    let status = arr[0].as_u64().ok_or("status")? as u16;
    let body = arr[1].as_str().unwrap_or("").to_owned();
    let csp = arr[2].as_str().unwrap_or("").to_owned();
    Ok((status, body, csp))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn pwa_icons_are_served() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    for path in ["/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"] {
        let (status, ct, _) = fetch_meta(driver, &app.url(path)).await?;
        assert_eq!(status, 200, "expected 200 for {path}");
        assert!(
            ct.starts_with("image/png"),
            "expected image/png content-type for {path}, got {ct:?}"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn ios_pwa_meta_tags_present() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    // The four ingredients of a working iOS Add-to-Home-Screen.
    driver
        .find(By::Css(r#"link[rel="apple-touch-icon"]"#))
        .await?;
    driver
        .find(By::Css(
            r#"meta[name="apple-mobile-web-app-capable"][content="yes"]"#,
        ))
        .await?;
    driver
        .find(By::Css(r#"meta[name="apple-mobile-web-app-title"]"#))
        .await?;
    driver.find(By::Css(r#"link[rel="manifest"]"#)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn no_permissive_cors_on_assets_or_pages() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    // The previous CorsLayer::permissive() emitted `Access-Control-Allow-Origin: *`
    // on every response, including HTML pages and the manifest. We removed it.
    // Verify by checking the header is absent / empty.
    for path in [
        "/",
        "/homework.js",
        "/theme.css",
        "/manifest.webmanifest",
        "/icon-192.png",
    ] {
        let (status, _, acao) = fetch_meta(driver, &app.url(path)).await?;
        assert_eq!(status, 200, "{path} should serve 200");
        assert_eq!(
            acao, "",
            "{path} should not advertise Access-Control-Allow-Origin (was {acao:?})"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

// NOTE on the request-body limit (audit H2): `BodyLimitLayer` in rama
// communicates the limit to inner services via Extensions; it only
// rejects when something downstream actually reads the body. Every
// route in this app is GET-only and ignores the body, so the limit is
// genuinely defence-in-depth — there's no observable path to e2e-test
// it without adding a body-reading handler purely for the test (which
// would itself be the kind of attack surface the limit defends against).
// Verification: the layer is mounted in main.rs:spawn_service_http and
// spawn_service_https; presence is enforced by code review.

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn digital_clock_invalid_time_sets_aria_invalid() -> TestResult<()> {
    // Regression for the audit's H6: validation feedback must be linked to the
    // input via aria-invalid / aria-describedby so screen-reader users hear it.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/digital-clock")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    // Force fill-in mode and "words → digital" direction so the inputs render.
    set_input_value(driver, "#num-exercises", "1").await?;
    // Direction checkboxes: only "words-to-digital".
    for (sel, on) in [
        (r#"input[name="dir"][value="words-to-digital"]"#, true),
        (r#"input[name="dir"][value="digital-to-words"]"#, false),
    ] {
        set_checkbox(driver, sel, on).await?;
    }
    set_checkbox(driver, r#"input[name="answer"][value="fill"]"#, true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#answer-h", Duration::from_secs(10)).await?;

    // Submit an out-of-range time.
    set_input_value(driver, "#answer-h", "99").await?;
    set_input_value(driver, "#answer-m", "0").await?;
    click(driver, "#button-check").await?;

    // After submit, the hour input gains aria-invalid="true" and points at
    // #exercise-feedback via aria-describedby.
    let hh = driver.find(By::Css("#answer-h")).await?;
    let aria_invalid = hh.attr("aria-invalid").await?.unwrap_or_default();
    assert_eq!(
        aria_invalid, "true",
        "expected aria-invalid=true on #answer-h"
    );
    let describedby = hh.attr("aria-describedby").await?.unwrap_or_default();
    assert!(
        describedby
            .split_whitespace()
            .any(|t| t == "exercise-feedback"),
        "expected aria-describedby to reference exercise-feedback, was {describedby:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn leave_guard_falls_back_to_confirm_when_dialog_unsupported() -> TestResult<()> {
    // Regression for iOS <15.4: browsers without <dialog>.showModal must
    // fall back to window.confirm rather than silently swallowing the
    // prompt. We simulate the missing API by deleting showModal from the
    // HTMLDialogElement prototype before the leave guard fires.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    click(driver, "a[data-exercise-id='multiplications']").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    // Stub out showModal and record every window.confirm() invocation.
    driver
        .execute(
            "delete HTMLDialogElement.prototype.showModal; \
             window.__confirmCalls = []; \
             window.confirm = function(msg) { window.__confirmCalls.push(msg); return false; };",
            vec![],
        )
        .await?;

    // Make some progress so the leave guard becomes active.
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    set_input_value(driver, "#answer", "999").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;

    // Trigger the leave guard via the home link.
    click(driver, ".home-link").await?;

    // Give the fallback a moment to run, then read back the recorded calls.
    tokio::time::sleep(Duration::from_millis(300)).await;
    let calls = driver
        .execute(
            "return JSON.stringify(window.__confirmCalls || []);",
            vec![],
        )
        .await?;
    let json: String = calls.json().as_str().unwrap_or("[]").to_owned();
    assert!(
        json.contains("Stop oefening"),
        "expected window.confirm() to be called with the leave label, got {json:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn leave_guard_dialog_has_aria_labelledby() -> TestResult<()> {
    // Regression: dialog must be programmatically associated with its heading
    // for screen-reader users to know what they're being asked.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    click(driver, "a[data-exercise-id='multiplications']").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;

    // Make progress (wrong + skip) so the leave guard activates.
    set_input_value(driver, "#answer", "999").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;

    click(driver, ".home-link").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;

    let dlg = driver.find(By::Css("dialog.leave-guard-dialog")).await?;
    let labelledby = dlg.attr("aria-labelledby").await?.unwrap_or_default();
    assert!(
        !labelledby.is_empty(),
        "expected aria-labelledby on leave-guard dialog"
    );
    // Read the heading text via `textContent` rather than WebElement::text().
    // WebDriver's `.text()` reads from the rendered layout tree, which is
    // unreliable for elements painted in the top layer by `dialog.showModal()`
    // — chromedriver returns empty even when the markup is correct. Screen
    // readers compute the accessible name from `textContent` for
    // aria-labelledby references, so checking textContent is the more
    // faithful assertion anyway.
    let heading_text: String = driver
        .execute(
            "return document.getElementById(arguments[0])?.textContent ?? \"\";",
            vec![serde_json::Value::String(labelledby.clone())],
        )
        .await?
        .json()
        .as_str()
        .map(str::to_owned)
        .unwrap_or_default();
    assert!(
        !heading_text.trim().is_empty(),
        "aria-labelledby target should hold heading text (got {heading_text:?})"
    );

    driver.clone().quit().await?;
    Ok(())
}

// ---- Content-Security-Policy regression tests ----
//
// The audit's Wave 5 dropped `'unsafe-inline'` from script-src and
// style-src in favour of per-page SHA-256 hashes (computed at build time
// by `build.rs`, attached to the response in `layout::build_csp`). These
// tests lock that shape so a future change can't silently re-introduce
// `'unsafe-inline'` or add a new inline asset without hashing it.
//
// They don't pin exact hash values (those rotate with content) — only
// the structural invariants.

/// Every HTML page response advertises a CSP that:
///   * starts with `default-src 'self'`
///   * names `'self'` and at least one `'sha256-…'` source in `script-src`
///   * names `'self'` in `style-src` (and a hash if the page has inline CSS)
///   * does NOT include `'unsafe-inline'` *anywhere*
///
/// Static-asset routes that don't go through `layout::page` get the
/// deny-all fallback set by the middleware: `default-src 'none'`.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn csp_shape_locked_no_unsafe_inline() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    // HTML pages: per-page CSP with hashes.
    for path in [
        "/",
        "/about",
        "/privacy",
        "/2/clock",
        "/1/multiplications",
        "/extra/flashcards",
    ] {
        let (status, _body, csp) = fetch_csp(driver, &app.url(path)).await?;
        assert_eq!(status, 200, "{path} should serve 200");
        assert!(!csp.is_empty(), "{path} should set a CSP header");
        assert!(
            csp.contains("default-src 'self'"),
            "{path} CSP should pin default-src 'self', got {csp:?}"
        );
        assert!(
            !csp.contains("'unsafe-inline'"),
            "{path} CSP must not contain 'unsafe-inline' (any directive), got {csp:?}"
        );
        assert!(
            !csp.contains("'unsafe-eval'"),
            "{path} CSP must not contain 'unsafe-eval', got {csp:?}"
        );
        // script-src must whitelist at least one SHA-256 source (the
        // always-on theme-init script + importmap give us two even on
        // the otherwise-inline-free home page).
        let script_src = directive(&csp, "script-src").ok_or("missing script-src")?;
        assert!(
            script_src.contains("'self'"),
            "{path} script-src should include 'self', got {script_src:?}"
        );
        assert!(
            script_src.contains("'sha256-"),
            "{path} script-src should whitelist at least one inline by hash, got {script_src:?}"
        );
        // `'inline-speculation-rules'` is added unconditionally by
        // `layout::build_csp` so any page can grow a `<script type="speculationrules">`
        // block (home.rs already does). Drift would silently disable
        // pre-rendering — assert it's present on every HTML route so we
        // catch a regression that would otherwise only show up as a
        // performance loss.
        assert!(
            script_src.contains("'inline-speculation-rules'"),
            "{path} script-src must keep 'inline-speculation-rules' so speculationrules \
             blocks can be added without revisiting CSP; got {script_src:?}"
        );
        // style-src always names 'self'; the hash list is empty for pages
        // without inline CSS (home, about, offline) and non-empty for
        // exercise pages.
        let style_src = directive(&csp, "style-src").ok_or("missing style-src")?;
        assert!(
            style_src.contains("'self'"),
            "{path} style-src should include 'self', got {style_src:?}"
        );
        assert!(
            !directive_contains_token(&csp, "style-src-attr", "'unsafe-inline'"),
            "{path} CSP must not include style-src-attr 'unsafe-inline' (Wave 5 dropped it), \
             got {csp:?}"
        );
    }

    // Static / discovery routes: deny-all fallback.
    for path in ["/robots.txt", "/sitemap.xml", "/.well-known/security.txt"] {
        let (status, _body, csp) = fetch_csp(driver, &app.url(path)).await?;
        assert_eq!(status, 200, "{path} should serve 200");
        assert!(
            csp.contains("default-src 'none'"),
            "{path} CSP should be the deny-all fallback (default-src 'none'), got {csp:?}"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

/// Exercise pages that ship per-page inline CSS (`STYLE` declared via
/// `inline_style!` in the handler) must hash that block in `style-src`.
/// Catches the case where someone adds new inline `<style>` content
/// without routing it through `inline_style!` — the page would render
/// but the browser would block the style with no human noticing in code
/// review.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn csp_exercise_pages_whitelist_inline_style_by_hash() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    for path in [
        "/1/mathbox",
        "/1/multiplications",
        "/1/thermometer",
        "/2/clock",
        "/2/digital-clock",
        "/2/fractions",
        "/2/percentages",
        "/extra/flashcards",
    ] {
        let (_status, _body, csp) = fetch_csp(driver, &app.url(path)).await?;
        let style_src = directive(&csp, "style-src").ok_or("missing style-src")?;
        assert!(
            style_src.contains("'sha256-"),
            "exercise page {path} ships an inline <style>, so style-src must include its \
             SHA-256 hash. Got {style_src:?}"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

/// Rendered HTML for every public page must contain zero `style="…"`
/// inline attributes. Wave 5 migrated those to CSS classes or CSSOM
/// property access; reintroducing one would be silently blocked by the
/// per-page CSP (since `style-src-attr` is no longer permissive).
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn rendered_html_has_no_inline_style_attributes() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    for path in [
        "/",
        "/about",
        "/privacy",
        "/offline",
        "/1/mathbox",
        "/2/clock",
        "/2/digital-clock",
        "/2/fractions",
        "/extra/flashcards",
    ] {
        let (_status, body, _csp) = fetch_csp(driver, &app.url(path)).await?;
        // Strip `<script>…</script>` and `<style>…</style>` blocks before
        // checking — their bodies are JS / CSS source, not HTML, and our
        // own JS code legitimately contains substrings like `style="…"`
        // in comments / template literals that mention CSP migrations.
        let outside = strip_script_and_style(&body);
        let bad_double = outside.contains("style=\"");
        let bad_single = outside.contains("style='");
        assert!(
            !bad_double && !bad_single,
            "rendered HTML for {path} contains an inline style= attribute \
             outside any <script>/<style> block, which the per-page CSP would \
             block. Migrate to a CSS class or CSSOM property access."
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

/// Extract a single CSP directive (everything after `<name> ` up to the
/// next `;` or end-of-string). Returns `None` if the directive isn't set.
fn directive<'a>(csp: &'a str, name: &str) -> Option<&'a str> {
    for chunk in csp.split(';') {
        let chunk = chunk.trim();
        if let Some(rest) = chunk.strip_prefix(name)
            && (rest.is_empty() || rest.starts_with(' '))
        {
            return Some(rest.trim_start());
        }
    }
    None
}

/// True iff `csp` has `name` set AND that directive's value contains
/// `token`. False if the directive isn't present at all.
fn directive_contains_token(csp: &str, name: &str, token: &str) -> bool {
    directive(csp, name).is_some_and(|v| v.contains(token))
}

/// Remove every `<script …>…</script>` and `<style …>…</style>` block
/// from `html` and return the remainder. Used by the
/// `rendered_html_has_no_inline_style_attributes` test so the scan only
/// inspects real HTML markup, not the JS/CSS source we inline (whose
/// comments and template literals may legitimately contain the substring
/// `style="` while saying nothing about live attributes). Permissive on
/// purpose — case-insensitive tag match, longest-match closing tag.
fn strip_script_and_style(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let lower = html.to_ascii_lowercase();
    let mut i = 0;
    while i < html.len() {
        let next_open = ["<script", "<style"]
            .iter()
            .filter_map(|tag| lower[i..].find(tag).map(|off| (i + off, tag.len())))
            .min_by_key(|(pos, _)| *pos);
        let Some((open_pos, tag_len)) = next_open else {
            out.push_str(&html[i..]);
            break;
        };
        out.push_str(&html[i..open_pos]);
        // Skip past the opening tag's `>`.
        let after_open = open_pos + tag_len;
        let Some(gt_offset) = lower[after_open..].find('>') else {
            break;
        };
        let body_start = after_open + gt_offset + 1;
        // Find the matching closing tag (case-insensitive).
        let close_tag = if lower[open_pos..].starts_with("<script") {
            "</script"
        } else {
            "</style"
        };
        let Some(close_offset) = lower[body_start..].find(close_tag) else {
            break;
        };
        let close_pos = body_start + close_offset;
        // Skip past the closing tag's `>`.
        let Some(close_gt) = lower[close_pos..].find('>') else {
            break;
        };
        i = close_pos + close_gt + 1;
    }
    out
}

// ---- Accessibility regression tests (audit Wave 2) ----

/// Flashcards' `.deck-select-btn` previously shipped
/// `:focus-visible { outline: none }` with no replacement — keyboard users
/// landing on a deck button couldn't see where focus was. Wave 2 swapped
/// in an inset accent outline. Lock that in so future CSS edits can't
/// silently re-introduce the `outline: none` regression.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_deck_button_has_visible_focus_ring() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck(
        driver,
        "test-focus-ring",
        "Focus ring regression",
        r#"[{"front":"aap"}]"#,
    )
    .await?;
    driver.refresh().await?;
    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-focus-ring'] .deck-select-btn",
        Duration::from_secs(10),
    )
    .await?;

    // Focus the deck button programmatically and read back the computed
    // outline. WebDriver sessions don't have a preceding mouse event, so
    // `.focus()` is treated as keyboard-style and matches `:focus-visible`
    // in Chrome / Firefox / Edge. (Test will fail loudly if a future
    // browser version changes that heuristic — we want to know.)
    let result = driver
        .execute(
            r#"
            const btn = document.querySelector(
                ".deck-item[data-deck-id='test-focus-ring'] .deck-select-btn"
            );
            btn.focus();
            const cs = getComputedStyle(btn);
            return {
                matchesFocusVisible: btn.matches(":focus-visible"),
                outlineWidth: cs.outlineWidth,
                outlineStyle: cs.outlineStyle,
                outlineColor: cs.outlineColor,
            };
            "#,
            vec![],
        )
        .await?;
    let val = result.json();
    let matches = val
        .get("matchesFocusVisible")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let width = val
        .get("outlineWidth")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let style = val
        .get("outlineStyle")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    assert!(
        matches,
        "expected .deck-select-btn to match :focus-visible after .focus(); \
         if this stops working in a future browser, switch the test to a TAB-key \
         interaction. Got: {val:?}"
    );
    // Parse the leading number out of e.g. "3px".
    let width_px: f64 = width.trim_end_matches("px").parse().unwrap_or(0.0);
    assert!(
        width_px >= 2.0,
        "expected a visible outline of at least 2px on focused .deck-select-btn, \
         got outline-width={width:?}, outline-style={style:?}. \
         Did someone re-add `outline: none` to .deck-select-btn:focus-visible?"
    );
    assert_ne!(
        style, "none",
        "outline-style on focused .deck-select-btn must not be 'none' \
         (was {style:?}). Did someone re-add `outline: none`?"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// Every `<img>` element emitted from any frontend JS source under
/// `src/service/` must carry an explicit `alt` attribute — even if empty
/// (decorative). Pure source-level invariant, not a runtime check: we
/// can't reliably render every `<img>` code path in e2e (the active-play
/// image-card path requires Wikimedia API access), so we lock the source
/// pattern instead. Catches future regressions like
/// `'<img src="' + url + '">'` (no `alt=`) before the patch lands.
#[test]
#[allow(
    clippy::expect_used,
    reason = "test code — surfaces walk failure clearly on regression"
)]
fn every_img_in_service_js_has_alt_attribute() {
    let root = std::path::Path::new("src/service");
    let mut violations = Vec::new();
    walk_js(root, &mut violations).expect("walk src/service for .js files");
    assert!(
        violations.is_empty(),
        "found <img> emission(s) without an `alt=` attribute. \
         Decorative images: use `alt=\"\"`. Meaningful images: \
         use a short non-spoiling description.\n\n{}",
        violations.join("\n"),
    );
}

fn walk_js(dir: &std::path::Path, out: &mut Vec<String>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk_js(&path, out)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("js") {
            scan_js_for_imgs_without_alt(&path, out)?;
        }
    }
    Ok(())
}

fn scan_js_for_imgs_without_alt(
    path: &std::path::Path,
    out: &mut Vec<String>,
) -> std::io::Result<()> {
    let content = std::fs::read_to_string(path)?;
    for (line_idx, line) in content.lines().enumerate() {
        // Skip JS comments — `// <img …>` inside a comment isn't a real
        // emission. Crude but sufficient for this codebase (no block
        // comments embed `<img`).
        let stripped = line.split("//").next().unwrap_or(line);
        let mut cursor = 0;
        while let Some(off) = stripped[cursor..].find("<img") {
            let tag_start = cursor + off;
            // Skip past `<img` itself, then scan until the tag's `>`.
            let after_open = tag_start + 4;
            let tag_end = stripped[after_open..]
                .find('>')
                .map(|e| after_open + e)
                .unwrap_or(stripped.len());
            let tag = &stripped[tag_start..tag_end];
            if !tag.contains("alt=") {
                out.push(format!(
                    "{}:{}: {}",
                    path.display(),
                    line_idx + 1,
                    line.trim()
                ));
            }
            cursor = after_open;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Wave 4 — manifest tightening, JSON-LD, breadcrumbs
// ---------------------------------------------------------------------------

/// Locks in the [W3C manifest spec](https://www.w3.org/TR/appmanifest/) keys
/// every install-prompt-ready PWA wants. Catches three regressions: the
/// "any maskable" anti-pattern slipping back in (would crop badly on
/// Android adaptive icons), losing the install-identity stability
/// (`id`), or losing the launcher classification (`categories`).
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn manifest_advertises_required_pwa_fields() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;

    let (status, body, _csp) = fetch_csp(driver, &app.url("/manifest.webmanifest")).await?;
    assert_eq!(status, 200, "/manifest.webmanifest must serve 200");

    let manifest: serde_json::Value = serde_json::from_str(&body)
        .map_err(|e| format!("/manifest.webmanifest must parse as JSON: {e}"))?;
    let obj = manifest
        .as_object()
        .ok_or("manifest top-level must be a JSON object")?;

    for required in [
        "id",
        "name",
        "short_name",
        "start_url",
        "scope",
        "display",
        "lang",
        "dir",
        "theme_color",
        "background_color",
        "categories",
        "icons",
    ] {
        assert!(
            obj.contains_key(required),
            "manifest missing required key {required:?}; got {body}"
        );
    }
    assert_eq!(obj["id"], "/", "manifest id must pin install identity to /");
    assert_eq!(obj["lang"], "nl-BE", "manifest lang must be nl-BE");
    assert_eq!(obj["dir"], "ltr", "manifest dir must be explicit ltr");

    let categories = obj["categories"]
        .as_array()
        .ok_or("manifest `categories` must be a JSON array")?;
    let cat_strs: Vec<&str> = categories.iter().filter_map(|c| c.as_str()).collect();
    assert!(
        cat_strs.contains(&"education"),
        "manifest categories must include 'education', got {cat_strs:?}"
    );

    let icons = obj["icons"]
        .as_array()
        .ok_or("manifest `icons` must be a JSON array")?;
    assert!(!icons.is_empty(), "manifest must declare at least one icon");
    for (i, icon) in icons.iter().enumerate() {
        let purpose = icon["purpose"]
            .as_str()
            .unwrap_or_else(|| panic!("icon {i} missing purpose: {icon}"));
        // The "any maskable" combo is the anti-pattern Wave 4 dropped:
        // one icon design can't be both unmodified AND mask-safe without
        // looking compromised in one of the two contexts.
        assert!(
            !purpose.split_whitespace().any(|p| p == "maskable")
                || purpose.split_whitespace().all(|p| p == "maskable"),
            "icon {i} mixes maskable with another purpose ({purpose:?}); split into separate entries"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

/// JSON-LD structured data: site-wide (`WebSite` + `EducationalOrganization`)
/// on every HTML page, plus per-exercise (`LearningResource` + `BreadcrumbList`)
/// on exercise routes. Asserts the bodies parse as valid JSON and carry
/// the expected schema.org `@type` markers — catches a missing inline,
/// truncated body, or wrong content-type.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn json_ld_is_present_and_well_formed() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    // Every HTML page must carry the always-on site-wide block.
    for path in ["/", "/about", "/privacy", "/1/multiplications", "/2/clock"] {
        driver.goto(app.url(path)).await?;
        wait_for_css(driver, "h1", Duration::from_secs(10)).await?;
        let bodies = ld_json_bodies(driver).await?;
        assert!(
            !bodies.is_empty(),
            "{path} must include at least one <script type=\"application/ld+json\"> block"
        );
        let types: Vec<String> = bodies
            .iter()
            .filter_map(|b| serde_json::from_str::<serde_json::Value>(b).ok())
            .flat_map(collect_types)
            .collect();
        assert!(
            types.iter().any(|t| t == "WebSite"),
            "{path} must include a schema.org WebSite entity, got types {types:?}"
        );
        assert!(
            types.iter().any(|t| t == "EducationalOrganization"),
            "{path} must include a schema.org EducationalOrganization entity, got types {types:?}"
        );
    }

    // Exercise pages must additionally carry LearningResource + BreadcrumbList.
    for path in ["/1/multiplications", "/2/clock", "/extra/flashcards"] {
        driver.goto(app.url(path)).await?;
        wait_for_css(driver, "h1", Duration::from_secs(10)).await?;
        let bodies = ld_json_bodies(driver).await?;
        let types: Vec<String> = bodies
            .iter()
            .filter_map(|b| serde_json::from_str::<serde_json::Value>(b).ok())
            .flat_map(collect_types)
            .collect();
        assert!(
            types.iter().any(|t| t == "LearningResource"),
            "{path} must include LearningResource JSON-LD, got types {types:?}"
        );
        assert!(
            types.iter().any(|t| t == "BreadcrumbList"),
            "{path} must include BreadcrumbList JSON-LD, got types {types:?}"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}

/// Visible breadcrumb on every exercise page: 🏠 home › Niveau X ›
/// {exercise label}. Three items, only the last has `aria-current="page"`,
/// the middle link points at the matching `#niveau-X` anchor on home.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn exercise_pages_render_visible_breadcrumb() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    // (path, expected niveau anchor, expected exercise label).
    for (path, niveau_anchor, leaf) in [
        ("/2/clock", "/#niveau-2", "analoge klok"),
        ("/1/multiplications", "/#niveau-1", "maaltafels"),
        ("/extra/flashcards", "/#niveau-10", "flitskaarten"),
    ] {
        driver.goto(app.url(path)).await?;
        wait_for_css(driver, "nav.breadcrumb", Duration::from_secs(10)).await?;

        let items = driver.find_all(By::Css("nav.breadcrumb ol > li")).await?;
        assert_eq!(items.len(), 3, "{path} breadcrumb must have 3 items");

        // Middle item links to the home-page niveau anchor.
        let middle_href = driver
            .find(By::Css("nav.breadcrumb ol > li:nth-child(2) > a[href]"))
            .await?
            .attr("href")
            .await?
            .unwrap_or_default();
        assert_eq!(
            middle_href, niveau_anchor,
            "{path} breadcrumb middle item must link to {niveau_anchor}"
        );

        // Leaf is aria-current="page" and matches the exercise label.
        let leaf_text = driver
            .find(By::Css("nav.breadcrumb ol > li[aria-current='page']"))
            .await?
            .text()
            .await?;
        assert_eq!(
            leaf_text.trim(),
            leaf,
            "{path} breadcrumb leaf must be the exercise label"
        );
    }

    // Also the home-page anchors the breadcrumbs link into.
    driver.goto(app.url("/")).await?;
    for anchor in ["niveau-1", "niveau-2", "niveau-10"] {
        wait_for_css(driver, &format!("h2#{anchor}"), Duration::from_secs(10)).await?;
    }

    driver.clone().quit().await?;
    Ok(())
}

/// `<script type="importmap">` must appear in the document *before* any
/// module loading is triggered — `<link rel="modulepreload">`,
/// `<script type="module" src=...>`, or inline `<script type="module">`.
/// Once the parser moves past the "before import maps" phase, spec-strict
/// browsers (Firefox) reject any later importmap and bare specifiers
/// (`import x from "@homework"`) fail with a generic-looking type error.
/// Chrome is more lenient — so this ordering bug used to slip past CI on
/// Chromium-only e2e runs. The byte-position check below catches it on
/// every page that ships a `modulepreload` link.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn importmap_precedes_any_module_loading() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    for path in ["/", "/about", "/privacy", "/1/mathbox", "/extra/flashcards"] {
        let (_status, body, _csp) = fetch_csp(driver, &app.url(path)).await?;
        let importmap = body
            .find(r#"<script type="importmap">"#)
            .ok_or_else(|| format!("{path}: missing <script type=\"importmap\"> tag"))?;

        // Module-loading triggers that must come AFTER the importmap.
        // Not every page has every trigger — page handlers add inline
        // module scripts conditionally — so we only assert ordering for
        // the triggers that actually appear in the response.
        for needle in [
            r#"<link rel="modulepreload""#,
            r#"<script type="module" src="#,
            r#"<script type="module">"#,
        ] {
            if let Some(pos) = body.find(needle) {
                assert!(
                    importmap < pos,
                    "{path}: <script type=\"importmap\"> (byte {importmap}) must appear \
                     before {needle:?} (byte {pos}) — Firefox rejects late importmaps and \
                     bare specifiers like `@homework` then fail to resolve"
                );
            }
        }
    }

    driver.clone().quit().await?;
    Ok(())
}

/// Helper: collect every inline JSON-LD body on the current document, in
/// source order. Strips the `<script>` wrapper, returns raw JSON strings.
async fn ld_json_bodies(driver: &WebDriver) -> TestResult<Vec<String>> {
    let result = driver
        .execute(
            r#"return Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
            ).map(s => s.textContent);"#,
            vec![],
        )
        .await?;
    let arr = result.json().as_array().cloned().unwrap_or_default();
    Ok(arr
        .into_iter()
        .filter_map(|v| v.as_str().map(str::to_owned))
        .collect())
}

/// Helper: walk a parsed JSON-LD value and collect every `@type` it
/// declares. Handles both flat `{ "@type": "X" }` and `@graph` arrays.
fn collect_types(v: serde_json::Value) -> Vec<String> {
    let mut out = Vec::new();
    walk(&v, &mut out);
    fn walk(v: &serde_json::Value, out: &mut Vec<String>) {
        match v {
            serde_json::Value::Object(map) => {
                if let Some(t) = map.get("@type").and_then(|t| t.as_str()) {
                    out.push(t.to_owned());
                }
                if let Some(graph) = map.get("@graph") {
                    walk(graph, out);
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    walk(item, out);
                }
            }
            _ => {}
        }
    }
    out
}
