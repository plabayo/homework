// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use super::helpers::{
    click, inject_deck, inject_deck_json, poll_until, select_deck_and_start, set_checkbox,
    set_input_value, setup_multipart_exercise, wait_for_css, wait_for_nonempty_text, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult};

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_deck_completes_session() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck(
        driver,
        "test-one",
        "Test memorisatie",
        r#"[{"front":"aap"}]"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-one']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-one'] .deck-select-btn",
    )
    .await?;
    poll_until(Duration::from_secs(5), || async {
        let value = driver
            .execute(
                "return document.querySelector('#selected-deck-id')?.value || '';",
                vec![],
            )
            .await?;
        Ok(value.json().as_str().unwrap_or("") == "test-one")
    })
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "aap").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_two_sided_deck_correct_answer_reaches_finish() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck(
        driver,
        "test-two",
        "Test koppelen",
        r#"[{"front":"hond","back":"woef"}]"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-two']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-two'] .deck-select-btn",
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "woef").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_bidirectional_deck_completes_session() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(
        driver,
        r#"{"id":"test-bidir","name":"Test twee richtingen","mode":"two-sided","bidirectional":true,"cards":[{"front":"appel","back":"appel"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-bidir']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-bidir'] .deck-select-btn",
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "appel").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_hint_button_appears_and_reveals_hint() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(
        driver,
        r#"{"id":"test-hint","name":"Test hint","mode":"two-sided","bidirectional":false,"cards":[{"front":"chat","back":"kat","hint":"een dier dat miauw zegt"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-hint']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-hint'] .deck-select-btn",
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, ".fc-hint-chip", Duration::from_secs(5)).await?;

    // CSS sanity: collapsed chip must be a perfect square so it renders as a circle.
    // If theme.css or another rule sets a conflicting min-height, this catches it immediately.
    let dims = driver
        .execute(
            "const el = document.querySelector('.fc-hint-chip'); \
             return [el.offsetWidth, el.offsetHeight];",
            vec![],
        )
        .await?;
    let dims = dims.json();
    let chip_w = dims[0].as_u64().unwrap_or(0);
    let chip_h = dims[1].as_u64().unwrap_or(0);
    assert_eq!(
        chip_w, chip_h,
        "hint chip must be square (circle) when collapsed, got {chip_w}×{chip_h}"
    );

    let open_before = driver
        .execute(
            "return document.querySelector('.fc-hint-chip')?.classList.contains('open') ?? false;",
            vec![],
        )
        .await?;
    assert!(
        !open_before.json().as_bool().unwrap_or(true),
        "hint chip should be collapsed before clicking"
    );

    click(driver, ".fc-hint-chip").await?;

    let open_after = driver
        .execute(
            "return document.querySelector('.fc-hint-chip')?.classList.contains('open') ?? false;",
            vec![],
        )
        .await?;
    assert!(
        open_after.json().as_bool().unwrap_or(false),
        "hint chip should be open after clicking"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_one_at_a_time_with_fuzzy() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp","name":"Multi-deel test","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon",
                "parts":["wachter van de zon","half man","half leeuw"]}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, ".fc-mp-progress", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "halve leeuw").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Op de kaart staan: wachter van de zon / half man / half leeuw.",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#button-next").await?;

    // One card = 1 point (regardless of how many parts it has).
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_non_exact_does_not_reveal_until_card_end() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-no-spoil","name":"Multi-deel geen spoiler","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon",
                "parts":["wachter van de zon","half man"]}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-no-spoil").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    let next_buttons = driver.find_all(By::Css("#button-next")).await?;
    assert!(
        next_buttons.is_empty(),
        "multipart card should not reveal the full answer before the card is complete"
    );

    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Op de kaart staan: wachter van de zon / half man.",
        Duration::from_secs(5),
    )
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_all_at_once() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-aao","name":"Multi-deel alles tegelijk","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon",
                "parts":["wachter van de zon","half man","half leeuw"]}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-aao").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(
        driver,
        "#answer",
        "wachter van de zon, half man, half leeuw",
    )
    .await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_partial_required() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-partial","name":"Multi-deel gedeeltelijk","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon",
                "parts":["wachter van de zon","half man","half leeuw"],
                "partsRequired":2}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-partial").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter van de zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_partial_required_does_not_flag_bijna_goed() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-partial-lenient","name":"Multi-deel deels verplicht","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon",
                "parts":["wachter van de zon","half man","half leeuw"],
                "partsRequired":2}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-partial-lenient").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;
    let repeat_buttons = driver.find_all(By::Css("#review-button-repeat")).await?;
    assert!(
        repeat_buttons.is_empty(),
        "partial-required multipart cards should not be flagged as a practice-again round",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_en_separator_all_at_once() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-en","name":"Multi-deel en-separator","mode":"two-sided",
            "cards":[{"front":"fruit","back":"sinaasappelen",
                "parts":["sinaasappelen","dadels"]}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-en").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "sinaasappelen en dadels").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_skip_advances_whole_card() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-mp-skip","name":"Multi-deel skip test","mode":"two-sided",
            "cards":[
                {"front":"fruit","back":"sinaasappelen",
                 "parts":["sinaasappelen","dadels"]}
            ],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-mp-skip").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "fout antwoord").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Op de kaart staan: sinaasappelen / dadels.",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#button-next").await?;

    // Skipping the whole multi-part card counts as 0/1 (one card, not one per part).
    wait_for_text(driver, "#result h3", "0 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_non_exact_typo_shows_answer_before_finishing() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-close-typo","name":"Typo feedback test","mode":"two-sided",
            "cards":[{"front":"huis","back":"maison"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-close-typo").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "maizon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Op de kaart staat: maison.",
        Duration::from_secs(5),
    )
    .await?;

    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_lenient_match_shows_bijna_goed() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-lenient","name":"Bijna goed test","mode":"two-sided",
            "cards":[{"front":"egyptisch heerser","back":"de farao"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-lenient").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "farao").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Deze kaart komt terug bij fouten oefenen.",
        Duration::from_secs(5),
    )
    .await?;

    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#review-button-repeat", Duration::from_secs(5)).await?;
    wait_for_css(driver, ".item-lenient", Duration::from_secs(3)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_emoji_card_accepted() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-emoji","name":"Emoji kaarten","mode":"one-sided",
            "cards":[
                {"front":"lente 🌸"},
                {"front":"winter ❄️"}
            ],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-emoji").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "lente").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "winter").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_partial_score_no_wave() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-partial","name":"Deels goed","mode":"one-sided",
            "cards":[{"front":"lente"},{"front":"zomer"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-partial").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "lente").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "fout").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fill-stop-confirm").await?;

    wait_for_text(driver, "#result h3", "1 / 2", Duration::from_secs(5)).await?;
    tokio::time::sleep(Duration::from_secs(1)).await;
    let wave_count = driver.find_all(By::Css(".fc-wave-overlay")).await?.len();
    assert_eq!(wave_count, 0, "wave should not appear on partial score");

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_perfect_score_shows_wave() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-perfect","name":"Alles goed","mode":"one-sided",
            "cards":[{"front":"lente"},{"front":"zomer"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-perfect").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "lente").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "zomer").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;
    wait_for_css(driver, ".fc-wave-overlay", Duration::from_secs(3)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_single_text_card_hides_partial_mode() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-single-text","name":"Enkele tekstkaart","mode":"one-sided",
            "cards":[{"front":"maan"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-single-text']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-single-text'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;

    let partial_exists = driver
        .execute(
            "return !!document.querySelector('input[name=\"fc-mode\"][value=\"partial\"]');",
            vec![],
        )
        .await?;
    assert!(
        !partial_exists.json().as_bool().unwrap_or(true),
        "partial mode should be hidden when only one text card is available"
    );

    let count_exists = driver
        .execute("return !!document.querySelector('#fc-count');", vec![])
        .await?;
    assert!(
        !count_exists.json().as_bool().unwrap_or(true),
        "partial count input should not be rendered for a single text card"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_review_mode_flips_and_navigates_inside_frame() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-review-mode","name":"Kaarten bekijken","mode":"two-sided",
            "cards":[
                {"front":"zon","back":"soleil"},
                {"front":"maan","back":"lune"},
                {"front":"ster","back":"etoile"},
                {"front":"wolk","back":"nuage"},
                {"front":"regen","back":"pluie"}
            ],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-review-mode']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-review-mode'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-start-review", Duration::from_secs(10)).await?;
    click(driver, "#fc-start-review").await?;

    wait_for_css(driver, ".fc-review-viewer", Duration::from_secs(10)).await?;
    wait_for_text(
        driver,
        "#exercise-title",
        "kaart 1 van 5",
        Duration::from_secs(10),
    )
    .await?;

    let start_metrics = driver
        .execute(
            r#"
            const viewport = document.querySelector('.fc-review-viewport');
            const active = document.querySelector('.fc-review-card.is-active');
            if (!viewport || !active) return null;
            const vr = viewport.getBoundingClientRect();
            const activeCenter = active.getBoundingClientRect().left + active.getBoundingClientRect().width / 2;
            return { viewportCenter: vr.left + vr.width / 2, activeCenter };
            "#,
            vec![],
        )
        .await?;
    let start = start_metrics.json();
    let start_obj = start.as_object().expect("expected review metrics object");
    let start_view_center = start_obj["viewportCenter"].as_f64().unwrap_or(0.0);
    let start_active_center = start_obj["activeCenter"].as_f64().unwrap_or(0.0);
    assert!(
        (start_active_center - start_view_center).abs() <= 4.0,
        "expected first review card to be centered at start",
    );

    click(driver, ".fc-review-card.is-active").await?;
    let flipped = driver
        .execute(
            "return document.querySelector('.fc-review-card.is-active')?.classList.contains('is-flipped') ?? false;",
            vec![],
        )
        .await?;
    assert!(
        flipped.json().as_bool().unwrap_or(false),
        "expected clicking the active review card to flip it",
    );

    click(driver, "#fc-review-next").await?;
    poll_until(Duration::from_secs(10), || async {
        let active = driver
            .execute(
                "return document.querySelector('.fc-review-card.is-active')?.dataset.index || '';",
                vec![],
            )
            .await?;
        Ok(active.json().as_str().unwrap_or("") == "1")
    })
    .await?;

    click(driver, "#fc-review-prev").await?;
    poll_until(Duration::from_secs(10), || async {
        let active = driver
            .execute(
                "return document.querySelector('.fc-review-card.is-active')?.dataset.index || '';",
                vec![],
            )
            .await?;
        Ok(active.json().as_str().unwrap_or("") == "0")
    })
    .await?;

    let fits = driver
        .execute(
            r#"
            const exercise = document.getElementById('exercise');
            const viewer = document.querySelector('.fc-review-viewer');
            const viewport = document.querySelector('.fc-review-viewport');
            if (!exercise || !viewer || !viewport) return false;
            const er = exercise.getBoundingClientRect();
            const vr = viewer.getBoundingClientRect();
            const pr = viewport.getBoundingClientRect();
            return vr.left >= er.left - 0.5 &&
                vr.right <= er.right + 0.5 &&
                pr.left >= er.left - 0.5 &&
                pr.right <= er.right + 0.5;
            "#,
            vec![],
        )
        .await?;
    assert!(
        fits.json().as_bool().unwrap_or(false),
        "expected the review viewer to stay inside the exercise frame",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_review_mode_home_link_leaves_without_warning() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-review-exit","name":"Vrij bekijken","mode":"two-sided",
            "cards":[{"front":"appel","back":"pomme"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-review-exit']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-review-exit'] .deck-select-btn",
    )
    .await?;
    click(driver, "#fc-start-review").await?;
    wait_for_css(driver, ".fc-review-viewer", Duration::from_secs(5)).await?;

    click(driver, ".home-link").await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    let dialogs = driver
        .find_all(By::Css("dialog.leave-guard-dialog"))
        .await?;
    assert!(
        dialogs.is_empty(),
        "expected review mode to leave without a warning dialog",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_review_mode_long_text_fits_on_card() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-review-long-text","name":"Lange kaarttekst","mode":"two-sided",
            "cards":[{"front":"dit is een extreem lange kaarttekst met veel woorden die normaal makkelijk buiten het kaartje zou vallen als je de letters niet dynamisch kleiner maakt","back":"dit is ook een lange achterkant die nog altijd volledig leesbaar moet blijven binnen de grenzen van dezelfde kaart"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-review-long-text']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-review-long-text'] .deck-select-btn",
    )
    .await?;
    click(driver, "#fc-start-review").await?;
    wait_for_css(driver, ".fc-review-viewer", Duration::from_secs(5)).await?;

    let front_fits = driver
        .execute(
            r#"
            return Array.from(document.querySelectorAll('.fc-review-face-front .fc-review-face-text'))
                .every(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
            "#,
            vec![],
        )
        .await?;
    assert!(
        front_fits.json().as_bool().unwrap_or(false),
        "expected long front text to shrink so it fits inside the review card",
    );

    click(driver, ".fc-review-card.is-active").await?;
    let back_fits = driver
        .execute(
            r#"
            return Array.from(document.querySelectorAll('.fc-review-face-back .fc-review-face-text'))
                .every(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
            "#,
            vec![],
        )
        .await?;
    assert!(
        back_fits.json().as_bool().unwrap_or(false),
        "expected long back text to shrink so it fits inside the review card",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_review_mode_multipart_card_shows_chips() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-review-parts","name":"Onderdelen kaart","mode":"two-sided",
            "cards":[
                {"front":"vraag","parts":["deel A","deel B","deel C"],"partsRequired":2}
            ],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-review-parts']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-review-parts'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-start-review", Duration::from_secs(10)).await?;
    click(driver, "#fc-start-review").await?;

    wait_for_css(driver, ".fc-review-viewer", Duration::from_secs(10)).await?;

    click(driver, ".fc-review-card.is-active").await?;
    poll_until(Duration::from_secs(10), || async {
        let result = driver
            .execute(
                "return document.querySelector('.fc-review-card.is-active')?.classList.contains('is-flipped') ?? false;",
                vec![],
            )
            .await?;
        Ok(result.json().as_bool().unwrap_or(false))
    })
    .await?;

    let back_face = driver.find(By::Css(".fc-review-face-back")).await?;
    let back_text = back_face.text().await?;
    let back_text_lower = back_text.to_lowercase();
    assert!(
        back_text_lower.contains("deel a")
            && back_text_lower.contains("deel b")
            && back_text_lower.contains("deel c"),
        "expected all part chips on the back face, got: {back_text}",
    );
    assert!(
        back_text_lower.contains("2 van 3 verplicht"),
        "expected required-count note on the back face, got: {back_text}",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_image_card_exercise_text_answer() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-img","name":"Afbeelding test","mode":"two-sided",
            "cards":[{"wikimedia":"File:Cat.jpg","back":"kat"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-img").await?;

    wait_for_css(
        driver,
        "#exercise-content .flash-image-container",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;

    set_input_value(driver, "#answer", "kat").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_order_checkbox_preserves_order() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-order","name":"Volgorde test","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-order']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-order'] .deck-select-btn",
    )
    .await?;

    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;
    let order_checked = driver
        .execute(
            "return document.querySelector('#fc-order-important')?.checked ?? true;",
            vec![],
        )
        .await?;
    assert!(
        !order_checked.json().as_bool().unwrap_or(true),
        "order checkbox should be unchecked by default"
    );

    set_checkbox(driver, "#fc-order-important", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "aap").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "beer").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_stop_mid_session_shows_partial_results() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-stop-partial","name":"Stop tussentijds","mode":"two-sided",
            "cards":[
                {"front":"appel","back":"pomme"},
                {"front":"hond","back":"chien"}
            ],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-stop-partial").await?;

    // Wait for the first question then immediately click "terug naar menu".
    // A confirm dialog appears; accept it to stop and show partial results.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    click(driver, ".exercise-meta .button-reset").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#stop-confirm").await?;

    // No cards answered before stop → only done cards recorded → 0 / 0.
    wait_for_text(driver, "#result h3", "0 / 0", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_legacy_multiline_back_rendered_as_multipart_in_review() -> TestResult<()> {
    // Injects a deck in the old format where multi-part content was stored as
    // newline-separated text in the `back` field (no `parts` array). The
    // normalization layer must detect the newline, split it, and render chips
    // in review mode — verifying the fix for the legacy multi-part card bug.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-legacy-mp","name":"Legacy onderdelen","mode":"two-sided",
            "cards":[{"front":"sfinx","back":"wachter van de zon\nhalf leeuw"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-legacy-mp']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-legacy-mp'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-start-review", Duration::from_secs(10)).await?;
    click(driver, "#fc-start-review").await?;

    wait_for_css(driver, ".fc-review-viewer", Duration::from_secs(10)).await?;

    // Flip the card to see the back face with parts chips.
    click(driver, ".fc-review-card.is-active").await?;
    poll_until(Duration::from_secs(10), || async {
        let result = driver
            .execute(
                "return document.querySelector('.fc-review-card.is-active')?.classList.contains('is-flipped') ?? false;",
                vec![],
            )
            .await?;
        Ok(result.json().as_bool().unwrap_or(false))
    })
    .await?;

    let chip_count = driver
        .execute(
            "return document.querySelectorAll('.fc-review-face-back .fc-review-part-chip').length;",
            vec![],
        )
        .await?;
    assert_eq!(
        chip_count.json().as_i64().unwrap_or(0),
        2,
        "expected 2 part chips on the back face of the legacy deck card",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_skip_two_sided_reveals_answer() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-skip-reveal","name":"Skip onthulling","mode":"two-sided",
            "cards":[{"front":"chat","back":"kat"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-skip-reveal").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    // Give a wrong answer so the skip button appears, then skip.
    set_input_value(driver, "#answer", "fout").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;

    // Skipping a two-sided card must reveal the answer and lock the exercise.
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    let locked = driver
        .execute(
            "return document.querySelector('#exercise-content')?.classList.contains('locked') ?? false;",
            vec![],
        )
        .await?;
    assert!(
        locked.json().as_bool().unwrap_or(false),
        "exercise should be locked (answer revealed) after skipping a two-sided card",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_fill_in_stop_skips_all_remaining_blanks() -> TestResult<()> {
    // One click of "stop oefening" on a fill-in question must skip all remaining
    // blanks at once rather than requiring a click per blank.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-fill-stop","name":"Fill stop","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"},{"front":"kat"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-fill-stop']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-fill-stop'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;

    // Use fill-all mode so all 3 cards are blanks.
    click(driver, "input[name='fc-mode'][value='all']").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // Wait for first fill-in blank, click "stop oefening", confirm the dialog.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fill-stop-confirm").await?;

    // A single confirmed skip must reach the result screen immediately (all blanks skipped).
    wait_for_nonempty_text(driver, "#result h3", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_fill_in_stop_dialog_can_be_cancelled() -> TestResult<()> {
    // "Blijf hier" in the fill-in stop dialog must keep the user on the exercise
    // without advancing to the result screen.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-fill-stop-cancel","name":"Fill stop annuleren","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-fill-stop-cancel']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-fill-stop-cancel'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;
    click(driver, "input[name='fc-mode'][value='all']").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // Click stop then cancel.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fill-stop-stay").await?;

    // Exercise must still be visible.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    let result_hidden = driver
        .execute(
            "return document.getElementById('page-result')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        result_hidden.json().as_bool().unwrap_or(false),
        "result section should remain hidden after cancelling the fill-in stop dialog",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_image_multipart_any_accepted_answer_correct() -> TestResult<()> {
    // An image card with multiple accepted answers (parts) should accept any one of
    // them as a correct answer.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-img-mp","name":"Afbeelding meerdere antwoorden","mode":"two-sided",
            "cards":[{"wikimedia":"File:Flag_of_Egypt.svg","back":"vlag van egypte\negyptische vlag","parts":["vlag van egypte","egyptische vlag"]}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-img-mp").await?;

    wait_for_css(
        driver,
        "#exercise-content .flash-image-container",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;

    // Give the second accepted answer.
    set_input_value(driver, "#answer", "egyptische vlag").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_stop_dialog_can_be_cancelled() -> TestResult<()> {
    // Clicking "Blijf hier" in the stop confirmation dialog must keep the user
    // on the exercise screen without recording any result.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-stop-cancel","name":"Stop annuleren","mode":"two-sided",
            "cards":[
                {"front":"chat","back":"kat"},
                {"front":"chien","back":"hond"}
            ],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-stop-cancel").await?;

    // Click "terug naar menu" to trigger the stop dialog.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    click(driver, ".exercise-meta .button-reset").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;

    // Click "Blijf hier" to cancel — exercise must still be visible.
    click(driver, "#stop-stay").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;

    // Result section must still be hidden.
    let result_hidden = driver
        .execute(
            "return document.getElementById('page-result')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        result_hidden.json().as_bool().unwrap_or(false),
        "result section should remain hidden after cancelling the stop dialog",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_skip_after_partial_progress_scores_zero() -> TestResult<()> {
    // User answers the first part correctly, then skips the card.
    // The whole card should be counted as wrong (0 / 1).
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_multipart_exercise(
        driver,
        &app.url("/extra/flashcards"),
        "test-mp-skip-partial",
        "sfinx",
        &["wachter van de zon", "half man", "half leeuw"],
        None,
    )
    .await?;

    // Answer first part correctly.
    set_input_value(driver, "#answer", "wachter van de zon").await?;
    click(driver, "#button-check").await?;

    // Skip button should now be visible (matched.size > 0).
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    click(driver, "#button-next").await?;

    wait_for_text(driver, "#result h3", "0 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_wrong_answer_does_not_count_as_progress() -> TestResult<()> {
    // Wrong answer followed by correct answers — all parts must still be submitted.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_multipart_exercise(
        driver,
        &app.url("/extra/flashcards"),
        "test-mp-wrong-then-right",
        "sfinx",
        &["wachter van de zon", "half man"],
        None,
    )
    .await?;

    // Wrong answer — no progress.
    set_input_value(driver, "#answer", "olifant").await?;
    click(driver, "#button-check").await?;

    // Counter must still show 0/2 (wrong answer is not partial progress).
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    let progress_text = driver
        .execute(
            "return document.querySelector('.fc-mp-progress')?.textContent ?? '';",
            vec![],
        )
        .await?;
    assert!(
        progress_text.json().as_str().unwrap_or("").contains("0/2"),
        "wrong answer must not advance the parts counter, got: {:?}",
        progress_text.json(),
    );

    // Now answer both parts correctly.
    set_input_value(driver, "#answer", "wachter van de zon").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    // Both answers are exact — no review state is shown, result is immediate.
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_lenient_answer_appears_in_bijna_goed() -> TestResult<()> {
    // A phrase-coverage (lenient) match on all parts should produce a "bijna goed"
    // entry in the result section.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_multipart_exercise(
        driver,
        &app.url("/extra/flashcards"),
        "test-mp-lenient-result",
        "sfinx",
        &["wachter van de zon", "half leeuw"],
        None,
    )
    .await?;

    // Both answers are phrase-coverage matches (content words present but not exact).
    set_input_value(driver, "#answer", "wachter zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half leeuw").await?;
    click(driver, "#button-check").await?;

    // Card done — review shown because of non-exact answers.
    wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
    click(driver, "#button-next").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    let bijna_goed = driver
        .execute(
            "return document.querySelector('.result-detail')?.textContent ?? '';",
            vec![],
        )
        .await?;
    assert!(
        bijna_goed
            .json()
            .as_str()
            .unwrap_or("")
            .to_lowercase()
            .contains("bijna goed"),
        "lenient multi-part answers should produce a 'bijna goed' section in results",
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_multipart_parts_required_equal_to_total_behaves_as_all_required()
-> TestResult<()> {
    // A card stored with partsRequired == parts.length should be normalised to
    // "all required" (partsRequired absent) — the exercise must demand all parts.
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Inject with partsRequired == parts.length (redundant but valid input).
    setup_multipart_exercise(
        driver,
        &app.url("/extra/flashcards"),
        "test-mp-req-eq-total",
        "sfinx",
        &["wachter van de zon", "half man"],
        Some(2), // == parts.length → normalised to absent
    )
    .await?;

    // Answer only the first part — card must NOT be done yet.
    set_input_value(driver, "#answer", "wachter van de zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    let next_visible = driver.find_all(By::Css("#button-next")).await?;
    assert!(
        next_visible.is_empty(),
        "card with partsRequired == parts.length must require all parts before finishing",
    );

    // Answer the second part — now it should finish.
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    // Both answers are exact — no review state, result is immediate.
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}
