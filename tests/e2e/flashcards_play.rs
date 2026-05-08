use super::helpers::{
    click, inject_deck, inject_deck_json, select_deck_and_start, set_checkbox, set_input_value,
    wait_for_css, wait_for_rail_stable, wait_for_text,
};
use super::{BrowserHarness, By, Duration, Key, TestApp, TestResult};

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
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(5)).await?;
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
    wait_for_css(driver, ".fc-hint-toggle", Duration::from_secs(5)).await?;

    let hint_hidden_before = driver
        .execute(
            "return document.querySelector('.fc-hint-text')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        hint_hidden_before.json().as_bool().unwrap_or(false),
        "hint text should be hidden before clicking the toggle"
    );

    click(driver, ".fc-hint-toggle").await?;

    let hint_hidden_after = driver
        .execute(
            "return document.querySelector('.fc-hint-text')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        !hint_hidden_after.json().as_bool().unwrap_or(true),
        "hint text should be visible after clicking the toggle"
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

    wait_for_text(driver, "#result h3", "3 / 3", Duration::from_secs(10)).await?;

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

    wait_for_text(driver, "#result h3", "3 / 3", Duration::from_secs(5)).await?;

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

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;

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

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;

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

    wait_for_text(driver, "#result h3", "0 / 2", Duration::from_secs(5)).await?;

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
    wait_for_rail_stable(driver).await?;

    let start_metrics = driver
        .execute(
            r#"
            const viewport = document.querySelector('.fc-review-viewport');
            const rail = document.querySelector('.fc-review-rail');
            const cards = Array.from(document.querySelectorAll('.fc-review-card'));
            const inners = Array.from(document.querySelectorAll('.fc-review-card-inner'));
            const active = document.querySelector('.fc-review-card.is-active');
            if (!viewport || !rail || cards.length < 3 || !active) return null;
            const vr = viewport.getBoundingClientRect();
            const centers = cards.map(card => {
                const r = card.getBoundingClientRect();
                return r.left + r.width / 2;
            });
            // layout steps: center-to-center distances between adjacent card slots.
            const steps = centers.slice(1).map((center, i) => center - centers[i]);
            // visual gaps: space between the scaled visual faces of adjacent cards.
            // getBoundingClientRect on the inner element returns the post-transform rect.
            const visualRects = inners.map(el => el.getBoundingClientRect());
            const visualGaps = visualRects.slice(1).map((r, i) => r.left - visualRects[i].right);
            const transform = new DOMMatrixReadOnly(getComputedStyle(rail).transform).m41;
            const activeCenter = active.getBoundingClientRect().left + active.getBoundingClientRect().width / 2;
            return {
                viewportCenter: vr.left + vr.width / 2,
                activeCenter,
                steps,
                visualGaps,
                transform,
            };
            "#,
            vec![],
        )
        .await?;
    let start = start_metrics.json();
    let start_obj = start.as_object().expect("expected review metrics object");
    let start_view_center = start_obj["viewportCenter"].as_f64().unwrap_or(0.0);
    let start_active_center = start_obj["activeCenter"].as_f64().unwrap_or(0.0);
    let start_transform = start_obj["transform"].as_f64().unwrap_or(0.0);
    assert!(
        (start_active_center - start_view_center).abs() <= 4.0,
        "expected first review card to be centered at start",
    );
    // The active card has margin-inline to compensate for its larger visual scale,
    // so layout step[0] (active→inactive) is intentionally larger than the others.
    // What must be equal is the VISUAL gap — the space between scaled faces.
    let visual_gaps = start_obj["visualGaps"]
        .as_array()
        .expect("expected visual gaps");
    let base_gap = visual_gaps[0].as_f64().unwrap_or(0.0);
    for gap in visual_gaps {
        let value = gap.as_f64().unwrap_or(0.0);
        assert!(
            (value - base_gap).abs() <= 2.0,
            "expected equal visual spacing between cards, got {value} vs {base_gap}",
        );
    }
    // Rail shift per navigation step = card width + gap (inactive-to-inactive step).
    // The margin on the active card cancels out when active moves: both positions
    // include +M so the delta is just W+G.  Use the last layout step (always
    // between two inactive cards) as the canonical slot width.
    let start_steps = start_obj["steps"].as_array().expect("expected step array");
    let inactive_step = start_steps.last().and_then(|v| v.as_f64()).unwrap_or(0.0);

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
    wait_for_text(
        driver,
        "#exercise-title",
        "kaart 2 van 5",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_rail_stable(driver).await?;
    let one_step_metrics = driver
        .execute(
            r#"
            const viewport = document.querySelector('.fc-review-viewport');
            const rail = document.querySelector('.fc-review-rail');
            const active = document.querySelector('.fc-review-card.is-active');
            if (!viewport || !rail || !active) return null;
            const vr = viewport.getBoundingClientRect();
            const activeCenter = active.getBoundingClientRect().left + active.getBoundingClientRect().width / 2;
            const transform = new DOMMatrixReadOnly(getComputedStyle(rail).transform).m41;
            return { viewportCenter: vr.left + vr.width / 2, activeCenter, transform };
            "#,
            vec![],
        )
        .await?;
    let one_step = one_step_metrics.json();
    let one_step_obj = one_step.as_object().expect("expected one-step object");
    let one_step_view_center = one_step_obj["viewportCenter"].as_f64().unwrap_or(0.0);
    let one_step_active_center = one_step_obj["activeCenter"].as_f64().unwrap_or(0.0);
    let one_step_transform = one_step_obj["transform"].as_f64().unwrap_or(0.0);
    assert!(
        (one_step_active_center - one_step_view_center).abs() <= 4.0,
        "expected next review card to stay centered after one-step navigation",
    );
    assert!(
        ((one_step_transform - start_transform).abs() - inactive_step).abs() <= 2.0,
        "expected moving one card to shift the rail by one slot",
    );

    click(driver, "#fc-review-prev").await?;
    wait_for_text(
        driver,
        "#exercise-title",
        "kaart 1 van 5",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_rail_stable(driver).await?;
    click(driver, ".fc-review-card[data-index='2']").await?;
    wait_for_text(
        driver,
        "#exercise-title",
        "kaart 3 van 5",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_rail_stable(driver).await?;
    let jump_metrics = driver
        .execute(
            r#"
            const viewport = document.querySelector('.fc-review-viewport');
            const rail = document.querySelector('.fc-review-rail');
            const active = document.querySelector('.fc-review-card.is-active');
            if (!viewport || !rail || !active) return null;
            const vr = viewport.getBoundingClientRect();
            const activeCenter = active.getBoundingClientRect().left + active.getBoundingClientRect().width / 2;
            const transform = new DOMMatrixReadOnly(getComputedStyle(rail).transform).m41;
            return { viewportCenter: vr.left + vr.width / 2, activeCenter, transform };
            "#,
            vec![],
        )
        .await?;
    let jump = jump_metrics.json();
    let jump_obj = jump.as_object().expect("expected jump object");
    let jump_view_center = jump_obj["viewportCenter"].as_f64().unwrap_or(0.0);
    let jump_active_center = jump_obj["activeCenter"].as_f64().unwrap_or(0.0);
    let jump_transform = jump_obj["transform"].as_f64().unwrap_or(0.0);
    assert!(
        (jump_active_center - jump_view_center).abs() <= 4.0,
        "expected jumped-to review card to stay centered, got: activeCenter={jump_active_center:.2}, viewportCenter={jump_view_center:.2}, transform={jump_transform:.2}",
    );
    assert!(
        ((jump_transform - start_transform).abs() - inactive_step * 2.0).abs() <= 2.5,
        "expected clicking two cards away to shift the rail by two slots, got: jumpTransform={jump_transform:.2}, startTransform={start_transform:.2}, inactiveStep={inactive_step:.2}",
    );

    driver
        .find(By::Css("body"))
        .await?
        .send_keys(Key::Left)
        .await?;
    wait_for_text(
        driver,
        "#exercise-title",
        "kaart 2 van 5",
        Duration::from_secs(10),
    )
    .await?;

    for title in ["kaart 3 van 5", "kaart 4 van 5", "kaart 5 van 5"] {
        click(driver, "#fc-review-next").await?;
        wait_for_text(driver, "#exercise-title", title, Duration::from_secs(10)).await?;
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
    let last_metrics = driver
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
    let last = last_metrics.json();
    let last_obj = last.as_object().expect("expected last-card metrics object");
    let last_view_center = last_obj["viewportCenter"].as_f64().unwrap_or(0.0);
    let last_active_center = last_obj["activeCenter"].as_f64().unwrap_or(0.0);
    assert!(
        (last_active_center - last_view_center).abs() <= 4.0,
        "expected last review card to stop centered as well",
    );

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
    // Wait for the initial centering animation to finish before clicking.
    wait_for_rail_stable(driver).await?;

    // Flip the card to reveal the back face with the parts.  Use a JS click so
    // the event fires directly on the element regardless of animation state.
    driver
        .execute(
            "document.querySelector('.fc-review-card.is-active')?.click();",
            vec![],
        )
        .await?;
    wait_for_css(
        driver,
        ".fc-review-card.is-active.is-flipped",
        Duration::from_secs(10),
    )
    .await?;
    tokio::time::sleep(Duration::from_millis(420)).await;

    // Three part chips should be rendered on the back face.
    let chips = driver
        .find_all(By::Css(".fc-review-face-back .fc-review-part-chip"))
        .await?;
    assert_eq!(
        chips.len(),
        3,
        "expected 3 part chips on the back face, got {}",
        chips.len()
    );
    let chip_texts: Vec<String> = {
        let mut v = Vec::new();
        for chip in &chips {
            v.push(chip.text().await?);
        }
        v
    };
    assert_eq!(
        chip_texts,
        ["deel A", "deel B", "deel C"],
        "part chip texts did not match",
    );

    // The required-count note should read "2 van 3 verplicht".
    wait_for_text(
        driver,
        ".fc-review-face-back .fc-review-parts-note",
        "2 van 3 verplicht",
        Duration::from_secs(10),
    )
    .await?;

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
