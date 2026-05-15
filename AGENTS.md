# Notes for AI agents

Start by reading **[README.md](./README.md)** and **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
They describe what the project is, how it is structured, and the rules for
adding or changing things. Follow them.

Beyond that: read the existing code before writing new code. The project has a
clear, consistent style — in Rust, in JavaScript, and in tests. Match it.

## Web platform guidelines (CSS & vanilla JS)

When creating or improving an exercise, page, or any frontend code, follow the
mental models, rules, and patterns documented in
**[guidelines/css_and_some_js.md](./guidelines/css_and_some_js.md)**. This
project is **vanilla CSS + vanilla JS** — no React, no styled-components, no
JS framework. The guidelines document captures how to make the best of the web
platform in that vanilla form, including layout (Flexbox/Grid), responsive
design, typography, motion, and accessibility.

The document is a **living reference**. When you discover a useful pattern,
gotcha, or technique while working on this repo, contributions back to it are
welcome and encouraged.

## Before every commit

Run `just qa-full` and make sure it passes completely. This is what CI runs;
if it fails locally it will fail in CI and block deployment. Do not commit code
that does not pass `just qa-full`.
