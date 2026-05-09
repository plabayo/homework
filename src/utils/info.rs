// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

/// Git hash of the cli.
pub const GIT_HASH: &str = env!("VERGEN_GIT_SHA");

/// Build-scoped version token used to bust asset caches.
pub const ASSET_VERSION: &str = GIT_HASH;
