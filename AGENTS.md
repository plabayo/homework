# Notes for AI agents

Start by reading **[README.md](./README.md)** and **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
They describe what the project is, how it is structured, and the rules for
adding or changing things. Follow them.

Beyond that: read the existing code before writing new code. The project has a
clear, consistent style — in Rust, in JavaScript, and in tests. Match it.

## Web platform guidelines (CSS & vanilla JS)

When creating or improving an exercise, page, or any frontend code, follow the
mental models, rules, and patterns documented in
**[guidelines/css_and_some_js.md](./guidelines/css_and_some_js.md)** and its
companion **[guidelines/animations.md](./guidelines/animations.md)**. This
project is **vanilla CSS + vanilla JS** — no React, no styled-components, no
JS animation library, no framework. The guidelines documents capture how to
make the best of the web platform in that vanilla form: the CSS doc covers
layout (Flexbox/Grid), responsive design, typography, scroll, and
accessibility; the animations doc covers motion craft — design tricks,
springs, View Transitions, SVG and Canvas animation, performance, and the
accessibility rules that govern all of it.

Both documents are **living references**. When you discover a useful pattern,
gotcha, or technique while working on this repo, contributions back to them
are welcome and encouraged.

## Before every commit

Run `just qa-full` and make sure it passes completely. This is what CI runs;
if it fails locally it will fail in CI and block deployment. Do not commit code
that does not pass `just qa-full`.
