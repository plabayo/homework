// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use std::collections::BTreeSet;

use super::helpers::{click, set_checkbox, set_input_value, wait_for_css, wait_for_text};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, check_a11y};

const ANSWER_CURRENT_QUESTION: &str = r#"
const question = document.querySelector('.fraction-sense-question');
const kind = question?.dataset.kind;
const fraction = (element) => ({
    num: Number(element.querySelector('.frac-num').textContent),
    den: Number(element.querySelector('.frac-den').textContent),
});
const set = (selector, value) => {
    const input = question.querySelector(selector);
    if (!input) throw new Error(`answer input not found: ${selector}`);
    input.value = String(value);
};
const setFraction = (num, den, numSelector = '#answer-num', denSelector = '#answer-den') => {
    set(numSelector, num);
    set(denSelector, den);
};
const choose = (label) => {
    const normalized = label.replace(/\s/g, '');
    const button = Array.from(question.querySelectorAll('.option'))
        .find((item) => item.textContent.replace(/\s/g, '') === normalized);
    if (!button) throw new Error(`answer option not found: ${label}`);
    button.click();
};
const gcd = (a, b) => {
    let x = Math.abs(a);
    let y = Math.abs(b);
    while (y) [x, y] = [y, x % y];
    return x || 1;
};

if (kind === 'visual-to-fraction') {
    const parts = question.querySelectorAll('.fraction-visual-part');
    setFraction(question.querySelectorAll('.fraction-visual-part.is-filled').length, parts.length);
} else if (kind === 'fraction-to-visual') {
    const target = fraction(question.querySelector('.fraction-sense-prompt .fraction'));
    const button = Array.from(question.querySelectorAll('.fraction-visual-option')).find((option) => {
        const parts = option.querySelectorAll('.fraction-visual-part');
        const filled = option.querySelectorAll('.fraction-visual-part.is-filled');
        return parts.length === target.den && filled.length === target.num;
    });
    if (!button) throw new Error('matching visual option not found');
    button.click();
} else if (kind === 'number-line') {
    const ticks = Array.from(question.querySelectorAll('.fraction-line-tick'));
    const pointX = Number(question.querySelector('.fraction-line-point').getAttribute('cx'));
    const num = ticks.findIndex((tick) => Math.abs(Number(tick.getAttribute('x1')) - pointX) < 0.01);
    setFraction(num, ticks.length - 1);
} else if (kind === 'compare') {
    const values = Array.from(question.querySelectorAll('.fraction-sense-expression .fraction')).map(fraction);
    const difference = values[0].num * values[1].den - values[1].num * values[0].den;
    choose(difference < 0 ? '<' : difference > 0 ? '>' : '=');
} else if (kind === 'order') {
    const values = Array.from(question.querySelectorAll('.fraction-token .fraction')).map(fraction);
    values.sort((a, b) => a.num * b.den - b.num * a.den);
    choose(values.map((value) => `${value.num}/${value.den}`).join('<'));
} else if (kind === 'complete-equivalent') {
    const source = fraction(question.querySelector('.fraction-sense-expression > .fraction'));
    const targetDen = Number(question.querySelector('.fraction-partial-input > span:last-child').textContent);
    set('#answer-integer', source.num * (targetDen / source.den));
} else if (kind === 'simplify') {
    const source = fraction(question.querySelector('.fraction-sense-expression > .fraction'));
    const divisor = gcd(source.num, source.den);
    setFraction(source.num / divisor, source.den / divisor);
} else if (kind === 'common-denominator') {
    const rows = question.querySelectorAll('.fraction-common-rows p');
    const left = fraction(rows[0].querySelector('.fraction'));
    const right = fraction(rows[1].querySelector('.fraction'));
    const commonDen = Number(rows[0].querySelector('.fraction-partial-input > span:last-child').textContent);
    set('#answer-left-num', left.num * (commonDen / left.den));
    set('#answer-right-num', right.num * (commonDen / right.den));
} else if (kind === 'improper-to-mixed') {
    const source = fraction(question.querySelector('.fraction-sense-expression > .fraction'));
    set('#answer-whole', Math.floor(source.num / source.den));
    setFraction(source.num % source.den, source.den, '#answer-mixed-num', '#answer-mixed-den');
} else if (kind === 'mixed-to-improper') {
    const whole = Number(question.querySelector('.fraction-mixed-number > strong').textContent);
    const source = fraction(question.querySelector('.fraction-mixed-number .fraction'));
    setFraction(whole * source.den + source.num, source.den);
} else if (kind === 'fraction-to-decimal') {
    const source = fraction(question.querySelector('.fraction-sense-expression > .fraction'));
    set('#answer-decimal', String(source.num / source.den).replace('.', ','));
} else if (kind === 'decimal-to-fraction') {
    const decimal = Number(question.querySelector('.fraction-decimal-source').textContent.replace(',', '.'));
    const hundredths = Math.round(decimal * 100);
    const divisor = gcd(hundredths, 100);
    setFraction(hundredths / divisor, 100 / divisor);
} else {
    throw new Error(`unknown fraction-sense question kind: ${kind}`);
}
return kind;
"#;

const CHECK_LAYOUT: &str = r#"
const question = document.querySelector('.fraction-sense-question');
const children = Array.from(question.children);
const gaps = children.slice(1).map((child, index) => {
    const previous = children[index].getBoundingClientRect();
    const current = child.getBoundingClientRect();
    return current.top - previous.bottom;
});
return {
    kind: question.dataset.kind,
    gaps,
    comfortable: gaps.length > 0 && gaps.every((gap) => gap >= 18),
    noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
};
"#;

#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn fraction_sense_all_question_types_and_catalogue_order() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/")).await?;
    wait_for_css(
        driver,
        "#niveau-2 + .exercise-list",
        Duration::from_secs(10),
    )
    .await?;
    let links = driver
        .find_all(By::Css("#niveau-2 + .exercise-list a"))
        .await?;
    assert_eq!(
        links[2].attr("data-exercise-id").await?.as_deref(),
        Some("fraction-sense")
    );
    assert_eq!(
        links[3].attr("data-exercise-id").await?.as_deref(),
        Some("fractions")
    );

    driver.goto(app.url("/2/fraction-sense")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;

    let concept_options = driver.find_all(By::Css("input[name='practice']")).await?;
    assert_eq!(
        concept_options.len(),
        4,
        "the four concepts should be independent checkboxes"
    );
    wait_for_text(
        driver,
        "#form-setup",
        "breuken en kommagetallen omzetten (bijv. 3/4 = 0,75)",
        Duration::from_secs(10),
    )
    .await?;
    wait_for_text(
        driver,
        ".denominator-levels",
        "15, 20, 25, 50 en 100",
        Duration::from_secs(10),
    )
    .await?;

    set_checkbox(driver, "input[value='improper']", true).await?;
    set_checkbox(driver, "#include-decimals", true).await?;
    click(driver, "input[name='denominator-set'][value='large']").await?;
    set_input_value(driver, "#num-exercises", "12").await?;
    click(driver, "#form-setup button[type='submit']").await?;

    wait_for_css(driver, ".fraction-sense-question", Duration::from_secs(10)).await?;
    tokio::time::sleep(Duration::from_millis(300)).await;
    check_a11y(driver).await?;

    let mut seen = BTreeSet::new();
    for index in 0..12 {
        let layout = driver.execute(CHECK_LAYOUT, vec![]).await?;
        assert_eq!(
            layout.json()["comfortable"].as_bool(),
            Some(true),
            "fraction content groups should have comfortable spacing: {}",
            layout.json()
        );
        assert_eq!(
            layout.json()["noOverflow"].as_bool(),
            Some(true),
            "fraction question should not overflow horizontally: {}",
            layout.json()
        );

        let result = driver.execute(ANSWER_CURRENT_QUESTION, vec![]).await?;
        let kind = result
            .json()
            .as_str()
            .ok_or("fraction-sense question kind should be a string")?;
        seen.insert(kind.to_owned());
        click(driver, "#button-check").await?;
        if index < 11 {
            wait_for_text(
                driver,
                "#exercise-title",
                &format!("oefening {} van 12", index + 2),
                Duration::from_secs(10),
            )
            .await?;
        }
    }

    assert_eq!(
        seen,
        BTreeSet::from([
            "visual-to-fraction".to_owned(),
            "fraction-to-visual".to_owned(),
            "number-line".to_owned(),
            "compare".to_owned(),
            "order".to_owned(),
            "complete-equivalent".to_owned(),
            "simplify".to_owned(),
            "common-denominator".to_owned(),
            "improper-to-mixed".to_owned(),
            "mixed-to-improper".to_owned(),
            "fraction-to-decimal".to_owned(),
            "decimal-to-fraction".to_owned(),
        ])
    );
    wait_for_text(driver, "#result h3", "12 / 12", Duration::from_secs(10)).await?;

    driver.clone().quit().await?;
    Ok(())
}
