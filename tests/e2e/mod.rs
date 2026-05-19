// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

pub(crate) use std::time::{Duration, Instant};

pub(crate) use crate::support::a11y::check_a11y;
pub(crate) use crate::support::app::TestApp;
pub(crate) use crate::support::browser::BrowserHarness;
pub(crate) use rama::error::BoxError;
pub(crate) use thirtyfour::prelude::{By, WebDriver, WebElement};

pub(crate) type TestResult<T> = Result<T, BoxError>;

mod a11y;
mod app_shell;
mod clock_freeplay;
mod exercise_flows;
mod flashcards_decks;
mod flashcards_play;
mod fractions;
mod helpers;
mod language_banner;
mod percentages;
mod review_context;
