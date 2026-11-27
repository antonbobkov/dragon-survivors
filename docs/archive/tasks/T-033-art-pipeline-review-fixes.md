# T-033: Art pipeline: fixes from the T-017 review

**Source:** [T-017 review](../../../reports/reviews/2026-11-26-T-017-review.md) · **Model:** Sonnet · **Depends on:** T-021 merged (it edits `tools/build-atlas.mjs` and the manifest)

## What

1. `tools/build-atlas.mjs`: a present-but-invalid `tintStrength` (null, non-number, outside `(0, 1]`) fails the build with the entry name, with or without a tint (§3.2 step 2).
2. Frame keys are unique by construction: refuse a BMP or list path containing `#` (or any character the variant suffixes use), with a clear error; add a build-time check that no two distinct (path, ops) pairs produce the same key.
3. Tests that fail on each mutation the review used: `from` own ops before base ops (use a base entry with ops); `palette.mjs` counting variants (exercise its pure function or `main` on a temp tree); junk after `key` and after a frame header.

## Must not

Change any produced atlas output (the rebuild must stay byte-identical). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green, rebuild byte-identical, commit `T-033: …` with `Closes: T-033`.
