use super::helpers::{
    click, parse_product_answer, selector_has_disabled, set_checkbox, set_input_value, text_of,
    wait_for_css, wait_for_nonempty_text, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult};

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn multiplications_happy_path_reaches_finish() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    let prompt =
        wait_for_nonempty_text(driver, "#exercise-content p", Duration::from_secs(2)).await?;
    let answer = parse_product_answer(&prompt)?;
    set_input_value(driver, "#answer", &answer.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn timeout_locks_question_and_shows_correct_answer() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-3", true).await?;
    set_checkbox(driver, "#time-mode", true).await?;
    set_checkbox(driver, "#deadline-on", true).await?;
    set_input_value(driver, "#deadline-seconds", "1").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "te traag",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(10)).await?;
    wait_for_css(
        driver,
        "#exercise-content .box.bad",
        Duration::from_secs(10),
    )
    .await?;

    let answer_text = text_of(driver, "#exercise-content .box.bad").await?;
    assert!(
        answer_text.chars().any(|c| c.is_ascii_digit()),
        "expected the timed-out screen to show the correct answer, got: {answer_text:?}"
    );
    assert!(
        driver
            .find_all(By::Css("#exercise-content #answer"))
            .await?
            .is_empty(),
        "expected the answer input to be replaced by the correction view",
    );

    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "0 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn wrong_answer_creates_reviewable_result_and_history() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-4", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    set_input_value(driver, "#answer", "999").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip", Duration::from_secs(10)).await?;
    click(driver, "#button-skip").await?;

    wait_for_css(driver, "#review-button-repeat", Duration::from_secs(10)).await?;

    click(driver, "#page-result .button-reset").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    wait_for_css(driver, ".history-session", Duration::from_secs(10)).await?;

    let practice_enabled = !selector_has_disabled(
        driver,
        "[data-action='practice-mistakes']",
        Duration::from_secs(10),
    )
    .await?;
    assert!(
        practice_enabled,
        "expected practice-mistakes to be enabled after a wrong answer"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn exercise_home_link_warns_before_losing_progress() -> TestResult<()> {
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

    click(driver, ".home-link").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_text(
        driver,
        "dialog.leave-guard-dialog .muted",
        "Je verliest je voortgang als je weggaat.",
        Duration::from_secs(10),
    )
    .await?;

    click(driver, "#leave-stay").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;

    click(driver, ".home-link").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, "#leave-leave").await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn exercise_browser_back_warns_before_losing_progress() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    click(driver, "a[data-exercise-id='multiplications']").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-3", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;

    driver.back().await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#leave-stay").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_set_mode_renders_interactive_widget() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, ".clock.interactive", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#hour-inc", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn thermometer_draw_mode_renders_interactive_widget() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/thermometer")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='tk'][value='teken']", true).await?;
    set_checkbox(driver, "input[name='tk'][value='schrijf']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(
        driver,
        ".thermo-svg-host.interactive",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_css(driver, "#thermo-inc", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
