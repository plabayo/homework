// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// The eye toggle that switches the result screen and the history from
// "only what went wrong" to every exercise, in the order it was asked.

use super::helpers::{
    click, poll_until, set_checkbox, set_input_value, wait_for_css, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver, check_a11y};
use thirtyfour::prelude::Key;

const TIMEOUT: Duration = Duration::from_secs(10);

/// The sum on screen, e.g. "3 + 4 =" → 7. Read as textContent: while the
/// question fades in, WebDriver's visible text can still be empty.
async fn current_sum(driver: &WebDriver) -> TestResult<u32> {
    let value = driver
        .execute(
            "return document.querySelector('#exercise-content p span')?.textContent ?? '';",
            vec![],
        )
        .await?;
    let text = value.json().as_str().unwrap_or_default().to_owned();
    let mut numbers = text
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .map(str::parse::<u32>);
    let a = numbers.next().ok_or("no first term")??;
    let b = numbers.next().ok_or("no second term")??;
    Ok(a + b)
}

async fn answer(driver: &WebDriver, value: u32) -> TestResult<()> {
    set_input_value(driver, "#answer", &value.to_string()).await?;
    click(driver, "#button-check").await
}

/// Item texts in one script call: the lists re-render when the toggle or a
/// history refresh lands, which would leave WebDriver handles stale.
async fn list_items(driver: &WebDriver, selector: &str) -> TestResult<Vec<String>> {
    let value = driver
        .execute(
            &format!("return [...document.querySelectorAll({selector:?})].map(li => li.textContent.trim());"),
            vec![],
        )
        .await?;
    Ok(value
        .json()
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn show_all_toggle_lists_every_exercise_in_order() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "3").await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    set_checkbox(driver, "input[name='practice'][value='splitsen']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // First right, second right after one miss, third right.
    wait_for_text(driver, "#exercise-title", "oefening 1 van 3", TIMEOUT).await?;
    let sum = current_sum(driver).await?;
    answer(driver, sum).await?;
    wait_for_text(driver, "#exercise-title", "oefening 2 van 3", TIMEOUT).await?;
    let second = current_sum(driver).await?;
    answer(driver, second + 1).await?;
    wait_for_css(driver, "#exercise-feedback.is-bad", TIMEOUT).await?;
    answer(driver, second).await?;
    wait_for_text(driver, "#exercise-title", "oefening 3 van 3", TIMEOUT).await?;
    let sum = current_sum(driver).await?;
    answer(driver, sum).await?;

    wait_for_text(driver, "#result h3", "3 / 3", TIMEOUT).await?;
    wait_for_text(
        driver,
        ".result-detail .section-title",
        "Wat ging moeilijk",
        TIMEOUT,
    )
    .await?;
    assert_eq!(list_items(driver, ".result-detail li").await?.len(), 1);

    click(driver, ".result-detail .show-all-toggle").await?;
    wait_for_text(
        driver,
        ".result-detail .section-title",
        "Alle oefeningen",
        TIMEOUT,
    )
    .await?;
    let all = list_items(driver, ".result-detail li").await?;
    assert_eq!(all.len(), 3);
    assert!(all[0].starts_with("1."), "numbered in order: {all:?}");
    assert!(
        all[1].contains("1× fout vooraf"),
        "the miss is on the second: {all:?}"
    );
    let pressed = driver
        .find(By::Css(".result-detail .show-all-toggle"))
        .await?
        .attr("aria-pressed")
        .await?;
    assert_eq!(pressed.as_deref(), Some("true"));

    // The choice carries over to the history, and switches back there.
    click(driver, "#page-result .button-reset").await?;
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    wait_for_css(
        driver,
        ".history-toolbar .show-all-toggle[aria-pressed='true']",
        TIMEOUT,
    )
    .await?;
    wait_for_css(driver, ".history-recent .outcome-all-list", TIMEOUT).await?;
    assert_eq!(
        list_items(driver, ".history-recent .history-session li")
            .await?
            .len(),
        3
    );

    click(driver, ".history-toolbar .show-all-toggle").await?;
    wait_for_css(
        driver,
        ".history-toolbar .show-all-toggle[aria-pressed='false']",
        TIMEOUT,
    )
    .await?;
    // The history re-reads IndexedDB before it re-renders, and the tricky
    // item is in both lists: wait for the list to shrink, not for the item.
    poll_until("the history to list only the mistake", TIMEOUT, || async {
        let items = list_items(driver, ".history-recent .history-session li").await?;
        Ok(items.len() == 1)
    })
    .await?;
    wait_for_css(
        driver,
        ".history-recent .history-session li.item-tricky",
        TIMEOUT,
    )
    .await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn result_keeps_exercise_details_from_every_retry_round() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "2").await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    set_checkbox(driver, "input[name='practice'][value='splitsen']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    // Round one: one clean answer, one skipped after a mistake.
    wait_for_text(driver, "#exercise-title", "oefening 1 van 2", TIMEOUT).await?;
    let sum = current_sum(driver).await?;
    answer(driver, sum).await?;
    wait_for_text(driver, "#exercise-title", "oefening 2 van 2", TIMEOUT).await?;
    let retry_sum = current_sum(driver).await?;
    answer(driver, retry_sum + 1).await?;
    wait_for_css(driver, "#button-skip", TIMEOUT).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#button-next", TIMEOUT).await?;
    click(driver, "#button-next").await?;
    wait_for_text(driver, "#result h3", "1 / 2", TIMEOUT).await?;
    let first_round = list_items(driver, ".result-detail li").await?;
    assert_eq!(first_round.len(), 1);
    assert!(first_round[0].contains("overgeslagen"));

    // Round two: correct it after another mistake. Round three: clean.
    click(driver, "#review-button-repeat").await?;
    wait_for_text(driver, "#exercise-title", "oefening 1 van 1", TIMEOUT).await?;
    answer(driver, retry_sum + 2).await?;
    wait_for_css(driver, "#exercise-feedback.is-bad", TIMEOUT).await?;
    answer(driver, retry_sum).await?;
    wait_for_text(driver, "#result h2", "ronde 2 afgerond", TIMEOUT).await?;
    let second_round = list_items(driver, ".result-cycle[open] li").await?;
    assert_eq!(second_round.len(), 1);
    assert!(second_round[0].contains("1× fout vooraf"));
    click(driver, "#review-button-repeat").await?;
    wait_for_text(driver, "#exercise-title", "oefening 1 van 1", TIMEOUT).await?;
    answer(driver, retry_sum).await?;
    wait_for_text(driver, "#result h2", "ronde 3 afgerond", TIMEOUT).await?;

    const FIRST: &str = ".result-cycle[data-cycle-index='0']";
    const SECOND: &str = ".result-cycle[data-cycle-index='1']";
    const LATEST: &str = ".result-cycle[data-cycle-index='2']";
    wait_for_css(driver, &format!("{FIRST}:not([open])"), TIMEOUT).await?;
    wait_for_css(driver, &format!("{SECOND}:not([open])"), TIMEOUT).await?;
    wait_for_css(driver, &format!("{LATEST}[open]"), TIMEOUT).await?;
    assert_eq!(driver.find_all(By::Css(".result-cycle")).await?.len(), 3);
    wait_for_text(
        driver,
        &format!("{LATEST} .history-perfect"),
        "alles vlekkeloos",
        TIMEOUT,
    )
    .await?;

    // Native disclosures work with the keyboard, and several can stay open.
    driver
        .find(By::Css(format!("{FIRST} > summary")))
        .await?
        .send_keys(Key::Enter)
        .await?;
    wait_for_css(driver, &format!("{FIRST}[open]"), TIMEOUT).await?;
    click(driver, &format!("{SECOND} > summary")).await?;
    assert_eq!(
        list_items(driver, &format!("{FIRST} li")).await?,
        first_round
    );
    assert_eq!(
        list_items(driver, &format!("{SECOND} li")).await?,
        second_round
    );

    click(driver, &format!("{LATEST} .show-all-toggle")).await?;
    for (selector, count) in [(FIRST, 2), (SECOND, 1), (LATEST, 1)] {
        wait_for_css(driver, &format!("{selector}[open]"), TIMEOUT).await?;
        wait_for_text(
            driver,
            &format!("{selector} .section-title"),
            "Alle oefeningen",
            TIMEOUT,
        )
        .await?;
        assert_eq!(
            list_items(driver, &format!("{selector} li")).await?.len(),
            count
        );
        wait_for_css(
            driver,
            &format!("{selector} .show-all-toggle[aria-pressed='true']"),
            TIMEOUT,
        )
        .await?;
    }
    assert!(driver.execute(
        "return document.activeElement.matches('.result-cycle[data-cycle-index=\"2\"] .show-all-toggle');",
        vec![],
    ).await?.json().as_bool().unwrap_or(false), "toggling keeps keyboard focus");

    // Updating a hidden round must neither open it nor replace its answers.
    click(driver, &format!("{FIRST} > summary")).await?;
    click(driver, &format!("{SECOND} .show-all-toggle")).await?;
    wait_for_css(driver, &format!("{FIRST}:not([open])"), TIMEOUT).await?;
    click(driver, &format!("{FIRST} > summary")).await?;
    assert_eq!(
        list_items(driver, &format!("{FIRST} li")).await?,
        first_round
    );
    assert_eq!(
        list_items(driver, &format!("{SECOND} li")).await?,
        second_round
    );
    driver.set_window_rect(0, 0, 390, 844).await?;
    check_a11y(driver).await?;

    // A new exercise must start its own set of rounds.
    click(driver, "#page-result .button-reset").await?;
    wait_for_css(driver, "#page-setup:not([hidden])", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_text(driver, "#exercise-title", "oefening 1 van 1", TIMEOUT).await?;
    let sum = current_sum(driver).await?;
    answer(driver, sum).await?;
    wait_for_text(driver, "#result h2", "klaar", TIMEOUT).await?;
    assert!(driver.find_all(By::Css(".result-cycle")).await?.is_empty());

    driver.clone().quit().await?;
    Ok(())
}
