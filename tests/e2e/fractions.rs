// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, Duration, TestApp, TestResult, WebDriver};

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 { a } else { gcd(b, a % b) }
}

fn lcm(a: u32, b: u32) -> u32 {
    a / gcd(a, b) * b
}

// Read the rendered breuk-van-getal question and return the expected integer answer.
async fn parse_fraction_of_number_question(driver: &WebDriver) -> TestResult<u32> {
    let result = driver
        .execute(
            "var n = document.querySelector('.fraction-expr .frac-num'); \
             var d = document.querySelector('.fraction-expr .frac-den'); \
             var t = (document.querySelector('.fraction-expr') || {}).textContent || ''; \
             var m = t.match(/van\\s+(\\d+)/); \
             return [parseInt(n ? n.textContent : '0', 10), \
                     parseInt(d ? d.textContent : '0', 10), \
                     m ? parseInt(m[1], 10) : 0];",
            vec![],
        )
        .await?;
    let json = result.json();
    let arr = json
        .as_array()
        .ok_or("expected JS array for breuk-van-getal")?;
    let num = arr[0].as_u64().ok_or("expected num")? as u32;
    let den = arr[1].as_u64().ok_or("expected den")? as u32;
    let n = arr[2].as_u64().ok_or("expected whole number")? as u32;
    if den == 0 {
        return Err("denominator is zero".into());
    }
    Ok(num * n / den)
}

// Read the rendered optellen question and return the simplified (num, den) answer.
async fn parse_fraction_add_question(driver: &WebDriver) -> TestResult<(u32, u32)> {
    let result = driver
        .execute(
            "var nums = Array.from(document.querySelectorAll('.fraction-expr .frac-num')) \
                            .map(function(e) { return parseInt(e.textContent, 10); }); \
             var dens = Array.from(document.querySelectorAll('.fraction-expr .frac-den')) \
                            .map(function(e) { return parseInt(e.textContent, 10); }); \
             return [nums[0], dens[0], nums[1], dens[1]];",
            vec![],
        )
        .await?;
    let json = result.json();
    let arr = json.as_array().ok_or("expected JS array for optellen")?;
    let a_num = arr[0].as_u64().ok_or("expected a_num")? as u32;
    let a_den = arr[1].as_u64().ok_or("expected a_den")? as u32;
    let b_num = arr[2].as_u64().ok_or("expected b_num")? as u32;
    let b_den = arr[3].as_u64().ok_or("expected b_den")? as u32;
    let common = lcm(a_den, b_den);
    let res_num = a_num * (common / a_den) + b_num * (common / b_den);
    let g = gcd(res_num, common);
    Ok((res_num / g, common / g))
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn fractions_breuk_van_getal_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/fractions")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[value='breuk-van-getal']", true).await?;
    set_checkbox(driver, "input[value='optellen']", false).await?;
    set_checkbox(driver, "input[value='aftrekken']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(10)).await?;
    let answer = parse_fraction_of_number_question(driver).await?;
    set_input_value(driver, "#answer", &answer.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn fractions_optellen_happy_path() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/fractions")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[value='breuk-van-getal']", false).await?;
    set_checkbox(driver, "input[value='optellen']", true).await?;
    set_checkbox(driver, "input[value='aftrekken']", false).await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(
        driver,
        "#exercise-content #answer-num",
        Duration::from_secs(10),
    )
    .await?;
    let (res_num, res_den) = parse_fraction_add_question(driver).await?;
    set_input_value(driver, "#answer-num", &res_num.to_string()).await?;
    set_input_value(driver, "#answer-den", &res_den.to_string()).await?;
    click(driver, "#button-check").await?;

    wait_for_text(driver, "#result h3", "1 / 1", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
