# T-035: Close the horse and stage test gaps found in review

**Source:** [T-024 review](../../reports/reviews/2026-11-26-T-024-review.md), finding 4 · **Model:** Sonnet · **Depends on:** T-025 merged (it edits `enemies.js`)

## What

Tests only (new file `test/horses-review.test.mjs`), so each mutation fails at least one test. Apply each locally, run the suite, restore from a backup copy (not `git checkout`), never commit a mutation.

| Rule (spec §2.1, §4.1, §8.8, §17) | Mutation that must fail |
|---|---|
| Stampedes come after the budget spawns in step 4 | call `stepStampede` before the budget loop |
| A stampede horse's `flip` is `u.x < 0` (run direction) | delete `h.flip = ux < 0` (use a near-vertical line) |
| Horse i sits at the documented side of the line | reverse the perpendicular offset |
| Horses take part in separation | exclude horses from separation |
| `spawner.spawned` counts budget spawns only | count stampede horses too |
| The stage banner shows only in 'play' | hide it only in 'dying' (check 'over') |
| A horse's walk anim advances | skip `advanceAnim` for horses |

## Must not

Change behaviour (a spec violation found → minimal fix, under `Expectations changed`). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-035`.
