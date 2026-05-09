// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, text_of, wait_for_css, wait_for_text};
use super::{BrowserHarness, Duration, TestApp, TestResult};

const TIMEOUT: Duration = Duration::from_secs(10);

// Opens the clock page and clicks the "vrij verkennen" entry button.
async fn open_freeplay(driver: &thirtyfour::WebDriver, app: &TestApp) -> TestResult<()> {
    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#freeplay-open", TIMEOUT).await?;
    click(driver, "#freeplay-open").await?;
    wait_for_css(driver, "#page-freeplay:not([hidden])", TIMEOUT).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_button_opens_freeplay_screen() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;

    // Initial state: setup visible, freeplay hidden.
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    wait_for_css(driver, "#page-freeplay[hidden]", TIMEOUT).await?;

    click(driver, "#freeplay-open").await?;

    // After click: setup hidden, freeplay visible.
    wait_for_css(driver, "#page-setup[hidden]", TIMEOUT).await?;
    wait_for_css(driver, "#page-freeplay:not([hidden])", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_back_button_returns_to_setup() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;

    click(driver, "#freeplay-back").await?;

    // After back: setup visible again, freeplay hidden.
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    wait_for_css(driver, "#page-freeplay[hidden]", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_shows_interactive_clock_with_initial_time_and_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;

    // Interactive clock SVG must be injected by JS.
    wait_for_css(driver, "#freeplay-clock .clock.interactive", TIMEOUT).await?;

    // Initial digital time: 06:00.
    let digital = text_of(driver, "#freeplay-digital").await?;
    assert_eq!(
        digital, "06:00",
        "expected initial freeplay time 06:00, got {digital:?}"
    );

    // Initial Dutch phrase: "zes uur" (single variant).
    let phrase = text_of(driver, "#freeplay-phrase").await?;
    assert!(
        phrase.contains("zes uur"),
        "expected initial phrase to contain 'zes uur', got: {phrase:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_hour_inc_updates_time_and_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;
    wait_for_css(driver, "#freeplay-clock .clock.interactive", TIMEOUT).await?;

    // One hour increment: 06:00 → 07:00.
    click(driver, "#freeplay-hour-inc").await?;
    wait_for_text(driver, "#freeplay-digital", "07:00", TIMEOUT).await?;

    let phrase = text_of(driver, "#freeplay-phrase").await?;
    assert!(
        phrase.contains("zeven uur"),
        "expected phrase to contain 'zeven uur' after one hour increment, got: {phrase:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_shows_both_phrase_variants_for_ambiguous_time() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;
    wait_for_css(driver, "#freeplay-clock .clock.interactive", TIMEOUT).await?;

    // Navigate to 11:20 — a time with two valid Dutch phrases.
    // Starting at 06:00: 5 hour-inc → 11:00, then 4 min-inc (×5 min each) → 11:20.
    for _ in 0..5 {
        click(driver, "#freeplay-hour-inc").await?;
    }
    for _ in 0..4 {
        click(driver, "#freeplay-min-inc").await?;
    }
    wait_for_text(driver, "#freeplay-digital", "11:20", TIMEOUT).await?;

    // Both Dutch variants must appear in the phrase element's innerHTML.
    let phrase_html = driver
        .execute(
            "return document.getElementById('freeplay-phrase').innerHTML",
            vec![],
        )
        .await?
        .json()
        .as_str()
        .unwrap_or("")
        .to_owned();

    assert!(
        phrase_html.contains("tien voor half twaalf"),
        "expected traditional variant 'tien voor half twaalf' in phrase, got: {phrase_html:?}"
    );
    assert!(
        phrase_html.contains("twintig over elf"),
        "expected modern variant 'twintig over elf' in phrase, got: {phrase_html:?}"
    );
    assert!(
        phrase_html.contains("of"),
        "expected 'of' separator between variants, got: {phrase_html:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}
