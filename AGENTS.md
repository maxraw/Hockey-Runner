# AGENTS.md

## Project overview
- This repository contains a hockey shot tracking application.
- The product detects a puck, records a shot attempt, and estimates shot speed.
- Main concerns: mobile flow, timing window, computer vision reliability, and stable speed estimation.

## Working rules
- Always identify the relevant files before making changes.
- For non-trivial work, explain the plan briefly before editing.
- Prefer minimal, reversible changes over broad refactors.
- Do not claim a bug is fixed until validation is described.

## Validation
- For mobile changes, verify start, pause, resume, and early stop.
- For AI/CV changes, verify noisy input, missed detections, and unrealistic outliers.
- For UI work, verify layout on narrow mobile screens first.

## Architecture
- Keep business logic out of UI components.
- Keep timing values configurable, not duplicated across files.
- Final shot metrics must be derived from validated data, not from a single noisy frame.

## UI/UX rules
- Prefer simple screens and large touch targets.
- Keep critical actions obvious and reduce ambiguous states.
- Explain camera/calibration steps in plain language.
