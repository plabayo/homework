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
    // And the referenced element exists with the heading text.
    let heading = driver.find(By::Id(&labelledby)).await?;
    let text = heading.text().await?;
    assert!(
        !text.trim().is_empty(),
        "aria-labelledby target should hold heading text"
    );

    driver.clone().quit().await?;
    Ok(())
}
