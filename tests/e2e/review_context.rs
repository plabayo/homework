// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

//! Tests that verify each exercise's review state shows the original question
//! context alongside the correct answer.
//!
//! When a child skips or exhausts all attempts, they must be able to see both
//! WHAT was asked and WHAT the correct answer is — not just the answer in
//! isolation.  Without the question context the child cannot learn from the
//! mistake because they may not remember what the exercise was asking.
//!
//! Coverage:
//!   • Multiplications   — equation (a × b =) preserved in review
//!   • Clock "zet" (phrase prompt) — Dutch phrase label shown above correct clock
//!   • Clock "lees" (word-choice)  — Dutch phrase shown in .time-readout.bad
//!   • Thermometer "teken"         — target value preserved in review bad-box

use super::helpers::{
    click, set_checkbox, set_input_value, text_of, wait_for_css, wait_for_nonempty_text,
};
use super::{BrowserHarness, Duration, TestApp, TestResult};

const TIMEOUT: Duration = Duration::from_secs(10);

/// Click check (the exercise's current answer is taken as-is), wait for the
/// skip button, click it, and wait for the locked review state.
///
/// Works for non-fill-in modes where clicking check without explicit input
/// registers a wrong answer (e.g. clock "zet" with hands at 0:00, thermometer
/// "teken" with level at 0, or a word-choice list after a wrong option was
/// pre-selected via JS).
async fn skip_to_review(driver: &thirtyfour::WebDriver) -> TestResult<()> {
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip", TIMEOUT).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#exercise-content.locked", TIMEOUT).await?;
    Ok(())
}

// ─── Multiplications ─────────────────────────────────────────────────────────

/// After skip the multiplication equation (a × b =) must still be visible
/// alongside the correct answer, so the child can see both the question and
/// the answer at the same time.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn multiplications_review_shows_equation() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "#table-2", true).await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content #answer", TIMEOUT).await?;

    // Wrong answer → skip button appears.
    set_input_value(driver, "#answer", "999").await?;
    click(driver, "#button-check").await?;
    wait_for_css(driver, "#button-skip", TIMEOUT).await?;
    click(driver, "#button-skip").await?;
    wait_for_css(driver, "#exercise-content.locked", TIMEOUT).await?;

    // The multiplication sign must still be visible — original question preserved.
    let content = driver
        .execute(
            "return document.getElementById('exercise-content').innerText;",
            vec![],
        )
        .await?
        .json()
        .as_str()
        .unwrap_or("")
        .to_owned();
    assert!(
        content.contains('×'),
        "expected '×' to remain visible in multiplications review, got: {content:?}"
    );

    // Correct answer must appear in the bad box.
    let answer = text_of(driver, "#exercise-content .box.bad").await?;
    assert!(
        answer.chars().any(|c| c.is_ascii_digit()),
        "expected correct answer digit in bad box, got: {answer:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

// ─── Clock ───────────────────────────────────────────────────────────────────

/// "zet de klok" with a Dutch phrase prompt: after skip the phrase must appear
/// as a label above the correct clock so the child sees what they were asked
/// to set the clock to.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_zet_word_prompt_review_shows_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", true).await?;
    click(driver, "input[name='granularity'][value='five']").await?;

    // Pin Math.random = 0.2: Fisher-Yates on the wordsAllowed bag puts the
    // entry at original index 28 (h=2, m=20) last, so bag.pop() returns it.
    // The Dutch phrase for 2:20 is "tien voor half drie" / "twintig over twee".
    driver
        .execute(
            "window._savedRandom = Math.random; Math.random = () => 0.2;",
            vec![],
        )
        .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".clock.interactive", TIMEOUT).await?;
    driver
        .execute("Math.random = window._savedRandom;", vec![])
        .await?;

    // Clock hands start at 0:00; the question is h=2,m=20 → wrong answer.
    skip_to_review(driver).await?;

    // The Dutch phrase must appear as a .clock-choice-label above the clock.
    wait_for_css(driver, ".clock-choice-label", TIMEOUT).await?;
    let phrase = text_of(driver, ".clock-choice-label").await?;
    let dutch_words = ["uur", "half", "kwart", "voor", "over"];
    assert!(
        dutch_words.iter().any(|w| phrase.contains(w)),
        "expected Dutch time phrase in .clock-choice-label during review, got: {phrase:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// "lees de klok" with word-choice answer mode: after skip the review must
/// show the correct Dutch phrase in .time-readout.bad, not a bare digital time.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_lees_word_choice_review_shows_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_checkbox(driver, "input[name='ck'][value='lees']", true).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", false).await?;
    click(driver, "input[name='granularity'][value='five']").await?;

    // Math.random = 0.2:
    //   • Fisher-Yates on the 144-entry allowed[] → h=2,m=20 chosen.
    //   • 0.2 < 0.4 → choiceStyle = "words" (Dutch phrase options).
    driver
        .execute(
            "window._savedRandom = Math.random; Math.random = () => 0.2;",
            vec![],
        )
        .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".option-list", TIMEOUT).await?;
    driver
        .execute("Math.random = window._savedRandom;", vec![])
        .await?;

    // The framework returns early when readGiven() is null, so we must select
    // a button before clicking check. Pick the first option whose data-value
    // does not decode to h=2,m=20 (the correct answer).
    let found_wrong = driver
        .execute(
            r#"
            const btns = [...document.querySelectorAll('#exercise-content .option-list .option')];
            const wrong = btns.find(b => {
                try {
                    const v = JSON.parse(decodeURIComponent(b.dataset.value));
                    return !(v.h === 2 && v.m === 20);
                } catch { return true; }
            });
            if (wrong) { wrong.click(); return true; }
            return false;
            "#,
            vec![],
        )
        .await?
        .json()
        .as_bool()
        .unwrap_or(false);
    assert!(
        found_wrong,
        "expected at least one wrong option in the word-choice list"
    );

    skip_to_review(driver).await?;

    // Review now shows the full option list with the correct phrase highlighted in
    // `.review-correct`. The correct Dutch phrase must appear there — not a bare
    // "HH:MM" digital time string.
    wait_for_css(driver, ".option-list .review-correct", TIMEOUT).await?;
    let readout = text_of(driver, ".option-list .review-correct").await?;
    let dutch_words = ["uur", "half", "kwart", "voor", "over"];
    assert!(
        dutch_words.iter().any(|w| readout.contains(w)),
        "expected Dutch phrase in .review-correct for lees word-choice review, got: {readout:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

// ─── Thermometer ─────────────────────────────────────────────────────────────

/// "teken de thermometer": after skip the review must show the same target
/// value that was displayed as "Doel: X ℃" in the question, so the child
/// knows what temperature they were supposed to colour to.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn thermometer_teken_review_shows_target_value() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    driver.goto(app.url("/1/thermometer")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    set_input_value(driver, "#vmax", "30").await?;
    set_checkbox(driver, "input[name='tk'][value='teken']", true).await?;
    set_checkbox(driver, "input[name='tk'][value='schrijf']", false).await?;

    // Pin Math.random = 0.5:
    //   • pickRandom(["teken"]) → "teken" (only one entry, Math.random not used).
    //   • v = 0 + floor(0.5 * (30 - 0 + 1)) = floor(15.5) = 15.
    // target = 15 ≠ 0, so the thermometer (starting at 0) gives a wrong answer on check.
    driver
        .execute(
            "window._savedRandom = Math.random; Math.random = () => 0.5;",
            vec![],
        )
        .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, ".thermo-svg-host.interactive", TIMEOUT).await?;
    driver
        .execute("Math.random = window._savedRandom;", vec![])
        .await?;

    // Read the target from the "Doel: X ℃" display in the question.
    // Use wait_for_nonempty_text so CI paint delays don't return "".
    let goal_text =
        wait_for_nonempty_text(driver, "#exercise-content .box.split-part", TIMEOUT).await?;
    let target: i32 = goal_text.trim().parse().unwrap_or(-1);
    assert!(
        target > 0,
        "expected positive target temperature in .box.split-part, got {goal_text:?}"
    );

    // The thermometer starts at 0 (≠ target=15) → check gives a wrong answer.
    skip_to_review(driver).await?;

    // The same target value must be visible in the review bad box.
    let review_text =
        wait_for_nonempty_text(driver, "#exercise-content .box.split-part.bad", TIMEOUT).await?;
    let review_val: i32 = review_text.trim().parse().unwrap_or(-2);
    assert_eq!(
        review_val, target,
        "review must show target {target}℃ in .box.split-part.bad, got {review_text:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}
