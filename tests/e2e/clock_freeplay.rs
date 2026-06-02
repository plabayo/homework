// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, text_of, wait_for_css, wait_for_text};
use super::{BrowserHarness, Duration, TestApp, TestResult, check_a11y};

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

    // Initial Dutch phrase: "zes uur" (single variant). Phrase updates
    // are debounced (and dimmed via `.is-updating` while pending) to
    // prevent rapid-click strobing — wait for it to settle before reading.
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;
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
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;

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
    // Starting at 06:00: 5 hour-inc → 11:00, then 20 min-inc (×1 min each
    // since freeplay runs at 1-minute granularity) → 11:20.
    for _ in 0..5 {
        click(driver, "#freeplay-hour-inc").await?;
    }
    for _ in 0..20 {
        click(driver, "#freeplay-min-inc").await?;
    }
    wait_for_text(driver, "#freeplay-digital", "11:20", TIMEOUT).await?;
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;

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
    // Both variants are now wrapped in a flip widget rather than separated by "of".
    assert!(
        phrase_html.contains("phrase-flip"),
        "expected phrase-flip widget to contain both variants, got: {phrase_html:?}"
    );

    // Layer 3 a11y: front-face state of the phrase-flip widget.
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    // Layer 3 a11y: back-face (flipped) state — accent-coloured text on default background.
    click(driver, ".phrase-flip").await?;
    tokio::time::sleep(Duration::from_millis(450)).await; // wait for 3-D flip animation
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// End-to-end check that the new 1-minute Dutch phrasing is wired all the
/// way to the live phrase element: one click on min-inc moves 06:00 →
/// 06:01 and the readout (after the debounce settles) reads "een over
/// zes". Complements the JS unit tests that lock in the phrase table.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_minute_step_shows_one_minute_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;
    wait_for_css(driver, "#freeplay-clock .clock.interactive", TIMEOUT).await?;
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;

    click(driver, "#freeplay-min-inc").await?;
    wait_for_text(driver, "#freeplay-digital", "06:01", TIMEOUT).await?;
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;

    // 06:01 has two readings — canonical "een over zes" and the Flemish
    // "een na zes" — so the phrase-flip widget renders BOTH; which face
    // shows up first is randomised. Read innerHTML to see both at once.
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
        phrase_html.contains("een over zes"),
        "expected 1-minute phrase 'een over zes' after one min-inc, got: {phrase_html:?}"
    );
    assert!(
        phrase_html.contains("een na zes"),
        "expected Flemish alt 'een na zes' after one min-inc, got: {phrase_html:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// Locks in the anti-strobe debounce: rapid ± clicks must keep the phrase
/// element marked `.is-updating` (CSS dims it) until the user pauses, and
/// the digital readout must keep ticking instantly throughout. Without the
/// debounce the phrase text would rewrite on every click, which is the
/// epileptic-trigger pattern we shipped to prevent.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn freeplay_phrase_swap_is_debounced_during_rapid_clicks() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_freeplay(driver, &app).await?;
    wait_for_css(driver, "#freeplay-clock .clock.interactive", TIMEOUT).await?;
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;

    // Rapid burst: 4 clicks back-to-back. Debounce is 180ms; the bundled
    // chromedriver dispatches each click in well under that, so right
    // after the burst the class must still be present (= debounce timer
    // pending, dim still applied).
    for _ in 0..4 {
        click(driver, "#freeplay-min-inc").await?;
    }
    // Digital readout updates instantly each click — independent of the
    // phrase debounce. After 4 +1-min clicks from 06:00 → 06:04.
    wait_for_text(driver, "#freeplay-digital", "06:04", TIMEOUT).await?;
    let is_updating_during_burst = driver
        .execute(
            "return document.getElementById('freeplay-phrase').classList.contains('is-updating')",
            vec![],
        )
        .await?
        .json()
        .as_bool()
        .unwrap_or(false);
    assert!(
        is_updating_during_burst,
        "phrase must carry `.is-updating` while the debounce timer is pending — without it rapid clicks would strobe the phrase text",
    );

    // After the debounce window passes, the class must go away and the
    // phrase must reflect the *final* time (06:04), not any of the
    // intermediate values it passed through. 06:04 also has the Flemish
    // "vier na zes" alt → both faces of the flip widget land in innerHTML.
    wait_for_css(driver, "#freeplay-phrase:not(.is-updating)", TIMEOUT).await?;
    let final_phrase_html = driver
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
        final_phrase_html.contains("vier over zes"),
        "settled phrase must be the final 06:04 reading 'vier over zes', got: {final_phrase_html:?}"
    );
    // Confirm we didn't land on an intermediate time (xx:01 / xx:02 / xx:03)
    // — proves the debounce dropped the in-flight updates.
    for stale in ["een over zes", "twee over zes", "drie over zes"] {
        assert!(
            !final_phrase_html.contains(stale),
            "settled phrase must not contain the intermediate reading {stale:?}, got: {final_phrase_html:?}"
        );
    }

    driver.clone().quit().await?;
    Ok(())
}
