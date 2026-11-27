# T-037: Close the slime test gaps found in review

**Source:** [T-025 review](../../../reports/reviews/2026-11-26-T-025-review.md), finding 4 · **Model:** Sonnet · **Depends on:** —

Tests only (new file `test/slimes-review.test.mjs`), so each mutation fails at least one test; restore from a backup copy, never commit a mutation.

| Rule (§2.1, §8.9) | Mutation that must fail |
|---|---|
| A fused megaslime faces the tower (`flip` true when the tower is to its left) | `>` instead of `<`, or delete the line (fuse to one side of the tower) |
| The densest core's ties go to the lower id | `a.id > core.id` (two equally dense clusters) |
| Fusion runs after the despawn pass | fuse before despawn (a slime past `DESPAWN_DIST` while a fusion is due must be despawned, not fused) |

Done means `npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-037`.
