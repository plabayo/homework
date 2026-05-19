// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, Duration, TestApp, TestResult, WebDriver};

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 { a } else { gcd(b, a % b) }
}

// Read the rendered fraction (frac-num / frac-den) and compute the percentage.
async fn parse_breuk_naar_procent(driver: &WebDriver) -> TestResult<u32> {
    let result = driver
        .execute(
            "var num = document.querySelector('.pct-expr .frac-num'); \
             var den = document.querySelector('.pct-expr .frac-den'); \
             return [parseInt(num ? num.textContent : '0', 10), \
                     parseInt(den ? den.textContent : '0', 10)];",
            vec![],
        )
        .await?;
    let arr = result.json().as_array().ok_or("expected array")?.to_vec();
    let num = arr[0].as_u64().ok_or("expected num")? as u32;
    let den = arr[1].as_u64().ok_or("expected den")? as u32;
    if den == 0 {
        return Err("denominator is zero".into());
    }
    Ok(num * 100 / den)
}

// Read the displayed percentage and return the simplified (num, den) answer.
async fn parse_procent_naar_breuk(driver: &WebDriver) -> TestResult<(u32, u32)> {
    let result = driver
        .execute(
            "return parseInt(document.querySelector('.pct-display')?.textContent || '0', 10);",
            vec![],
        )
        .await?;
    let pct = result.json().as_u64().ok_or("expected pct")? as u32;
    let g = gcd(pct, 100);
    Ok((pct / g, 100 / g))
}

// Read pct and whole, compute pct% of whole.
async fn parse_procent_van_getal(driver: &WebDriver) -> TestResult<u32> {
    let result = driver
        .execute(
            "var pct   = parseInt(document.querySelector('.pct-display')?.textContent || '0', 10); \
             var whole = parseInt(document.querySelector('.pct-whole')?.textContent   || '0', 10); \
             return [pct, whole];",
            vec![],
        )
        .await?;
    let arr = result.json().as_array().ok_or("expected array")?.to_vec();
    let pct = arr[0].as_u64().ok_or("expected pct")? as u32;
    let whole = arr[1].as_u64().ok_or("expected whole")? as u32;
    if whole == 0 {
        return Err("whole is zero".into());
    }
    Ok(pct * whole / 100)
}

// Read part and whole, compute part/whole × 100.
async fn parse_wat_procent(driver: &WebDriver) -> TestResult<u32> {
    let result = driver
        .execute(
            "var part  = parseInt(document.querySelector('.pct-part')?.textContent  || '0', 10); \
             var whole = parseInt(document.querySelector('.pct-whole')?.textContent  || '0', 10); \
             return [part, whole];",
            vec![],
        )
        .await?;
    let arr = result.json().as_array().ok_or("expected array")?.to_vec();
    let part = arr[0].as_u64().ok_or("expected part")? as u32;
    let whole = arr[1].as_u64().ok_or("expected whole")? as u32;
    if whole == 0 {
        return Err("whole is zero".into());
    }
    Ok(part * 100 / whole)
}

// Navigate to percentages and configure a single-kind, 1-exercise session.
async fn setup_percentages(driver: &WebDriver, app: &TestApp, only_kind: &str) -> TestResult<()> {
    driver.goto(app.url("/2/percentages")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    // Toggle kinds: enable only the requested one, disable the defaults.
    for kind in &[
        "breuk-naar-procent",
        "procent-naar-breuk",
        "procent-van-getal",
    ] {
        set_checkbox(
            driver,
            &format!("input[value='{kind}']"),
            *kind == only_kind,
        )
        .await?;
    }
    // wat-procent is off by default; enable it if requested.
    set_checkbox(
        driver,
        "input[value='wat-procent']",
        only_kind == "wat-procent",
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn percentages_breuk_naar_procent_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_percentages(driver, &app, "breuk-naar-procent").await?;
    wait_for_css(
        driver,
        "#exercise-content .fraction",
        Duration::from_secs(10),
    )
    .await?;

    let answer = parse_breuk_naar_procent(driver).await?;
    set_input_value(driver, "#answer", &answer.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn percentages_procent_naar_breuk_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_percentages(driver, &app, "procent-naar-breuk").await?;
    wait_for_css(
        driver,
        "#exercise-content .pct-display",
        Duration::from_secs(10),
    )
    .await?;

    let (num, den) = parse_procent_naar_breuk(driver).await?;
    set_input_value(driver, "#answer-num", &num.to_string()).await?;
    set_input_value(driver, "#answer-den", &den.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn percentages_procent_van_getal_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_percentages(driver, &app, "procent-van-getal").await?;
    wait_for_css(
        driver,
        "#exercise-content .pct-whole",
        Duration::from_secs(10),
    )
    .await?;

    let answer = parse_procent_van_getal(driver).await?;
    set_input_value(driver, "#answer", &answer.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn percentages_wat_procent_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    setup_percentages(driver, &app, "wat-procent").await?;
    wait_for_css(
        driver,
        "#exercise-content .pct-part",
        Duration::from_secs(10),
    )
    .await?;

    let answer = parse_wat_procent(driver).await?;
    set_input_value(driver, "#answer", &answer.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
