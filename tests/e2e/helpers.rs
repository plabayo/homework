// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

use super::{By, Duration, Instant, TestResult, WebDriver, WebElement};

pub(crate) async fn inject_deck(
    driver: &WebDriver,
    id: &str,
    name: &str,
    cards_json: &str,
) -> TestResult<()> {
    let script = format!(
        r#"localStorage.setItem('homework_flashcard_decks',
            JSON.stringify([{{id:'{id}',name:{name:?},cards:{cards_json},createdAt:1}}])
        );"#,
    );
    driver.execute(&script, vec![]).await?;
    Ok(())
}

pub(crate) async fn inject_deck_json(driver: &WebDriver, deck_json: &str) -> TestResult<()> {
    let script =
        format!("localStorage.setItem('homework_flashcard_decks', JSON.stringify([{deck_json}]));");
    driver.execute(&script, vec![]).await?;
    Ok(())
}

pub(crate) async fn generate_import_param(driver: &WebDriver) -> TestResult<String> {
    encode_deck_for_import(
        driver,
        r#"{name:"Gedeeld deck",mode:"two-sided",bidirectional:false,cards:[{front:"huis",back:"maison"}]}"#,
    )
    .await
}

pub(crate) async fn encode_deck_for_import(
    driver: &WebDriver,
    deck_js: &str,
) -> TestResult<String> {
    let script = format!(
        r#"
        const done = arguments[arguments.length - 1];
        const deck = {deck_js};
        const json = JSON.stringify(deck);
        const cs = new CompressionStream("deflate-raw");
        const writer = cs.writable.getWriter();
        writer.write(new TextEncoder().encode(json));
        writer.close();
        new Response(cs.readable).arrayBuffer().then(buf => {{
            let bin = "";
            for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
            done(btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, ""));
        }});
        "#
    );
    let result = driver.execute_async(&script, vec![]).await?;
    Ok(result.json().as_str().unwrap_or("").to_owned())
}

pub(crate) async fn select_deck_and_start(driver: &WebDriver, deck_id: &str) -> TestResult<()> {
    wait_for_css(
        driver,
        &format!(".deck-item[data-deck-id='{deck_id}']"),
        Duration::from_secs(10),
    )
    .await?;
    click(
        driver,
        &format!(".deck-item[data-deck-id='{deck_id}'] .deck-select-btn"),
    )
    .await?;
    click(driver, "#form-setup button[type='submit']").await?;
    Ok(())
}

/// Injects a two-sided multi-part deck, navigates to the flashcards page,
/// and starts the exercise.  `parts` are the answer parts; `parts_required`
/// is `None` for "all required" or `Some(n)` for a partial minimum.
pub(crate) async fn setup_multipart_exercise(
    driver: &WebDriver,
    app_url: &str,
    deck_id: &str,
    front: &str,
    parts: &[&str],
    parts_required: Option<usize>,
) -> TestResult<()> {
    let parts_json = parts
        .iter()
        .map(|p| format!(r#""{p}""#))
        .collect::<Vec<_>>()
        .join(",");
    let parts_required_json = match parts_required {
        Some(n) => format!(r#","partsRequired":{n}"#),
        None => String::new(),
    };
    let deck_json = format!(
        r#"{{"id":"{deck_id}","name":"Multi-deel test","mode":"two-sided",
            "cards":[{{"front":"{front}","parts":[{parts_json}]{parts_required_json}}}],
            "createdAt":1}}"#
    );
    driver.goto(app_url).await?;
    wait_for_css(driver, "#deck-manager", Duration::from_secs(10)).await?;
    inject_deck_json(driver, &deck_json).await?;
    driver.refresh().await?;
    select_deck_and_start(driver, deck_id).await?;
    wait_for_css(driver, "#exercise-content #answer", Duration::from_secs(5)).await?;
    Ok(())
}

pub(crate) async fn collect_hrefs(links: Vec<WebElement>) -> TestResult<Vec<String>> {
    let mut hrefs = Vec::with_capacity(links.len());
    for link in links {
        if let Some(href) = link.attr("href").await? {
            hrefs.push(href);
        }
    }
    Ok(hrefs)
}

pub(crate) async fn wait_for_css(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<()> {
    poll_until(timeout, || async {
        let matches = driver.find_all(By::Css(selector)).await?;
        Ok(!matches.is_empty())
    })
    .await
}

/// Wait until `selector` matches at least `min` elements. Used by tests that
/// need to react to the *number* of elements changing (e.g. clicking a "toon
/// meer" button reveals new cards) — `wait_for_css` only proves ≥1 is there.
pub(crate) async fn wait_for_css_count(
    driver: &WebDriver,
    selector: &str,
    min: usize,
    timeout: Duration,
) -> TestResult<()> {
    poll_until(timeout, || async {
        let matches = driver.find_all(By::Css(selector)).await?;
        Ok(matches.len() >= min)
    })
    .await
}

pub(crate) async fn wait_for_text(
    driver: &WebDriver,
    selector: &str,
    expected: &str,
    timeout: Duration,
) -> TestResult<()> {
    let expected = expected.to_owned();
    poll_until(timeout, || async {
        let matches = driver.find_all(By::Css(selector)).await?;
        if matches.is_empty() {
            return Ok(false);
        }
        let text = matches[0].text().await?;
        Ok(text.contains(&expected))
    })
    .await
}

pub(crate) async fn selector_has_disabled(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<bool> {
    wait_for_css(driver, selector, timeout).await?;
    let disabled = driver
        .find(By::Css(selector))
        .await?
        .prop("disabled")
        .await?
        .unwrap_or_default();
    Ok(disabled == "true")
}

pub(crate) async fn click(driver: &WebDriver, selector: &str) -> TestResult<()> {
    driver.find(By::Css(selector)).await?.click().await?;
    Ok(())
}

pub(crate) async fn set_input_value(
    driver: &WebDriver,
    selector: &str,
    value: &str,
) -> TestResult<()> {
    let input = driver.find(By::Css(selector)).await?;
    input.clear().await?;
    input.send_keys(value).await?;
    Ok(())
}

pub(crate) async fn set_checkbox(
    driver: &WebDriver,
    selector: &str,
    checked: bool,
) -> TestResult<()> {
    let checkbox = driver.find(By::Css(selector)).await?;
    if checkbox.is_selected().await? != checked {
        checkbox.click().await?;
    }
    Ok(())
}

pub(crate) async fn text_of(driver: &WebDriver, selector: &str) -> TestResult<String> {
    Ok(driver.find(By::Css(selector)).await?.text().await?)
}

pub(crate) async fn wait_for_nonempty_text(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<String> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(el) = driver.find(By::Css(selector)).await {
            let t = el.text().await.unwrap_or_default();
            if !t.trim().is_empty() {
                return Ok(t);
            }
        }
        if Instant::now() >= deadline {
            return Err(format!("no visible text in {selector:?} within {timeout:?}").into());
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    }
}

pub(crate) async fn wait_for_enabled(
    driver: &WebDriver,
    selector: &str,
    timeout: Duration,
) -> TestResult<()> {
    let deadline = Instant::now() + timeout;
    let script = format!(
        "var el = document.querySelector({selector:?}); return el != null && !el.disabled;"
    );
    loop {
        let enabled = driver
            .execute(&script, vec![])
            .await
            .ok()
            .and_then(|v| v.json().as_bool())
            .unwrap_or(false);
        if enabled {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("{selector:?} not enabled within {timeout:?}").into());
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    }
}

pub(crate) async fn poll_until<F, Fut>(timeout: Duration, mut f: F) -> TestResult<()>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = TestResult<bool>>,
{
    let deadline = Instant::now() + timeout;
    loop {
        if f().await? {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("condition not met within {timeout:?}").into());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

pub(crate) fn parse_product_answer(text: &str) -> TestResult<u32> {
    let mut numbers = text
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .map(str::parse::<u32>);

    let a = numbers
        .next()
        .ok_or_else(|| format!("could not parse first number from {text:?}"))??;
    let b = numbers
        .next()
        .ok_or_else(|| format!("could not parse second number from {text:?}"))??;

    Ok(a * b)
}
