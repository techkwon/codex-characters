# Codex Characters

Codex-compatible animated pet assets for HighLearning characters.

## Characters

### Airo

Magic cat mascot based on the large blue-hat character from the source reference.

- Package: `highlearning/airo`
- Runtime files: `pet.json`, `spritesheet.webp`
- QA files: `qa/contact-sheet.png`, `qa/review.json`

### Haro

Small green-eared companion mascot based on the left-side character from the source reference.

- Package: `highlearning/haro`
- Runtime files: `pet.json`, `spritesheet.webp`
- QA files: `qa/contact-sheet.png`, `qa/review.json`

## Validation

Both pets were generated through the `hatch-pet` workflow and passed deterministic validation:

- Atlas size: `1536x1872`
- Cell size: `192x208`
- Format: transparent-capable `RGBA` WebP
- `qa/review.json`: no errors or warnings

`Haro` uses magenta chroma-key generation because green chroma-key conflicts with the character's green ears and hands.

