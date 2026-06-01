// Copyright (C) 2024-2026 Plabayo
// See LICENSE in the repository root for details.
// Source-available; non-commercial use only.

// Apply the stored theme override before first paint so dark-mode users
// don't see the light palette flash through. Runs as a classic synchronous
// inline <script> for the same reason — a deferred module would render
// after layout. Whitelisted in CSP via its SHA-256 hash (see csp.rs).
(() => {
    const t = localStorage.getItem("homework:theme");
    if (t) document.documentElement.style.colorScheme = t;
})();
