use std::env;
use std::error::Error;

use thirtyfour::ChromiumLikeCapabilities;
use thirtyfour::manager::BrowserKind;
use thirtyfour::prelude::{DesiredCapabilities, WebDriver};

type TestResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

pub struct BrowserHarness {
    pub driver: WebDriver,
}

impl BrowserHarness {
    pub async fn spawn() -> TestResult<Self> {
        let mut caps = DesiredCapabilities::chrome();
        caps.add_arg("--headless=new")?;
        caps.add_arg("--disable-gpu")?;
        caps.add_arg("--no-sandbox")?;
        caps.add_arg("--disable-dev-shm-usage")?;
        caps.add_arg("--window-size=1280,900")?;

        if let Ok(chrome_bin) = env::var("CHROME_BIN") {
            caps.set_binary(&chrome_bin)?;
        }

        let mut builder = WebDriver::managed(caps);
        if let Ok(driver_bin) = env::var("CHROMEDRIVER") {
            builder = builder.driver_binary(BrowserKind::Chrome, driver_bin);
        }
        let driver = builder.await?;

        Ok(Self { driver })
    }
}
