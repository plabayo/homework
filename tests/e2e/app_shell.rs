// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, collect_hrefs, set_checkbox, set_input_value, wait_for_css, wait_for_text,
};
use super::{BrowserHarness, By, Duration, Instant, TestApp, TestResult, WebDriver, check_a11y};

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn accessibility_on_key_pages() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    wait_for_text(
        driver,
        ".page-intro",
        "Kies een oefening en ga meteen aan de slag.",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_css(driver, ".site-footer", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn home_page_and_all_exercise_routes_render() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(
        driver,
        ".exercise-list a[data-exercise-id]",
        Duration::from_secs(10),
    )
    .await?;

    let links = driver
        .find_all(By::Css(".exercise-list a[data-exercise-id]"))
        .await?;
    assert!(
        !links.is_empty(),
        "expected exercise links on the home page"
    );

    let hrefs = collect_hrefs(links).await?;
    for href in hrefs {
        driver.goto(app.url(&href)).await?;
        wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
        wait_for_css(driver, "#history", Duration::from_secs(10)).await?;
    }

    driver.clone().quit().await?;
    Ok(())
}

/// `/privacy` is a `[Required]` policy page (audit's Wave 3): it must be a
/// real route, reachable from the global footer, and structurally
/// recognisable (heading + the four content sections). Catches the
/// likeliest regression — someone deletes the footer link or removes a
/// section, and the policy disappears from the navigable surface.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn privacy_page_reachable_from_home_and_renders_sections() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Reach /privacy by clicking the footer link from /, not by typing the
    // URL — proves the global discoverability story works end-to-end.
    driver.goto(app.url("/")).await?;
    wait_for_css(
        driver,
        ".site-footer a[href='/privacy']",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, ".site-footer a[href='/privacy']").await?;
    wait_for_css(driver, "h1", Duration::from_secs(10)).await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;

    // All four substantive sections must be present (their headings live
    // inside `<section class="about-section">` blocks).
    let section_headings = driver
        .find_all(By::Css(".about-section h2"))
        .await?
        .into_iter();
    let mut titles = Vec::new();
    for h in section_headings {
        titles.push(h.text().await?);
    }
    for expected in [
        "Wat we niet verzamelen",
        "Wat op het toestel blijft",
        "Wat de server wél ziet",
        "Wijzigingen en contact",
    ] {
        assert!(
            titles.iter().any(|t| t.contains(expected)),
            "expected /privacy section heading {expected:?}, got {titles:?}"
        );
    }

    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// /privacy must also be reachable from the /about footer — the footer
/// is duplicated across pages today, so a regression on one of the two
/// definitions can leave the policy visible from one entry point but not
/// the other.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn privacy_page_reachable_from_about_footer() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/about")).await?;
    wait_for_css(
        driver,
        ".site-footer a[href='/privacy']",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, ".site-footer a[href='/privacy']").await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// /privacy carries the substantive disclosures — Fly.io's 7-day log
/// retention with a link to the source doc, plus a contact mailto. The
/// audit doc says these are policy-required; a regression dropping
/// either makes the page accurate-by-coincidence at best.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn privacy_page_discloses_log_retention_and_contact() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/privacy")).await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;

    // Fly.io citation: text must mention "7 dagen" AND there must be a
    // canonical link to Fly's logging docs.
    let body = driver.find(By::Tag("main")).await?.text().await?;
    assert!(
        body.contains("7 dagen"),
        "privacy page must disclose the 7-day log-retention window in plain Dutch, got: {body:?}"
    );
    let fly_link_count = driver
        .find_all(By::Css(
            "main a[href='https://fly.io/docs/monitoring/logging-overview/']",
        ))
        .await?
        .len();
    assert!(
        fly_link_count >= 1,
        "privacy page must link to Fly.io's logging docs as the source for the retention claim"
    );

    // Contact mailto must be present.
    let mailto_count = driver
        .find_all(By::Css("main a[href^='mailto:']"))
        .await?
        .len();
    assert!(
        mailto_count >= 1,
        "privacy page must include a mailto: contact link for policy questions"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// /privacy is in the service-worker PRECACHE list so it stays reachable
/// after the server goes away. Mirrors the home_page_survives_server_shutdown
/// test but for the policy page — proves the "linked from every page,
/// always reachable" promise survives an outage.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn privacy_page_survives_server_shutdown() -> TestResult<()> {
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Visit /privacy first so the SW gets it into PAGES_CACHE on top of
    // the install-time PRECACHE.
    driver.goto(app.url("/privacy")).await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;
    wait_for_service_worker(driver, Duration::from_secs(10)).await?;
    driver.refresh().await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;

    app.stop();

    // After server shutdown, refreshing must still show the policy.
    driver.refresh().await?;
    wait_for_text(driver, "h1", "Privacyverklaring", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Waits until the service worker is active for the current origin.
/// Returns an error if the SW doesn't activate within the timeout.
async fn wait_for_service_worker(driver: &WebDriver, timeout: Duration) -> TestResult<()> {
    let deadline = Instant::now() + timeout;
    loop {
        // navigator.serviceWorker.controller is set synchronously once the SW
        // has activated and called clients.claim() — no async needed here.
        let ready: bool = driver
            .execute(
                "return !!(navigator.serviceWorker && navigator.serviceWorker.controller);",
                vec![],
            )
            .await?
            .json()
            .as_bool()
            .unwrap_or(false);
        if ready {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err("timed out waiting for service worker to become active".into());
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn cached_exercise_page_survives_server_shutdown() -> TestResult<()> {
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    tokio::time::sleep(Duration::from_secs(1)).await;
    driver.refresh().await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;

    app.stop();

    driver.refresh().await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn home_page_survives_server_shutdown() -> TestResult<()> {
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Visit home to trigger SW install + PRECACHE (home page lands in STATIC_CACHE).
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    wait_for_service_worker(driver, Duration::from_secs(10)).await?;
    // One more refresh so the SW-controlled response is in PAGES_CACHE too.
    driver.refresh().await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;

    app.stop();

    driver.refresh().await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn precached_pages_available_without_prior_visit() -> TestResult<()> {
    // The service worker pre-caches exercise pages during install.  This test
    // verifies that a page from PRECACHE is served from cache even though it was
    // never explicitly visited by the user before the server went offline.
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Visit home to trigger SW install + PRECACHE (all exercise pages get cached).
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    wait_for_service_worker(driver, Duration::from_secs(10)).await?;
    // Give the SW install handler time to finish fetching all PRECACHE entries.
    tokio::time::sleep(Duration::from_secs(3)).await;

    app.stop();

    // Navigate to a pre-cached exercise page that was never explicitly visited.
    driver.goto(app.url("/1/thermometer")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
