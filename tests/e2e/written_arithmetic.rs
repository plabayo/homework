// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver, check_a11y};

async fn operand(driver: &WebDriver, selector: &str) -> TestResult<u32> {
    let script = format!(
        r#"return Array.from(document.querySelectorAll({selector:?}))
            .map(cell => cell.textContent.trim()).join("");"#,
    );
    let value = driver.execute(script, vec![]).await?.json().clone();
    Ok(value
        .as_str()
        .ok_or("operand should be a string")?
        .parse()?)
}

fn addition_steps(a: u32, b: u32) -> Vec<(u32, u32)> {
    let mut steps = Vec::new();
    let mut place = 1;
    let mut carry = 0;
    while place <= a.max(b) || carry > 0 {
        let total = (a / place) % 10 + (b / place) % 10 + carry;
        carry = total / 10;
        steps.push((total % 10, carry));
        place *= 10;
    }
    steps
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn written_arithmetic_checks_each_column_and_is_first_in_level() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(
        driver,
        "#niveau-3 + .exercise-list",
        Duration::from_secs(10),
    )
    .await?;
    let first = driver.find(By::Css("#niveau-3 + .exercise-list a")).await?;
    assert_eq!(
        first.attr("data-exercise-id").await?.as_deref(),
        Some("written-arithmetic")
    );

    driver.goto(app.url("/3/written-arithmetic")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='practice'][value='som']", true).await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(
        driver,
        "#exercise-content #answer-digit",
        Duration::from_secs(10),
    )
    .await?;
    let a = operand(driver, ".written-operand-a .written-number").await?;
    let b = operand(driver, ".written-operand-b .written-number").await?;
    let steps = addition_steps(a, b);
    assert!(steps.len() >= 2, "expected a multi-column calculation");
    // Axe samples rendered colours, so wait until the shared page entrance
    // animation has reached its fully opaque state.
    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;

    for (index, (digit, carry)) in steps.iter().copied().enumerate() {
        set_input_value(driver, "#answer-digit", &digit.to_string()).await?;
        click(
            driver,
            &format!("input[name='step-transfer'][value='{carry}']"),
        )
        .await?;
        click(driver, "#button-check").await?;

        if index + 1 < steps.len() {
            let clear = driver.find(By::Css("#exercise > .input-clear")).await?;
            assert_eq!(clear.attr("aria-hidden").await?.as_deref(), Some("true"));
            let input = driver.find(By::Css("#answer-digit")).await?;
            assert_eq!(input.attr("autocomplete").await?.as_deref(), Some("off"));
        }
    }

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;
    driver.clone().quit().await?;
    Ok(())
}
