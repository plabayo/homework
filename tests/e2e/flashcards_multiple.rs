// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use super::helpers::{
    click, poll_until, set_checkbox, set_input_value, wait_for_css, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver, check_a11y};

async fn setup(driver: &WebDriver, app: &TestApp) -> TestResult<()> {
    driver.goto(app.url("/extra/flashcards")).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    driver
        .execute(
            r#"
        localStorage.setItem('homework_flashcard_decks', JSON.stringify([
            {id:'seasons',name:'Seizoenen',mode:'one-sided',cards:[
                {front:'lente'},{front:'zomer'},{front:'winter'}],
                practice:{mode:'partial',count:1,orderImportant:true}},
            {id:'colors',name:'Kleuren',mode:'one-sided',cards:[
                {front:'rood'},{front:'groen'}],practice:{orderImportant:true}},
            {id:'words',name:'Frans',mode:'two-sided',cards:[
                {front:'chat',back:'kat'},{front:'salut',parts:['hallo','dag']}],practice:{}}
        ]));
    "#,
            vec![],
        )
        .await?;
    driver.refresh().await?;
    wait_for_css(
        driver,
        "[data-deck-id='seasons'] .deck-select-btn",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, "[data-deck-id='seasons'] .deck-select-btn").await?;
    click(driver, "#fc-toggle-multiple").await?;
    click(driver, "input[data-deck-id='colors']").await?;
    click(driver, "input[data-deck-id='words']").await?;
    wait_for_text(
        driver,
        ".fc-selection-count",
        "3 decks",
        Duration::from_secs(5),
    )
    .await?;
    Ok(())
}

// Answers come from our fixture, not application internals. For a fill-in grid,
// choose a missing word by reading which fixture words are already visible.
async fn complete_session(driver: &WebDriver) -> TestResult<()> {
    let mut grids = std::collections::BTreeSet::new();
    let mut previous = String::new();
    for _ in 0..5 {
        wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
        let source = driver
            .find(By::Css("#exercise-content .fc-source-deck"))
            .await?
            .text()
            .await?;
        if source != "Frans" && source != previous {
            assert!(
                grids.insert(source.clone()),
                "a fill-in grid must never be interrupted by another deck"
            );
        }
        previous = source;
        let answer = driver.execute(r#"
            const root = document.querySelector('#exercise-content');
            const source = root.querySelector('.fc-source-deck').textContent;
            const words = source === 'Seizoenen' ? ['lente','zomer','winter'] : ['rood','groen'];
            if (source !== 'Frans') {
                const shown = [...root.querySelectorAll('.fill-hint-text, .fill-answer-text')].map(el => el.textContent);
                return words.find(word => !shown.includes(word)) || '';
            }
            return root.querySelector('.flash-text').textContent === 'chat' ? 'kat' : 'hallo, dag';
        "#, vec![]).await?;
        let answer = answer.json().as_str().unwrap_or("");
        assert!(
            !answer.is_empty(),
            "each queued blank must have an unanswered input"
        );
        set_input_value(driver, "#answer", answer).await?;
        click(driver, "#button-check").await?;
    }
    wait_for_text(driver, "#result h3", "5 / 5", Duration::from_secs(10)).await?;
    Ok(())
}

async fn skip_session(driver: &WebDriver) -> TestResult<()> {
    // Two grouped fill-in exercises, one ordinary card, and one multi-part card.
    for _ in 0..4 {
        wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
        let before = driver
            .find(By::Css("#exercise-title"))
            .await?
            .text()
            .await?;
        let grid = !driver
            .find_all(By::Css(".flash-fill-grid"))
            .await?
            .is_empty();
        click(driver, "#button-skip").await?;
        if grid {
            wait_for_text(
                driver,
                "dialog[open]",
                "andere kaarten",
                Duration::from_secs(5),
            )
            .await?;
            click(driver, "#fill-stop-confirm").await?;
        } else {
            click(driver, "#button-skip").await?;
            wait_for_css(driver, "#button-next", Duration::from_secs(5)).await?;
            click(driver, "#button-next").await?;
        }
        // HTML dialog close events are asynchronous; wait for the next question
        // instead of accidentally clicking the previous question's skip again.
        poll_until(
            "skip advances the question",
            Duration::from_secs(5),
            || async {
                Ok(driver
                    .find(By::Css("#page-result"))
                    .await?
                    .is_displayed()
                    .await?
                    || driver
                        .find(By::Css("#exercise-title"))
                        .await?
                        .text()
                        .await?
                        != before)
            },
        )
        .await?;
    }
    wait_for_text(driver, "#result h3", "0 / 5", Duration::from_secs(10)).await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser and its driver; run via `just test-e2e`"]
async fn flashcards_multiple_complete_browse_and_preserve_settings() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    setup(driver, &app).await?;
    driver.set_window_rect(0, 0, 390, 844).await?;
    check_a11y(driver).await?;
    let overflow = driver
        .execute(
            "return document.documentElement.scrollWidth > innerWidth;",
            vec![],
        )
        .await?;
    assert_eq!(overflow.json().as_bool(), Some(false));

    // Switching session timing must not overwrite the source deck's preferences.
    set_checkbox(driver, "#time-mode", true).await?;
    driver.refresh().await?;
    wait_for_text(
        driver,
        ".fc-selection-count",
        "3 decks",
        Duration::from_secs(10),
    )
    .await?;
    assert_eq!(
        driver
            .find_all(By::Css(".fc-deck-check input:checked"))
            .await?
            .len(),
        3
    );
    click(driver, "#fc-start-review").await?;
    wait_for_text(
        driver,
        ".fc-review-counter",
        "1 / 7",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_text(
        driver,
        ".fc-source-deck",
        "Seizoenen",
        Duration::from_secs(5),
    )
    .await?;
    for _ in 0..3 {
        click(driver, "#fc-review-next").await?;
    }
    wait_for_text(driver, ".fc-source-deck", "Kleuren", Duration::from_secs(5)).await?;
    click(driver, "#page-exercises .button-reset").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    complete_session(driver).await?;
    click(driver, "#page-result .button-reset").await?;
    wait_for_text(
        driver,
        ".history-session > summary",
        "5 oefenvragen · 3 decks",
        Duration::from_secs(5),
    )
    .await?;
    let summary = driver.find(By::Css(".history-session > summary")).await?;
    let text = summary.text().await?;
    for name in ["Seizoenen", "Kleuren", "Frans", "alles vlekkeloos"] {
        assert!(text.contains(name), "missing history summary: {name}");
    }
    // Native disclosure must work by keyboard even for a perfect session.
    summary.send_keys(thirtyfour::prelude::Key::Enter).await?;
    wait_for_css(
        driver,
        ".history-session[open] .history-deck",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find_all(By::Css(".history-session[open] .history-deck"))
            .await?
            .len(),
        3
    );
    assert_eq!(
        driver
            .find_all(By::Css(".history-session[open] .item-correct"))
            .await?
            .len(),
        5
    );
    check_a11y(driver).await?;
    let overflow = driver
        .execute(
            "return document.documentElement.scrollWidth > innerWidth;",
            vec![],
        )
        .await?;
    assert_eq!(overflow.json().as_bool(), Some(false));
    // Reloading after a rename must keep the historical name snapshot.
    driver.execute("const decks = JSON.parse(localStorage.getItem('homework_flashcard_decks')); decks.find(d => d.id === 'words').name = 'Nieuwe naam'; localStorage.setItem('homework_flashcard_decks', JSON.stringify(decks));", vec![]).await?;
    driver.refresh().await?;
    wait_for_text(
        driver,
        ".history-deck-names",
        "Frans",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, "#fc-toggle-multiple").await?;
    wait_for_css(driver, "#fc-count", Duration::from_secs(5)).await?;
    assert_eq!(
        driver
            .find(By::Css("#fc-count"))
            .await?
            .prop("value")
            .await?
            .as_deref(),
        Some("1")
    );
    assert!(
        !driver
            .find(By::Css("#time-mode"))
            .await?
            .is_selected()
            .await?
    );
    wait_for_text(driver, ".history-empty", "Nog geen", Duration::from_secs(5)).await?;
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser and its driver; run via `just test-e2e`"]
async fn flashcards_multiple_skip_and_retry_from_stored_history() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    setup(driver, &app).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    skip_session(driver).await?;
    // Reload before retrying so questions pass through IndexedDB serialization.
    driver.refresh().await?;
    wait_for_css(
        driver,
        "#history [data-action='practice-mistakes']:not(:disabled)",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_text(
        driver,
        ".history-session > summary",
        "5 oefenvragen · 3 decks",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, ".history-session > summary").await?;
    wait_for_text(
        driver,
        ".history-session[open]",
        "overgeslagen",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find_all(By::Css(".history-session[open] .item-wrong"))
            .await?
            .len(),
        5
    );
    click(driver, "#history [data-action='practice-mistakes']").await?;
    wait_for_css(driver, "#picker-start", Duration::from_secs(5)).await?;
    click(driver, "#picker-start").await?;
    complete_session(driver).await?;
    // Also cover the in-memory repeat path.
    click(driver, "#page-result .button-reset").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    skip_session(driver).await?;
    click(driver, "#review-button-repeat").await?;
    complete_session(driver).await?;
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser and its driver; run via `just test-e2e`"]
async fn flashcards_multiple_empty_selection_keyboard_and_deleted_deck() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    setup(driver, &app).await?;
    for id in ["seasons", "colors", "words"] {
        let input = driver
            .find(By::Css(format!("input[data-deck-id='{id}']")))
            .await?;
        input.send_keys(thirtyfour::prelude::Key::Space).await?;
        let focused = driver
            .execute("return document.activeElement?.dataset.deckId;", vec![])
            .await?;
        assert_eq!(focused.json().as_str(), Some(id));
    }
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_text(
        driver,
        "#config-error",
        "Kies een deck",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, "input[data-deck-id='colors']").await?;
    // A deck deleted elsewhere must not leave a stale selection after reload.
    driver.execute("localStorage.setItem('homework_flashcard_decks', JSON.stringify(JSON.parse(localStorage.getItem('homework_flashcard_decks')).filter(d => d.id !== 'colors')));", vec![]).await?;
    driver.refresh().await?;
    wait_for_text(
        driver,
        ".fc-selection-count",
        "0 decks",
        Duration::from_secs(10),
    )
    .await?;
    click(driver, "#fc-toggle-multiple").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_text(
        driver,
        "#config-error",
        "Kies een deck",
        Duration::from_secs(5),
    )
    .await?;
    poll_until("setup still visible", Duration::from_secs(5), || async {
        Ok(driver
            .find(By::Css("#page-setup"))
            .await?
            .is_displayed()
            .await?)
    })
    .await?;
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser and its driver; run via `just test-e2e`"]
async fn flashcards_single_history_and_legacy_week_details() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;
    setup(driver, &app).await?;
    click(driver, "#fc-toggle-multiple").await?;
    click(driver, "[data-deck-id='words'] .deck-select-btn").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    for number in 1..=2 {
        wait_for_text(
            driver,
            "#exercise-title",
            &format!("oefening {number} van 2"),
            Duration::from_secs(5),
        )
        .await?;
        wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
        // The entrance animation can briefly make WebDriver's visible-text
        // accessor empty; read the rendered card's textContent instead.
        let front = driver
            .find(By::Css("#exercise-content .flash-text"))
            .await?
            .prop("textContent")
            .await?
            .unwrap_or_default();
        set_input_value(
            driver,
            "#answer",
            if front == "chat" { "kat" } else { "hallo, dag" },
        )
        .await?;
        driver
            .find(By::Css("#answer"))
            .await?
            .send_keys(thirtyfour::prelude::Key::Enter)
            .await?;
    }
    wait_for_text(driver, "#result h3", "2 / 2", Duration::from_secs(5)).await?;
    click(driver, "#page-result .button-reset").await?;
    wait_for_text(
        driver,
        ".history-session > summary",
        "2 oefenvragen · 1 deck",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, ".history-session > summary").await?;
    wait_for_text(
        driver,
        ".history-deck",
        "chat → kat",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find_all(By::Css(".history-deck .item-correct"))
            .await?
            .len(),
        2
    );

    // Convert the real persisted session to the old single-deck format and
    // age it into a weekly bucket. The fallback must also expose every card.
    let result = driver
        .execute_async(
            r#"
        const done = arguments[arguments.length - 1];
        const req = indexedDB.open('homework', 1);
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('sessions', 'readwrite');
            const store = tx.objectStore('sessions');
            const rows = store.getAll();
            rows.onsuccess = () => {
                for (const session of rows.result) {
                    session.finishedAt = Date.now() - 21 * 86400000;
                    for (const outcome of session.questions) delete outcome.question.historySource;
                    store.put(session);
                }
            };
            tx.oncomplete = () => { db.close(); done(true); };
            tx.onerror = () => done(false);
        };
        req.onerror = () => done(false);
    "#,
            vec![],
        )
        .await?;
    assert_eq!(result.json().as_bool(), Some(true));
    driver.refresh().await?;
    wait_for_css(driver, ".history-week", Duration::from_secs(10)).await?;
    click(driver, ".history-week > summary").await?;
    wait_for_text(
        driver,
        ".history-week .history-session > summary",
        "Frans (huidige naam)",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, ".history-week .history-session > summary").await?;
    wait_for_text(
        driver,
        ".history-week .history-deck",
        "chat → kat",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find_all(By::Css(".history-week .history-deck .item-correct"))
            .await?
            .len(),
        2
    );
    check_a11y(driver).await?;
    driver.clone().quit().await?;
    Ok(())
}
