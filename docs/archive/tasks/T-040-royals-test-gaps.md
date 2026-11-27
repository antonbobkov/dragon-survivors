# T-040: Close the princess and prince test gaps found in review

**Source:** [T-031/T-032 review](../../../reports/reviews/2026-11-27-T-031-T-032-review.md), finding 4 · **Model:** Sonnet · **Depends on:** —

Tests only (new file `test/royals-review.test.mjs`), so each mutation fails at least one test; restore from a backup copy, never commit a mutation. If T-029 (rebalance) changes a number you rely on, read it from `content.js`.

| Rule (§8.4, §14.4, §14.5, §20) | Mutation that must fail |
|---|---|
| Homing gems are safe from the prince | delete `if (g.homing) continue;` (a homing gem still in flight near him on a theft tick) |
| The prince's grab radius is measured from him | measure from the dragon (place gems so the two readings differ) |
| Enemies touch the princess at her own radius | use the tower's radius (an enemy in the 16 px gap) |
| Only live enemies hurt her | drop the `e.hp <= 0` skip (an enemy killed earlier in step 8) |
| The prince is never busy (walks on theft ticks) | return busy after a theft |
| The prince's walk anim loops | skip his anim advance |
| He is always added, even at the cap | refuse him at `MAX_ENEMIES` |
| A mage's no-cast distance and summon ring stay tower-based while it is lured | aim either at the princess |

Done means `npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-040`.
