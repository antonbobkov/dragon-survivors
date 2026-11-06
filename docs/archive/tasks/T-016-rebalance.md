# T-016: Rebalance after play-test 1, including late-game pressure

**Source:** [owner play-test 1](../../../reports/feedback/2026-11-06-owner-playtest-1.md); [full-run balance](../../../reports/measurements/2026-11-06-full-run-balance.md); decision D-4 in [decisions.md](../../decisions.md) · **Model:** Opus · **Depends on:** T-013, T-014, T-015

## Why

The owner's feedback halved enemy speeds, cut the dragon to a third, shrank the tether, took away free explosions and free pierce, and added mage orbs that hurt the tower. Every earlier measurement is stale. The late game was already too forgiving (full builds get Repair-only offers).

## What

1. **Measure first** with `tools/measure.mjs` (update its bots: the dragon is slower, gem range may need rethinking; mage orbs exist, so `kite` should dodge them if cheap to do, else note it). Baseline table, named causes.
2. **Do not change the owner's numbers:** enemy speeds, `DRAGON_SPEED`, `TETHER_LENGTH`, and the rule changes of T-013–T-015. Tune timeline rates and weights, enemy HP and contact DPS, the XP curve, tower HP, and the T-013/T-015 *unmeasured* numbers (follow speed, rest distance, orb damage/interval/speed).
3. **D-4, late game:** decide and implement (recommended: no Repair offer while tower HP ≥ 50% once the build is full, and a steeper `xpToNext` past level 20); measure it; fold the answer into the spec and delete the D-4 row.
4. **Targets** as in T-006 (`idle`+naive 25–90 s; `aim`+greedy median 3:00; `kite`+greedy reaches 5:00 in at least half the seeds; every tower falls by 7:00), pooled over at least 16 seeds. If the slower world makes a target meaningless, say why and propose a replacement in the report.
5. **Report** `reports/measurements/2026-11-06-playtest1-rebalance.md` (frozen): baseline, each change old → new with a reason, after table, what to look for in play.

## Must not

Edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; spec and content agree; report written; commit `T-016: …` with `Closes: T-016`.

## What T-013, T-014 and T-015 left you

- **The measure bots are stale (T-013 finding):** `aim` holds 60 px above the tower and `kite` circles at 120 px (outside the new 105 px tether). With a following tower both targets move: the tower moved on 95–97% of ticks and the aim pair drifted ~2400 px up the map; bots that keep moving outrun the 75 px/s golem, so 3–8 of 16 runs reach the 420 s cap with thousands of kills. Redesign the bots for the new tether (for example: `aim` stands still and lets the tower come to rest; `kite` circles at ~80 px, inside the tether) before trusting any number.
- **T-014 measurement:** without built-in laser pierce, greedy builds lost ~90 s of median survival (unconfirmed cause; probe it).
- **Visual (T-013):** at the 40 px rest distance the 2× dragon overlaps the top of the castle; the carriers show almost all the time because the tower almost always moves. `TOWER_REST_DIST` and `TOWER_FOLLOW_SPEED` are *unmeasured* and yours to tune for feel as well as numbers (≥ 50 px removes the overlap).
- **Golem (D-5 still open):** 75 px/s catches a following tower (60) but not a dragged one (87). Report how often the bots escape it; do not add a golem rule unless a target needs it, and then say so.
- **Mage orbs (T-015):** greedy bots that used to coast to the golem now fall around 2:45 (aim+greedy median 391.8 → 164.4 s on the stale bots). The bots never dodge, so that is the worst case: give the moving bots a cheap dodge (step perpendicular to an orb heading at the dragon within ~100 px) so the instrument measures a player who tries. `MAGE_ORB_DAMAGE` (5), `MAGE_ORB_INTERVAL` (3 s), `MAGE_ORB_SPEED` (110) and `MAGE_ORB_RANGE` (320) are *unmeasured* and yours to tune; D-6 (orb damages the tower) stays the owner's call.
