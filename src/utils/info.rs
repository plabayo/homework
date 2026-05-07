/// Git hash of the cli.
pub const GIT_HASH: &str = env!("VERGEN_GIT_SHA");

/// Build-scoped version token used to bust asset caches.
pub const ASSET_VERSION: &str = GIT_HASH;
