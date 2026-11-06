# T-008: Close the sim-core test gaps found in review

**Source:** [T-002 review](../../reports/reviews/2026-11-06-T-002-review.md), finding 2 · **Model:** Sonnet · **Depends on:** T-004 merged (it edits the same modules)

## Why

The review mutated the sim core and found rules that no test holds: each mutation below left the whole suite green. A rule without a test drifts silently.

## What

Add tests (in `test/sim-review.test.mjs` or next to the existing ones) so that **each** of these mutations makes at least one test fail. Prove it: apply each mutation locally, run the suite, revert. Do not commit mutations.

| Rule | Mutation that must fail | Spec |
|---|---|---|
| A projectile remembers the ids it hit and never re-hits them | delete `p.hits.push(e.id)` in `projectiles.js` (use a projectile that survives its hit, e.g. by stubbing `rollProcs` or a pierce case if T-005 has landed) | §12 |
| Nearest overlapping enemy is hit; ties go to the lower id | replace the nearest/tie-break choice with "first candidate" | §4.1 |
| Dead enemies (hp ≤ 0) are skipped by projectiles and by tower contact | remove the `hp <= 0` checks | §2.1, §7.2 |
| Tower overlap is strict (`<`) | change to `<=` | §7.2 |
| Tower HP stops at 0 | remove the floor | §7.2 |
| The hit effect spawns at the projectile's position | spawn it at the enemy | §4.1 |
| `flip` returns to false when the enemy walks right | delete that branch | §5 |
| Spawner draws the type, then the angle | add an extra rng draw before the type | §9 |
| Spawner weights use `t` at the start of the tick | use `t + DT` | §9 |

## Must not

Change sim behaviour (tests only). If a test shows the code violates the spec, fix the code in the same commit and say so under `Expectations changed`. Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; the commit body lists each mutation and the test that now catches it; `Closes: T-008`.
