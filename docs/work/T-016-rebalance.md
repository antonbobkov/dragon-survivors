# T-016: Rebalance after play-test 1, including late-game pressure

**Source:** [owner play-test 1](../../reports/feedback/2026-11-06-owner-playtest-1.md); [full-run balance](../../reports/measurements/2026-11-06-full-run-balance.md); decision D-4 in [decisions.md](../decisions.md) · **Model:** Opus · **Depends on:** T-013, T-014, T-015

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
