# homework

A free, offline-capable web app where children practice elementary-school
exercises — multiplications, mental arithmetic, the analog clock, the
digital clock, the thermometer, and more.

> Live at <https://elementary.training>. No account, no tracking, no ads.

The app works on **phone, tablet, and desktop** (mobile-first), runs
**fully offline** once cached (PWA + service worker), and stores all
practice history **only on the child's device** (IndexedDB), never on
the server.

It is intentionally small and pragmatic: every exercise is a tiny page
that plugs into a shared client-side framework, so adding a new exercise
is a matter of writing one Rust file plus its sibling `.css` / `.js`.

---

## Philosophy

This is a teaching aid, not a teacher.

- **You sit next to your child.** The tool is meant to be used with a
  parent or teacher present, the same way you'd use pen and paper. It
  doesn't gamify, doesn't reward streaks, doesn't push notifications.
  Mistakes are just feedback: a panda emoji says _"probeer het nog eens"_.
- **Privacy by construction.** All practice history lives in the child's
  browser. The server holds no database, no analytics, no per-user data.
  Wiping the browser data wipes everything.
- **Mobile-first, then upgrade.** The base layout is built for the
  smallest device and progressively enhanced via `min-width` media
  queries — never the other way around. Tap targets are large, contrast
  passes WCAG AA / AAA, and the whole UI works without a mouse.
- **Server-rendered HTML, sprinkled with JS.** The page chrome is
  rendered by Rama's `html!` macro on the server; the play loop, history
  and offline support are a small JavaScript framework. There is no
  build step, no bundler, no framework runtime in the browser.
- **Offline by default.** A service worker pre-caches the shell and
  uses a network-first-with-timeout strategy for HTML so the child can
  keep practicing even when the connection drops.
- **Dutch (NL-BE) only, for now.** The exercises follow the Flemish
  primary-school curriculum. Localisation is on the roadmap but not a
  near-term goal — better one good language than five mediocre ones.

We are not trying to be exhaustive. New exercises are added when there
is a real didactic need, not because the framework can support them.

---

## Exercises today

**Niveau 1️⃣**

- **rekendoos** — som / verschil / splitsen / vermenigvuldigen / delen
- **maaltafels** — pick which tables (1–10), drill them
- **thermometer** — read the temperature or colour the bar in;
  optional negative range with a blue liquid below 0 °C

**Niveau 2️⃣**

- **analoge klok** — read the clock or set the hands; supports
  multiple-choice or free-input answers, and a special _"set the clock
  from a Dutch phrase"_ mode (`kwart voor vier`)
- **digitale klok** — translate between digital times and Dutch time
  expressions (`half drie`, `kwart over vijf`, …); multiple-choice in
  one direction, fill-in on a big LED clock face in the other

**Extra ✨**

- **flitskaarten** — make your own one-sided or two-sided decks, with
  optional bidirectional practice, hints, multi-part answers, and
  share/import links

Per-exercise, parents can review past sessions, see which questions
were skipped or needed multiple attempts, and click _"oefen recente
fouten"_ to drill exactly those again.

---

## Project layout

```
src/
  main.rs                      — CLI + HTTP/HTTPS bootstrap (Rama)
  service/
    mod.rs                     — router, middleware
    layout.rs                  — page() shell helper (head, body chrome)
    assets.rs                  — embeds + serves theme.css, homework.js, sw.js, manifest, favicon
    assets/
      theme.css                — global design tokens, layout, components
      homework.js              — runExercise framework, IndexedDB, service-worker reg, offline UI
      service-worker.js        — offline-first caching strategy
      manifest.webmanifest     — PWA manifest
      favicon.svg
    pages/
      home.rs                  — exercise catalogue grouped by Niveau
      offline.rs               — fallback page when offline + uncached
    exercises/
      mod.rs                   — ExerciseInfo registry, exercise_scaffold(), niveau_label()
      multiplications.rs/.css/.js
      mathbox.rs/.css/.js
      thermometer.rs/.css/.js
      clock.rs/.css/.js
      digital_clock.rs/.css/.js
      flashcards.rs/.css/.js
```

Every exercise file is small (~100 LOC of Rust for handler + form,
plus a `.css` and a `.js` sibling that drive the play loop). The shared
runner in `homework.js` handles configure → play → review → finish, the
mistake-history database, and the offline service worker.

---

## How an exercise is built

1. **Define a Rust handler** (`src/service/exercises/foo.rs`):
   - one `ExerciseInfo` const (id, path, label, icon, level)
   - one `pub async fn handler() -> impl IntoResponse` that calls
     `page(meta, STYLE, body, SCRIPT)`
   - a `config_fields()` returning `impl IntoHtml` with the form fields
     specific to this exercise

2. **Write its CSS** (`foo.css`) — minimal, scoped to the exercise.

3. **Write its JS** (`foo.js`) — calls `runExercise({ id, label,
   buildDeck, renderQuestion, isCorrect, ... })` from `/homework.js`.
   The framework handles everything else: form submit, persistence,
   history, mistake-mode, result page, offline indicator.

4. **Register the route** in `src/service/mod.rs` and add an entry to
   `all_exercises()` in `src/service/exercises/mod.rs`.

The Rust file then includes its sibling files via `include_str!`, which
keeps the binary self-contained while letting your editor give you
proper CSS/JS syntax highlighting and tooling:

```rust
const STYLE: &str = include_str!("foo.css");
const SCRIPT: &str = include_str!("foo.js");
```

---

## Running locally

Requirements:
- **Rust 1.93+** (the project uses edition 2024).
- **[just](https://just.systems/)** is the task runner. Without it,
  read `justfile` and run the underlying `cargo` commands directly.

```bash
# run on http://127.0.0.1:8080
just run

# auto-reload on file changes (requires `cargo install cargo-watch`)
just watch-run

# run the fast local QA path: fmt, sort, check, clippy, doc, test
just qa

# run the full local QA path, including ignored browser smoke tests
just qa-full

# run only the ignored browser smoke suite (requires Chrome/Chromium)
just test-e2e
```

The browser smoke tests use `thirtyfour`'s managed driver mode. With Chrome or
Chromium installed, the crate auto-downloads a compatible driver on demand.
If the browser is not in the default location for your OS, set
`CHROME_BIN=/path/to/chrome`. `CHROMEDRIVER=/path/to/chromedriver` remains
supported as an override for offline or pinned-driver environments.

The dev server has no HTTPS by default. To run with TLS locally pass
`--https <addr>` (it expects a `CertIssuer` configured via env
variables — see `src/main.rs`).

### Other useful tasks

```bash
just lint            # fmt + cargo-sort
just clippy          # cargo clippy --all-targets --all-features
just doc             # cargo doc
just docker          # build + run the production Dockerfile
just deploy          # fly.io deploy (production)
just update-deps     # cargo upgrades + cargo update
```

### Adding or editing an exercise

The fastest dev loop:

```bash
just watch-run
```

Then edit any `.rs`, `.css`, or `.js` file under
`src/service/exercises/` — the binary rebuilds automatically because
the static assets are inlined via `include_str!`. Hard-refresh the
browser tab (Shift+Reload) to bypass the service worker cache.

---

## Architecture notes

- **Server**: [Rama](https://ramaproxy.org). One `Router`, a few
  middleware layers (CORS, HSTS, tracing, header normalization).
  Pages are built with Rama's type-safe `html!` macro.
- **Static assets**: `Css(&'static str)` and `Script(&'static str)`
  response wrappers from Rama auto-set the right `Content-Type`.
- **Client**: vanilla ES modules. No bundler, no framework. The shared
  client framework is a single `homework.js` file (≈ 1,350 lines).
- **Storage**: `localStorage` for the per-exercise config, `IndexedDB`
  (object store `sessions`, indexed by `exerciseId`) for the practice
  history. Nothing leaves the device.
- **Offline**: a service worker precaches the app shell on install,
  serves static assets stale-while-revalidate, and serves HTML with
  network-first + 2.5 s timeout, falling back to the last cached copy
  and ultimately to `/offline`. Build-versioned asset URLs ensure a new
  deployment pulls fresh JS/CSS when online while keeping old builds
  available offline.
- **Accessibility / theming**: design tokens in `theme.css`, dark mode
  via `prefers-color-scheme`, contrast verified ≥ AA in both schemes.
  Number-only inputs are filtered live so the browser's pattern
  popup never fires.

---

## Contributing

Bug reports, ideas, and patches are welcome.

- **First**, please [open an issue](https://github.com/plabayo/homework/issues/new)
  describing the bug or the feature you'd like to add. We'll discuss it
  there before you sink time into a pull request — easier for everyone
  than rejecting work that's already done. See [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Code of conduct**: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- **Security issues**: [SECURITY.md](./SECURITY.md). The site runs as
  a static-shell PWA with no server-side state, so the attack surface
  is small, but if you spot anything please tell us privately first.
- **Have an idea but not the time / skill to PR it?** That's totally
  fine — open an issue or send an email; we love feature suggestions
  from teachers, parents, and kids.

### Get in touch

- **Email**: [hello@plabayo.tech](mailto:hello@plabayo.tech) — for
  feedback, suggestions, didactic input, partnerships, or just to
  say hi.
- **GitHub**: <https://github.com/plabayo/homework>

---

## Licence

This project is dual-licensed under MIT or Apache-2.0, at your option —
see [LICENSE](./LICENSE).

---

## Premium sponsors

- **[rama](https://ramaproxy.org)** — 🦙 Rama (ラマ) is a modular service
  framework for the 🦀 Rust language to move and transform your network
  packets. This site is built with rama and maintained by
  [Plabayo](https://plabayo.tech).
- **[fly.io](https://fly.io)** — sponsors the hosting of the production
  service as a globally accessible cloud app.

We are grateful to both sponsors for the cloud resources and the time
we get to spend on this project.

If you'd like to support the project financially yourself, you can buy
us [a coffee ☕](https://www.buymeacoffee.com/plabayo) or sponsor us
on [GitHub Sponsors 😻](https://github.com/sponsors/plabayo).
