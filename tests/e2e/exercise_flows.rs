// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

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

// Open the clock page in "zet" mode and return once the interactive clock is ready.
async fn open_clock_zet(driver: &thirtyfour::WebDriver, app: &TestApp) -> TestResult<()> {
    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".clock.interactive", Duration::from_secs(10)).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_hand_drag_minute_hand_moves_correctly() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_clock_zet(driver, &app).await?;

    // Verify that tip circles exist for both hands, and that dragging the minute
    // tip to 3-o'clock (SVG 86, 50) moves only the minute — hour stays at 6.
    // We dispatch pointerdown directly on the tip element so the test is not
    // sensitive to which SVG element happens to be on top at pixel-level coords.
    let result = driver
        .execute(
            r#"
            const svg  = document.querySelector('.clock.interactive svg');
            const rect = svg.getBoundingClientRect();
            const scale = rect.width / 100;

            const minuteTip = svg.querySelector('.hand-hit-tip[data-hand="minute"]');
            const hourTip   = svg.querySelector('.hand-hit-tip[data-hand="hour"]');
            if (!minuteTip || !hourTip) return { error: 'tip elements missing' };

            // Drag minute hand to 3 o'clock: SVG (86, 50) → angle=90° → minute=15.
            const mRect = minuteTip.getBoundingClientRect();
            const startX = (mRect.left + mRect.right)  / 2;
            const startY = (mRect.top  + mRect.bottom) / 2;
            const newX = rect.left + 86 * scale;
            const newY = rect.top  + 50 * scale;

            minuteTip.dispatchEvent(new PointerEvent('pointerdown', {
                clientX: startX, clientY: startY,
                bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointermove', {
                clientX: newX, clientY: newY,
                bubbles: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true, pointerId: 1, isPrimary: true,
            }));

            const clock = document.querySelector('.clock.interactive');
            return {
                minuteTipHand: minuteTip.dataset.hand,
                hourTipHand:   hourTip.dataset.hand,
                m: parseInt(clock.dataset.m ?? '-1', 10),
                h: parseInt(clock.dataset.h ?? '-1', 10),
            };
            "#,
            vec![],
        )
        .await?;

    let result = result.json();
    assert!(
        result.get("error").is_none(),
        "expected tip elements to be present, got: {:?}",
        result["error"]
    );
    assert_eq!(
        result["minuteTipHand"].as_str().unwrap_or(""),
        "minute",
        "minute tip circle must carry data-hand='minute'"
    );
    assert_eq!(
        result["hourTipHand"].as_str().unwrap_or(""),
        "hour",
        "hour tip circle must carry data-hand='hour'"
    );
    let m = result["m"].as_i64().unwrap_or(-1);
    let h = result["h"].as_i64().unwrap_or(-1);
    assert_eq!(
        m, 15,
        "dragging minute tip to 3-o'clock must set m=15, got {m}"
    );
    assert_eq!(
        h, 6,
        "dragging minute hand must not change the hour (expected 6), got {h}"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_hand_drag_hour_hand_moves_independently() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_clock_zet(driver, &app).await?;

    // Drag the hour-hand tip to 3 o'clock (SVG 86, 50 → angle=90° → h=3).
    // The minute must remain unchanged at 0.
    let result = driver
        .execute(
            r#"
            const svg  = document.querySelector('.clock.interactive svg');
            const rect = svg.getBoundingClientRect();
            const scale = rect.width / 100;

            const hourTip = svg.querySelector('.hand-hit-tip[data-hand="hour"]');
            if (!hourTip) return { error: 'hour tip element missing' };

            const hRect  = hourTip.getBoundingClientRect();
            const startX = (hRect.left + hRect.right)  / 2;
            const startY = (hRect.top  + hRect.bottom) / 2;

            // 3 o'clock = SVG (86, 50) → angle=90° → h = round(90/30) = 3
            const newX = rect.left + 86 * scale;
            const newY = rect.top  + 50 * scale;

            hourTip.dispatchEvent(new PointerEvent('pointerdown', {
                clientX: startX, clientY: startY,
                bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointermove', {
                clientX: newX, clientY: newY,
                bubbles: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true, pointerId: 1, isPrimary: true,
            }));

            const clock = document.querySelector('.clock.interactive');
            return {
                h: parseInt(clock.dataset.h ?? '-1', 10),
                m: parseInt(clock.dataset.m ?? '-1', 10),
            };
            "#,
            vec![],
        )
        .await?;

    let result = result.json();
    assert!(
        result.get("error").is_none(),
        "expected hour tip element, got: {:?}",
        result["error"]
    );
    let h = result["h"].as_i64().unwrap_or(-1);
    let m = result["m"].as_i64().unwrap_or(-1);
    assert_eq!(h, 3, "dragging hour tip to 3-o'clock must set h=3, got {h}");
    assert_eq!(
        m, 0,
        "dragging hour hand must not change the minute (expected 0), got {m}"
    );

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
