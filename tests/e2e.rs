mod support;

use std::thread::sleep;
use std::time::{Duration, Instant};

use rama::error::BoxError;
use support::a11y::check_a11y;
use support::app::TestApp;
use support::browser::BrowserHarness;
use thirtyfour::prelude::{By, WebDriver, WebElement};

type TestResult<T> = Result<T, BoxError>;

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn accessibility_on_key_pages() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Home page
    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    // Exercise setup form (multiplications — representative of all exercises)
    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;

    // Exercise play page
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    // Let the page-in animation (220 ms) finish before axe measures contrast ratios.
    sleep(Duration::from_millis(300));
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn home_page_and_all_exercise_routes_render() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(
        driver,
        ".exercise-list a[data-exercise-id]",
        Duration::from_secs(10),
    )
    .await?;

    let links = driver
        .find_all(By::Css(".exercise-list a[data-exercise-id]"))
        .await?;
    assert!(
        !links.is_empty(),
        "expected exercise links on the home page"
    );

    let hrefs: Vec<String> = collect_hrefs(links).await?;
    for href in hrefs {
        driver.goto(app.url(&href)).await?;
        wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
        wait_for_css(driver, "#history", Duration::from_secs(10)).await?;
    }

    driver.clone().quit().await?;
    Ok(())
}

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
    // Wait for the question-in animation (180 ms, starts at opacity:0) to finish
    // before reading text — WebDriver returns "" for invisible elements.
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

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn cached_exercise_page_survives_server_shutdown() -> TestResult<()> {
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    sleep(Duration::from_secs(1));
    driver.refresh().await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    sleep(Duration::from_secs(1));

    app.stop();

    driver.refresh().await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

// ---- flashcard tests -------------------------------------------------------

/// Set up a custom deck in localStorage so example decks don't affect ordering.
async fn inject_deck(driver: &WebDriver, id: &str, name: &str, cards_json: &str) -> TestResult<()> {
    let script = format!(
        r#"localStorage.setItem('homework_flashcard_decks',
            JSON.stringify([{{id:'{id}',name:{name:?},cards:{cards_json},createdAt:1}}])
        );"#,
    );
    driver.execute(&script, vec![]).await?;
    Ok(())
}

/// Inject a fully-specified deck JSON object (allows setting mode, bidirectional, hints, …).
async fn inject_deck_json(driver: &WebDriver, deck_json: &str) -> TestResult<()> {
    let script =
        format!("localStorage.setItem('homework_flashcard_decks', JSON.stringify([{deck_json}]));");
    driver.execute(&script, vec![]).await?;
    Ok(())
}

/// Use the browser's native CompressionStream to encode a deck the same way
/// flashcards.js does, and return the resulting URL `?import=…` parameter value.
async fn generate_import_param(driver: &WebDriver) -> TestResult<String> {
    encode_deck_for_import(
        driver,
        r#"{name:"Gedeeld deck",mode:"two-sided",bidirectional:false,cards:[{front:"huis",back:"maison"}]}"#,
    )
    .await
}

/// Encode an arbitrary deck JS literal (not JSON — property names need no quotes in JS)
/// via the browser's CompressionStream, matching flashcards.js's `encodeDeck`.
async fn encode_deck_for_import(driver: &WebDriver, deck_js: &str) -> TestResult<String> {
    let script = format!(
        r#"
        const done = arguments[arguments.length - 1];
        const deck = {deck_js};
        const json = JSON.stringify(deck);
        const cs = new CompressionStream("deflate-raw");
        const writer = cs.writable.getWriter();
        writer.write(new TextEncoder().encode(json));
        writer.close();
        new Response(cs.readable).arrayBuffer().then(buf => {{
            let bin = "";
            for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
            done(btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""));
        }});
        "#
    );
    let result = driver.execute_async(&script, vec![]).await?;
    Ok(result.json().as_str().unwrap_or("").to_owned())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_setup_shows_example_decks() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager .deck-list", Duration::from_secs(10)).await?;

    let items = driver.find_all(By::Css(".deck-item")).await?;
    assert!(
        items.len() >= 2,
        "expected at least 2 example decks, found {}",
        items.len()
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_one_sided_deck_completes_session() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Load page first so localStorage is in scope, then inject a 2-card one-sided deck.
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

    // ensureExamples() prepends built-in decks, so target by ID rather than position.
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

    // Single card: fill in the correct answer.
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

    // ensureExamples() prepends built-in decks, so target by ID rather than position.
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

    // Single card: type the correct back value.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "woef").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_create_one_sided_deck_and_practice() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Open the new-deck editor.
    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Mijn memorisatiedeck").await?;

    // Fill in the first card (front only → one-sided).
    set_input_value(driver, "#card-front-0", "zon").await?;

    // Add a second card.
    click(driver, "#fc-add-card").await?;
    wait_for_css(driver, "#card-front-1", Duration::from_secs(5)).await?;
    set_input_value(driver, "#card-front-1", "maan").await?;

    // Save the deck.
    click(driver, "#fc-save-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(5)).await?;

    // Start a session.
    click(driver, "#form-setup button[type='submit']").await?;

    // Card 1 (index 0): fill in "zon".
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "zon").await?;
    click(driver, "#button-check").await?;

    // Card 2 (index 1): skip.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;

    wait_for_text(driver, "#result h3", "1 / 2", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_create_two_sided_deck_and_practice() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Open the new-deck editor.
    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Mijn koppelingsdeck").await?;

    // Switch to two-sided mode first so the back field becomes visible.
    click(driver, "input[name='deck-type'][value='two-sided']").await?;

    // One card with front + back.
    set_input_value(driver, "#card-front-0", "huis").await?;
    set_input_value(driver, "#card-back-0", "maison").await?;

    // Save and start.
    click(driver, "#fc-save-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(5)).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // Single two-sided card: type the correct back.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "maison").await?;
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
    // Two-sided bidirectional deck: same front and back so the answer is correct
    // regardless of which direction the exercise picks.
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

    // Hint toggle button must be present.
    wait_for_css(driver, ".fc-hint-toggle", Duration::from_secs(5)).await?;

    // Hint text is hidden until the button is clicked.
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

    // After click the hint text must be visible.
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
async fn flashcards_import_via_url_is_client_side() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // Load the page first so we can use the browser's CompressionStream API.
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Encode a deck entirely in the browser — same algorithm as flashcards.js.
    let param = generate_import_param(driver).await?;
    assert!(
        !param.is_empty(),
        "expected a non-empty encoded import param"
    );

    // Navigate to the import URL. The server only serves the page HTML; all
    // decoding happens in the browser (client-side only).
    driver
        .goto(app.url(&format!("/extra/flashcards?import={param}")))
        .await?;

    // The import confirmation box must appear — proving client-side decode worked.
    wait_for_css(driver, ".fc-import-box", Duration::from_secs(10)).await?;

    // Confirm import and verify the deck is now selected.
    click(driver, "#fc-confirm-import").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_import_exact_duplicate_selects_existing() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Pre-inject a deck whose content exactly matches what generate_import_param encodes.
    inject_deck_json(
        driver,
        r#"{"id":"test-dup","name":"Gedeeld deck","mode":"two-sided","bidirectional":false,
            "cards":[{"front":"huis","back":"maison"}],"createdAt":1}"#,
    )
    .await?;

    let param = generate_import_param(driver).await?;
    driver
        .goto(app.url(&format!("/extra/flashcards?import={param}")))
        .await?;

    // No import dialog should appear: content is identical, so the existing deck
    // is auto-selected with a toast instead.
    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-dup'].selected",
        Duration::from_secs(10),
    )
    .await?;
    let import_boxes = driver.find_all(By::Css(".fc-import-box")).await?;
    assert!(
        import_boxes.is_empty(),
        "import dialog must not appear for a deck with identical content"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_import_name_conflict_overwrite() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Pre-inject a deck with the same name but different cards.
    inject_deck_json(
        driver,
        r#"{"id":"test-conf-ow","name":"Gedeeld deck","mode":"two-sided","bidirectional":false,
            "cards":[{"front":"chat","back":"kat"}],"createdAt":1}"#,
    )
    .await?;

    let param = generate_import_param(driver).await?;
    driver
        .goto(app.url(&format!("/extra/flashcards?import={param}")))
        .await?;

    // The conflict UI must appear with both resolution buttons.
    wait_for_css(driver, ".fc-import-box", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#fc-overwrite-import", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#fc-saveas-import", Duration::from_secs(5)).await?;

    // Click overwrite — the existing deck entry is replaced in-place.
    click(driver, "#fc-overwrite-import").await?;
    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-conf-ow'].selected",
        Duration::from_secs(10),
    )
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_import_name_conflict_save_as_new() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Pre-inject a deck with the same name but different cards.
    inject_deck_json(
        driver,
        r#"{"id":"test-conf-new","name":"Gedeeld deck","mode":"two-sided","bidirectional":false,
            "cards":[{"front":"chat","back":"kat"}],"createdAt":1}"#,
    )
    .await?;

    let param = generate_import_param(driver).await?;
    driver
        .goto(app.url(&format!("/extra/flashcards?import={param}")))
        .await?;

    // The conflict UI must appear.
    wait_for_css(driver, "#fc-saveas-import", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#fc-import-name", Duration::from_secs(5)).await?;

    // Change the proposed name and save as a new deck.
    set_input_value(driver, "#fc-import-name", "Gedeeld deck (kopie)").await?;
    click(driver, "#fc-saveas-import").await?;

    // The newly created deck (with the renamed title) must be selected.
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(10)).await?;
    let selected_name = text_of(driver, ".deck-item.selected .deck-name").await?;
    assert_eq!(
        selected_name, "Gedeeld deck (kopie)",
        "the new deck must carry the user-supplied name"
    );

    // The original conflicting deck must still be present in the list.
    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-conf-new']",
        Duration::from_secs(5),
    )
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

/// Select the deck with the given ID, start the exercise, and return.
async fn select_deck_and_start(driver: &WebDriver, deck_id: &str) -> TestResult<()> {
    wait_for_css(
        driver,
        &format!(".deck-item[data-deck-id='{deck_id}']"),
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        &format!(".deck-item[data-deck-id='{deck_id}'] .deck-select-btn"),
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;
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

    // Deck with one 3-part card; all 3 parts required (default).
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

    // Part 1: fuzzy match "wachter zon" → "wachter van de zon".
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, ".fc-mp-progress", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter zon").await?;
    click(driver, "#button-check").await?;

    // Part 2: "half man" (exact).
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    // Part 3: fuzzy "halve leeuw" → "half leeuw".
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "halve leeuw").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "3 / 3", Duration::from_secs(10)).await?;

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

    // Deck with one 3-part card.
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

    // Type all three parts comma-separated in one shot.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(
        driver,
        "#answer",
        "wachter van de zon, half man, half leeuw",
    )
    .await?;
    click(driver, "#button-check").await?;

    // The 2 auto-advance entries fire with 200 ms each; wait up to 5 s.
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

    // 3-part card with only 2 required.
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

    // Give 2 of 3 parts; third entry is auto-advanced.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "wachter van de zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "half man").await?;
    click(driver, "#button-check").await?;

    // Second entry satisfied requiredCount=2, third auto-advances.
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

    // Type both parts with Dutch "en" as separator — should count as all-at-once.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "sinaasappelen en dadels").await?;
    click(driver, "#button-check").await?;

    // Both entries should auto-advance; result shows 2/2.
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

    // Single 2-part card only — avoids shuffle-order flakiness.
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

    // At part 0 of the 2-part card: make a wrong attempt so skip button appears.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "fout antwoord").await?;
    click(driver, "#button-check").await?;

    // Click skip — should skip the ENTIRE card (both parts), going straight to results.
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;

    // Both parts skipped; result shows 0 / 2 with no more questions.
    wait_for_text(driver, "#result h3", "0 / 2", Duration::from_secs(5)).await?;

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

    // Single two-sided card: correct answer includes a Dutch article.
    inject_deck_json(
        driver,
        r#"{"id":"test-lenient","name":"Bijna goed test","mode":"two-sided",
            "cards":[{"front":"egyptisch heerser","back":"de farao"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-lenient").await?;

    // Type answer without the article — should be accepted via phrase-coverage.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "farao").await?;
    click(driver, "#button-check").await?;

    // Session ends; result shows 1 / 1 and the "Bijna goed" section appears.
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(5)).await?;
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

    // Cards whose text contains emoji with variation selectors (e.g. ❄️ = U+2744 + U+FE0F).
    // The user should be able to answer with plain text and still be accepted.
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

    // Both plain-text answers accepted despite emoji in card text — 2 / 2.
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

    // Answer first correctly, then skip the second.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "lente").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "fout").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(3)).await?;
    click(driver, "#button-skip").await?;

    // 1 / 2 — no wave overlay should ever appear.
    wait_for_text(driver, "#result h3", "1 / 2", Duration::from_secs(5)).await?;
    // Give it a full second to confirm the wave is not triggered.
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

    // 2 / 2 — wave overlay should appear briefly.
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

/// ---- Config persistence test -----------------------------------------------

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_mode_config_persists_across_sessions() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // 4-card one-sided deck so partial mode (≥2 blanks) is valid.
    inject_deck_json(
        driver,
        r#"{"id":"test-persist","name":"Config persistentie","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"},{"front":"kat"},{"front":"hond"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    // Select the deck so mode options appear.
    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-persist']",
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        ".deck-item[data-deck-id='test-persist'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;

    // Switch to partial mode, set count to 2, and enable order-important.
    click(driver, "input[name='fc-mode'][value='partial']").await?;
    wait_for_enabled(driver, "#fc-count", Duration::from_secs(3)).await?;
    set_input_value(driver, "#fc-count", "2").await?;
    set_checkbox(driver, "#fc-order-important", true).await?;

    // Start a session and skip both blanks directly — the fill-in renderer shows
    // the skip button immediately so no answer is required.
    click(driver, "#form-setup button[type='submit']").await?;
    for _ in 0..2 {
        wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
        click(driver, "#button-skip").await?;
    }

    // Return to setup. Wait for the result text to be visible (not just present in
    // the DOM) — the result page has a page-in animation; clicking reset too early
    // throws ElementNotInteractable while the overlay is still fading in.
    wait_for_nonempty_text(driver, "#result h3", Duration::from_secs(10)).await?;
    click(driver, "#page-result .button-reset").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    // Mode options must be restored: partial radio checked, count = 2, order checked.
    wait_for_css(driver, "#fc-order-important", Duration::from_secs(5)).await?;

    let partial_checked = driver
        .execute(
            "return document.querySelector('input[name=\"fc-mode\"][value=\"partial\"]')?.checked ?? false;",
            vec![],
        )
        .await?;
    assert!(
        partial_checked.json().as_bool().unwrap_or(false),
        "partial mode radio must be restored after returning to setup"
    );

    let count_val = driver
        .execute(
            "return document.querySelector('#fc-count')?.value ?? '';",
            vec![],
        )
        .await?;
    assert_eq!(
        count_val.json().as_str().unwrap_or(""),
        "2",
        "partial count must be restored to 2"
    );

    let order_checked = driver
        .execute(
            "return document.querySelector('#fc-order-important')?.checked ?? false;",
            vec![],
        )
        .await?;
    assert!(
        order_checked.json().as_bool().unwrap_or(false),
        "order-important checkbox must be restored"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// ---- Image card tests -------------------------------------------------------

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_image_card_exercise_text_answer() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Inject a deck with a single image card.  No real image is loaded during
    // the test — the exercise renders a loading placeholder and the answer field
    // still appears and accepts text.
    inject_deck_json(
        driver,
        r#"{"id":"test-img","name":"Afbeelding test","mode":"two-sided",
            "cards":[{"wikimedia":"File:Cat.jpg","back":"kat"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    select_deck_and_start(driver, "test-img").await?;

    // The image-card question renders a container plus the answer input.
    wait_for_css(
        driver,
        "#exercise-content .flash-image-container",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;

    // Type the correct answer and confirm it's accepted.
    set_input_value(driver, "#answer", "kat").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_image_card_type_toggle_in_editor() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // Open the new-deck editor.
    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;

    // Default state: text front is visible, image front is hidden.
    let img_front_hidden_before = driver
        .execute(
            "return document.querySelector('.card-image-front')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        img_front_hidden_before.json().as_bool().unwrap_or(false),
        "image front should be hidden when card type is text"
    );

    let text_front_hidden_before = driver
        .execute(
            "return document.querySelector('.card-text-front')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        !text_front_hidden_before.json().as_bool().unwrap_or(true),
        "text front should be visible by default"
    );

    // Click the image radio button for card 0.
    click(driver, "input[name='card-type-0'][value='image']").await?;

    // Now image front should be visible and text front hidden.
    let img_front_hidden_after = driver
        .execute(
            "return document.querySelector('.card-image-front')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        !img_front_hidden_after.json().as_bool().unwrap_or(true),
        "image front should be visible after toggling to image type"
    );

    let text_front_hidden_after = driver
        .execute(
            "return document.querySelector('.card-text-front')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        text_front_hidden_after.json().as_bool().unwrap_or(false),
        "text front should be hidden after toggling to image type"
    );

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

    // Two-card one-sided deck in a fixed order.
    inject_deck_json(
        driver,
        r#"{"id":"test-order","name":"Volgorde test","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    // Select the deck: mode options (including the order checkbox) should appear.
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

    // The order checkbox must be visible and unchecked by default (shuffle is the default).
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

    // Check the box so order is preserved, then start.
    set_checkbox(driver, "#fc-order-important", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // With preserved order the fill-in grid starts at "aap" (index 0).
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "aap").await?;
    click(driver, "#button-check").await?;

    // Second slot is "beer".
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "beer").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

// ---- helpers ---------------------------------------------------------------

async fn collect_hrefs(links: Vec<WebElement>) -> TestResult<Vec<String>> {
    let mut hrefs = Vec::with_capacity(links.len());
    for link in links {
        if let Some(href) = link.attr("href").await? {
            hrefs.push(href);
        }
    }
    Ok(hrefs)
}

async fn wait_for_css(driver: &WebDriver, selector: &str, timeout: Duration) -> TestResult<()> {
    poll_until(timeout, || async {
        let matches = driver.find_all(By::Css(selector)).await?;
        Ok(!matches.is_empty())
    })
    .await
}

async fn wait_for_text(
    driver: &WebDriver,
    selector: &str,
    expected: &str,
    timeout: Duration,
) -> TestResult<()> {
    let expected = expected.to_owned();
    poll_until(timeout, || async {
        let matches = driver.find_all(By::Css(selector)).await?;
        if matches.is_empty() {
            return Ok(false);
        }
        let text = matches[0].text().await?;
        Ok(text.contains(&expected))
    })
    .await
}

async fn selector_has_disabled(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<bool> {
    wait_for_css(driver, selector, timeout).await?;
    let disabled = driver
        .find(By::Css(selector))
        .await?
        .prop("disabled")
        .await?
        .unwrap_or_default();
    Ok(disabled == "true")
}

async fn click(driver: &WebDriver, selector: &str) -> TestResult<()> {
    driver.find(By::Css(selector)).await?.click().await?;
    Ok(())
}

async fn set_input_value(driver: &WebDriver, selector: &str, value: &str) -> TestResult<()> {
    let input = driver.find(By::Css(selector)).await?;
    input.clear().await?;
    input.send_keys(value).await?;
    Ok(())
}

async fn set_checkbox(driver: &WebDriver, selector: &str, checked: bool) -> TestResult<()> {
    let checkbox = driver.find(By::Css(selector)).await?;
    if checkbox.is_selected().await? != checked {
        checkbox.click().await?;
    }
    Ok(())
}

async fn text_of(driver: &WebDriver, selector: &str) -> TestResult<String> {
    Ok(driver.find(By::Css(selector)).await?.text().await?)
}

/// Poll until the element at `selector` has non-empty visible text, then return it.
/// Necessary because WebDriver's `.text()` returns "" while CSS opacity animations run.
async fn wait_for_nonempty_text(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<String> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(el) = driver.find(By::Css(selector)).await {
            let t = el.text().await.unwrap_or_default();
            if !t.trim().is_empty() {
                return Ok(t);
            }
        }
        if Instant::now() >= deadline {
            return Err(format!("no visible text in {selector:?} within {timeout:?}").into());
        }
        sleep(Duration::from_millis(30));
    }
}

async fn wait_for_enabled(driver: &WebDriver, selector: &str, timeout: Duration) -> TestResult<()> {
    let deadline = Instant::now() + timeout;
    let script = format!(
        "var el = document.querySelector({selector:?}); return el != null && !el.disabled;"
    );
    loop {
        let enabled = driver
            .execute(&script, vec![])
            .await
            .ok()
            .and_then(|v| v.json().as_bool())
            .unwrap_or(false);
        if enabled {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("{selector:?} not enabled within {timeout:?}").into());
        }
        sleep(Duration::from_millis(30));
    }
}

async fn poll_until<F, Fut>(timeout: Duration, mut f: F) -> TestResult<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = TestResult<bool>>,
{
    let deadline = Instant::now() + timeout;
    loop {
        if f().await? {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("condition not met within {timeout:?}").into());
        }
        sleep(Duration::from_millis(100));
    }
}

fn parse_product_answer(text: &str) -> TestResult<u32> {
    let mut numbers = text
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .map(str::parse::<u32>);

    let a = numbers
        .next()
        .ok_or_else(|| format!("could not parse first number from {text:?}"))??;
    let b = numbers
        .next()
        .ok_or_else(|| format!("could not parse second number from {text:?}"))??;

    Ok(a * b)
}
