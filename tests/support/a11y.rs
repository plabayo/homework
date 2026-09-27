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

    // Let finite animations (page / question entrance fades) settle first:
    // axe blends in ancestor opacity, so auditing mid-fade measures colours
    // that never persist on screen and flags muted-but-compliant text.
    // Infinite animations (e.g. a ticking clock hand) never finish and are
    // skipped.
    let ret = driver
        .execute_async(
            "const done = arguments[arguments.length - 1]; \
             const finite = document.getAnimations().filter( \
                 (a) => a.effect?.getComputedTiming().endTime !== Infinity); \
             Promise.allSettled(finite.map((a) => a.finished)) \
                 .then(() => axe.run()) \
                 .then(done);",
            vec![],
        )
        .await?;

    let result = ret.json();
    let violations = result["violations"].as_array().cloned().unwrap_or_default();

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
