# T-010: Close the roster test gaps found in review

**Source:** [T-004 review](../../reports/reviews/2026-11-06-T-004-review.md), finding 4 · **Model:** Sonnet · **Depends on:** T-005 merged (it edits the same modules)

## Why

Eight mutations of the roster code left the whole suite green. Each is a spec rule nobody holds.

## What

Add tests (in `test/roster.test.mjs` or a new `test/roster-review.test.mjs`) so that **each** mutation below makes at least one test fail. Apply each locally, run the suite, revert. Never commit a mutation.

| Rule (spec §8.4 / §8.2) | Mutation that must fail |
|---|---|
| A ghost's own death never raises another ghost | make the burn→ghost check in `effects.js` also accept `ghost.die` |
| The golem counts toward the cap | subtract 1 from the spawner's live count once the golem exists |
| Summoning skeletons damage the tower | skip enemies playing `skelly.summon` in tower contact |
| A casting mage can be hit | skip enemies playing `mage.spell` in projectile collision |
| Casting mages and summoning skeletons take part in separation | skip `mage.spell` (and, separately, `skelly.summon`) in separation |
| Golem knockback from a hit exactly at its centre goes (0, 1) | change the fallback to (0, −1) |
| A mage casts at exactly 80 px from the tower (the skip is strictly `< 80`) | change `<` to `<=` |

## Must not

Change sim behaviour (tests only; if a test exposes a spec violation, fix it and say so under `Expectations changed`). Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; the commit body lists each mutation and the test that now catches it; `Closes: T-010`.
