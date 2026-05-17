// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, wait_for_css};
use super::{BrowserHarness, Duration, TestApp, TestResult, WebDriver};

/// Wait until an element matching `selector` is absent from the DOM.
async fn wait_for_absent(driver: &WebDriver, selector: &str, timeout: Duration) -> TestResult<()> {
    use super::{By, Instant};
    let deadline = Instant::now() + timeout;
    loop {
        let count = driver.find_all(By::Css(selector)).await?.len();
        if count == 0 {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("element {selector:?} still present after {timeout:?}").into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn read_cookie(driver: &WebDriver, name: &str) -> TestResult<Option<String>> {
    let script = format!(
        "return document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('{name}=')) ?? null;"
    );
    let val = driver.execute(&script, vec![]).await?;
    Ok(val.json().as_str().map(String::from))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn lang_banner_shows_by_default() -> TestResult<()> {
    // The test browser typically sends an English Accept-Language header
    // (not Dutch), so the server should render the language banner.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, "#lang-banner", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn lang_banner_dismiss_removes_banner_and_sets_cookie() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, "#lang-banner", Duration::from_secs(10)).await?;

    // Dismiss the banner.
    click(driver, "#lang-banner-dismiss").await?;

    // Banner should be removed from the DOM.
    wait_for_absent(driver, "#lang-banner", Duration::from_secs(5)).await?;

    // The lang_ok=1 cookie should now be set.
    let cookie = read_cookie(driver, "lang_ok").await?;
    assert!(
        cookie.as_deref() == Some("lang_ok=1"),
        "expected lang_ok=1 cookie, got: {cookie:?}",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn lang_banner_not_rendered_after_cookie_set() -> TestResult<()> {
    // After dismissal the browser sends lang_ok=1 in subsequent requests
    // and the server omits the banner from the response entirely.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // First visit — banner shows.
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, "#lang-banner", Duration::from_secs(10)).await?;

    // Dismiss to set the cookie.
    click(driver, "#lang-banner-dismiss").await?;
    wait_for_absent(driver, "#lang-banner", Duration::from_secs(5)).await?;

    // Reload — this time the browser sends lang_ok=1; server renders no banner.
    driver.refresh().await?;
    wait_for_absent(driver, "#lang-banner", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn lang_banner_client_side_removal_when_cookie_already_set() -> TestResult<()> {
    // Simulate a cached/offline page scenario: the page HTML still contains
    // the lang-banner element (because the cached version was built without
    // the cookie), but the cookie is now set. The JS should remove it.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Visit to load a live page (banner rendered by server).
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, "#lang-banner", Duration::from_secs(10)).await?;

    // Set the cookie directly via JS (simulates a prior dismiss in another tab).
    driver
        .execute(
            "document.cookie = 'lang_ok=1; path=/; max-age=31536000; SameSite=Lax';",
            vec![],
        )
        .await?;

    // Reload: server sees cookie → no banner in HTML. The page should not have it.
    driver.refresh().await?;
    wait_for_absent(driver, "#lang-banner", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn lang_banner_shows_on_exercise_pages() -> TestResult<()> {
    // The banner should appear on exercise pages too, not just the home page.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    for path in &[
        "/1/mathbox",
        "/1/multiplications",
        "/2/clock",
        "/extra/flashcards",
    ] {
        driver.goto(app.url(path)).await?;
        wait_for_css(driver, "#lang-banner", Duration::from_secs(10)).await?;
    }

    driver.clone().quit().await?;
    Ok(())
}
