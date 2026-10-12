// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
#![allow(clippy::unwrap_used, clippy::expect_used)]

//! How flashcard answers are checked (soepel / streng), the pointed hint a
//! strict near miss gets, and how a typed answer is shown against the card —
//! right away, on the result, and later in the history.

use super::helpers::{
    click, inject_deck_json, poll_until, select_deck_and_start, set_input_value, wait_for_css,
    wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver, check_a11y};

const TIMEOUT: Duration = Duration::from_secs(5);

async fn start_deck(driver: &WebDriver, app: &TestApp, deck_json: &str) -> TestResult<()> {
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(driver, deck_json).await?;
    driver.refresh().await?;
    let id = serde_json::from_str::<serde_json::Value>(deck_json)?["id"]
        .as_str()
        .unwrap()
        .to_owned();
    select_deck_and_start(driver, &id).await?;
    wait_for_css(driver, "#exercise-content #answer", TIMEOUT).await
}

async fn answer(driver: &WebDriver, text: &str) -> TestResult<()> {
    wait_for_css(driver, "#exercise-content #answer", TIMEOUT).await?;
    set_input_value(driver, "#answer", text).await?;
    click(driver, "#button-check").await
}

/// The text of every element matching `selector`, hidden ones included: the
/// spoken summary of a comparison is visually hidden on purpose.
async fn text_content(driver: &WebDriver, selector: &str) -> TestResult<String> {
    let script = format!(
        "return [...document.querySelectorAll({selector:?})].map((el) => el.textContent).join('\\n');"
    );
    Ok(driver
        .execute(&script, vec![])
        .await?
        .json()
        .as_str()
        .unwrap_or_default()
        .to_owned())
}

async fn wait_for_text_content(
    driver: &WebDriver,
    selector: &str,
    expected: &str,
) -> TestResult<()> {
    poll_until(
        &format!("{selector:?} to contain {expected:?}"),
        TIMEOUT,
        || async { Ok(text_content(driver, selector).await?.contains(expected)) },
    )
    .await
}

async fn count(driver: &WebDriver, selector: &str) -> TestResult<usize> {
    Ok(driver.find_all(By::Css(selector)).await?.len())
}

async fn stored_practice(driver: &WebDriver, deck_id: &str) -> TestResult<serde_json::Value> {
    let script = format!(
        "return JSON.parse(localStorage.getItem('homework_flashcard_decks')).find((d) => d.id === {deck_id:?}).practice ?? null;"
    );
    Ok(driver.execute(&script, vec![]).await?.json().clone())
}

const STRICT_FRENCH: &str = r#"{"id":"fr-strict","name":"Frans streng","mode":"two-sided",
    "cards":[{"front":"luisteren","back":"écouter"}],"practice":{"strict":true},"createdAt":1}"#;

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_strict_missing_accent_gets_a_hint_and_the_fix_is_practised_again()
-> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    start_deck(driver, &app, STRICT_FRENCH).await?;

    // Phone keyboards must not "fix" the answer for the child.
    let attributes = driver
        .execute(
            "const a = document.getElementById('answer'); \
             return [a.getAttribute('autocapitalize'), a.getAttribute('autocorrect'), a.spellcheck];",
            vec![],
        )
        .await?;
    assert_eq!(attributes.json(), &serde_json::json!(["off", "off", false]));

    answer(driver, "ecouter").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "bijna! kijk nog eens naar het accent.",
        TIMEOUT,
    )
    .await?;
    wait_for_css(
        driver,
        "#exercise-feedback .fc-attempt .fc-diff-mark",
        TIMEOUT,
    )
    .await?;
    assert!(
        !text_content(driver, "#exercise-feedback")
            .await?
            .contains("écouter"),
        "the hint points at the mistake without giving the answer away"
    );
    assert_eq!(
        count(driver, "#button-next").await?,
        0,
        "a near miss is not accepted"
    );

    answer(driver, "écouter").await?;
    wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;
    // Fixed after a hint is still a mistake to practise.
    wait_for_css(driver, "#review-button-repeat", TIMEOUT).await?;
    wait_for_text_content(
        driver,
        ".result-detail .fc-diff figcaption",
        "Jij typte “ecouter”, juist is “écouter”.",
    )
    .await?;
    wait_for_text_content(driver, ".result-detail", "daarna zelf verbeterd").await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_strict_sentence_needs_its_capital_and_full_stop() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    start_deck(
        driver,
        &app,
        r#"{"id":"fr-zin","name":"Zinnen","mode":"two-sided",
            "cards":[{"front":"Ik heet Marie.","back":"Je m'appelle Marie."}],
            "practice":{"strict":true},"createdAt":1}"#,
    )
    .await?;

    answer(driver, "je m'appelle Marie").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "bijna! kijk nog eens naar de hoofdletter en het leesteken.",
        TIMEOUT,
    )
    .await?;
    // A typographic apostrophe and the French space are not mistakes.
    answer(driver, "Je m’appelle Marie .").await?;
    wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_lenient_near_miss_shows_what_was_typed_without_coming_back() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    start_deck(
        driver,
        &app,
        r#"{"id":"fr-soepel","name":"Frans soepel","mode":"two-sided",
            "cards":[{"front":"luisteren","back":"écouter"},{"front":"hart","back":"cœur"}],
            "createdAt":1}"#,
    )
    .await?;

    for _ in 0..2 {
        wait_for_css(driver, "#exercise-content .flash-text", TIMEOUT).await?;
        let front = text_content(driver, "#exercise-content .flash-text").await?;
        if front == "hart" {
            // Lenient: neither the œ nor the accent counts.
            answer(driver, "coeur").await?;
            continue;
        }
        answer(driver, "écoutez").await?;
        wait_for_text(
            driver,
            "#exercise-feedback",
            "Bijna goed. Op de kaart staat: écouter.",
            TIMEOUT,
        )
        .await?;
        // The review compares the typed answer with the card, letter by letter.
        wait_for_css(
            driver,
            "#exercise-content > .fc-diff .fc-diff-e .fc-diff-mark",
            TIMEOUT,
        )
        .await?;
        wait_for_text_content(
            driver,
            "#exercise-content .fc-diff figcaption",
            "Jij typte “écoutez”, juist is “écouter”.",
        )
        .await?;
        click(driver, "#button-next").await?;
    }

    wait_for_text(driver, "#result h3", "2 / 2", TIMEOUT).await?;
    assert_eq!(
        count(driver, "#review-button-repeat").await?,
        0,
        "a lenient near miss does not come back unless the deck says so"
    );
    wait_for_css(driver, ".result-detail li.item-near .fc-diff", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_lenient_near_miss_can_count_as_a_mistake() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    start_deck(
        driver,
        &app,
        r#"{"id":"fr-telt","name":"Frans","mode":"two-sided",
            "cards":[{"front":"luisteren","back":"écouter"}],
            "practice":{"nearMissIsMistake":true},"createdAt":1}"#,
    )
    .await?;

    answer(driver, "écoutez").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Deze kaart komt terug bij fouten oefenen.",
        TIMEOUT,
    )
    .await?;
    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;
    wait_for_css(driver, "#review-button-repeat", TIMEOUT).await?;
    wait_for_css(driver, ".result-detail li.item-tricky .fc-diff", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_opened_hint_counts_as_a_mistake_only_when_chosen() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    for hint_is_mistake in [false, true] {
        let practice = if hint_is_mistake {
            r#"{"hintIsMistake":true}"#
        } else {
            "{}"
        };
        start_deck(
            driver,
            &app,
            &format!(
                r#"{{"id":"fr-hint","name":"Hints","mode":"two-sided",
                    "cards":[{{"front":"luisteren","back":"écouter","hint":"Begint met é."}}],
                    "practice":{practice},"createdAt":1}}"#
            ),
        )
        .await?;
        click(driver, "#exercise-content .fc-hint-chip").await?;
        answer(driver, "écouter").await?;
        wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;
        if hint_is_mistake {
            wait_for_css(driver, "#review-button-repeat", TIMEOUT).await?;
            wait_for_text(
                driver,
                ".result-detail",
                "hint gebruikt · opnieuw oefenen",
                TIMEOUT,
            )
            .await?;
        } else {
            assert_eq!(count(driver, "#review-button-repeat").await?, 0);
        }
    }

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_checking_options_are_saved_with_the_deck_and_apply() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(
        driver,
        r#"{"id":"fr-opties","name":"Frans","mode":"two-sided",
            "cards":[{"front":"luisteren","back":"écouter","hint":"Begint met é."}],"createdAt":1}"#,
    )
    .await?;
    driver.refresh().await?;
    click(
        driver,
        ".deck-item[data-deck-id='fr-opties'] .deck-select-btn",
    )
    .await?;
    wait_for_css(driver, "#fc-checking", TIMEOUT).await?;

    // Lenient by default: the lenient option shows, the strict rules do not.
    assert_eq!(count(driver, "#fc-strict:checked").await?, 0);
    assert_eq!(count(driver, "#fc-strict-rules[hidden]").await?, 1);
    assert_eq!(count(driver, "#fc-lenient-options:not([hidden])").await?, 1);
    assert_eq!(
        count(driver, "#fc-hint-mistake-row:not([hidden])").await?,
        1
    );
    check_a11y(driver).await?;

    click(driver, "label.fc-switch").await?;
    wait_for_css(driver, "#fc-strict-rules:not([hidden])", TIMEOUT).await?;
    assert_eq!(count(driver, "#fc-lenient-options[hidden]").await?, 1);
    assert_eq!(
        count(driver, "input[name='fc-strict-rule']:checked").await?,
        4
    );
    wait_for_text(driver, "#fc-checking-help", "zoals op een toets", TIMEOUT).await?;
    // Switching on exercises the checked theme too.
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;

    click(driver, "input[name='fc-strict-rule'][value='accents']").await?;
    click(driver, "#fc-hint-mistake").await?;
    poll_until("strict settings saved with the deck", TIMEOUT, || async {
        Ok(stored_practice(driver, "fr-opties").await?
            == serde_json::json!({"strict":true,"strictRules":["capitals","punctuation","spelling"],"hintIsMistake":true}))
    })
    .await?;

    // The choice survives a reload…
    driver.refresh().await?;
    wait_for_css(driver, "#fc-strict:checked", TIMEOUT).await?;
    assert_eq!(
        count(
            driver,
            "input[name='fc-strict-rule'][value='accents']:checked"
        )
        .await?,
        0
    );
    assert_eq!(count(driver, "#fc-hint-mistake:checked").await?, 1);

    // …and applies: without the accent rule, a missing accent is fine.
    click(driver, "#form-setup button[type='submit']").await?;
    answer(driver, "ecouter").await?;
    wait_for_text(driver, "#result h3", "1 / 1", TIMEOUT).await?;
    assert_eq!(count(driver, "#review-button-repeat").await?, 0);

    // Back to lenient: the lenient-only option is offered and saved again.
    click(driver, "#result .button-reset").await?;
    wait_for_css(driver, "#fc-strict:checked", TIMEOUT).await?;
    click(driver, "label.fc-switch").await?;
    click(driver, "#fc-near-miss-mistake").await?;
    poll_until("lenient settings saved with the deck", TIMEOUT, || async {
        Ok(stored_practice(driver, "fr-opties").await?
            == serde_json::json!({"nearMissIsMistake":true,"hintIsMistake":true}))
    })
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_history_shows_what_was_typed_after_a_reload() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    start_deck(driver, &app, STRICT_FRENCH).await?;

    for attempt in ["ecoute", "ecoute", "ecoute"] {
        answer(driver, attempt).await?;
    }
    wait_for_css(driver, "#exercise-content > .fc-diff", TIMEOUT).await?;
    // The comparison is the point of the review, so it is not dimmed.
    let opacity = driver
        .execute(
            "return getComputedStyle(document.querySelector('#exercise-content')).opacity;",
            vec![],
        )
        .await?;
    assert_eq!(opacity.json().as_str(), Some("1"));
    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "0 / 1", TIMEOUT).await?;

    driver.refresh().await?;
    wait_for_css(
        driver,
        ".history-session-expandable",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, ".history-session-expandable > summary").await?;
    wait_for_text_content(
        driver,
        ".history-deck .fc-diff figcaption",
        "Jij typte “ecoute”, juist is “écouter”.",
    )
    .await?;
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;
    check_a11y(driver).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn flashcards_editor_sets_checking_for_new_and_edited_decks() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;

    // A new deck starts lenient, folded into one row that says so.
    click(driver, "#fc-new-deck").await?;
    wait_for_css(driver, "#fc-editor-checking:not([open])", TIMEOUT).await?;
    wait_for_text(driver, "#fc-checking-badge", "soepel", TIMEOUT).await?;
    wait_for_text(
        driver,
        "#fc-checking-summary",
        "kleine typfouten zijn bijna goed",
        TIMEOUT,
    )
    .await?;
    check_a11y(driver).await?;

    set_input_value(driver, "#deck-name-input", "Frans editor").await?;
    click(driver, "input[name='deck-type'][value='two-sided']").await?;
    set_input_value(driver, "#card-front-0", "luisteren").await?;
    set_input_value(driver, "#card-back-0", "écouter").await?;

    click(driver, "#fc-editor-checking > summary").await?;
    wait_for_css(driver, "#fc-editor-checking[open]", TIMEOUT).await?;
    // The hint option only appears once a card has a hint.
    assert_eq!(count(driver, "#fc-hint-mistake-row[hidden]").await?, 1);
    click(driver, ".card-row .card-hint-check[data-dir='fwd']").await?;
    set_input_value(
        driver,
        ".card-row .card-hint-input[data-dir='fwd']",
        "Begint met é.",
    )
    .await?;
    wait_for_css(driver, "#fc-hint-mistake-row:not([hidden])", TIMEOUT).await?;

    click(driver, "#fc-editor-checking label.fc-switch").await?;
    wait_for_text(driver, "#fc-checking-badge", "streng", TIMEOUT).await?;
    click(driver, "input[name='fc-strict-rule'][value='capitals']").await?;
    click(driver, "#fc-hint-mistake").await?;
    wait_for_text(
        driver,
        "#fc-checking-summary",
        "accenten · leestekens · spelling · hint telt als fout",
        TIMEOUT,
    )
    .await?;
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;
    check_a11y(driver).await?;
    click(driver, "#theme-toggle").await?;

    click(driver, "#fc-save-deck").await?;
    wait_for_css(driver, ".deck-item.selected", TIMEOUT).await?;
    let id = driver
        .execute(
            "return JSON.parse(localStorage.getItem('homework_flashcard_decks')).find((d) => d.name === 'Frans editor').id;",
            vec![],
        )
        .await?
        .json()
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(
        stored_practice(driver, &id).await?,
        serde_json::json!({"strict":true,"strictRules":["accents","punctuation","spelling"],"hintIsMistake":true})
    );
    // The setup screen shows the same settings straight away.
    wait_for_css(driver, "#fc-checking #fc-strict:checked", TIMEOUT).await?;

    // Editing shows how the deck is checked now, and saves a change.
    click(
        driver,
        &format!(".deck-item[data-deck-id='{id}'] [data-action='edit']"),
    )
    .await?;
    wait_for_text(driver, "#fc-checking-badge", "streng", TIMEOUT).await?;
    click(driver, "#fc-editor-checking > summary").await?;
    click(driver, "#fc-editor-checking label.fc-switch").await?;
    wait_for_text(driver, "#fc-checking-badge", "soepel", TIMEOUT).await?;

    // An unsaved checking change is an unsaved change.
    click(driver, ".home-link").await?;
    wait_for_css(driver, "dialog.leave-guard-dialog[open]", TIMEOUT).await?;
    click(driver, "#leave-stay").await?;

    click(driver, "#fc-near-miss-mistake").await?;
    click(driver, "#fc-save-deck").await?;
    poll_until("the edited settings to be saved", TIMEOUT, || async {
        Ok(stored_practice(driver, &id).await?
            == serde_json::json!({"nearMissIsMistake":true,"hintIsMistake":true}))
    })
    .await?;

    driver.clone().quit().await?;
    Ok(())
}
