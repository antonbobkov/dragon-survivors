# T-034: Close the claw test gaps found in review

**Source:** [T-022 review](../../reports/reviews/2026-11-26-T-022-review.md), finding 4 · **Model:** Sonnet · **Depends on:** T-023 merged (it extends `src/sim/claws.js`)

## What

Tests only (new file `test/claws-review.test.mjs`), so that each of these mutations makes at least one test fail. Apply each locally, run the suite, restore from a backup copy (not `git checkout`), never commit a mutation.

| Rule | Mutation that must fail |
|---|---|
| A slash's side is fixed at the volley | re-read the side from the facing at strike time (turn the dragon **left** between queue and strike) |
| A slash strikes from the dragon's centre at strike time | strike from where the dragon stood when queued (move the dragon so the target is inside only from the new position) |
| Dead enemies are skipped by rectangles and by the cone (and do not use up a cone target) | remove either `e.hp > 0` filter |
| Force scales the left claw's knock | rectangle knock without Force |
| The other side's Amount repeats come at 15, 21… ticks | collapse them all to 9 |
| Slashes strike in step 8 after the ring | move `collideSlashes` before the ring, or before projectiles |
| Slash delays hold while offers are open; pending slashes never strike while dying | count delays down with offers open; strike while dying |
| An evolution evolves required weapons owned at any level (debug grant) | require the top level |
| An evolve card is not offered when the result is already owned | remove that check |

## Must not

Change behaviour (a spec violation found → minimal fix, listed under `Expectations changed`). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-034`.
