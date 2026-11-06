# Full-run balance: gem-collecting bots, baseline and tuning to the golem

Date: 2026-11-06 · Task: T-006 · Instrument: `tools/measure.mjs` · Frozen: a re-measure is a new dated report. Follows [the early-balance report](2026-11-06-early-balance.md).

## Summary

| Target (judgement, owner may change) | Before | After (seeds 1..16) | After (fresh pool 101..132) | Met |
|---|---|---|---|---|
| `idle+naive` falls between 25 s and 90 s | 28.1 s | 28.1 s | 29.0 s | yes |
| `aim+greedy` median 3:00 | 4:31 (271.4 s) | 4:00 (239.9 s) | 2:59 (178.7 s) | **no** on the main pool: the outcome is bimodal and aim plays like kite (see below) |
| `kite+greedy` reaches 5:00 in at least half the seeds | 7 / 16 | 8 / 16 | 16 / 32 | yes, at the edge (26 / 48 on seeds 1..48) |
| every bot's tower falls by 7:00 | 15 of 96 runs never fell | latest fall 381 s | latest fall 399 s | yes |

Five numbers changed: the timeline rates at 2:00, 3:00, 4:00 and 5:00, and the golem's speed. Enemy HP and contact DPS, the XP curve and every weapon are unchanged. The fun features (split fireworks, gem comet tail) are untouched.

## Method

- Headless `Game` runs, one per seed, until the tower falls or the 420 s (7:00) cap. Survival time is `game.t` at the fall. Seeds 1..16 for every table unless stated; confirmation on a fresh pool, seeds 101..132.
- A bot is a movement policy plus a pick rule (`<policy>+<pick>`), spec §20:
  - `idle`: no input; fires right; collects nothing.
  - `aim`: holds station 60 px above the tower, aims at the enemy nearest the tower.
  - `kite`: circles the tower at 120 px, aims the same way.
  - `aim` and `kite` fly to the non-homing gem nearest the dragon whenever one lies within 400 px of the tower (about what is on screen around it), then go back to their own movement.
  - `naive` takes card 0; `greedy` takes Repair below 40% tower HP, else a new weapon, else the highest-level weapon's upgrade, else a buff upgrade, else a new buff.
- **Gem range.** The instrument first used 250 px. With it `aim` was still level 1 at 1:00 after 26 kills: the fireball kills at up to 420 px, so most gems lie beyond 250 px. 400 px was chosen before any tuning; the baseline below uses it.
- Default run: `node tools/measure.mjs` (all six bots, 16 seeds), about 25 s wall on the owner's laptop. `--timeline --step 30` adds medians over time; `--set` runs what-ifs. Side probes (tower damage by enemy type, golem distance) were scratch scripts driving the same bots and seeds.

## Baseline

`node tools/measure.mjs --timeline --step 30` on the numbers as T-009 and T-005 left them:

| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) |
|---|---|---|---|---|---|---|---|---|
| idle+naive | 16 | 28.1 | 27.7 | 31.2 | 0 | 0 | 0 | 1 |
| idle+greedy | 16 | 28.1 | 27.7 | 31.2 | 0 | 0 | 0 | 1 |
| aim+naive | 16 | 92.0 | 83.5 | 165.2 | 0 | 0 | 74 | 5.5 |
| aim+greedy | 16 | 271.4 | 86.0 | >=420.0 | 8 | 8 | 2675 | 32.5 |
| kite+naive | 16 | 88.4 | 79.8 | 120.9 | 0 | 0 | 67 | 5 |
| kite+greedy | 16 | 127.1 | 86.5 | >=420.0 | 7 | 7 | 265.5 | 11.5 |

`kite+greedy` over time (medians; a fallen run counts with its final values):

| t s | Tower HP | Enemies alive | Kills | Spawned | Level |
|---|---|---|---|---|---|
| 60 | 100 | 2.5 | 25.5 | 28 | 3 |
| 90 | 89 | 19.5 | 73 | 79 (1 fallen) | 5.5 |
| 120 | 11 | 30.5 | 210 | 196 (6 fallen) | 10 |
| 150 | 0 | 30 | 265.5 | 232.5 (9 fallen) | 11.5 |
| 420 | 0 | 31.5 | 265.5 | 232.5 (9 fallen) | 11.5 |

Tower damage by enemy type, `kite+greedy`, HP per run (mean over 16 seeds) in each 30 s window:

| Window | Knight | Skeleton | Slime | Mage | Golem |
|---|---|---|---|---|---|
| 1:00–1:30 | 4.9 | 4.3 | 17.6 | | |
| 1:30–2:00 | 7.2 | 10.3 | 26.2 | | |
| 2:00–2:30 | 0.4 | 3.3 | 5.7 | 0.6 | |
| 2:30–5:00 | ≤ 1.1 per window, all types together | | | | |
| 5:00–7:00 | | | | | 4.2–7.3 |

### Causes

1. **The 1:00 → 2:00 ramp is a wall.** The rate climbs linearly from 0.6/s at 1:00 to 5/s at 2:00 while the build is level 3–8. Every run that fell, fell between 1:20 and 2:10; slimes (a split slime is three bodies at 8 DPS each) did half the damage.
2. **A run that survives 2:30 never loses.** Past about level 10 the build kills the horde as it arrives (about 30 alive at 12/s), more spawns mean more XP, and a full build (level ~33) is offered only Repair, so every later level-up heals 25 HP. Damage after 2:30 is about 1 HP per 30 s or less. The outcome is bimodal: a fall before 2:30 or survival to the cap.
3. **The golem ends nothing.** At 30 px/s it never catches the tower: a gem-collecting dragon drags the tower about 140 px/s on average (a probe of one surviving run: 650–830 px of tower movement per 5 s), and hits knock the golem back 6 px each. 15 of 96 runs reached the 7:00 cap, all of them with the golem alive and the tower at or near full HP.

## Tuning, one number at a time

Order of preference from the work file: timeline rates, then enemy HP/DPS, then the XP curve, then weapons. Each row is a full default run (16 seeds, all bots) after that one change, on top of the rows above it. Cells are median [min–max] s and runs reaching 5:00.

| Step | Number | Old → new | Reason | aim+greedy | kite+greedy | aim+naive | kite+naive |
|---|---|---|---|---|---|---|---|
| 0 | baseline | | | 271.4 [86.0–≥420], 8 | 127.1 [86.5–≥420], 7 | 92.0 [83.5–165.2], 0 | 88.4 [79.8–120.9], 0 |
| 1 | timeline 2:00 `rate` | 5 → 2.5 | cause 1: the 1:00–2:00 ramp outran a level 3–8 build | ≥420 [103.9–≥420], 14 | ≥420 [112.4–≥420], 14 | 112.3 [92.2–≥420], 1 | 121.7 [81.9–≥420], 5 |
| 2 | timeline 3:00 `rate` | 7 → 14 | step 1 left almost no losses: mid-game pressure back on the 2:00–3:00 ramp | 295.1 [103.9–≥420], 8 | 300.9 [112.4–≥420], 8 | 112.3 [92.2–139.9], 0 | 121.7 [81.9–≥420], 2 |
| 3 | timeline 4:00 `rate` | 10 → 16 | keep the ramp rising after 3:00 (10 would be a drop from 14) | 295.1 [103.9–≥420], 8 | 300.9 [112.4–≥420], 8 | same | same |
| 4 | timeline 5:00 `rate` | 12 → 18 | same, after 4:00 | 295.1 [103.9–≥420], 8 | 300.9 [112.4–≥420], 8 | same | same |
| 5 | golem `speed` | 30 → 150 px/s | cause 3: it must catch a tower dragged about the map and end every run | 239.9 [103.9–344.9], 8 | 247.9 [112.4–373.4], 8 | 112.3 [92.2–139.9], 0 | 121.7 [81.9–381.4], 2 |

`idle` (both pick rules) is 28.1 [27.7–31.2] s at every step: it never sees 2:00. Steps 3 and 4 change no fall time (only kills, about +250 and +750 per surviving run); they keep the timeline monotone.

Side sweeps that informed the steps (`--set`, seeds 1..16 unless stated):

| Probe | aim+greedy | kite+greedy | Read |
|---|---|---|---|
| step 1 with 2:00 rate 3.5 / 2.5 / 2 | ≥420 (11 / 14 / 15 reach 5:00) | ≥420 (12 / 14 / 16) | 2.5 removes most early falls without making the first two minutes trivial |
| step 1, 3:00 rate 10 / 12 / 14 (32 seeds) | 23 / 19 / 17 of 32 reach 5:00 | 24 / 19 / 19 of 32 | 14 is the highest tried that keeps kite above half |
| step 1, 3:00 rate 20 | 155.6, 6 reach 5:00 | 150.8, 4 | aim median near 3:00 but kite far below half |
| step 1 + slime DPS 4 or 3, skeleton DPS 3, 3:00 rate up to 24 | ≥420, 10–15 reach 5:00 | ≥420, 10–15 | lower contact DPS removes the only mid-game threat; higher rates then only feed XP |
| steps 1–2, 4:00 rate 20 or 30, 5:00 rate 30 | 10 reach 5:00 | 12 | late rates change nothing: a full build kills the horde on arrival |
| steps 1–2, golem speed 90 / 120 / 150 (32 seeds) | 14 / 4 / 0 runs to the cap | 18 / 6 / 0 | 150 is the lowest speed tried that ends every run by 7:00 |
| steps 1–2, golem knockback 3 or 1 with speed 90 / 120 (32 seeds) | knockback 3, speed 120: 0 to the cap | 0 to the cap | knockback matters less than the tower's movement; one number (speed) suffices |
| baseline, golem speed 60 / 90 / 120 | 8 / 6 / 1 runs to the cap | 7 / 5 / 2 | |

## After

`node tools/measure.mjs --timeline --step 30`:

| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) |
|---|---|---|---|---|---|---|---|---|
| idle+naive | 16 | 28.1 | 27.7 | 31.2 | 0 | 0 | 0 | 1 |
| idle+greedy | 16 | 28.1 | 27.7 | 31.2 | 0 | 0 | 0 | 1 |
| aim+naive | 16 | 112.3 | 92.2 | 139.9 | 0 | 0 | 104.5 | 6.5 |
| aim+greedy | 16 | 239.9 | 103.9 | 344.9 | 8 | 0 | 2483.5 | 34.5 |
| kite+naive | 16 | 121.7 | 81.9 | 381.4 | 2 | 0 | 138.5 | 8 |
| kite+greedy | 16 | 247.9 | 112.4 | 373.4 | 8 | 0 | 2605.5 | 35 |

`kite+greedy` over time (medians):

| t s | Tower HP | Enemies alive | Kills | Spawned | Level |
|---|---|---|---|---|---|
| 60 | 100 | 2.5 | 25.5 | 28 | 3 |
| 90 | 100 | 10 | 61 | 60 | 5 |
| 120 | 90 | 15.5 | 139.5 | 121 (1 fallen) | 8 |
| 150 | 37 | 60.5 | 353 | 282 (1 fallen) | 14 |
| 180 | 3 | 73.5 | 839 | 616 (7 fallen) | 21 |
| 210 | 17 | 66.5 | 1221 | 845.5 (8 fallen) | 25.5 |
| 270 | 43 | 68 | 1998 | 1325.5 (8 fallen) | 29.5 |
| 300 | 50 | 68.5 | 2421 | 1588 (8 fallen) | 32 |
| 330 | 0 | 69 | 2605.5 | 1715 (11 fallen) | 35 |
| 390 | 0 | 71 | 2605.5 | 1715 (16 fallen) | 35 |

Confirmation on a fresh pool, `node tools/measure.mjs --seeds 32 --first-seed 101`:

| Bot | Seeds | Median s | Min s | Max s | Reached 5:00 | Reached cap | Kills (median) | Level (median) |
|---|---|---|---|---|---|---|---|---|
| idle+naive | 32 | 29.0 | 27.6 | 32.1 | 0 | 0 | 1 | 1 |
| idle+greedy | 32 | 29.0 | 27.6 | 32.1 | 0 | 0 | 1 | 1 |
| aim+naive | 32 | 104.3 | 83.5 | 392.9 | 5 | 0 | 90.5 | 6 |
| aim+greedy | 32 | 178.7 | 115.0 | 363.3 | 15 | 0 | 840 | 22 |
| kite+naive | 32 | 99.2 | 84.3 | 399.1 | 3 | 0 | 72.5 | 5.5 |
| kite+greedy | 32 | 238.4 | 90.5 | 363.8 | 16 | 0 | 2490.5 | 33 |

And seeds 1..48, greedy bots only: `aim+greedy` median 313.0 s, 30 of 48 reach 5:00; `kite+greedy` median 309.3 s, 26 of 48. No run anywhere reached the 7:00 cap.

The shape of a run now: a sparse first minute, a build of level 5 at 1:30, the crunch at 2:30–3:00 (70+ enemies alive, tower HP lowest), then either the fall or a full build that holds the horde until the golem; the golem then ends the run within 0–100 s.

## Why `aim+greedy` misses its 3:00 median

- **Aim and kite play the same game.** Enemies walk at the tower and the dragon cannot be hurt, so circling has no defensive value; both bots spend most of a run flying to gems. Their pooled results agree within noise (seeds 1..48: 30 and 26 of 48 reach 5:00). A median of 3:00 for one and "half reach 5:00" for the other cannot both hold for two bots with the same distribution. This tuning keeps the kite target, which is the one about reaching the golem.
- **The outcome is bimodal,** so the median sits in the gap between the two modes and jumps with the pool: 239.9 s (1..16), 178.7 s (101..132), 313.0 s (1..48). Runs fall either at 1:30–3:30 or after 5:00.
- Making aim differ would mean a different bot (for example one that only collects gems within the tether), which is a choice about the instrument rather than the game. Probes with such a bot (gem range 150–300 px) showed a cliff, not a curve: at 150–200 px aim fell at about 1:30 every run, at 250–300 px it behaved like kite.
- **Recommendation:** treat the two targets as one ("a collecting player reaches the golem in about half the runs") until the owner plays, or reduce the bimodality first. The lever that would do that is the late build, not the timeline: Repair-only offers on a full build heal 25 HP per level-up, and enemy HP does not grow, so a full build cannot lose to the horde. Candidates for a later task: a steeper XP curve for high levels, or Repair no longer offered once the build is full.

## Roster check

The contact DPS ordering knight 2 < skeleton 6 < slime 8 follows arrival order (knights from 0:00, skeletons from 0:30, slimes from 1:00, ghost knights 10 from 3:00), so the later enemy hits harder; the mage (5, from 2:00) is a summoner whose damage comes from its skeletons. Lowering slime and skeleton DPS was probed (table above) and removed the only mid-game threat, so it was not adopted. Knights stay the basic enemy: the only type in the first 30 s and 40–50% of spawns until 3:00.

## Changed numbers (all stay *unmeasured* until the owner has played them)

| Spec | Number | Old | New |
|---|---|---|---|
| §9 | rate at 2:00 | 5 | 2.5 |
| §9 | rate at 3:00 | 7 | 14 |
| §9 | rate at 4:00 | 10 | 16 |
| §9 | rate at 5:00 (and after) | 12 | 18 |
| §8, §13 | golem speed | 30 px/s | 150 px/s |

## To check in play

- **The golem at 150 px/s** charges rather than lumbers: from the spawn ring it reaches an unmoving tower in about 3 s. It is still slower than the tower on its tether (200 px/s), so a player who drags the tower away in a straight line can outrun it for as long as they like; the bots never do that. If that turns out to be the dominant strategy, the golem needs a rule (for example speeding up over time), not a number.
- The crunch now comes at 2:30–3:00, a minute before "chaos by minute 4".
- After 5:00 a surviving build fights about 70 enemies at 18/s with the golem; runs last 0–100 s more.
