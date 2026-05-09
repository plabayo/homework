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

    let ret = driver
        .execute_async(
            "axe.run().then(r => arguments[arguments.length - 1](r))",
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
