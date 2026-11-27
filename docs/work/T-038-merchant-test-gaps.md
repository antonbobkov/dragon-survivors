# T-038: Close the merchant test gaps found in review

**Source:** [T-030 review](../../reports/reviews/2026-11-26-T-030-review.md), finding 4 · **Model:** Sonnet · **Depends on:** T-031, T-032 merged (they touch `game.js`, `app.js`, targeting)

Tests only (new file `test/merchant-review.test.mjs`, and fix the assertion at `test/merchant.test.mjs:389` to check the second game), so each mutation fails at least one test; restore from a backup copy, never commit a mutation.

| Rule (§14.2, §14.3, §16, §19) | Mutation that must fail |
|---|---|
| A chest collected while offers are open queues a level-up; it does not reroll the open offers | `if (idle) openOffers` → `openOffers` (two chests on one tick) |
| The shop never opens unless the phase is 'play' | drop the `phase !== 'play'` guard (tower falls on the trade-completing tick) |
| A projectile hits the nearest of enemies and merchants (ties to the lower id) | skip the merchant when an enemy overlaps; flip the id tie |
| Claw cones hit the merchant without using a target slot | cones never hit him; he takes a target slot |
| Each hit restarts his 3 s flee | restart only when not fleeing |
| He despawns at 1400 px from the **tower** | measure from the dragon |
| The shop UI is used only when no level-up offers are open | drop `offers.length === 0` from `shopOpen` |
| Keys 1/2/3 do not buy on the cards page | drop `shop.page !== 'cards'` |
| Debug commands are not applied while the shop is open | move `stepDebug` above the shop freeze |

Done means `npm run gate` green; commit body lists each mutation and its catching test; `Closes: T-038`.
