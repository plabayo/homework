// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::collections::BTreeSet;

use super::helpers::{click, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, check_a11y};

const ANSWER_CURRENT_QUESTION: &str = r#"
const question = document.querySelector('.decimal-question');
const kind = question?.dataset.kind;
const clean = (text) => text.replace(/\s/g, '').replace(',', '.');
const number = (element) => Number(clean(element.textContent));
const choose = (label) => {
    const normalized = label.replace(/\s/g, '');
    const button = Array.from(question.querySelectorAll('.option'))
        .find((item) => item.textContent.replace(/\s/g, '') === normalized);
    if (!button) throw new Error(`answer option not found: ${label}`);
    button.click();
};
const scaled = (text) => {
    const normalized = text.replace(/\s/g, '').replace('.', ',');
    const [whole, fraction = ''] = normalized.split(',');
    return { units: Number(whole) * 10 ** fraction.length + Number(fraction || 0), precision: fraction.length };
};
const format = (units, precision) => {
    const digits = String(units).padStart(precision + 1, '0');
    if (precision === 0) return digits;
    const split = digits.length - precision;
    return `${digits.slice(0, split)},${digits.slice(split)}`;
};

if (kind === 'place-value') {
    const digit = Number(question.querySelector('.decimal-target-digit').textContent);
    const place = question.querySelector('.decimal-place-name').textContent;
    const divisor = place.includes('duizendsten') ? 1000 : place.includes('honderdsten') ? 100 : 10;
    const answer = String(digit / divisor).replace('.', ',');
    choose(answer);
} else if (kind === 'compare') {
    const values = Array.from(question.querySelectorAll('.decimal-number')).map(number);
    choose(values[0] < values[1] ? '<' : values[0] > values[1] ? '>' : '=');
} else if (kind === 'order') {
    const values = Array.from(question.querySelectorAll('.decimal-token'))
        .map((item) => ({ label: item.textContent.trim(), value: number(item) }))
        .sort((a, b) => a.value - b.value);
    choose(values.map((item) => item.label).join('<'));
} else if (kind === 'number-line') {
    const labels = question.querySelectorAll('.decimal-line-labels span');
    const start = scaled(labels[0].textContent);
    const pointX = Number(question.querySelector('.decimal-line-point').getAttribute('cx'));
    const ticks = Array.from(question.querySelectorAll('.decimal-line-tick'))
        .map((tick) => Number(tick.getAttribute('x1')));
    const markIndex = ticks.indexOf(pointX);
    question.querySelector('#answer').value = format(start.units + markIndex, start.precision);
} else if (kind === 'round') {
    const source = scaled(question.querySelector('.decimal-number').textContent);
    question.querySelector('#answer').value = format(Math.floor((source.units + 5) / 10), source.precision - 1);
} else {
    throw new Error(`unknown decimal question kind: ${kind}`);
}
return kind;
"#;

const CHECK_COMFORTABLE_SPACING: &str = r#"
const question = document.querySelector('.decimal-question');
const group = question.querySelector(':scope > .decimal-order, :scope > .decimal-comparison') ?? question;
const children = Array.from(group.children);
const gaps = children.slice(1).map((child, index) => {
    const previous = children[index].getBoundingClientRect();
    const current = child.getBoundingClientRect();
    return current.top - previous.bottom;
});
return {
    kind: question.dataset.kind,
    gaps,
    comfortable: gaps.length > 0 && gaps.every((gap) => gap >= 18),
};
"#;

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn decimals_exercises_all_concepts_and_is_second_in_level() -> TestResult<()> {
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
    let links = driver
        .find_all(By::Css("#niveau-3 + .exercise-list a"))
        .await?;
    assert_eq!(
        links[0].attr("data-exercise-id").await?.as_deref(),
        Some("written-arithmetic")
    );
    assert_eq!(
        links[1].attr("data-exercise-id").await?.as_deref(),
        Some("decimals")
    );

    driver.goto(app.url("/3/decimals")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    set_input_value(driver, "#num-exercises", "5").await?;
    click(driver, "input[name='precision'][value='3']").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, ".decimal-question", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;

    let mut seen = BTreeSet::new();
    for index in 0..5 {
        let spacing = driver.execute(CHECK_COMFORTABLE_SPACING, vec![]).await?;
        assert_eq!(
            spacing.json()["comfortable"].as_bool(),
            Some(true),
            "decimal content groups should have comfortable spacing: {}",
            spacing.json()
        );
        let result = driver.execute(ANSWER_CURRENT_QUESTION, vec![]).await?;
        let kind = result
            .json()
            .as_str()
            .ok_or("decimal question kind should be a string")?;
        seen.insert(kind.to_owned());
        click(driver, "#button-check").await?;
        if index < 4 {
            wait_for_text(
                driver,
                "#exercise-title",
                &format!("oefening {} van 5", index + 2),
                Duration::from_secs(10),
            )
            .await?;
        }
    }

    assert_eq!(
        seen,
        BTreeSet::from([
            "place-value".to_owned(),
            "compare".to_owned(),
            "order".to_owned(),
            "number-line".to_owned(),
            "round".to_owned(),
        ])
    );
    wait_for_text(driver, "#result h3", "5 / 5", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
