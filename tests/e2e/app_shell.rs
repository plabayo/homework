use super::helpers::{click, collect_hrefs, set_checkbox, set_input_value, wait_for_css};
use super::{
    BrowserHarness, By, Duration, Instant, TestApp, TestResult, WebDriver, check_a11y, sleep,
};

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn accessibility_on_key_pages() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    sleep(Duration::from_millis(300));
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
        sleep(Duration::from_millis(200));
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

    sleep(Duration::from_secs(1));
    driver.refresh().await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    sleep(Duration::from_secs(1));

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
    sleep(Duration::from_millis(500));

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
    sleep(Duration::from_secs(3));

    app.stop();

    // Navigate to a pre-cached exercise page that was never explicitly visited.
    driver.goto(app.url("/1/thermometer")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
