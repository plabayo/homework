// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// The "⚖️ verdeling" selector under a multi-kind checklist: fair by default,
// only there when there is something to share, and the split it shows is
// the split the deck gets.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_css_count};
use super::{BrowserHarness, Duration, TestApp, TestResult, WebDriver};

const TIMEOUT: Duration = Duration::from_secs(10);

/// Move the slider for `kind` the way a drag would: set it and fire `input`.
async fn set_weight(driver: &WebDriver, kind: &str, weight: u8) -> TestResult<()> {
    driver
        .execute(
            &format!(
                "const range = document.querySelector(\".kind-weight-row[data-kind='{kind}'] input\");
                 range.value = '{weight}';
                 range.dispatchEvent(new Event('input', {{ bubbles: true }}));"
            ),
            vec![],
        )
        .await?;
    Ok(())
}

async fn js_string(driver: &WebDriver, script: &str) -> TestResult<String> {
    let value = driver.execute(script, vec![]).await?;
    Ok(value.json().as_str().unwrap_or_default().to_owned())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn kind_weights_start_fair_and_only_show_for_two_or_more_kinds() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, ".kind-weights:not([hidden])", TIMEOUT).await?;
    let state = js_string(
        driver,
        "return document.querySelector('.kind-weights-state').textContent;",
    )
    .await?;
    assert_eq!(state, "gelijk");
    let shares = js_string(
        driver,
        "return [...document.querySelectorAll('.kind-weight-row:not([hidden]) output')].map(o => o.textContent).join(' ');",
    )
    .await?;
    assert_eq!(shares, "34% 33% 33%");

    set_checkbox(driver, "input[name='practice'][value='verschil']", false).await?;
    set_checkbox(driver, "input[name='practice'][value='splitsen']", false).await?;
    wait_for_css(driver, ".kind-weights[hidden]", TIMEOUT).await?;

    set_checkbox(driver, "input[name='practice'][value='delen']", true).await?;
    wait_for_css(driver, ".kind-weights:not([hidden])", TIMEOUT).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn kind_weights_shape_the_deck_and_are_remembered() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/mathbox")).await?;
    wait_for_css(driver, ".kind-weights:not([hidden])", TIMEOUT).await?;
    set_checkbox(driver, "input[name='practice'][value='splitsen']", false).await?;
    set_input_value(driver, "#num-exercises", "12").await?;
    click(driver, ".kind-weights > summary").await?;
    set_weight(driver, "som", 1).await?;
    set_weight(driver, "verschil", 5).await?;

    let shares = js_string(
        driver,
        "return [...document.querySelectorAll('.kind-weight-row:not([hidden]) output')].map(o => o.textContent).join(' ');",
    )
    .await?;
    assert_eq!(shares, "17% 83%");
    let state = js_string(
        driver,
        "return document.querySelector('.kind-weights-state').textContent;",
    )
    .await?;
    assert_eq!(state, "aangepast");

    // The worksheet shows the exact split: 12 × 1/6 = 2 sums, 10 differences.
    click(driver, "#button-print").await?;
    wait_for_css_count(driver, "#print-sheet .print-item", 12, TIMEOUT).await?;
    let split = js_string(
        driver,
        "const rows = [...document.querySelectorAll('#print-sheet .print-body')].map(b => b.textContent);
         return `${rows.filter(t => t.includes('+')).length}/${rows.filter(t => t.includes('−')).length}`;",
    )
    .await?;
    assert_eq!(split, "2/10");

    // The weights come back with the rest of the settings.
    driver.refresh().await?;
    wait_for_css(driver, ".kind-weights:not([hidden])", TIMEOUT).await?;
    let restored = js_string(
        driver,
        "return [...document.querySelectorAll('.kind-weight-row:not([hidden]) input')].map(r => r.value).join(',');",
    )
    .await?;
    assert_eq!(restored, "1,5");

    click(driver, ".kind-weights > summary").await?;
    click(driver, ".kind-weights-reset").await?;
    let state = js_string(
        driver,
        "return document.querySelector('.kind-weights-state').textContent;",
    )
    .await?;
    assert_eq!(state, "gelijk");

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn kind_weights_count_the_decimals_extra_as_a_kind() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/fraction-sense")).await?;
    wait_for_css(driver, ".kind-weights:not([hidden])", TIMEOUT).await?;
    wait_for_css(
        driver,
        ".kind-weight-row[data-kind='decimals'][hidden]",
        TIMEOUT,
    )
    .await?;
    set_checkbox(driver, "#include-decimals", true).await?;
    wait_for_css(
        driver,
        ".kind-weight-row[data-kind='decimals']:not([hidden])",
        TIMEOUT,
    )
    .await?;
    let rows = js_string(
        driver,
        "return String(document.querySelectorAll('.kind-weight-row:not([hidden])').length);",
    )
    .await?;
    let shares = js_string(
        driver,
        "return [...document.querySelectorAll('.kind-weight-row:not([hidden]) output')].map(o => parseInt(o.textContent, 10)).reduce((a, b) => a + b, 0).toString();",
    )
    .await?;
    assert_eq!(shares, "100", "{rows} kinds should share 100%");

    driver.clone().quit().await?;
    Ok(())
}
