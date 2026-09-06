// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, set_checkbox, set_input_value, wait_for_css, wait_for_nonempty_text, wait_for_text,
};
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
    while place <= a.max(b) {
        let total = (a / place) % 10 + (b / place) % 10 + carry;
        carry = total / 10;
        steps.push((total % 10, carry));
        place *= 10;
    }
    steps
}

async fn answer_addition(driver: &WebDriver, steps: &[(u32, u32)]) -> TestResult<()> {
    for &(digit, carry) in steps {
        set_input_value(driver, "#answer-digit", &digit.to_string()).await?;
        if carry == 1 {
            click(driver, ".written-transfer-toggle").await?;
        }
        click(driver, "#button-check").await?;
    }
    Ok(())
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
        if carry == 1 {
            click(driver, ".written-transfer-toggle").await?;
        }
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

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn written_arithmetic_reveals_a_final_carry_in_reserved_space() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/3/written-arithmetic")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    driver
        .execute("Math.random = () => 0.999999;", Vec::new())
        .await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='practice'][value='som']", true).await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#answer-digit", Duration::from_secs(10)).await?;
    let leading_operand = driver
        .find(By::Css(".written-operand-a .written-leading-column"))
        .await?;
    assert_eq!(leading_operand.text().await?, "");
    let leading_result = driver
        .find(By::Css(".written-result-row [data-leading-result]"))
        .await?;
    assert_eq!(leading_result.text().await?, "");

    let a = operand(driver, ".written-operand-a .written-number").await?;
    let b = operand(driver, ".written-operand-b .written-number").await?;
    assert_eq!((a, b), (990, 10));
    let steps = addition_steps(a, b);
    answer_addition(driver, &steps[..steps.len() - 1]).await?;

    let (digit, carry) = steps[steps.len() - 1];
    assert_eq!(carry, 1);
    wait_for_text(
        driver,
        "#written-transfer-hint",
        "de 0 links",
        Duration::from_secs(5),
    )
    .await?;
    set_input_value(driver, "#answer-digit", &digit.to_string()).await?;
    click(driver, ".written-transfer-toggle").await?;
    let leading_result = wait_for_nonempty_text(
        driver,
        ".written-result-row [data-leading-result]",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(leading_result, "1");
    click(driver, ".written-transfer-toggle").await?;
    assert_eq!(
        driver
            .find(By::Css("[data-leading-result]"))
            .await?
            .text()
            .await?,
        ""
    );
    click(driver, ".written-transfer-toggle").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn written_arithmetic_borrow_toggle_follows_the_next_column() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/3/written-arithmetic")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    driver
        .execute("Math.random = () => 0.5;", Vec::new())
        .await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='practice'][value='som']", false).await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", true).await?;
    set_checkbox(driver, "#include-decimals", true).await?;
    click(driver, "input[name='decimal-places'][value='1']").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#answer-digit", Duration::from_secs(10)).await?;
    let a = operand(driver, ".written-operand-a .written-number").await?;
    let b = operand(driver, ".written-operand-b .written-number").await?;
    assert_eq!((a, b), (5550, 2325));

    wait_for_text(
        driver,
        ".written-transfer-toggle",
        "0",
        Duration::from_secs(5),
    )
    .await?;
    let toggle = driver.find(By::Css(".written-transfer-toggle")).await?;
    assert_eq!(toggle.text().await?, "0");
    assert_eq!(toggle.attr("aria-pressed").await?.as_deref(), Some("false"));
    let toggle_column = driver
        .execute(
            "const cell = document.querySelector('.written-transfer-toggle').closest('td');
             return cell.closest('table').tHead.rows[0].cells[cell.cellIndex]
                 .querySelector('[aria-hidden]').textContent;",
            Vec::new(),
        )
        .await?;
    assert_eq!(toggle_column.json().as_str(), Some("E"));
    wait_for_text(
        driver,
        "#written-transfer-hint",
        "Laat 0 staan",
        Duration::from_secs(5),
    )
    .await?;

    // A correct digit with a missing borrow keeps the same column active.
    set_input_value(driver, "#answer-digit", "5").await?;
    click(driver, "#button-check").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Je moet hier 1 lenen",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find(By::Css("#answer-digit"))
            .await?
            .attr("aria-label")
            .await?
            .as_deref(),
        Some("cijfer bij de tienden")
    );

    click(driver, ".written-transfer-toggle").await?;
    assert_eq!(toggle.text().await?, "1");
    click(driver, ".written-transfer-toggle").await?;
    assert_eq!(toggle.text().await?, "0");
    // Native button keyboard activation must work too.
    toggle.send_keys(" ").await?;
    assert_eq!(toggle.attr("aria-pressed").await?.as_deref(), Some("true"));
    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;
    click(driver, "#button-check").await?;

    wait_for_text(
        driver,
        "#exercise-feedback",
        "5 − 1 geleend − 2",
        Duration::from_secs(5),
    )
    .await?;
    wait_for_text(
        driver,
        ".written-transfer.is-current",
        "1",
        Duration::from_secs(5),
    )
    .await?;
    assert_eq!(
        driver
            .find(By::Css(".written-transfer-toggle"))
            .await?
            .text()
            .await?,
        "0"
    );

    // An unnecessary borrow and a wrong result each get specific feedback.
    set_input_value(driver, "#answer-digit", "2").await?;
    click(driver, ".written-transfer-toggle").await?;
    click(driver, "#button-check").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Je hoeft hier niets te lenen",
        Duration::from_secs(5),
    )
    .await?;
    click(driver, ".written-transfer-toggle").await?;
    set_input_value(driver, "#answer-digit", "3").await?;
    click(driver, "#button-check").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "Controleer het cijfer bij de eenheden",
        Duration::from_secs(5),
    )
    .await?;
    set_input_value(driver, "#answer-digit", "2").await?;
    click(driver, "#button-check").await?;

    // The consumed 1 disappears, and 0 needs no click to continue.
    let transfer_text =
        wait_for_nonempty_text(driver, ".written-transfer-row", Duration::from_secs(5)).await?;
    assert_eq!(
        transfer_text.split_whitespace().collect::<Vec<_>>(),
        ["geleend", "0"]
    );
    set_input_value(driver, "#answer-digit", "2").await?;
    click(driver, "#button-check").await?;
    assert!(
        driver
            .find_all(By::Css(".written-transfer-toggle"))
            .await?
            .is_empty()
    );
    assert_eq!(
        wait_for_nonempty_text(driver, ".written-transfer-row", Duration::from_secs(5)).await?,
        "geleend"
    );
    set_input_value(driver, "#answer-digit", "3").await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;
    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn written_arithmetic_decimals_are_opt_in_and_keep_the_comma_aligned() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/3/written-arithmetic")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    let decimal_options = driver.find(By::Css("#decimal-options")).await?;
    assert!(decimal_options.attr("hidden").await?.is_some());

    set_checkbox(driver, "#include-decimals", true).await?;
    assert!(decimal_options.attr("hidden").await?.is_none());
    click(driver, "input[name='decimal-places'][value='2']").await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='practice'][value='som']", true).await?;
    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(
        driver,
        ".written-result-row .written-decimal-separator",
        Duration::from_secs(10),
    )
    .await?;
    let comma_text = driver
        .execute(
            r#"return document.querySelector(
                '.written-operand-a .written-decimal-separator'
            )?.textContent ?? '';"#,
            Vec::new(),
        )
        .await?;
    assert_eq!(comma_text.json().as_str(), Some(","));

    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;
    let a = operand(driver, ".written-operand-a .written-number").await?;
    let b = operand(driver, ".written-operand-b .written-number").await?;
    let steps = addition_steps(a, b);
    answer_addition(driver, &steps).await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;
    driver.clone().quit().await?;
    Ok(())
}
