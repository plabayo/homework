// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// Regression tests for the security + PWA fixes documented in the
// audit: PWA icons present, iOS standalone meta tags, no permissive CORS,
// digital-clock validation a11y, and leave-guard dialog ARIA + iOS
// <dialog>-fallback behaviour. See the NOTE further down for why the
// 64 KiB body limit isn't e2e-tested.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css};
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
