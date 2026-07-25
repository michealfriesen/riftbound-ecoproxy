# Copilot Coding Agent Instructions

## Validation in CI agent runs

- Do not use browser automation or screenshot-based checks (for example Playwright navigation/snapshots, or Chromium `--screenshot`) in this repository's Copilot Actions runs.
- Do not open temporary binary artifacts from `/tmp` with `view`.
- Validate changes with text-based checks only (for example focused file inspection and existing CLI checks such as `node --check` for changed JavaScript files).
