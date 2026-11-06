# Early-game balance: baseline and first-two-minutes tuning

Date: 2026-11-06 · Task: T-009 · Instrument: `tools/measure.mjs` · Frozen: a re-measure is a new dated report.

## Summary

| Policy | Target (judgement, *unmeasured* for taste) | Before (median) | After (median) | Met |
|---|---|---|---|---|
| idle | falls between 25 s and 60 s | 13.3 s | 28.1 s | yes |
| aim | survives at least 75 s | 17.6 s | 82.8 s | yes |
| kite | survives at least 120 s | 17.4 s | 79.5 s | **no**: out of reach with a level-1 fireball and no growth (see below) |

Four numbers changed: the timeline rates at 0:00, 0:30 and 1:00, and knight contact DPS. Tower HP, knight HP, the 2:00+ timeline and all weapons are unchanged.

## Method

- Headless `Game` runs, one per seed, until the tower falls (phase leaves `'play'`) or the 180 s cap. Survival time is `game.t` at the fall.
- Seeds 1..16 for every table unless stated. A confirmation pass used a fresh pool, seeds 101..132.
- Build under test: sim core plus roster (T-002, T-004); fireball level 1 only. No gems, XP or level-ups exist yet, so `Level` is always 1 and no policy ever picks a card.
- Policies:
  - `idle`: no input; the fireball fires right, its default direction.
  - `aim`: stands still at the start point and aims at the enemy nearest the tower.
  - `kite`: circles the tower at 120 px (tangent steering plus a radial correction) and aims the same way.
- Default run: `node tools/measure.mjs` (all policies, 16 seeds, 180 s cap), about 1 s wall time on the owner's laptop. `--timeline` adds medians over time; `--set` runs what-ifs without editing `content.js`.

## Baseline

`node tools/measure.mjs --timeline --step 5` on the numbers as they were:

| Policy | Seeds | Median s | Min s | Max s | Reached cap | Kills (median) |
|---|---|---|---|---|---|---|
| idle | 16 | 13.3 | 13.0 | 14.4 | 0 | 1 |
| aim | 16 | 17.6 | 16.9 | 18.5 | 0 | 8 |
| kite | 16 | 17.4 | 16.6 | 18.8 | 0 | 7 |

`aim` over time (medians):

| t s | Tower HP | Enemies alive | Kills | Spawned |
|---|---|---|---|---|
| 5 | 100 | 6 | 1 | 7 |
| 10 | 100 | 12 | 4 | 16 |
| 15 | 84 | 19 | 7 | 26 |
| 20 | 0 | 19 | 8 | 31 (all fallen) |

### Cause

**The spawn rate in the first 30 s is about three times what a level-1 fireball can kill, and each knight at the tower removes 10% of its HP per second, so the first wave to arrive ends the run in about 4 s.** Knights spawn 560 px out and walk at 55 px/s, so nothing touches the tower for the first ~10 s. From then on knights arrive at the spawn rate (1.5/s, rising to 2.5/s by 0:30), while the fireball kills at most ~0.55 knights/s (0.9 s cooldown, 2 hits for a 3-HP knight); the aim bot measured 0.45/s. The crowd at the tower grows by about one knight per second and the damage grows with it, quadratically in time: 100 HP last ~3.5 s after first contact. Aiming buys only 4 s over idling; the player's skill is irrelevant to the outcome.

## Tuning, one number at a time

Order of preference from the work file: timeline rate for 0:00–1:00, knight contact DPS, tower HP, knight HP. Each row is a full default run (16 seeds) after that one change, on top of the rows above it.

| Step | Number | Old → new | Reason | idle median [min–max] | aim median [min–max] | kite median [min–max] |
|---|---|---|---|---|---|---|
| 0 | baseline | | | 13.3 [13.0–14.4] | 17.6 [16.9–18.5] | 17.4 [16.6–18.8] |
| 1 | timeline 0:00 `rate` | 1.5 → 0.3 | start gentle: below the fireball's ~0.55 kills/s ceiling | 16.8 [16.5–18.4] | 27.6 [26.0–28.2] | 25.8 [23.5–27.7] |
| 2 | timeline 0:30 `rate` | 2.5 → 0.5 | the 0:00–0:30 ramp toward 2.5/s still outran the fireball by 0:20 | 19.0 [18.5–20.4] | 53.1 [51.8–55.0] | 51.1 [48.9–52.3] |
| 3 | timeline 1:00 `rate` | 3.5 → 0.6 | the 0:30–1:00 ramp toward 3.5/s was the next wall, at ~0:50 | 19.0 [18.5–20.4] | 82.0 [78.0–84.1] | 77.8 [73.5–80.6] |
| 4 | knight contact DPS | 10 → 2 | idle still fell in ~9 s after first contact; a lone knight now takes 2%/s of the tower, not 10% | 28.1 [27.7–31.2] | 82.8 [78.0–85.4] | 79.5 [76.3–83.3] |

Side sweeps (a scratch script driving the same policies and seeds): with steps 1, 2 and 4 applied, the 1:00 rate gave aim medians of 82.8 / 79.6 / 74.8 / 72.0 s for 0.6 / 0.8 / 1.0 / 1.2 (min 78.0 / 74.3 / 72.2 / 70.1); 0.6 is the highest value tried that keeps every seed at or above 75 s. With steps 1–3 applied, knight DPS 3 gave idle 25.2 s (min 24.8), too close to the 25 s floor; tower HP 400 alone gave idle 26.4 s, but knight DPS comes first in the preference order and keeps the Repair card's 25 HP meaningful.

## After

`node tools/measure.mjs --timeline`:

| Policy | Seeds | Median s | Min s | Max s | Reached cap | Kills (median) |
|---|---|---|---|---|---|---|
| idle | 16 | 28.1 | 27.7 | 31.2 | 0 | 0 |
| aim | 16 | 82.8 | 78.0 | 85.4 | 0 | 44.5 |
| kite | 16 | 79.5 | 76.3 | 83.3 | 0 | 39 |

`aim` over time (medians):

| t s | Tower HP | Enemies alive | Kills | Spawned |
|---|---|---|---|---|
| 10 | 100 | 1 | 2 | 3 |
| 30 | 100 | 1 | 10 | 11 |
| 60 | 100 | 2 | 26 | 28 |
| 70 | 100 | 6 | 34 | 38 |
| 80 | 68 | 17.5 | 42 | 55 (1 fallen) |
| 90 | 0 | 17.5 | 44.5 | 60.5 (all fallen) |

Confirmation on a fresh pool, `node tools/measure.mjs --seeds 32 --first-seed 101`:

| Policy | Seeds | Median s | Min s | Max s | Kills (median) |
|---|---|---|---|---|---|
| idle | 32 | 29.0 | 27.6 | 32.1 | 1 |
| aim | 32 | 83.8 | 79.9 | 86.9 | 45 |
| kite | 32 | 81.2 | 74.0 | 85.1 | 39 |

## Why kite does not reach 120 s

The wall is now the 1:00 → 2:00 ramp toward the 2:00 row's 5 enemies/s, outside this task's scope, against a level-1 fireball that kills at most ~0.6 enemies/s of the 1:00 mix. An aiming player holds the tower at full HP for 70 s, then loses it within ~15 s. Probes with numbers beyond what this task may change:

| Probe (`--set`) | aim median [min–max] | kite median [min–max] |
|---|---|---|
| `knight.hp=2 towerHp=1000` | 101.7 [97.5–105.3] | 96.7 [90.0–101.3] |
| `rate.120=0.6 --max-seconds 240` (2:00 row, out of scope) | 137.6 [93.6–142.3] | 99.7 [83.9–136.6] |

Kiting is no better than aiming in this build: enemies walk at the tower, not the dragon, and there are no gems to collect, so circling only moves the firing point (and from farther away). The kite target is a growth target. **Recommendation:** keep the target and re-measure all three policies once T-005 (gems, level-ups, weapons) has landed; the policies already pick card 0 when `game.offers` is non-empty. The 2:00+ timeline is the natural next knob there, with growth in play.

## Changed numbers (all stay *unmeasured* until the owner has played them)

| Spec | Number | Old | New |
|---|---|---|---|
| §9 | rate at 0:00 | 1.5 | 0.3 |
| §9 | rate at 0:30 | 2.5 | 0.5 |
| §9 | rate at 1:00 | 3.5 | 0.6 |
| §8 | Knight contact DPS | 10 | 2 |

Feel to check in play: the first minute is now sparse (one enemy every 1.7–3.3 s, the first one reaching the tower at ~10 s), then the 1:00 → 2:00 ramp arrives steeply. Knights now hurt less than skeletons (6) and slimes (8), so the starting enemy is a slow, tanky nuisance rather than the main threat.
