# Rebalance after play-test 1: new bots, baseline, D-4 and tuning

Date: 2026-11-06 · Task: T-016 · Instrument: `tools/measure.mjs` · Code: main at `9fa0eb8` (the orb timer that holds out of range) plus this task · Frozen: a re-measure is a new dated report. Follows [the full-run balance report](2026-11-06-full-run-balance.md); every number there is stale.

## Summary

| Target (from T-006) | Baseline (seeds 1..16) | After (1..16) | After (101..132) | After (1..48, greedy) | Met |
|---|---|---|---|---|---|
| `idle+naive` falls between 25 s and 90 s | 38.3 s | 38.0 s | 40.9 s | | yes |
| `aim+greedy` median 3:00 | 164.3 s | 313.7 s | 312.2 s | 311.5 s | **no**, and it cannot hold together with the next row (see below) |
| `kite+greedy` reaches 5:00 in at least half the seeds | 5 / 16 | 10 / 16 | 21 / 32 | 27 / 48 | yes |
| every tower falls by 7:00 | 10 of 96 runs at the cap | 1 of 96 | 0 of 192 | 1 of 96 | **no**, 1 run: the dragon drags the tower away from the golem (D-5) |

One rule and five numbers changed: the D-4 Repair rule, `TOWER_REST_DIST`, the 3:00 spawn rate (changed twice), the golem's knockback, the XP curve and the ghost knight's HP. The owner's numbers (enemy speeds, `DRAGON_SPEED` 87, `TETHER_LENGTH` 105) and the T-013 to T-015 rules are unchanged. The orb numbers, `TOWER_FOLLOW_SPEED` and contact DPS are unchanged. Both fun features (split fireworks, gem comet tail) are untouched.

## Method

- Headless `Game` runs, one per seed, until the tower falls or the 420 s (7:00) cap. Seeds 1..16 for every step table; confirmation on seeds 101..132 (all bots) and 1..48 (greedy bots). Decisions between candidate values used seeds 1..48, plus 101..132 from the XP step on, because 16 seeds move by 2–3 runs between neighbouring values.
- **The bots were redesigned before any number was trusted** (commit `b422036`). The tower now follows the dragon, so the old bots, anchored to the tower, drifted across the map with it (the old `aim` station 60 px above the tower moved up with the tower). Every bot is now anchored to *home*, the dragon's start point:
  - `idle`: no input; stands on home, fires right, collects and dodges nothing.
  - `aim`: stands on home and lets the tower come to rest 50 px below it.
  - `kite`: walks a circle of 80 px around home, inside the tether; the tower follows on a smaller circle and moves on 85% of ticks.
  - `aim` and `kite` fly to the non-homing gem nearest the dragon while one lies within 300 px of home (half the view height, fixed before tuning; 200 px starved the bots, 400 px gave the same outcomes as 300), and **dodge mage orbs**: an orb within 100 px that will pass within its radius + 12 + 4 px of the dragon overrides everything, and the dragon steps straight away from its path.
  - Pick rules `naive` (card 0) and `greedy` (Repair below 40%, else a new weapon, the top weapon's upgrade, a buff upgrade, a new buff) are unchanged.
- The instrument now also splits the tower's HP loss by source (each enemy type's contact, orbs), names what ended each fallen run (the source with the most HP in its last 30 s), counts HP repaired and how often the tower moved. `--causes` prints the split per window; `--no-dodge` turns the dodge off. Side probes (golem traces, per-seed pairs, temporary code edits for what-ifs) were scratch scripts on the same bots and seeds; no probe code is committed.
- Default run: `node tools/measure.mjs` (six bots, 16 seeds), about 45 s on the owner's laptop.

### The stale bots, for reference

The old bots on the same code (before the redesign): `aim+greedy` 164.4 s, `kite+greedy` 169.8 s, 1–2 runs per bot at the cap. The medians happen to agree with the new baseline; the failure modes do not (drift, outrunning the golem).

## Baseline

`node tools/measure.mjs --timeline --causes --step 30` on the numbers as T-013 to T-015 left them:

| Bot | Median s | Min s | Max s | Reached 5:00 | Reached cap | Level | Fall causes | Tower moving |
|---|---|---|---|---|---|---|---|---|
| idle+naive | 38.3 | 37.1 | 46.5 | 0 | 0 | 1 | knight 16 | 0% |
| idle+greedy | 38.3 | 37.1 | 46.5 | 0 | 0 | 1 | knight 16 | 0% |
| aim+naive | 109.6 | 99.2 | ≥420 | 2 | 2 | 4.5 | slime 12, skeleton 2 | 48% |
| aim+greedy | 164.3 | 100.6 | ≥420 | 6 | 4 | 13.5 | slime 6, skeleton 4, golem 2 | 59% |
| kite+naive | 115.7 | 106.1 | ≥420 | 2 | 2 | 5 | slime 11, skeleton 2, knight 1 | 86% |
| kite+greedy | 165.4 | 108.4 | ≥420 | 5 | 2 | 13 | slime 8, golem 3, skeleton 2, orb 1 | 86% |

`kite+greedy` tower HP lost by source, mean per run:

| Window | Knight | Skeleton | Slime | Mage | Golem | Orb | Total |
|---|---|---|---|---|---|---|---|
| 1:00–2:00 | 3.0 | 5.4 | 22.8 | | | | 31.2 |
| 2:00–3:00 | 2.5 | 14.1 | 30.8 | 1.1 | | 12.4 | 60.9 |
| 3:00–5:00 | | 0.1 | | | | 4.1 | 4.2 |
| 5:00–7:00 | | | | | 29.7 | | 29.7 |

Repaired: 34.3 HP per run (`aim+greedy` 43.8).

### Causes

1. **The crunch is 1:40–3:00 and it is contact, mostly slimes.** Every fall before the golem came between 1:40 and 3:00; slimes took about 60% of the HP, skeletons most of the rest. Builds were level 3 at 1:30 and 6 at 2:00: the dragon walks at 87 px/s and the fireball kills at up to 420 px, so the bots reach only part of the early gems (about 50 kills by 1:30, level 2–3). Meanwhile the 2:00 → 3:00 ramp climbed to 14/s.
2. **A run that gets past 3:00 takes almost no damage until the golem.** About 4 HP per run over 3:00–5:00, nearly all from orbs: the build kills the horde as it arrives. The outcome is bimodal, as in T-006: a fall at 1:40–3:00, or survival to the golem.
3. **The golem ends nothing for a strong build.** A trace of the runs at the cap: the golem hovers 100–250 px from the tower. At 6 px per hit, about 13 hits/s cancel its 75 px/s, and a full build aiming at the enemy nearest the tower lands that easily; Repair (25 HP per level-up, the only card a full build gets) covered the occasional contact. 10 of 96 runs reached 7:00.
4. **Orbs are a real threat, and the dodge matters.** With dodging, orbs took 12–17 HP per greedy run, at 2:00–3:30. Without it (`--no-dodge`, baseline) they took about 33 HP and were the top fall cause (orb 8, slime 6, skeleton 2 for `aim+greedy`).

## D-4, late game: decided

**Adopted: once the build is full, Repair is offered only while tower HP is below half (`REPAIR_OFFER_BELOW = 0.5`, *unmeasured*).** A healthy full build is offered nothing: its level-ups pass at once with no screen, no rng draw and no sound (the level still counts, the world keeps running). A Repair that lifts the tower to half or more ends the rest of the queue. Spec §14 and §14.1; the D-4 row is deleted from `docs/decisions.md`.

**Not adopted: a steeper `xpToNext` past level 20.** Measured at +5 and +10 XP per level past 20 (with golem knockback 6, 3 and 2): no change outside the noise (median, runs at 5:00 and at the cap within one run of each other). Falls before 3:00 happen near level 13, and survivors are full by about 4:00 either way.

Effect of the Repair rule alone (step 1 below): Repair healed 34–44 HP per greedy run before, 17–22 after; the outcome table did not move, because the late game was not losing HP that Repair had been covering, except against the golem. D-4's underlying problem, a late game with no pressure before the golem, is what causes 3 to 3 and 7 below address.

## Tuning, one number at a time

Each row is a full default run (seeds 1..16, all bots) after that change, on top of the rows above. Cells: median s, runs reaching 5:00 / the 7:00 cap.

| Step | Number | Old → new | Reason | idle | aim+naive | aim+greedy | kite+naive | kite+greedy |
|---|---|---|---|---|---|---|---|---|
| 0 | baseline | | | 38.3 | 109.6, 2/2 | 164.3, 6/4 | 115.7, 2/2 | 165.4, 5/2 |
| 1 | Repair for a full build (D-4) | always → below 50% HP | D-4 | 38.3 | 109.6, 2/2 | 164.3, 6/3 | 115.7, 2/1 | 165.4, 5/5 |
| 2 | `TOWER_REST_DIST` | 40 → 50 px | at 40 the 2× dragon (40 px tall) overlaps the top of the 60 px castle; at 50 they just touch | 38.0 | 110.4, 2/2 | 149.4, 5/4 | 113.5, 0/0 | 173.5, 7/5 |
| 3 | timeline 3:00 `rate` | 14 → 8 | cause 1: the 2:00 → 3:00 ramp | 38.0 | 110.4, 1/1 | 163.4, 6/3 | 113.5, 0/0 | 353.1, 11/7 |
| 4 | golem knockback (`GOLEM_KNOCKBACK`) | 6 → 1 px | cause 3: hits held the golem off forever | 38.0 | 110.4, 1/0 | 163.4, 6/0 | 113.5, 0/0 | 312.0, 11/1 |
| 5 | `xpToNext(level)` | 5 + 3L → 3 + 3L | cause 1: the early levels come too late for a dragon that walks | 38.0 | 138.2, 6/2 | 314.5, 13/2 | 108.6, 4/0 | 313.2, 11/3 |
| 6 | timeline 3:00 `rate` | 8 → 10 | with cheaper levels, 8 gave more than the target needs | 38.0 | 134.3, 3/0 | 314.9, 15/3 | 108.6, 5/1 | 314.2, 10/1 |
| 7 | ghost knight `hp` | 3 → 10 | the last escapes from the golem; a late enemy as tough as the first one | 38.0 | 134.3, 3/0 | 313.7, 14/1 | 108.6, 4/0 | 312.5, 10/0 |

Sweeps behind the steps (greedy bots; runs reaching 5:00, or the cap where stated, out of the pool):

| Step | Values tried | aim+greedy | kite+greedy | Read |
|---|---|---|---|---|
| 3 | 3:00 rate 14 / 10 / 8, seeds 1..48 | 22 / 24 / 25 of 48 | 17 / 23 / 27 of 48 | 8 the highest tried keeping kite above half |
| 3, rejected | slime DPS 6; tower HP 150; 2:00 rate 2 (seeds 1..16, on the step-1 numbers) | 6 / 8 / 5 of 16 | 6 / 7 / 6 of 16 | none moved kite past half alone |
| 4 | knockback 6 / 3 / 2 / 1.5 / 1, seeds 1..48, runs at the cap | 18 / 6 / 5 / 4 / 3 of 48 | 19 / 11 / 9 / 7 / 2 of 48 | 1 the only value that ends almost every run |
| 5 | 3:00 rate 7 / 6, slime DPS 6, 2:00 rate 2, on seeds 101..132 | | 11 / 14 / 12 / 11 of 32 | the fresh pool's kite falls are at 1:40–2:00, before any of these act |
| 5 | XP 5 + 3L / 3 + 3L / 4 + 2L, seeds 1..48 + 101..132 | 47 / 58 / 73 of 80 | 39 / 52 / 71 of 80 | 4 + 2L makes the crunch trivial |
| 6 | 3:00 rate 8 / 10 / 12 with 3 + 3L, 80 seeds | 58 / 49 / 44 of 80 | 52 / 48 / 43 of 80 | 10 keeps each pool above half (27/48, 21/32); 12 is at the edge |
| 7 | ghost knight HP 3 / 10 / 20, seeds 1..48, at 5:00 · at the cap | 29·7 / 28·1 / 26·0 of 48 | 27·7 / 27·0 / 25·0 of 48 | 10 removes the escapes without losing runs to 5:00 |

Why step 7 stops the escapes is a probe, not confirmed: in the traced seeds the dragon still chases gems on every tick after 5:00, and the golem now reaches the tower within about 15 s instead of trailing it.

## After

`node tools/measure.mjs --timeline --causes --step 30`:

| Bot | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills | Level | Fall causes | Tower moving |
|---|---|---|---|---|---|---|---|---|---|
| idle+naive | 38.0 | 37.0 | 46.1 | 0 | 0 | 1 | 1 | knight 16 | 0% |
| idle+greedy | 38.0 | 37.0 | 46.1 | 0 | 0 | 1 | 1 | knight 16 | 0% |
| aim+naive | 134.3 | 100.2 | 318.4 | 3 | 0 | 149 | 8.5 | slime 9, golem 3, skeleton 2, knight 1, orb 1 | 43% |
| aim+greedy | 313.7 | 166.0 | ≥420 | 14 | 1 | 4233 | 38 | golem 13, slime 1, ghost knight 1 | 72% |
| kite+naive | 108.6 | 98.8 | 316.4 | 4 | 0 | 76 | 5 | slime 11, golem 4, skeleton 1 | 86% |
| kite+greedy | 312.5 | 107.6 | 318.7 | 10 | 0 | 4212.5 | 35 | golem 10, slime 5, skeleton 1 | 87% |

`kite+greedy` over time (medians; a fallen run counts with its final values):

| t s | Tower HP | Enemies alive | Kills | Level |
|---|---|---|---|---|
| 60 | 100 | 4 | 24 | 1 |
| 90 | 100 | 16.5 | 50.5 | 3 |
| 120 | 87 | 29 | 117 | 6 (2 fallen) |
| 150 | 73 | 90.5 | 270 | 11 (3 fallen) |
| 180 | 53 | 124 | 687 | 16.5 (6 fallen) |
| 240 | 49 | 74 | 2195 | 28 (6 fallen) |
| 300 | 52 | 83 | 3876.5 | 33.5 (6 fallen) |
| 330 | 0 | 83 | 4212.5 | 35 (16 fallen) |

`kite+greedy` tower HP lost by source, mean per run:

| Window | Knight | Skeleton | Slime | Mage | Ghost | Golem | Orb | Total |
|---|---|---|---|---|---|---|---|---|
| 1:00–2:00 | 2.6 | 5.0 | 18.6 | | | | | 26.1 |
| 2:00–3:00 | 1.2 | 9.4 | 11.9 | 1.0 | | | 12.8 | 36.2 |
| 3:00–5:00 | | 0.2 | 1.1 | | 0.1 | | 4.6 | 6.1 |
| 5:00–5:30 | | | | | | 45.6 | | 45.6 |

Repaired: 14.1 HP per run (`aim+greedy` 28.1).

Confirmation, `node tools/measure.mjs --seeds 32 --first-seed 101`:

| Bot | Median s | Min s | Max s | Reached 5:00 | Reached cap | Fall causes |
|---|---|---|---|---|---|---|
| idle+naive | 40.9 | 37.1 | 45.4 | 0 | 0 | knight 32 |
| aim+naive | 119.6 | 99.0 | 346.2 | 5 | 0 | slime 21, skeleton 6, golem 5 |
| aim+greedy | 312.2 | 105.3 | 320.9 | 20 | 0 | golem 20, slime 7, skeleton 3, orb 2 |
| kite+naive | 117.4 | 100.5 | 321.5 | 5 | 0 | slime 25, golem 5, skeleton 2 |
| kite+greedy | 313.1 | 105.3 | 381.0 | 21 | 0 | golem 21, slime 9, skeleton 2 |

And seeds 1..48, greedy: `aim+greedy` 311.5 s, 28 of 48 reach 5:00, 1 at the cap; `kite+greedy` 310.8 s, 27 of 48, none at the cap.

The shape of a run now: a quiet first minute (level 1 at 1:00), the crunch at 1:30–3:00 where slimes, skeletons and the first orbs take the tower to about half, then a full build by about 4:45 that holds the horde, and the golem, which reaches the tower 6–10 s after 5:00 and ends the run within about 20 s. Runs fall either at 1:40–3:30 or, nearly all of the rest, at 5:05–5:25.

## Targets that are not met, and why

### `aim+greedy` median 3:00

- **The two greedy bots play the same game,** as in T-006: enemies walk at the tower and only orbs threaten the dragon, which both bots dodge, so standing on home or circling it changes little. Their pooled results agree within noise (seeds 1..48 + 101..132: 48 and 48 of 80 reach 5:00).
- **For two bots with one distribution the targets contradict each other.** `kite` reaching 5:00 in at least half the runs means at least half survive past 5:00, so the median is at least 5:00 for both. A 3:00 median and "half reach 5:00" can only hold together if no run falls between 3:00 and 5:00 and exactly half fall before 3:00; the median then sits in the gap between the two modes and jumps with the pool (T-006 saw 178.7 s to 313.0 s; this baseline 164.3 s on seeds 1..16).
- This tuning keeps the kite target and the 7:00 target, the ones about the golem.
- **Proposed replacement:** "a greedy collecting player reaches the golem in half to two thirds of runs (measured: 60%), and a careless one (`naive` picks) falls in the crunch, median 1:45–2:30 (measured: 1:49–2:14)". If the owner wants a bot that plays clearly worse than `kite`, it has to be a different player (for example one that never dodges: `--no-dodge` cuts `kite+greedy` to 7 of 16 at 5:00 on the current numbers), which is a choice about the instrument, not the game.

### Every tower falls by 7:00: 1 run in 288

The one run (`aim+greedy`, seed 16, in both the 1..16 and the 1..48 pool) is the D-5 escape (traced: the golem walks at full speed, hits land on 9% of ticks): from 5:00 on, 600 gems lie on the ground, the dragon chases one on every tick and drags the tower at 87 px/s, faster than the golem's 75. No number this task may change closes it (the dragon's and the golem's speeds are the owner's). A probe of D-5's recommended rule, the golem gaining 10 px/s every 10 s after 5:00 (temporary code, not committed, on the step-6 numbers when 14 of 96 greedy runs on seeds 1..48 still escaped), ended every greedy run of seeds 1..48 and 101..132 by 5:20 with no change before 5:00. That is a rule and D-5 is the owner's, so it is not adopted; the instrument's evidence for it is above.

## Other findings

- **T-014's lost laser pierce, confirmed as a cause.** A probe giving the laser built-in pierce back (temporary code) raised the greedy runs reaching 5:00 on seeds 1..48 from 25 + 27 to 30 + 36 of 96 (on the step-4 numbers). Without pierce the laser removes one enemy per shot in the crunch.
- **The golem.** It catches a tower that follows (60 px/s) but not one being dragged (87 px/s), as D-5 says. With knockback at 1 px, hits on 9% of ticks barely slow it; its knockback is now a flourish, not a defence.
- **Orbs** cost a dodging greedy bot 13–20 HP per run and end 0–2 runs in 16. A bot that never dodges (`--no-dodge`, step-6 numbers, seeds 1..16) loses about 55 HP per run to them, and reaches 5:00 in 12 and 7 of 16 runs (`aim`, `kite`) instead of 15 and 10. The orb numbers stay as they were and *unmeasured* for taste (D-6 is the owner's).
- **Tower movement.** `aim` (which stands still between gem trips) has the tower moving on 43–72% of ticks, `kite` on 86%; with gems everywhere late in a run the carriers show almost always.

## Changed numbers and rules (all *unmeasured* until the owner has played them)

| Spec | Number | Old | New |
|---|---|---|---|
| §14.1 | Repair offered to a full build | always | only below `REPAIR_OFFER_BELOW = 0.5` of max HP; otherwise the level-up passes with no card |
| §7 | `TOWER_REST_DIST` | 40 px | 50 px |
| §9 | rate at 3:00 | 14 | 10 |
| §8, §8.4, §13 | golem knockback per hit | 6 px | 1 px (`GOLEM_KNOCKBACK`) |
| §14 | `xpToNext(level)` | 5 + 3 × level | 3 + 3 × level |
| §8 | ghost knight HP | 3 | 10 |

## To check in play

- **The castle no longer sits under the dragon.** At rest the tower is 50 px away, sprites touching rather than overlapping.
- **The crunch at 1:30–3:00:** slimes and skeletons at the tower, the first green orbs from 2:00. Dodging saves about 20 tower HP in this window.
- **The quiet stretch at 3:30–5:00.** A full build kills everything on arrival and level-ups stop showing cards once the build is full and the tower is above half. If it feels empty, the next lever is late pressure (more ghost knights, or a 4:00 rate above 16), measured against the kite target.
- **The golem is now an executioner.** It reaches the tower 6–10 s after `ohno` and ends the run within about 20 s; hitting it barely pushes it. The only escape is to walk away with the tower in a straight line (D-5). Decide in play whether that escape should exist.
- **Levels come faster early:** level 2 at 6 XP, level 10 at 33. Watch whether the first minutes give cards too often.
