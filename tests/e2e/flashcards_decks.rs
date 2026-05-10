// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, generate_import_param, inject_deck_json, select_deck_and_start, set_input_value,
    text_of, wait_for_css, wait_for_enabled, wait_for_nonempty_text, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult};

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
async fn flashcards_create_one_sided_deck_and_practice() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Mijn memorisatiedeck").await?;
    set_input_value(driver, "#card-front-0", "zon").await?;

    click(driver, "#fc-add-card").await?;
    wait_for_css(driver, "#card-front-1", Duration::from_secs(5)).await?;
    set_input_value(driver, "#card-front-1", "maan").await?;

    click(driver, "#fc-save-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(5)).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "zon").await?;
    click(driver, "#button-check").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#button-skip:not([hidden])", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fill-stop-confirm").await?;

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

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Mijn koppelingsdeck").await?;
    click(driver, "input[name='deck-type'][value='two-sided']").await?;
    set_input_value(driver, "#card-front-0", "huis").await?;
    set_input_value(driver, "#card-back-0", "maison").await?;

    click(driver, "#fc-save-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(5)).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "maison").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_unsaved_editor_home_link_can_save_before_leaving() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Bewaar mij").await?;
    set_input_value(driver, "#card-front-0", "zon").await?;

    click(driver, ".home-link").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#leave-save").await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    let saved = driver
        .execute(
            "return JSON.parse(localStorage.getItem('homework_flashcard_decks') || '[]').some(d => d.name === 'Bewaar mij');",
            vec![],
        )
        .await?;
    assert!(
        saved.json().as_bool().unwrap_or(false),
        "expected the deck to be saved before leaving via the home link"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_unsaved_editor_browser_back_can_stay_on_page() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;
    click(driver, "a[data-exercise-id='flashcards']").await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Niet bewaren").await?;
    set_input_value(driver, "#card-front-0", "maan").await?;

    driver.back().await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#leave-stay").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;

    let name_value = driver
        .find(By::Css("#deck-name-input"))
        .await?
        .prop("value")
        .await?
        .unwrap_or_default();
    assert!(
        name_value.contains("Niet bewaren"),
        "expected the editor to stay open after cancelling browser-back navigation"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_unsaved_editor_home_link_can_discard_changes() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;
    set_input_value(driver, "#deck-name-input", "Niet bewaren").await?;
    set_input_value(driver, "#card-front-0", "maan").await?;

    click(driver, ".home-link").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#leave-discard").await?;
    wait_for_css(driver, ".exercise-list", Duration::from_secs(10)).await?;

    let saved = driver
        .execute(
            "return JSON.parse(localStorage.getItem('homework_flashcard_decks') || '[]').some(d => d.name === 'Niet bewaren');",
            vec![],
        )
        .await?;
    assert!(
        !saved.json().as_bool().unwrap_or(true),
        "expected the unsaved draft to be discarded when leaving via the home link"
    );

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_newline_back_without_parts_is_treated_as_multi_component() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-egypt-newline","name":"Egypte newline","mode":"two-sided",
            "cards":[{"front":"egypte","back":"de nijl\nde woestijn"}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-egypt-newline']",
        Duration::from_secs(10),
    )
    .await?;
    let normalized = driver
        .execute(
            r#"
            const decks = JSON.parse(localStorage.getItem('homework_flashcard_decks') || '[]');
            const deck = decks.find((d) => d.id === 'test-egypt-newline');
            return {
                parts: deck?.cards?.[0]?.parts || null,
                back: deck?.cards?.[0]?.back || null,
            };
            "#,
            vec![],
        )
        .await?;
    let normalized = normalized.json();
    let parts_len = normalized["parts"].as_array().map(|v| v.len()).unwrap_or(0);
    assert_eq!(
        parts_len, 2,
        "expected load-time normalization to rewrite the raw newline answer into 2 parts"
    );
    assert!(
        normalized["back"].is_null(),
        "multi-part cards must not keep a redundant 'back' field after normalization"
    );

    click(
        driver,
        ".deck-item[data-deck-id='test-egypt-newline'] [data-action='edit']",
    )
    .await?;

    wait_for_css(driver, "#card-back-0", Duration::from_secs(5)).await?;
    let back_value = driver
        .find(By::Css("#card-back-0"))
        .await?
        .prop("value")
        .await?
        .unwrap_or_default();
    assert!(
        back_value.contains('\n'),
        "expected the editor to keep the newline-backed answer visible"
    );

    wait_for_text(
        driver,
        ".card-row[data-index='0'] .card-parts-total",
        "2",
        Duration::from_secs(5),
    )
    .await?;
    let parts_hidden = driver
        .execute(
            "return document.querySelector('.card-row[data-index=\"0\"] .card-parts-required')?.hidden ?? true;",
            vec![],
        )
        .await?;
    assert!(
        !parts_hidden.json().as_bool().unwrap_or(true),
        "expected the editor to treat a newline-backed answer as two components"
    );

    click(driver, "#fc-cancel-edit").await?;
    select_deck_and_start(driver, "test-egypt-newline").await?;

    wait_for_css(driver, ".fc-mp-progress", Duration::from_secs(5)).await?;
    wait_for_text(driver, ".fc-mp-progress", "0/2", Duration::from_secs(5)).await?;

    set_input_value(driver, "#answer", "de nijl").await?;
    click(driver, "#button-check").await?;
    wait_for_text(driver, ".fc-mp-progress", "1/2", Duration::from_secs(5)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_import_via_url_is_client_side() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    let param = generate_import_param(driver).await?;
    assert!(
        !param.is_empty(),
        "expected a non-empty encoded import param"
    );

    driver
        .goto(app.url(&format!("/extra/flashcards?import={param}")))
        .await?;

    wait_for_css(driver, ".fc-import-box", Duration::from_secs(10)).await?;
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

    wait_for_css(driver, ".fc-import-box", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#fc-overwrite-import", Duration::from_secs(5)).await?;
    wait_for_css(driver, "#fc-saveas-import", Duration::from_secs(5)).await?;

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

    wait_for_css(driver, "#fc-saveas-import", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#fc-import-name", Duration::from_secs(5)).await?;

    set_input_value(driver, "#fc-import-name", "Gedeeld deck (kopie)").await?;
    click(driver, "#fc-saveas-import").await?;

    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(10)).await?;
    let selected_name = text_of(driver, ".deck-item.selected .deck-name").await?;
    assert_eq!(
        selected_name, "Gedeeld deck (kopie)",
        "the new deck must carry the user-supplied name"
    );

    wait_for_css(
        driver,
        ".deck-item[data-deck-id='test-conf-new']",
        Duration::from_secs(5),
    )
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_mode_config_persists_across_sessions() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    inject_deck_json(
        driver,
        r#"{"id":"test-persist","name":"Config persistentie","mode":"one-sided",
            "cards":[{"front":"aap"},{"front":"beer"},{"front":"kat"},{"front":"hond"}],
            "createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;

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

    click(driver, "input[name='fc-mode'][value='partial']").await?;
    wait_for_enabled(driver, "#fc-count", Duration::from_secs(3)).await?;
    set_input_value(driver, "#fc-count", "2").await?;
    super::helpers::set_checkbox(driver, "#fc-order-important", true).await?;

    click(driver, "#form-setup button[type='submit']").await?;
    // One click on "stop oefening" (with dialog confirmation) skips all remaining fill-in blanks at once.
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(
        driver,
        "dialog.leave-guard-dialog[open]",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fill-stop-confirm").await?;

    wait_for_nonempty_text(driver, "#result h3", Duration::from_secs(10)).await?;
    click(driver, "#page-result .button-reset").await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
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

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_image_card_type_toggle_in_editor() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#deck-name-input", Duration::from_secs(5)).await?;

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

    click(driver, "input[name='card-type-0'][value='image']").await?;

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
