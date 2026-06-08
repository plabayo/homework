// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::helpers::{
    click, set_checkbox, set_input_value, wait_for_css, wait_for_nonempty_text, wait_for_text,
};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver};

const TIMEOUT: Duration = Duration::from_secs(10);

/// Configure the analog-clock exercise to a single word-mode "zet" question
/// at five-minute granularity, then start it.
///
/// Five-minute granularity is the coarsest setting whose times include the
/// ambiguous ones (xx:05/10/15/20/25/35/40) that have two valid Dutch
/// phrasings — the case this test exercises. Word mode renders the prompt as
/// a `.phrase-flip` widget in the `#exercise-feedback` line.
async fn start_word_zet_session(driver: &WebDriver, app: &TestApp) -> TestResult<()> {
    driver.goto(app.url("/2/clock")).await?;
    wait_for_css(driver, "#form-setup", TIMEOUT).await?;
    set_input_value(driver, "#num-exercises", "1").await?;
    // Keep only "zet de klok vanuit woorden" so every question is word-mode.
    set_checkbox(driver, "input[name='ck'][value='lees']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet']", false).await?;
    set_checkbox(driver, "input[name='ck'][value='zet-woorden']", true).await?;
    click(driver, "input[name='granularity'][value='five']").await?;
    click(driver, "#form-setup button[type='submit']").await?;
    wait_for_css(driver, "#exercise-content .clock.interactive", TIMEOUT).await?;
    wait_for_nonempty_text(driver, "#exercise-feedback", TIMEOUT).await?;
    Ok(())
}

/// `[total faces, visible faces]` of the phrase-flip widget in the feedback
/// line. A healthy flip has two faces with exactly one visible (computed
/// opacity > 0.5); the regression flattened the widget to plain text, leaving
/// zero `.phrase-flip-face` elements.
async fn feedback_flip_faces(driver: &WebDriver) -> TestResult<(i64, i64)> {
    let v = driver
        .execute(
            "var faces = document.querySelectorAll('#exercise-feedback .phrase-flip-face'); \
             var visible = 0; \
             faces.forEach(function (f) { \
                 if (parseFloat(getComputedStyle(f).opacity) > 0.5) visible++; \
             }); \
             return [faces.length, visible];",
            vec![],
        )
        .await?;
    let arr = v.json().as_array().ok_or("expected array")?.to_vec();
    let total = arr[0].as_i64().ok_or("expected face count")?;
    let visible = arr[1].as_i64().ok_or("expected visible count")?;
    Ok((total, visible))
}

/// True when the feedback-line phrase-flip is showing its front (un-flipped)
/// face — the phrasing that was visible at that moment.
async fn flip_shows_front(driver: &WebDriver) -> TestResult<bool> {
    Ok(driver
        .execute(
            "var el = document.querySelector('#exercise-feedback .phrase-flip'); \
             return !!el && !el.classList.contains('flipped');",
            vec![],
        )
        .await?
        .json()
        .as_bool()
        .unwrap_or(false))
}

/// Regression test for the analog-clock word-mode retry feedback.
///
/// When a "zet de klok" question has two valid Dutch phrasings, the prompt is
/// a tappable `.phrase-flip` widget showing one phrasing at a time. A wrong
/// attempt used to re-render the prompt from `textContent`, which flattened
/// the widget into both phrasings concatenated as plain text — e.g. "tien
/// voor half tien" + "twintig over negen" → "tien voor half tientwintig over
/// negen". The retry must instead preserve the widget: one visible phrasing,
/// still clickable, defaulting to the one that was showing.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn clock_zet_retry_feedback_keeps_single_clickable_phrase() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    // The target time is random; restart until we land on an ambiguous one
    // (two phrasings → a `.phrase-flip` in the prompt). ~58% of five-minute
    // times qualify, so this almost always succeeds on the first try.
    // Navigating away from a fresh, unanswered question is safe — the session
    // leave-guard only arms after the first recorded answer.
    let mut found = false;
    for _ in 0..25 {
        start_word_zet_session(driver, &app).await?;
        // Let renderZetFeedback's sizeFlip settle before inspecting.
        tokio::time::sleep(Duration::from_millis(80)).await;
        if !driver
            .find_all(By::Css("#exercise-feedback .phrase-flip"))
            .await?
            .is_empty()
        {
            found = true;
            break;
        }
    }
    assert!(
        found,
        "could not reach an ambiguous (two-phrasing) word-mode clock question in 25 tries",
    );

    // The fresh prompt shows the flip with exactly one visible face.
    let faces_before = feedback_flip_faces(driver).await?;
    assert_eq!(
        faces_before,
        (2, 1),
        "fresh word-mode prompt should be a 2-face flip with one visible face, got {faces_before:?}",
    );
    assert!(
        flip_shows_front(driver).await?,
        "fresh prompt should show the flip's front face",
    );

    // The interactive clock starts at 06:00 and an ambiguous target never has
    // m == 0, so submitting now is guaranteed wrong → the retry-feedback path
    // (the one that used to flatten the flip) runs.
    click(driver, "#button-check").await?;
    wait_for_text(
        driver,
        "#exercise-feedback",
        "probeer het nog eens",
        TIMEOUT,
    )
    .await?;

    // Regression: the prompt's flip must survive the retry intact — not
    // collapse into "<phrase A><phrase B>" plain text (which would leave zero
    // `.phrase-flip-face` elements).
    let faces_after = feedback_flip_faces(driver).await?;
    assert_eq!(
        faces_after,
        (2, 1),
        "after a wrong attempt the prompt must still be a 2-face flip with one visible face \
         (regression: both phrasings were concatenated as plain text), got {faces_after:?}",
    );
    // ...and still default to the phrasing that was visible at that moment.
    assert!(
        flip_shows_front(driver).await?,
        "retry feedback should keep the originally-visible phrasing (front face)",
    );

    // ...and remain clickable: tapping flips to the other phrasing, still
    // showing exactly one face.
    click(driver, "#exercise-feedback .phrase-flip").await?;
    tokio::time::sleep(Duration::from_millis(450)).await; // opacity crossfade
    let pressed = driver
        .execute(
            "var el = document.querySelector('#exercise-feedback .phrase-flip'); \
             return el ? el.getAttribute('aria-pressed') : '';",
            vec![],
        )
        .await?
        .json()
        .as_str()
        .unwrap_or("")
        .to_owned();
    assert_eq!(
        pressed, "true",
        "clicking the flip should toggle it to the alternate phrasing",
    );
    let faces_flipped = feedback_flip_faces(driver).await?;
    assert_eq!(
        faces_flipped,
        (2, 1),
        "after flipping, exactly one of the two faces is still visible, got {faces_flipped:?}",
    );

    driver.clone().quit().await?;
    Ok(())
}
