// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

//! Inline-asset registry and per-response CSP source construction.
//!
//! `build.rs` walks `src/service/` and emits one base64-SHA-256 const
//! per `.js` / `.css` file. The file lives in `$OUT_DIR/inline_hashes.rs`
//! and is `include!`d below — so every web asset under `src/service/`
//! has a hash constant whether or not it ends up being inlined.
//!
//! [`InlineStyle`], [`InlineScript`], and [`InlineModuleScript`] pair
//! the file body (via `include_str!`) with that hash constant. They're
//! declared at module level via the [`crate::inline_style!`],
//! [`crate::inline_script!`], and [`crate::inline_module_script!`]
//! macros. `page()` in `layout.rs` takes
//! typed `Option<&'static …>` parameters and uses both `.render()` (for
//! the HTML body) and `.hash_b64()` (to populate `script-src` / `style-src`
//! with `'sha256-…'` source expressions matching the bytes it just emitted).
//!
//! There's no global list of which inlines exist on which pages: every
//! page builds its CSP from precisely the inlines it passes to `page()`.
//! Forgetting to declare an inline is caught by the browser as a CSP
//! violation in dev; mismatching the hash const name is caught by the
//! compiler.

use rama::http::html::{IntoHtml, PreEscaped, script, style};

/// All build-script outputs live behind this namespace so the csp module's
/// public surface stays the typed struct interface (`THEME_INIT`,
/// `IMPORTMAP`, plus the per-handler statics declared via the
/// `inline_*!` macros) — and so a reader of `csp.rs` sees one `mod generated`
/// line instead of a wall of raw `*_HASH_B64` constants.
///
/// `pub(crate)` rather than private because the `inline_style!` /
/// `inline_script!` / `inline_module_script!` macros below expand in
/// handler modules outside this file and need to reference the hash
/// constants by name via `$crate::service::csp::generated::…`.
pub(crate) mod generated {
    // One `pub const FOO_BAR_HASH_B64: &str = "...";` per .js/.css file
    // under src/service/. See module docs in csp.rs.
    include!(concat!(env!("OUT_DIR"), "/inline_hashes.rs"));
    // `IMPORTMAP_BODY` is the JSON body of the `<script type="importmap">`
    // block inlined on every page (synthesised from the short git SHA,
    // matching `layout::page`'s render); `IMPORTMAP_HASH_B64` is its
    // base64-SHA-256. Same model as the file-based hashes — no runtime
    // computation.
    include!(concat!(env!("OUT_DIR"), "/importmap.rs"));
}

/// An inline `<style>` block whose body and SHA-256 are fixed at compile
/// time.
#[derive(Debug)]
pub struct InlineStyle {
    body: &'static str,
    hash_b64: &'static str,
}

impl InlineStyle {
    // `pub(crate)` rather than `pub`: callers go through the
    // `inline_style!` macro, never the constructor directly. Crate-private
    // is the minimum visibility that lets the macro expansion in handler
    // modules still resolve the path.
    pub(crate) const fn new(body: &'static str, hash_b64: &'static str) -> Self {
        Self { body, hash_b64 }
    }

    /// Render as `<style>…</style>`. Body is emitted verbatim — it's
    /// trusted CSS source that lives in the repo.
    pub fn render(&self) -> impl IntoHtml {
        style!(PreEscaped(self.body))
    }

    /// Base64-encoded SHA-256 of the body, ready to drop into a CSP
    /// `'sha256-<value>'` source expression.
    pub fn hash_b64(&self) -> &'static str {
        self.hash_b64
    }
}

/// An inline classic `<script>` block (synchronous, runs at parse time).
/// Use [`InlineModuleScript`] for ES-module inlines.
#[derive(Debug)]
pub struct InlineScript {
    body: &'static str,
    hash_b64: &'static str,
}

impl InlineScript {
    // See note on `InlineStyle::new`.
    pub(crate) const fn new(body: &'static str, hash_b64: &'static str) -> Self {
        Self { body, hash_b64 }
    }

    /// Render as `<script>…</script>` (classic, no `type` attribute).
    pub fn render(&self) -> impl IntoHtml {
        script!(PreEscaped(self.body))
    }

    pub fn hash_b64(&self) -> &'static str {
        self.hash_b64
    }
}

/// An inline `<script type="module">` block. Module semantics: deferred,
/// strict mode, top-level `await`. The kind is part of the type so a
/// classic body can't accidentally render as a module or vice versa.
#[derive(Debug)]
pub struct InlineModuleScript {
    body: &'static str,
    hash_b64: &'static str,
}

impl InlineModuleScript {
    // See note on `InlineStyle::new`.
    pub(crate) const fn new(body: &'static str, hash_b64: &'static str) -> Self {
        Self { body, hash_b64 }
    }

    pub fn render(&self) -> impl IntoHtml {
        script!(r#type = "module", PreEscaped(self.body))
    }

    pub fn hash_b64(&self) -> &'static str {
        self.hash_b64
    }
}

/// Declare a `pub static INLINE_STYLE_CONST` from a file under
/// `src/service/<path>` together with its build-script-generated hash.
///
/// Usage:
/// ```ignore
/// crate::inline_style!(STYLE, "clock.css", EXERCISES_CLOCK_CSS_HASH_B64);
/// ```
///
/// The hash constant must exist in `csp.rs`'s included
/// `inline_hashes.rs` — i.e. the file must already be under
/// `src/service/`. A typo is a compile error.
#[macro_export]
macro_rules! inline_style {
    ($name:ident, $path:literal, $hash_const:ident) => {
        pub static $name: $crate::service::csp::InlineStyle =
            $crate::service::csp::InlineStyle::new(
                include_str!($path),
                $crate::service::csp::generated::$hash_const,
            );
    };
}

/// Declare an inline classic `<script>`. See [`crate::inline_style!`]
/// for the general shape.
#[macro_export]
macro_rules! inline_script {
    ($name:ident, $path:literal, $hash_const:ident) => {
        pub static $name: $crate::service::csp::InlineScript =
            $crate::service::csp::InlineScript::new(
                include_str!($path),
                $crate::service::csp::generated::$hash_const,
            );
    };
}

/// Declare an inline `<script type="module">`.
#[macro_export]
macro_rules! inline_module_script {
    ($name:ident, $path:literal, $hash_const:ident) => {
        pub static $name: $crate::service::csp::InlineModuleScript =
            $crate::service::csp::InlineModuleScript::new(
                include_str!($path),
                $crate::service::csp::generated::$hash_const,
            );
    };
}

/// Inline `<script type="importmap">` declaring the `@homework`
/// bare-specifier mapping. Body is built at compile time from the short
/// git SHA — see `build.rs` and `IMPORTMAP_BODY` / `IMPORTMAP_HASH_B64`.
#[derive(Debug)]
pub struct InlineImportmap {
    body: &'static str,
    hash_b64: &'static str,
}

impl InlineImportmap {
    // Private constructor — `IMPORTMAP` below is the only intended
    // instance, built from the build.rs-generated body and hash. There's
    // no path that would want a second one.
    const fn new(body: &'static str, hash_b64: &'static str) -> Self {
        Self { body, hash_b64 }
    }

    pub fn render(&self) -> impl IntoHtml {
        script!(r#type = "importmap", PreEscaped(self.body))
    }

    pub fn hash_b64(&self) -> &'static str {
        self.hash_b64
    }
}

/// Inline `<script type="speculationrules">` for the [Speculation Rules
/// API](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API)
/// — tells the browser which links to prefetch/prerender from the current
/// page. Bodies vary per page (each page recommends different "what
/// comes next" routes), so we don't hash them; instead the page's CSP
/// adds the dedicated `'inline-speculation-rules'` keyword which the
/// browser scopes to this script type specifically.
#[derive(Debug)]
pub struct InlineSpeculationRules {
    body: &'static str,
}

impl InlineSpeculationRules {
    pub(crate) const fn new(body: &'static str) -> Self {
        Self { body }
    }

    pub fn render(&self) -> impl IntoHtml {
        script!(r#type = "speculationrules", PreEscaped(self.body))
    }
}

/// Inline `<script type="application/ld+json">` carrying schema.org
/// structured data. Browsers don't execute this content (the type isn't
/// JavaScript) but CSP's `script-src` still gates it because it lives in
/// a `<script>` tag — so each block is hashed at build time and the
/// page's CSP lists the matching `'sha256-…'`.
#[derive(Debug)]
pub struct InlineLdJson {
    body: &'static str,
    hash_b64: &'static str,
}

impl InlineLdJson {
    // See note on `InlineStyle::new`.
    pub(crate) const fn new(body: &'static str, hash_b64: &'static str) -> Self {
        Self { body, hash_b64 }
    }

    pub fn render(&self) -> impl IntoHtml {
        script!(r#type = "application/ld+json", PreEscaped(self.body))
    }

    pub fn hash_b64(&self) -> &'static str {
        self.hash_b64
    }
}

/// Declare a `pub static` speculation-rules block. JSON body is
/// `include_str!`'d from `$path`, no hashing involved (see the type docs).
#[macro_export]
macro_rules! inline_speculation_rules {
    ($name:ident, $path:literal) => {
        pub static $name: $crate::service::csp::InlineSpeculationRules =
            $crate::service::csp::InlineSpeculationRules::new(include_str!($path));
    };
}

/// Declare an inline JSON-LD block (`<script type="application/ld+json">`).
/// Body is `include_str!`'d from a `.jsonld` file, hash auto-generated by
/// `build.rs`. See [`crate::inline_style!`] for the general shape.
#[macro_export]
macro_rules! inline_ld_json {
    ($name:ident, $path:literal, $hash_const:ident) => {
        pub static $name: $crate::service::csp::InlineLdJson =
            $crate::service::csp::InlineLdJson::new(
                include_str!($path),
                $crate::service::csp::generated::$hash_const,
            );
    };
}

// Always-on inline: the theme-flash prevention script lives on every
// page (emitted unconditionally by `layout::page()`), so its hash is
// always in every page's `script-src`.
inline_script!(
    THEME_INIT,
    "assets/theme-init.js",
    ASSETS_THEME_INIT_JS_HASH_B64
);

// Always-on inline: the importmap mapping `@homework` to `/homework.js?v=…`.
pub static IMPORTMAP: InlineImportmap =
    InlineImportmap::new(generated::IMPORTMAP_BODY, generated::IMPORTMAP_HASH_B64);

// Always-on inline: site-wide schema.org `WebSite` + `EducationalOrganization`
// JSON-LD. Renders on every page; its hash is always in every page's
// `script-src`. Per-exercise `LearningResource` blocks (which include the
// `BreadcrumbList` for that exercise) are declared next to each handler.
inline_ld_json!(
    SITE_LD_JSON,
    "assets/site.jsonld",
    ASSETS_SITE_JSONLD_HASH_B64
);
