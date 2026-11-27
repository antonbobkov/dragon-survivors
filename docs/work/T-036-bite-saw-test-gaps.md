# T-036: Close the bite and saw test gaps found in review

**Source:** [T-023 review](../../reports/reviews/2026-11-26-T-023-review.md), finding 4 · **Model:** Sonnet · **Depends on:** — (run together with T-034)

## What

Tests only (new file `test/bite-saw-review.test.mjs`), so each mutation fails at least one test. Apply each locally, run the suite, restore from a backup copy, never commit a mutation.

| Rule | Mutation that must fail |
|---|---|
| A saw hit knocks away from the blade's position | use the tower or the dragon as the knock source (put the enemy beside the blade's path, not on the tower–dragon axis) |
| A bite breaks braziers only when it bites | break braziers with no enemy in reach |
| The bite's brazier reach is scaled by Area | use the unscaled reach (Area L3, brazier between the two radii) |
| Step 8 hits in order: claw slashes, then the bite, then the blades | move the bite before the claws; move blades before the bite (a kill by the earlier hitter changes the later one's target) |
| Expired saw rehit entries are dropped | never drop them (check the map after the rehit time) |
| The golem's `maxHp` equals its stored HP (finite) | set `maxHp` before the golem's HP sentinel |

## Must not

Change behaviour (a spec violation found → minimal fix, under `Expectations changed`). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-036`.
