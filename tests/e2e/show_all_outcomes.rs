// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// The eye toggle that switches the result screen and the history from
// "only what went wrong" to every exercise, in the order it was asked.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver};

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
    wait_for_css(
        driver,
        ".history-recent .history-session li.item-tricky",
        TIMEOUT,
    )
    .await?;
    assert_eq!(
        list_items(driver, ".history-recent .history-session li")
            .await?
            .len(),
        1
    );

    driver.clone().quit().await?;
    Ok(())
}
