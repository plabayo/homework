use super::helpers::{click, collect_hrefs, set_checkbox, set_input_value, wait_for_css};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, check_a11y, sleep};

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
