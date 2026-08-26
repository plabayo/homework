// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, set_checkbox, set_input_value, wait_for_css, wait_for_nonempty_text, wait_for_text,
};
use super::{BrowserHarness, Duration, TestApp, TestResult};

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn advanced_mathbox_addition_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/3/advanced-mathbox")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='practice'][value='som']", true).await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    let prompt =
        wait_for_nonempty_text(driver, "#exercise-content p", Duration::from_secs(2)).await?;
    let compact = prompt.replace('\u{202f}', "");
    let terms = compact
        .split(|character: char| !character.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .map(str::parse::<u32>)
        .collect::<Result<Vec<_>, _>>()?;
    assert_eq!(terms.len(), 2, "expected two terms in {prompt:?}");

    set_input_value(driver, "#answer", &(terms[0] + terms[1]).to_string()).await?;
    click(driver, "#button-check").await?;
    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
