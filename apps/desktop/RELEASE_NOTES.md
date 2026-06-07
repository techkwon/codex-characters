# HighLearning Pet Reminder 0.1.0

Release date: 2026-06-07

## Changes

- Make support diagnostics privacy-safe (a86c3c5)
- Protect local pet data with portable backups (1043191)
- Point Windows bundling at the committed icon (4443694)
- Fix desktop CI build prerequisites (9632f75)
- Add cross-platform desktop build pipeline (b9dd4df)
- Make routine reminders actually repeat (b50c29f)
- Prove lightweight release readiness (0fa97f9)
- Make first-run distribution feel branded (9c51139)
- Make pet interactions product-ready (82d06f9)
- Make Calico and Max the desktop defaults (c84fd80)
- Make HighLearning reminders usable without Codex (a2362dc)
- Document HighLearning pet usage in Korean (b7d173a)
- Publish HighLearning Codex pets (f34e64e)

## Verification

- npm run typecheck
- npm run build:ui
- cargo check
- npm run build
- npm run package:portable:mac
- GitHub Actions Desktop Build macOS arm64 / Windows x64

## Distribution

- macOS: app, dmg, portable zip
- Windows: msi, nsis, portable zip
