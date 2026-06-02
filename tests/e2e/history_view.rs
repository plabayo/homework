// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.
//
// Regression tests for the history-block reshape: pagination ("toon meer"),
// weekly aggregation for older sessions, and the retention cap.
//
// All three behaviours are driven off IndexedDB state and a `setupHistoryView`
// refresh — neither requires the kid to actually play through an exercise.
// We seed the DB via `driver.execute_async` and then call the existing
// refresh hook (`homework:refresh-history` custom event) and assert DOM.

use super::helpers::{click, wait_for_css, wait_for_css_count};
use super::{BrowserHarness, By, Duration, TestApp, TestResult, WebDriver};

/// Open the multiplications page and wait until homework.js has wired
/// `#history` (the seed scripts below assume an open IndexedDB).
async fn open_with_clean_history(driver: &WebDriver, app: &TestApp) -> TestResult<()> {
    driver.goto(app.url("/1/multiplications")).await?;
    wait_for_css(driver, "#form-setup", Duration::from_secs(10)).await?;
    wait_for_css(driver, "#history", Duration::from_secs(10)).await?;
    // Clear any pre-existing session rows so each test starts deterministic.
    driver
        .execute_async(
            r#"
            const cb = arguments[arguments.length - 1];
            const open = indexedDB.open("homework", 1);
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction("sessions", "readwrite");
                tx.objectStore("sessions").clear();
                tx.oncomplete = () => cb(null);
                tx.onerror = () => cb("clear failed");
            };
            open.onerror = () => cb("open failed");
            "#,
            vec![],
        )
        .await?;
    Ok(())
}

/// Insert N synthetic sessions for the given exercise. Each session has the
/// supplied `daysAgo` offset and a constant 10/10 score with no question
/// detail (the rendered card just shows "✨ alles vlekkeloos").
///
/// `wait_for_min_recent` is the smallest number of `.history-recent
/// .history-session` cards we expect to see after the refresh — that's the
/// signal that the dispatched `homework:refresh-history` actually re-read
/// the DB and rendered. Pass `0` if you only seeded out-of-window rows (the
/// refresh still has to land but no recent cards are expected); in that case
/// we wait for `.history-week` instead.
async fn seed_sessions(
    driver: &WebDriver,
    exercise_id: &str,
    sessions: &[(i64, &str)],
    wait_for_min_recent: usize,
) -> TestResult<()> {
    // Build a JSON array literal so we can pass everything in one execute call.
    let rows: Vec<String> = sessions
        .iter()
        .enumerate()
        .map(|(i, (days_ago, label))| {
            format!(
                "{{id:'seed-{i}',exerciseId:{eid:?},finishedAt:NOW-({d}*DAY),total:10,correct:10,questions:[{{label:{l:?},correct:false,attempts:1}}]}}",
                eid = exercise_id,
                d = days_ago,
                l = label,
            )
        })
        .collect();
    let script = format!(
        r#"
        const cb = arguments[arguments.length - 1];
        const DAY = 86400000;
        const NOW = Date.now();
        const rows = [{rows}];
        const open = indexedDB.open("homework", 1);
        open.onsuccess = () => {{
            const db = open.result;
            const tx = db.transaction("sessions", "readwrite");
            const store = tx.objectStore("sessions");
            for (const r of rows) store.put(r);
            tx.oncomplete = () => cb(null);
            tx.onerror = () => cb("put failed: " + tx.error);
        }};
        open.onerror = () => cb("open failed");
        "#,
        rows = rows.join(","),
    );
    driver.execute_async(script, vec![]).await?;
    // Nudge homework.js to re-read the DB and rerender.
    driver
        .execute(
            r#"document.dispatchEvent(new CustomEvent("homework:refresh-history"));"#,
            vec![],
        )
        .await?;
    // Wait for the async refresh to land instead of sleeping. The IDB read is
    // typically <50ms but can be longer under WebDriver load — poll up to 5s.
    if wait_for_min_recent > 0 {
        wait_for_css_count(
            driver,
            ".history-recent .history-session",
            wait_for_min_recent,
            Duration::from_secs(5),
        )
        .await?;
    } else {
        wait_for_css(driver, ".history-week", Duration::from_secs(5)).await?;
    }
    Ok(())
}

/// 3-session-default + "toon meer" button reveals the rest.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn history_renders_three_by_default_and_paginates() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_with_clean_history(driver, &app).await?;

    // 6 sessions, all within the recent window — should yield 3 visible cards
    // and a "toon meer" button revealing the remaining 3.
    seed_sessions(
        driver,
        "multiplications",
        &[
            (0, "7×8"),
            (1, "9×7"),
            (2, "6×6"),
            (3, "8×8"),
            (4, "5×5"),
            (5, "4×4"),
        ],
        3,
    )
    .await?;

    let initial_cards = driver
        .find_all(By::Css(".history-recent .history-session"))
        .await?
        .len();
    assert_eq!(initial_cards, 3, "expected 3 default-visible cards");

    let more_btn = driver
        .find_all(By::Css("[data-action='show-more']"))
        .await?;
    assert_eq!(more_btn.len(), 1, "expected one 'toon meer' button");

    click(driver, "[data-action='show-more']").await?;
    // Wait for the post-click rerender — 6 recent cards visible — instead of
    // blanket-sleeping. setupHistoryView re-renders synchronously after the
    // click, but the re-attachment to the DOM still lands on the next tick.
    wait_for_css_count(
        driver,
        ".history-recent .history-session",
        6,
        Duration::from_secs(5),
    )
    .await?;

    let after_first_click = driver
        .find_all(By::Css(".history-recent .history-session"))
        .await?
        .len();
    assert_eq!(
        after_first_click, 6,
        "click reveals next 3 → 6 visible total"
    );

    let more_btn_after = driver
        .find_all(By::Css("[data-action='show-more']"))
        .await?;
    assert!(
        more_btn_after.is_empty(),
        "'toon meer' button must vanish once all recent cards are visible"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// Sessions older than 2 weeks aggregate into weekly buckets regardless of
/// how few there are total. Also exercises the `<details>` summary text.
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn history_aggregates_older_than_two_weeks_into_weekly_buckets() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_with_clean_history(driver, &app).await?;

    // 1 recent + 3 old (>14 days). The old ones get aggregated; the recent
    // one stays as an individual card.
    seed_sessions(
        driver,
        "multiplications",
        &[(0, "7×8"), (20, "9×7"), (25, "9×7"), (30, "6×6")],
        1,
    )
    .await?;

    let recent_cards = driver
        .find_all(By::Css(".history-recent .history-session"))
        .await?
        .len();
    assert_eq!(recent_cards, 1, "only the daysAgo=0 session is in-window");

    let week_buckets = driver.find_all(By::Css(".history-week")).await?;
    assert!(
        !week_buckets.is_empty(),
        "older sessions must produce at least one .history-week bucket"
    );

    // Expand the first week and verify the top-mistakes block surfaces — the
    // actionable bit ("vaakste struikelblok"). 9×7 appears twice in the seed
    // so it should rank above 6×6. Wait for the `[open]` selector to match
    // rather than relying on a fixed sleep — clicking <summary> only flips
    // the attribute after the browser's next event-loop turn.
    click(driver, ".history-week > summary").await?;
    wait_for_css(
        driver,
        ".history-week[open] .history-week-mistakes",
        Duration::from_secs(5),
    )
    .await?;
    let mistakes_html = driver
        .find(By::Css(".history-week[open] .history-week-mistakes"))
        .await?
        .inner_html()
        .await?;
    assert!(
        mistakes_html.contains("9×7"),
        "expected most-frequent mistake to surface in week bucket: {mistakes_html:?}"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// Retention cap: `evictBeyondCap(exerciseId, cap)` deletes the oldest rows
/// past `cap`. Seeded 205 rows directly via IDB, called the exported helper
/// with cap=200, asserted exactly 200 remain AND the survivors are the 200
/// most recent (newest `daysAgo`).
#[tokio::test(flavor = "multi_thread")]
#[ignore = "requires a browser (Chrome/Edge/Firefox) and its driver; run via `just test-e2e`"]
async fn history_retention_cap_evicts_oldest_beyond_200() -> TestResult<()> {
    let app = TestApp::spawn()?;
    let browser = BrowserHarness::spawn().await?;
    let driver = &browser.driver;

    open_with_clean_history(driver, &app).await?;

    // Seed 205 rows with strictly increasing daysAgo so newest-first ordering
    // is deterministic; raw IDB put, no eviction yet.
    let mut seeds = Vec::with_capacity(205);
    for i in 0..205 {
        seeds.push((i, "filler"));
    }
    let seed_refs: Vec<(i64, &str)> = seeds.iter().map(|(d, l)| (*d, *l)).collect();
    seed_sessions(driver, "multiplications", &seed_refs, 3).await?;

    let stats = driver
        .execute_async(
            r#"
            const cb = arguments[arguments.length - 1];
            const mod = await import("@homework");
            await mod.evictBeyondCap("multiplications", 200);
            const open = indexedDB.open("homework", 1);
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction("sessions", "readonly");
                const idx = tx.objectStore("sessions").index("by_exercise");
                let total = 0;
                let oldestKept = Infinity;
                const cur = idx.openCursor(IDBKeyRange.only("multiplications"));
                cur.onsuccess = (e) => {
                    const c = e.target.result;
                    if (!c) { cb({ total, oldestKept }); return; }
                    total += 1;
                    if (c.value.finishedAt < oldestKept) oldestKept = c.value.finishedAt;
                    c.continue();
                };
                cur.onerror = () => cb({ total: -1, oldestKept: -1 });
            };
            open.onerror = () => cb({ total: -1, oldestKept: -1 });
            "#,
            vec![],
        )
        .await?
        .json()
        .clone();

    let total = stats["total"].as_u64().unwrap_or(0);
    let oldest_kept = stats["oldestKept"].as_i64().unwrap_or(0);
    assert_eq!(
        total, 200,
        "evictBeyondCap must trim the store to exactly the cap, got {total}"
    );
    // Seeded sessions are at NOW - i*DAY for i in 0..205. After eviction the
    // 200 newest survive (i = 0..199), so the oldest survivor's timestamp is
    // NOW - 199*DAY. We allow a small slack for the NOW the script captured
    // vs the NOW the page captured — just assert "older than 200 days isn't
    // here" by checking the floor.
    let day_ms: i64 = 24 * 60 * 60 * 1000;
    let now = chrono_like_now_ms();
    let expected_floor = now - 199 * day_ms - 5_000; // 5s slack
    assert!(
        oldest_kept >= expected_floor,
        "oldest surviving session must be at most ~199 days old; got oldestKept={oldest_kept}, expected_floor={expected_floor}"
    );

    driver.clone().quit().await?;
    Ok(())
}

/// Quick local-time-now in ms — avoids pulling chrono into the test crate.
fn chrono_like_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    (dur.as_millis() as i64).max(0)
}
