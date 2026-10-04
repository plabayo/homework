// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use super::helpers::{
    click, inject_deck_json, poll_until, set_input_value, wait_for_css, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver, check_a11y};

async fn paste_json(driver: &WebDriver, json: &str) -> TestResult<()> {
    driver
        .execute(
            "document.querySelector('#fc-paste-details').open = true;",
            vec![],
        )
        .await?;
    set_input_value(driver, "#fc-json-text", json).await?;
    click(driver, "#fc-check-json").await?;
    Ok(())
}

async fn capture_export(driver: &WebDriver, selector: &str) -> TestResult<serde_json::Value> {
    // Observe the actual download boundary, without depending on browser-specific
    // download directories. The production button still creates the real Blob.
    driver
        .execute(
            r#"
        window.exportBlob = null;
        const create = URL.createObjectURL.bind(URL);
        URL.createObjectURL = blob => { window.exportBlob = blob; return create(blob); };
        const click = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function () {
            if (this.download) { window.exportFilename = this.download; return; }
            return click.call(this);
        };
    "#,
            vec![],
        )
        .await?;
    click(driver, selector).await?;
    let exported = driver
        .execute_async(
            r#"
        const done = arguments[arguments.length - 1];
        if (!window.exportBlob) { done(null); return; }
        window.exportBlob.text().then(text => done(JSON.parse(text)));
    "#,
            vec![],
        )
        .await?;
    assert!(
        exported.json().is_object(),
        "export should create a JSON download"
    );
    Ok(exported.json().clone())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_json_file_import_export_and_practice() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards/import")).await?;
    wait_for_css(driver, "#fc-file", Duration::from_secs(10)).await?;
    driver
        .find(By::Css("#fc-file"))
        .await?
        .send_keys(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/flashcards-import.json"
        ))
        .await?;
    wait_for_css(
        driver,
        "#fc-import-preview:not([hidden])",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_text(
        driver,
        "#fc-preview-name",
        "Fietswoorden",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fc-confirm-import").await?;
    wait_for_text(
        driver,
        "#fc-import-status",
        "geïmporteerd",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fc-open-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(10)).await?;
    assert!(
        driver
            .find(By::Css("#time-mode"))
            .await?
            .is_selected()
            .await?
    );

    let json = capture_export(driver, ".deck-item.selected [data-action='export']").await?;
    assert_eq!(json["version"], 1);
    assert_eq!(json["cards"][0]["parts"][1], "velo");
    assert_eq!(json["cards"][0]["partsRequired"], 1);
    assert_eq!(json["cards"][0]["hint"], "Twee wielen");
    assert_eq!(json["practice"]["timeMode"], true);
    assert!(json.get("id").is_none());
    assert!(json.get("mode").is_none());

    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#answer", Duration::from_secs(5)).await?;
    set_input_value(driver, "#answer", "velo").await?;
    click(driver, "#button-check").await?;
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;
    click(driver, "#page-result .button-reset").await?;
    click(driver, ".deck-item.selected .fc-json-help").await?;
    assert!(
        driver
            .current_url()
            .await?
            .as_str()
            .ends_with("/extra/flashcards/import#json-uitleg")
    );
    wait_for_css(driver, "#json-uitleg", Duration::from_secs(5)).await?;
    // Re-importing the downloaded content selects the same deck, preserving history.
    paste_json(driver, &json.to_string()).await?;
    wait_for_text(
        driver,
        "#fc-import-status",
        "staat al",
        Duration::from_secs(5),
    )
    .await?;
    let count = driver.execute("return JSON.parse(localStorage.getItem('homework_flashcard_decks')).filter(d => d.name === 'Fietswoorden').length;", vec![]).await?;
    assert_eq!(count.json().as_u64(), Some(1));
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_json_validation_conflicts_and_storage_failure() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards/import")).await?;
    wait_for_css(driver, "#fc-file", Duration::from_secs(10)).await?;
    inject_deck_json(driver, r#"{"id":"existing","name":"Woorden","mode":"two-sided","cards":[{"front":"chat","back":"kat"}],"createdAt":1}"#).await?;
    paste_json(driver, r#"{"name":"Woorden","cards":[{"front":"fiets","parts":["velo","rijwiel"],"partsRequired":9}]}"#).await?;
    wait_for_text(
        driver,
        "#fc-import-error",
        "cards[0].partsRequired",
        Duration::from_secs(5),
    )
    .await?;
    assert!(
        driver
            .find(By::Css("#fc-import-preview"))
            .await?
            .attr("hidden")
            .await?
            .is_some()
    );

    let incoming = r#"{"name":"Woorden","cards":[{"front":"chien","back":"hond"}]}"#;
    paste_json(driver, incoming).await?;
    wait_for_css(
        driver,
        "#fc-overwrite-import:not([hidden])",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fc-cancel-import").await?;
    let original = driver.execute("return JSON.parse(localStorage.getItem('homework_flashcard_decks'))[0].cards[0].front;", vec![]).await?;
    assert_eq!(original.json().as_str(), Some("chat"));

    paste_json(driver, incoming).await?;
    driver.execute(r#"
        const set = Storage.prototype.setItem;
        window.restoreStorage = () => Storage.prototype.setItem = set;
        Storage.prototype.setItem = function (key, value) {
            if (key === 'homework_flashcard_decks') throw new DOMException('full', 'QuotaExceededError');
            return set.call(this, key, value);
        };
    "#, vec![]).await?;
    click(driver, "#fc-overwrite-import").await?;
    wait_for_text(
        driver,
        "#fc-import-error",
        "opslagruimte",
        Duration::from_secs(5),
    )
    .await?;
    let unchanged = driver.execute("return JSON.parse(localStorage.getItem('homework_flashcard_decks'))[0].cards[0].front;", vec![]).await?;
    assert_eq!(unchanged.json().as_str(), Some("chat"));
    driver.execute("window.restoreStorage();", vec![]).await?;
    click(driver, "#fc-overwrite-import").await?;
    wait_for_text(
        driver,
        "#fc-import-status",
        "geïmporteerd",
        Duration::from_secs(5),
    )
    .await?;
    let replaced = driver
        .execute(
            "return JSON.parse(localStorage.getItem('homework_flashcard_decks'))[0];",
            vec![],
        )
        .await?;
    assert_eq!(replaced.json()["id"], "existing");
    assert_eq!(replaced.json()["cards"][0]["front"], "chien");

    paste_json(
        driver,
        r#"{"name":"Woorden","cards":[{"front":"maison","back":"huis"}]}"#,
    )
    .await?;
    set_input_value(driver, "#fc-import-name", "Woorden nieuw").await?;
    click(driver, "#fc-saveas-import").await?;
    let decks = driver
        .execute(
            "return JSON.parse(localStorage.getItem('homework_flashcard_decks'));",
            vec![],
        )
        .await?;
    assert_eq!(decks.json().as_array().unwrap().len(), 2);
    assert_eq!(decks.json()[1]["name"], "Woorden nieuw");
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_json_live_settings_and_image_answers_export() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(driver, r#"{"id":"mixed","name":"Gemengd","mode":"one-sided","cards":[{"front":"lente"},{"front":"zomer"},{"front":"herfst"},{"front":"winter"},{"wikimedia":"File:Cat.jpg","parts":["kat","poes"],"hint":"Miauw","thumbUrl":"https://example.invalid/thumb"}],"createdAt":1}"#).await?;
    driver.refresh().await?;
    wait_for_css(driver, "[data-deck-id='mixed']", Duration::from_secs(10)).await?;
    let json = capture_export(driver, "[data-deck-id='mixed'] [data-action='export']").await?;
    assert_eq!(json["cards"][4]["parts"][1], "poes");
    assert_eq!(json["cards"][4]["hint"], "Miauw");
    assert!(json["cards"][4].get("thumbUrl").is_none());
    assert_eq!(json["cards"][0], "lente");

    // Use a text-only deck for the live settings check, avoiding network images.
    inject_deck_json(driver, r#"{"id":"memory","name":"Seizoenen","mode":"one-sided","cards":[{"front":"lente"},{"front":"zomer"},{"front":"herfst"},{"front":"winter"}],"createdAt":1}"#).await?;
    driver.refresh().await?;
    wait_for_css(driver, "[data-deck-id='memory']", Duration::from_secs(10)).await?;
    click(driver, "[data-deck-id='memory'] .deck-select-btn").await?;
    click(driver, "input[name='fc-mode'][value='partial']").await?;
    set_input_value(driver, "#fc-count", "1").await?;
    click(driver, "#fc-order-important").await?;
    click(driver, "#time-mode").await?;
    let json = capture_export(driver, ".deck-item.selected [data-action='export']").await?;
    assert_eq!(json["practice"]["mode"], "partial");
    assert_eq!(json["practice"]["count"], 1);
    assert_eq!(json["practice"]["orderImportant"], true);
    assert_eq!(json["practice"]["timeMode"], true);
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_json_page_is_accessible_responsive_and_works_offline() -> TestResult<()> {
    let mut app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards/import")).await?;
    wait_for_css(driver, "#fc-file", Duration::from_secs(10)).await?;
    check_a11y(driver).await?;
    driver.set_window_rect(0, 0, 360, 900).await?;
    driver
        .execute(
            "document.querySelectorAll('.fc-json-docs details').forEach(el => el.open = true);",
            vec![],
        )
        .await?;
    let fits = driver
        .execute(
            "return document.documentElement.scrollWidth <= document.documentElement.clientWidth;",
            vec![],
        )
        .await?;
    assert_eq!(
        fits.json().as_bool(),
        Some(true),
        "expanded documentation must fit a narrow screen"
    );
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;
    check_a11y(driver).await?;
    poll_until(
        "service worker to control the import page",
        Duration::from_secs(15),
        || async {
            let controlled = driver
                .execute("return !!navigator.serviceWorker.controller;", vec![])
                .await?;
            Ok(controlled.json().as_bool().unwrap_or(false))
        },
    )
    .await?;
    app.stop();
    driver.refresh().await?;
    wait_for_css(driver, "#fc-file", Duration::from_secs(10)).await?;
    paste_json(
        driver,
        r#"{"name":"Offline deck","cards":["lente","zomer"]}"#,
    )
    .await?;
    wait_for_css(
        driver,
        "#fc-import-preview:not([hidden])",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fc-confirm-import").await?;
    wait_for_text(
        driver,
        "#fc-import-status",
        "geïmporteerd",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "#fc-open-deck").await?;
    wait_for_css(driver, ".deck-item.selected", Duration::from_secs(10)).await?;
    let json = capture_export(driver, ".deck-item.selected [data-action='export']").await?;
    assert_eq!(json["name"], "Offline deck");
    driver.clone().quit().await?;
    Ok(())
}
