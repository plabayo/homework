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

The code lives under `src/service/`: a small Rama router with a shared
page layout, a per-page chrome (`assets/theme.css`, `assets/homework.js`,
`assets/service-worker.js`), and one folder per exercise. Exercise files
come in trios — a Rust handler (route + setup form), a CSS sibling, and a
JS sibling — and the shared `homework.js` framework drives the
configure → play → review → finish loop, IndexedDB history, mistake
mode, and offline support.

---

## How an exercise is built

Each exercise is a small trio:

1. A **Rust handler** that registers an `ExerciseInfo`, builds the setup
   form, and serves the page.
2. A **CSS file** scoped to the exercise.
3. A **JS file** that calls `runExercise({...})` from the shared client
   framework — providing the deck builder, the per-question renderer,
   and the answer checker. The framework handles configure / play /
   review / result, persistence, history, mistake-mode, and the offline
   indicator.

The Rust file embeds its sibling `.css` and `.js` via `include_str!`, so
the binary stays self-contained while your editor gives you proper
syntax highlighting per file. See `CONTRIBUTING.md` for the full
checklist of files to touch when adding a new exercise.

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

# quick local QA — formatting, sorting, lint, doc, unit tests
just qa

# full local QA including the browser smoke tests
just qa-full

# only the browser smoke tests (Chrome/Chromium required)
just test-e2e
```

The browser smoke tests auto-download a compatible WebDriver when Chrome
or Chromium is installed; set `CHROME_BIN` (or `CHROMEDRIVER`) if you
need to point at a non-default install.

The dev server runs plain HTTP by default. Pass `--https <addr>` (with
the cert-issuer env vars wired up) to enable TLS locally.

### Other useful tasks

Run `just --list` to see everything (lint, clippy, doc, docker build,
deploy, dependency updates, …).

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

- **Server**: [Rama](https://ramaproxy.org). One router, a small set of
  middleware (HSTS, CSP, tracing, header normalisation, request-body
  size limit). Same-origin only — no permissive CORS. Pages are built
  with Rama's type-safe HTML macros.
- **Client**: vanilla ES modules. No bundler, no framework, no
  client-side runtime. A single shared `homework.js` drives the
  configure / play / review / result loop.
- **Browser baseline**: roughly Chrome / Edge / Safari / Firefox /
  iOS Safari from 2024-onwards. Uses modern CSS (`light-dark()`,
  `color-mix()`), `<dialog>`, and IndexedDB without polyfills. Older
  browsers degrade gracefully (e.g. the leave-guard prompt falls back
  to `window.confirm`).
- **Storage**: `localStorage` for per-exercise config; `IndexedDB` for
  the practice history. Nothing leaves the device.
- **Offline**: a service worker precaches the app shell on install,
  serves static assets stale-while-revalidate, and serves HTML
  network-first with a short timeout — falling back to the last cached
  copy and ultimately to `/offline`. Build-versioned asset URLs ensure a
  new deployment pulls fresh JS/CSS when online while keeping old builds
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

This project is **source-available** under the
[Plabayo Source-Available Non-Commercial License](./LICENSE).

**In plain terms:**

- The source code is open — you are free to read, study, and learn from it.
- Personal, educational, and other non-commercial use is permitted.
- Forking and redistribution are allowed for non-commercial purposes,
  provided full credit is given to Plabayo and a link back to this
  repository is included.
- **Commercial use of any kind requires explicit written permission from
  Plabayo.** Plabayo retains the exclusive right to use this project
  commercially.
- All contributions to this project are donated to Plabayo and become
  Plabayo's intellectual property (see [CONTRIBUTING.md](./CONTRIBUTING.md)).

We believe in transparency and keep the code open so that teachers, parents,
and the community can always inspect what runs in their browser. Commercial
exclusivity is what lets Plabayo continue to build and maintain it.

For commercial licensing enquiries, contact
[hello@plabayo.tech](mailto:hello@plabayo.tech).

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
