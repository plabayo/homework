// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, set_checkbox, set_input_value, text_of, wait_for_css, wait_for_nonempty_text,
    wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, check_a11y};

const TIMEOUT: Duration = Duration::from_secs(10);

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn analog_clock_seconds_are_opt_in_and_fillable() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    assert!(
        driver
            .find(By::Css("#second-options"))
            .await?
            .attr("hidden")
            .await?
            .is_some(),
        "second precision choices should be hidden by default"
    );

    set_checkbox(driver, "#include-seconds", true).await?;
    wait_for_css(driver, "#second-options:not([hidden])", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    set_checkbox(driver, "input[name='answer'][value='fill']", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#answer-s", TIMEOUT).await?;
    wait_for_css(driver, ".clock .hand-second", TIMEOUT).await?;
    let value = driver
        .execute(
            "const c = document.querySelector('#exercise-content .clock'); return [Number(c.dataset.h), Number(c.dataset.m), Number(c.dataset.s)];",
            vec![],
        )
        .await?;
    let parts = value.json().as_array().ok_or("expected clock data")?;
    let hour = parts[0].as_u64().ok_or("expected hour")?;
    let minute = parts[1].as_u64().ok_or("expected minute")?;
    let second = parts[2].as_u64().ok_or("expected second")?;
    assert!(second > 0 && second < 60 && second % 5 == 0);

    let display_hour = if hour == 0 { 12 } else { hour };
    set_input_value(driver, "#answer-h", &display_hour.to_string()).await?;
    set_input_value(driver, "#answer-m", &minute.to_string()).await?;
    set_input_value(driver, "#answer-s", &second.to_string()).await?;
    check_a11y(driver).await?;
    click(driver, "#button-check").await?;
    wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn analog_clock_seconds_controls_use_configured_step() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_checkbox(driver, "#include-seconds", true).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#sec-inc", TIMEOUT).await?;
    click(driver, "#sec-inc").await?;
    let second = driver
        .find(By::Css("#exercise-content .clock"))
        .await?
        .attr("data-s")
        .await?
        .unwrap_or_default();
    assert_eq!(
        second, "5",
        "default advanced precision should step by five seconds"
    );

    for _ in 0..11 {
        click(driver, "#sec-inc").await?;
    }
    let carried = driver
        .execute(
            "const c = document.querySelector('#exercise-content .clock'); return [Number(c.dataset.h), Number(c.dataset.m), Number(c.dataset.s)];",
            vec![],
        )
        .await?;
    assert_eq!(
        carried.json(),
        &serde_json::json!([6, 1, 0]),
        "seconds should carry forward into the minute hand"
    );

    click(driver, "#sec-dec").await?;
    let dragged = driver
        .execute(
            r#"
            const svg = document.querySelector('#exercise-content .clock.interactive svg');
            const rect = svg.getBoundingClientRect();
            const scale = rect.width / 100;
            const secondTip = svg.querySelector('.hand-hit-tip[data-hand="second"]');
            const tipRect = secondTip.getBoundingClientRect();
            const startX = (tipRect.left + tipRect.right) / 2;
            const startY = (tipRect.top + tipRect.bottom) / 2;

            secondTip.dispatchEvent(new PointerEvent('pointerdown', {
                clientX: startX, clientY: startY,
                bubbles: true, cancelable: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointermove', {
                clientX: rect.left + 50 * scale,
                clientY: rect.top + 14 * scale,
                bubbles: true, pointerId: 1, isPrimary: true,
            }));
            window.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true, pointerId: 1, isPrimary: true,
            }));

            const clock = document.querySelector('#exercise-content .clock');
            return [Number(clock.dataset.h), Number(clock.dataset.m), Number(clock.dataset.s)];
            "#,
            vec![],
        )
        .await?;
    assert_eq!(
        dragged.json(),
        &serde_json::json!([6, 1, 0]),
        "dragging seconds across twelve should carry into the minute hand"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn digital_clock_seconds_render_exact_words_and_three_fields() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/digital-clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    let midnight = driver
        .execute_async(
            r#"
            const done = arguments[arguments.length - 1];
            import('@homework')
                .then(({ preciseTimePhrase }) => done(preciseTimePhrase(0, 0, 5, { use24h: true })))
                .catch((error) => done(`error: ${error}`));
            "#,
            vec![],
        )
        .await?;
    assert_eq!(
        midnight.json().as_str(),
        Some("middernacht, nul minuten en vijf seconden"),
        "00:00 should be spoken as midnight, not zero hour"
    );
    set_checkbox(driver, "#include-seconds", true).await?;
    wait_for_css(driver, "#second-options:not([hidden])", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='dir'][value='digital-to-words']", false).await?;
    set_checkbox(driver, "input[name='dir'][value='words-to-digital']", true).await?;
    set_checkbox(driver, "input[name='answer'][value='fill']", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#answer-s", TIMEOUT).await?;
    let phrase = wait_for_nonempty_text(driver, ".dclock-label", TIMEOUT).await?;
    assert!(
        phrase.contains("uur") && phrase.contains("minuten") && phrase.contains("seconden"),
        "advanced prompt should use exact hour/minute/second wording, got {phrase:?}"
    );
    let overflows = driver
        .execute(
            "const e = document.querySelector('.dclock-input'); return e.scrollWidth > e.clientWidth;",
            vec![],
        )
        .await?
        .json()
        .as_bool()
        .unwrap_or(true);
    assert!(
        !overflows,
        "HH:MM:SS input should not overflow its clock face"
    );
    assert_eq!(
        driver
            .find(By::Css("#answer-s"))
            .await?
            .attr("aria-label")
            .await?
            .as_deref(),
        Some("seconden")
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_seconds_toggle_updates_hand_controls_and_wording() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#freeplay-open", TIMEOUT).await?;
    click(driver, "#freeplay-open").await?;
    wait_for_css(driver, "#page-freeplay:not([hidden])", TIMEOUT).await?;
    assert_eq!(text_of(driver, "#freeplay-digital").await?, "06:00");
    wait_for_css(driver, ".clock.seconds-hidden", TIMEOUT).await?;

    set_checkbox(driver, "#freeplay-seconds", true).await?;
    wait_for_css(driver, "#freeplay-second-controls:not([hidden])", TIMEOUT).await?;
    wait_for_text(driver, "#freeplay-digital", "06:00:00", TIMEOUT).await?;
    click(driver, "#freeplay-sec-dec").await?;
    wait_for_text(driver, "#freeplay-digital", "05:59:59", TIMEOUT).await?;
    click(driver, "#freeplay-sec-inc").await?;
    wait_for_text(driver, "#freeplay-digital", "06:00:00", TIMEOUT).await?;
    click(driver, "#freeplay-sec-inc").await?;
    wait_for_text(driver, "#freeplay-digital", "06:00:01", TIMEOUT).await?;
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;
    let phrase = text_of(driver, "#freeplay-phrase").await?;
    assert!(
        phrase.contains("nul minuten") && phrase.contains("een seconde"),
        "freeplay should use exact seconds wording, got {phrase:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}
