# Contributing

Contributions are very welcome. Before you dive in, please read this page in
full — especially the intellectual property section.

## How to contribute

1. [File an issue](https://github.com/plabayo/homework/issues/new).
   The issue will be used to discuss the bug or feature and should be created
   before opening a pull request.
   > It is best to even wait on actually developing it so we are all aligned
   > on what you are trying to contribute, to avoid having to reject your hard
   > work and code.

2. Fork the repository, make your changes on a feature branch, and open a PR
   that references the issue.

3. A maintainer will review the PR. Small fixes can land quickly; larger
   changes may need a few rounds of discussion.

## Intellectual property & contributor agreement

**By submitting any contribution to this project — code, documentation,
tests, translations, design, or anything else — you agree to the following:**

1. **Your contribution is assigned to Plabayo.** All intellectual property
   rights in your contribution transfer irrevocably and exclusively to
   Plabayo upon submission. Plabayo may use, modify, sublicense, or otherwise
   exploit contributions under any terms it chooses, including commercially.

2. **You have the right to make this assignment.** You confirm that you own
   the rights to what you submit and that it does not infringe any
   third-party rights, employer agreements, or other obligations.

3. **No compensation is implied.** Contributions are voluntary donations of
   work. Plabayo does not owe contributors payment, royalties, or any other
   form of compensation.

4. **Credit is always given.** Plabayo recognises every contribution through
   the project's public git history. We value the effort behind each one,
   large or small.

We ask for this assignment because the project is source-available and
Plabayo holds the commercial rights (see [LICENSE](./LICENSE)). Plabayo
must hold full rights to all code in the repository to be able to operate
under that model. This is standard practice for source-available projects and
is not unusual — many well-known open-source foundations use a similar CLA.

## Licence

This project is source-available under the
[Plabayo Source-Available Non-Commercial License](./LICENSE).

In short: the source code is open for anyone to read and use
non-commercially, but commercial use is reserved for Plabayo. By
contributing, your work falls under this license and the IP assignment
above. The source code will always remain openly readable.

If you have questions about any of this before contributing, feel free to
reach out at [hello@plabayo.tech](mailto:hello@plabayo.tech).

## Developer notes

### Web platform guidelines (CSS & vanilla JS)

This project is built with **vanilla CSS and vanilla JavaScript** — no React,
no styled-components, no JS framework. Before adding or improving an exercise,
page, or any frontend code, read and follow
**[guidelines/css_and_some_js.md](./guidelines/css_and_some_js.md)**.

It collects the mental models, rules, and gotchas that make the web platform
pleasant to work with: selectors and the cascade, the box model, positioning,
Flexbox and Grid, responsive design, typography, colour and visual styling,
motion, scroll, and accessibility. Lean on it when deciding how a feature
should be built.

The document is **living**. When you encounter a useful pattern, a non-obvious
gotcha, or a technique worth remembering while working on the repo,
contributions back to the guidelines are very welcome — the goal is to keep
making the best of the web platform in its beautiful vanilla form.

### Adding a new exercise

Each exercise is a trio of files: a Rust handler, a CSS file, and a JS file.
When you add one, there are **three places** that must all be updated together —
the project will compile and run if any of them is missing, but the behaviour
will be wrong (broken routing, missing offline support, or invisible exercise):

1. **`src/service/exercises/<name>.rs`** — Rust handler + `ExerciseInfo` const.
   Follow the pattern of an existing exercise (e.g. `mathbox.rs`).

2. **`src/service/mod.rs`** — register the route in `load_https_app_service()`.
   ```rust
   .with_get("/level/name", exercises::name::handler)
   ```

3. **`src/service/assets/service-worker.js`** — add the path to `PRECACHE`
   so the page works offline.
   ```js
   "/level/name",
   ```

4. **`src/service/exercises/mod.rs`** — add an `ExerciseInfo` entry to the
   `ALL_EXERCISES` static so the exercise appears in the home-page catalogue.
   If the new exercise belongs to a level that does not yet exist, also add
   that level value to `EXERCISE_LEVELS` and add a matching arm to
   `niveau_label()`.

### Testing

When you add or modify an exercise, include tests alongside the code:

- **End-to-end tests** (`tests/e2e/`) — always add at least one happy-path
  e2e test that drives a real browser through the configure → answer → result
  flow. Look at an existing exercise test (e.g. `fractions.rs`) for the
  pattern.

- **JS unit tests** (`tests/js/`) — add these when the exercise JavaScript
  contains non-trivial logic (score calculation, deck building, answer
  normalisation, etc.). The harness in `tests/js/harness.mjs` shows how to
  import and test individual functions without a browser.

### Local development

```bash
just run          # dev server on http://localhost:8080
just watch-run    # auto-reload on file change (requires cargo-watch)
just qa           # fmt + clippy + doc + unit tests
just qa-full      # qa + browser e2e tests (requires chromedriver)
```

**`just qa-full` must pass before you open a PR.** CI runs the same suite; a
failure blocks the merge and prevents deployment. If you cannot run
`chromedriver` locally, run `just qa` at minimum and note the gap in your PR
description so a maintainer can verify the e2e tests.
