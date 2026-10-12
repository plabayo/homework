// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use rama::error::BoxError;
use thirtyfour::prelude::WebDriver;

/// Injects axe-core into the current page and asserts zero violations.
/// Covers WCAG 2.1 AA rules including colour contrast, ARIA, keyboard reachability, etc.
pub async fn check_a11y(driver: &WebDriver) -> Result<(), BoxError> {
    driver
        .execute(include_str!("../fixtures/axe.min.js"), vec![])
        .await?;

    // Audit the colours that persist on screen, not a frame mid-fade: axe
    // blends in ancestor opacity, so a running entrance fade flags
    // muted-but-compliant text. Fast-forward every finite animation and
    // transition to its end instead of *waiting* for it. An animation's
    // `finished` promise only settles when the browser renders a frame, and
    // a headless window can go without frames for long enough that awaiting
    // it hung until the 60s script timeout on CI. `finish()` is synchronous
    // and needs no frame. Infinite animations (a ticking clock hand) cannot
    // be finished and are left alone.
    let ret = driver
        .execute_async(
            "const done = arguments[arguments.length - 1]; \
             for (const a of document.getAnimations()) { \
                 if (a.effect?.getComputedTiming().endTime === Infinity) continue; \
                 try { a.finish(); } catch {} \
             } \
             axe.run().then(done, (error) => done({ error: String(error) }));",
            vec![],
        )
        .await?;

    let result = ret.json();
    // An audit that could not run must fail, never pass as "no violations".
    let Some(violations) = result["violations"].as_array().cloned() else {
        return Err(format!(
            "axe did not run on {}: {}",
            driver.current_url().await?,
            result["error"].as_str().unwrap_or("no result")
        )
        .into());
    };

    if violations.is_empty() {
        return Ok(());
    }

    let summary: Vec<String> = violations
        .iter()
        .map(|v| {
            let nodes: Vec<&str> = v["nodes"]
                .as_array()
                .map(|ns| ns.iter().filter_map(|n| n["html"].as_str()).collect())
                .unwrap_or_default();
            format!(
                "  [{impact}] {id}: {desc}\n    nodes: {nodes}",
                impact = v["impact"].as_str().unwrap_or("?"),
                id = v["id"].as_str().unwrap_or("?"),
                desc = v["description"].as_str().unwrap_or("?"),
                nodes = nodes.join(", "),
            )
        })
        .collect();

    Err(format!(
        "{} axe violation(s) on {}:\n{}",
        violations.len(),
        driver.current_url().await?,
        summary.join("\n"),
    )
    .into())
}
