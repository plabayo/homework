// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

//! Accessibility (axe-core / WCAG 2.1 AA) test coverage.
//!
//! Three layers of coverage:
//!
//! **Layer 1** – every exercise *setup* page is visited and scanned.  This
//! catches contrast / ARIA regressions on the static part of every exercise
//! automatically, including any new exercises added in the future.
//!
//! **Layer 2** – one representative active-exercise state per exercise family
//! (clock, thermometer, fractions, flashcards).  Covers JS-rendered question
//! UI that is never visible at the setup stage.
//!
//! **Layer 3** – specific transient DOM states that colour-contrast / ARIA
//! rules can fail in:
//!   • word-choice option list (clock "lees" mode)
//!   • a word-choice option in the `.selected` (accent-background) state
//!   • a word-choice option in the `.flipped` (3-D peek, back-face) state
//!
//! The freeplay phrase-flip state (Layer 3) is checked at the end of
//! `clock_freeplay::freeplay_shows_both_phrase_variants_for_ambiguous_time`.

use super::helpers::{
    click, collect_hrefs, inject_deck, set_checkbox, set_input_value, wait_for_css,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, check_a11y};

const TIMEOUT: Duration = Duration::from_secs(10);

// ─── Layer 1: all exercise setup pages ───────────────────────────────────────

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_all_exercise_setup_pages() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Home page — also acts as the starting point to collect all exercise hrefs.
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list a[data-exercise-id]", TIMEOUT).await?;
    check_a11y(driver).await?;

    let links = driver
        .find_all(By::Css(".exercise-list a[data-exercise-id]"))
        .await?;
    let hrefs = collect_hrefs(links).await?;

    for href in &hrefs {
        driver.goto(app.url(href)).await?;
        wait_for_css(driver, "#form-setup", TIMEOUT).await?;
        check_a11y(driver).await?;
    }

    driver.clone().quit().await?;
    Ok(())
}

// ─── Layer 2: active exercise state per family ────────────────────────────────

/// Clock "lees de klok" — multiple-choice option list (digit or word choices).
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_clock_lees_active() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    // Both digit-choice (optionListHtml) and word-choice (wordOptionListHtml)
    // render an .option-list, so this wait covers both variants.
    wait_for_css(driver, ".option-list", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Clock "zet de klok" — interactive SVG clock with drag handles.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_clock_zet_active() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".clock.interactive", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Thermometer "teken" mode — interactive SVG thermometer.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_thermometer_active() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/thermometer")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='tk'][value='teken']", true).await?;
    set_checkbox(driver, "input[name='tk'][value='schrijf']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".thermo-svg-host.interactive", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Fractions "breuk van getal" — fraction question with a number-input answer.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_fractions_active() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/fractions")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[value='breuk-van-getal']", true).await?;
    set_checkbox(driver, "input[value='optellen']", false).await?;
    set_checkbox(driver, "input[value='aftrekken']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Flashcards — one-sided deck, active card with answer input.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_flashcard_active() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", TIMEOUT).await?;
    inject_deck(
        driver,
        "a11y-deck",
        "A11y test deck",
        r#"[{"front":"aap","back":"singe"}]"#,
    )
    .await?;
    driver.refresh().await?;
    wait_for_css(driver, ".deck-item[data-deck-id='a11y-deck']", TIMEOUT).await?;
    click(
        driver,
        ".deck-item[data-deck-id='a11y-deck'] .deck-select-btn",
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

// ─── Layer 3: transient interactive states ────────────────────────────────────

/// Checks three a11y snapshots of the clock word-choice UI in sequence:
///
/// 1. The plain word-choice option list.
/// 2. One option in the `.selected` (accent background) state — verifies
///    that foreground text contrast passes against the accent background.
/// 3. One dual-variant option in the `.flipped` (3-D peek) state — verifies
///    that the back-face accent-coloured text passes contrast.
///
/// `Math.random` is pinned to 0.2 before the form is submitted so that
/// `buildDeck` deterministically picks h=2, m=20 ("twintig over twee" /
/// "tien voor half drie").  Both the correct answer and at least one
/// generated distractor are dual-variant times, so `.word-variant-peek`
/// buttons are guaranteed to be present.  Math.random is restored once the
/// question is fully rendered.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn a11y_clock_word_choice_selected_and_flipped() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    // 5-minute granularity is required: whole-hour times have no dual-variant
    // Dutch phrases, so they cannot produce word-option peek buttons.
    click(driver, "input[name='granularity'][value='five']").await?;

    // Pin Math.random to 0.2 so buildDeck always picks h=2, m=20.
    // Analysis: Fisher-Yates on the 144-entry allowed[] with k=0.2 puts the
    // entry at original index 28 (= h=2, m=20) last; bag.pop() returns it.
    // 0.2 < 0.4 (word-choice threshold) ensures choiceStyle="words".
    driver
        .execute(
            "window._savedRandom = Math.random; Math.random = () => 0.2;",
            vec![],
        )
        .await?;

    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".option-list", TIMEOUT).await?;
    tokio::time::sleep(Duration::from_millis(200)).await;

    // Deck is built and question is rendered — restore Math.random.
    driver
        .execute("Math.random = window._savedRandom;", vec![])
        .await?;

    // Snapshot 1: plain word-choice list.
    check_a11y(driver).await?;

    // Snapshot 2: select one option → .selected with accent background.
    click(driver, ".option-list .option").await?;
    tokio::time::sleep(Duration::from_millis(150)).await;
    check_a11y(driver).await?;

    // Snapshot 3: flip a dual-variant option → back face with accent text.
    // With the pinned seed, h=2/m=20 and its first distractor h=0/m=20 are
    // both dual-variant, so at least one .word-variant-peek is present.
    let peeks = driver.find_all(By::Css(".word-variant-peek")).await?;
    assert!(
        !peeks.is_empty(),
        "expected at least one .word-variant-peek button for the dual-variant \
         time h=2,m=20; check that Math.random pinning still produces the \
         correct question"
    );
    click(driver, ".word-variant-peek").await?;
    tokio::time::sleep(Duration::from_millis(400)).await; // wait for 3-D flip animation
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}
