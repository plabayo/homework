use std::env;
use std::error::Error;
use std::process::Command;

use thirtyfour::ChromiumLikeCapabilities;
use thirtyfour::manager::BrowserKind;
use thirtyfour::prelude::{DesiredCapabilities, WebDriver};

type TestResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub struct BrowserHarness {
    pub driver: WebDriver,
}

fn driver_in_path(name: &str) -> bool {
    let prog = if cfg!(windows) { "where" } else { "which" };
    Command::new(prog)
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

// Returns the first browser whose driver is already in PATH (or forced via env var).
// Order: Chrome → Edge → Firefox.
fn detect_browser() -> Option<BrowserKind> {
    if env::var("CHROME_BIN").is_ok()
        || env::var("CHROMEDRIVER").is_ok()
        || driver_in_path("chromedriver")
    {
        return Some(BrowserKind::Chrome);
    }
    if env::var("EDGE_BIN").is_ok()
        || env::var("EDGEDRIVER").is_ok()
        || driver_in_path("msedgedriver")
    {
        return Some(BrowserKind::Edge);
    }
    if env::var("FIREFOX_BIN").is_ok()
        || env::var("GECKODRIVER").is_ok()
        || driver_in_path("geckodriver")
    {
        return Some(BrowserKind::Firefox);
    }
    // Edge ships with every Windows install — let managed() find/download msedgedriver.
    #[cfg(windows)]
    return Some(BrowserKind::Edge);
    // On macOS Chrome and Firefox are often installed without their driver in PATH.
    // WebDriver::managed() auto-downloads the matching driver binary.
    #[cfg(target_os = "macos")]
    {
        if std::path::Path::new("/Applications/Google Chrome.app").exists() {
            return Some(BrowserKind::Chrome);
        }
        if std::path::Path::new("/Applications/Firefox.app").exists() {
            return Some(BrowserKind::Firefox);
        }
    }
    None
}

impl BrowserHarness {
    pub async fn spawn() -> TestResult<Self> {
        let kind = detect_browser().ok_or(
            "no browser driver found in PATH (chromedriver / msedgedriver / geckodriver); \
             set CHROME_BIN, EDGE_BIN, or FIREFOX_BIN to point to the browser binary, \
             or CHROMEDRIVER / EDGEDRIVER / GECKODRIVER to point to the driver",
        )?;

        let driver = match kind {
            BrowserKind::Chrome => {
                let mut caps = DesiredCapabilities::chrome();
                caps.add_arg("--headless=new")?;
                caps.add_arg("--disable-gpu")?;
                caps.add_arg("--no-sandbox")?;
                caps.add_arg("--disable-dev-shm-usage")?;
                caps.add_arg("--window-size=1280,900")?;
                if let Ok(bin) = env::var("CHROME_BIN") {
                    caps.set_binary(&bin)?;
                }
                let mut builder = WebDriver::managed(caps);
                if let Ok(bin) = env::var("CHROMEDRIVER") {
                    builder = builder.driver_binary(BrowserKind::Chrome, bin);
                }
                builder.await?
            }
            BrowserKind::Edge => {
                let mut caps = DesiredCapabilities::edge();
                caps.add_arg("--headless=new")?;
                caps.add_arg("--disable-gpu")?;
                caps.add_arg("--no-sandbox")?;
                caps.add_arg("--disable-dev-shm-usage")?;
                caps.add_arg("--window-size=1280,900")?;
                if let Ok(bin) = env::var("EDGE_BIN") {
                    caps.set_binary(&bin)?;
                }
                let mut builder = WebDriver::managed(caps);
                if let Ok(bin) = env::var("EDGEDRIVER") {
                    builder = builder.driver_binary(BrowserKind::Edge, bin);
                }
                builder.await?
            }
            BrowserKind::Firefox => {
                let mut caps = DesiredCapabilities::firefox();
                caps.add_arg("-headless")?;
                caps.add_arg("--width=1280")?;
                caps.add_arg("--height=900")?;
                if let Ok(bin) = env::var("FIREFOX_BIN") {
                    caps.set_firefox_binary(&bin)?;
                }
                let mut builder = WebDriver::managed(caps);
                if let Ok(bin) = env::var("GECKODRIVER") {
                    builder = builder.driver_binary(BrowserKind::Firefox, bin);
                }
                builder.await?
            }
            BrowserKind::Safari => return Err("unsupported browser kind".into()),
        };

        Ok(Self { driver })
    }
}
