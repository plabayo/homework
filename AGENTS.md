# Notes for AI agents

Start by reading **[README.md](./README.md)** and **[CONTRIBUTING.md](./CONTRIBUTING.md)**.
They describe what the project is, how it is structured, and the rules for
adding or changing things. Follow them.

Beyond that: read the existing code before writing new code. The project has a
clear, consistent style — in Rust, in JavaScript, and in tests. Match it.

## Before every commit

Run `just qa-full` and make sure it passes completely. This is what CI runs;
if it fails locally it will fail in CI and block deployment. Do not commit code
that does not pass `just qa-full`.
