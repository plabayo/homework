use super::helpers::{
    click, inject_deck, inject_deck_json, poll_until, select_deck_and_start, set_checkbox,
    set_input_value, wait_for_css, wait_for_text,
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

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;
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
