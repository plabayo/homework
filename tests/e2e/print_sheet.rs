// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// The "🖨️ afdrukken" worksheet: built from the setup form, made of boxes to
// write in (no inputs, no item numbers, no answer key), and reachable with
// Back and Forward like the other screens.

use super::helpers::{
    click, inject_deck_json, set_checkbox, set_input_value, wait_for_css, wait_for_css_count,
    wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver};

const TIMEOUT: Duration = Duration::from_secs(10);

async fn count(driver: &WebDriver, selector: &str) -> TestResult<usize> {
    Ok(driver.find_all(By::Css(selector)).await?.len())
}

async fn hash(driver: &WebDriver) -> TestResult<String> {
    let value = driver.execute("return location.hash;", vec![]).await?;
    Ok(value.json().as_str().unwrap_or_default().to_owned())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn print_sheet_shows_the_configured_exercises_as_boxes_to_write_in() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, "#button-print:not([hidden])", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "6").await?;
    set_checkbox(driver, "input[name='practice'][value='splitsen']", false).await?;
    click(driver, "#button-print").await?;

    wait_for_css_count(driver, "#print-sheet .print-item", 6, TIMEOUT).await?;
    assert_eq!(count(driver, "#print-sheet .print-item").await?, 6);
    assert_eq!(count(driver, "#print-sheet .print-blank").await?, 6);
    assert_eq!(hash(driver).await?, "#afdrukken");
    assert_eq!(
        count(driver, "#print-sheet input, #print-sheet button").await?,
        0,
        "a worksheet holds nothing to type in or tap"
    );
    assert_eq!(count(driver, "#print-sheet .print-num").await?, 0);
    assert_eq!(count(driver, "#print-sheet .print-answers").await?, 0);
    wait_for_text(driver, "#print-sheet .print-total", "6", TIMEOUT).await?;
    assert_eq!(
        count(driver, "#print-sheet .print-page").await?,
        count(driver, "#print-sheet .print-page > .print-footer").await?,
        "every page carries the footer"
    );
    wait_for_text(
        driver,
        "#print-sheet .print-footer",
        "elementary.training",
        TIMEOUT,
    )
    .await?;
    wait_for_text(
        driver,
        "#print-sheet .print-footer",
        "plabayo.tech",
        TIMEOUT,
    )
    .await?;

    // Another set keeps the settings.
    click(driver, "#print-reshuffle").await?;
    wait_for_css_count(driver, "#print-sheet .print-item", 6, TIMEOUT).await?;
    assert_eq!(count(driver, "#print-sheet .print-item").await?, 6);

    // Back returns to the setup screen, Forward to the same sheet.
    driver.back().await?;
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    assert_eq!(hash(driver).await?, "");
    driver.forward().await?;
    wait_for_css(driver, "#page-print:not([hidden]) .print-item", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn print_sheet_refuses_settings_that_make_no_exercises() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, "#button-print:not([hidden])", TIMEOUT).await?;
    for kind in ["som", "verschil", "splitsen"] {
        set_checkbox(
            driver,
            &format!("input[name='practice'][value='{kind}']"),
            false,
        )
        .await?;
    }
    click(driver, "#button-print").await?;

    wait_for_text(driver, "#config-error", "Kies minstens één soort", TIMEOUT).await?;
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    assert_eq!(hash(driver).await?, "");

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn print_sheet_writes_a_flashcard_fill_in_grid_once() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    inject_deck_json(
        driver,
        r#"{id:'seasons',name:'Seizoenen',mode:'one-sided',cards:[{front:'lente'},{front:'zomer'},{front:'herfst'},{front:'winter'}],createdAt:1}"#,
    )
    .await?;
    driver.refresh().await?;
    wait_for_css(driver, ".deck-item[data-deck-id='seasons']", TIMEOUT).await?;
    click(
        driver,
        ".deck-item[data-deck-id='seasons'] .deck-select-btn",
    )
    .await?;
    click(driver, "#button-print").await?;

    wait_for_css(driver, "#print-sheet .print-item", TIMEOUT).await?;
    wait_for_text(driver, "#print-sheet .print-title", "Seizoenen", TIMEOUT).await?;
    assert_eq!(
        count(driver, "#print-sheet .print-item").await?,
        1,
        "the whole grid is one exercise on paper"
    );
    assert_eq!(count(driver, "#print-sheet .print-write-line").await?, 4);

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn print_sheet_flashcards_as_cards_to_cut_out() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    inject_deck_json(
        driver,
        r#"{id:'fr',name:'Frans',mode:'two-sided',cards:[{front:'huis',back:'maison'},{front:'kat',back:'chat'},{front:'hond',back:'chien'},{front:'boom',back:'arbre'}],createdAt:1}"#,
    )
    .await?;
    driver.refresh().await?;
    wait_for_css(driver, ".deck-item[data-deck-id='fr']", TIMEOUT).await?;
    click(driver, ".deck-item[data-deck-id='fr'] .deck-select-btn").await?;
    click(driver, "#button-print").await?;

    // A test is the default: one ruled row per card.
    wait_for_css_count(driver, "#print-sheet .fc-print-row", 4, TIMEOUT).await?;
    click(driver, ".print-mode input[value='cards']").await?;
    wait_for_css(
        driver,
        "#print-sheet .fc-card-grid[data-side='back']",
        TIMEOUT,
    )
    .await?;
    assert_eq!(count(driver, "#print-sheet .print-page").await?, 2);
    assert!(
        driver
            .find(By::Css("#print-reshuffle"))
            .await?
            .attr("hidden")
            .await?
            .is_some(),
        "every card prints once, so there is nothing to reshuffle"
    );

    // Backs are mirrored per row: flipped on the long edge, each lands
    // behind its own front.
    let faces = |side: &str| {
        format!(
            "return [...document.querySelectorAll(\"#print-sheet .fc-card-grid[data-side='{side}'] .fc-print-card\")].slice(0, 6).map(c => c.textContent.trim()).join('|');"
        )
    };
    let front = driver.execute(faces("front"), vec![]).await?;
    let back = driver.execute(faces("back"), vec![]).await?;
    assert_eq!(front.json().as_str(), Some("huis|kat|hond|boom||"));
    assert_eq!(back.json().as_str(), Some("chien|chat|maison|||arbre"));

    // The choice is remembered for next time.
    driver.refresh().await?;
    wait_for_css(driver, ".deck-item[data-deck-id='fr']", TIMEOUT).await?;
    click(driver, ".deck-item[data-deck-id='fr'] .deck-select-btn").await?;
    click(driver, "#button-print").await?;
    wait_for_css(driver, "#print-sheet .fc-card-grid", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}
