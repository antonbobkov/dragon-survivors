# Damage calculator: floor, ceiling and pressure per minute

Date: 2026-11-26 · Task: T-020 · Instrument: [`tools/dps.mjs`](../../tools/dps.mjs) ([how it works](../../tools/dps.md)) · Code: main at `6e6be02` plus T-020 (no game numbers changed) · Frozen: a re-run is a new dated report.

## Summary

The calculator models every weapon's damage from formulas and checks each model against the real sim: **57 of 57 check cases within ±15%** (most within ±5%). Run on the current game, it says:

1. **Proc stacking on fireballs dwarfs everything else.** Explode 3 + Split 3 + Pierce 3 + Area 3 turns a level-5 fireball from 20 into about 1,800 DPS in a dense crowd (measured in the sim: 1,812). The mini tower carries the same procs. From 3:00 every ceiling is this one build, at 9–12× the pressure.
2. **The mini tower at L5 out-shoots the fireball it copies.** It fires 8.75 fireball shots per second against the dragon's 5. That makes it the best single-target weapon (35 DPS with a level-5 fireball) and the ceiling's first pick from 1:30 to 2:30.
3. **The laser is the weakest weapon at every level and in every role.** At L5 it does 6 DPS on a single target, against the fireball's 20 and the bite's 18. Its arcane matchups don't save it.
4. **Ooze is the wall, and levels come too late.** At the bots' measured levels, the floor covers 0.39–0.62 of the pressure from 1:00 to 1:30. At level 1, even the best possible build is below the pressure at 1:00, so that minute is flagged unwinnable. A slime spawn is 7 bodies, so it costs at least 7 hits whatever the damage.
5. **The late game is trivial and level-ups run out.** From 3:30, even a naive build covers 1.06–1.38× the pressure. A full build costs 31 level-ups (level 32), which the surviving bots reach by about 3:30. After that, every level-up offers only Repair.

## Method

`node tools/dps.mjs` (defaults: about 11 s) and `node tools/dps.mjs --check` (about 45 s). The full list of models and assumptions is in [tools/dps.md](../../tools/dps.md). In short:

- **The field.** Enemies form a Poisson field of static enemies within 350 px of the dragon. The number near the dragon is spawn rate × 6 s, at least 5: the enemies that arrive within six seconds. Aimed weapons aim at the nearest enemy, as the bots do.
- **Damage.** It is effective damage: the HP removed, after Might, the damage function's rounding, resistances and overkill. A slime counts as its 7 bodies, a ghost knight brings its ghost, and a mage brings one cast of 4 skeletons. Hits land on bodies in proportion to spawn rate × HP.
- **Pressure.** HP spawned per second, with tier multipliers and stampede horses at their average rate.
- **Levels.** The median level of the naive bots still standing (aim+naive and kite+naive, seeds 1..48), measured on this build: 1, 1, 4, 9, 14, 23, 32, 41, 49, 60 at 0:30 … 5:00. After 2:30 only 3–10 runs per bot were still standing, so those points are thin. The table also prints the "XP bound": the level every gem spawned so far would give.
- **Floor.** The median of 64 naive builds (card 0 of the real card pool).
- **Ceiling.** The best build the same picks can buy, as if every card were offered. It comes from a beam search plus an exhaustive search of builds with every item at its top level. A beam alone missed the proc build: Pierce reaches fireballs only at L3, so no single pick toward that build pays.
- **Check.** Each case runs a real `Game` with only the weapon and its buffs, and dummies (HP 10⁹, held in place) in a 400 px disk around a still dragon aiming at the nearest. The dummies are redrawn every 1.5–4.5 s, the first second of each layout is not counted, and 300 s are counted per case. Seed-to-seed noise is about ±5% (±6% for the one-sided left claw).

Two model corrections came out of the check while it was being built: an explosion near the shooter must miss the empty disk around it (nothing is nearer than the aimed target), and a still dragon's one-sided claw faces its aim. The check itself had to randomise layout lengths, because fixed windows locked in phase with cooldowns (the saw's 3 s).

## `--check`: models against the sim

Crowd: 1 dummy per 2,500 px². Sparse: 1 per 15,000 px². Buff sets:

- stat: Might 2, Haste 1, Area 1, Amount 1.
- proc: Explode 3, Split 2, Pierce 3, Velocity 1.
- reach: Velocity 2, Duration 2, Area 2, Haste 2.
- ceiling: Explode 3, Split 3, Pierce 3, Area 3.

The mini tower's shots are level-1 fireballs here, because no fireball is in the case.

| Weapon | L | Buffs | Field | Dummy | Model DPS | Measured DPS | Error | OK |
|---|---|---|---|---|---|---|---|---|
| fireball | 1 | none | crowd | horse | 2.22 | 2.19 | -1.5% | yes |
| fireball | 1 | stat | crowd | horse | 7.41 | 7.54 | 1.9% | yes |
| fireball | 1 | proc | crowd | horse | 58.49 | 52.80 | -9.7% | yes |
| fireball | 1 | none | sparse | horse | 2.22 | 2.20 | -1.2% | yes |
| fireball | 5 | none | crowd | horse | 20.00 | 19.91 | -0.5% | yes |
| fireball | 5 | stat | crowd | horse | 44.44 | 44.37 | -0.2% | yes |
| fireball | 5 | proc | crowd | horse | 559.52 | 530.02 | -5.3% | yes |
| fireball | 5 | none | sparse | horse | 18.92 | 19.60 | 3.6% | yes |
| laser | 1 | none | crowd | horse | 0.71 | 0.71 | -0.3% | yes |
| laser | 1 | stat | crowd | horse | 3.17 | 3.15 | -0.9% | yes |
| laser | 1 | proc | crowd | horse | 5.16 | 5.32 | 3.0% | yes |
| laser | 1 | none | sparse | horse | 0.71 | 0.72 | 0.3% | yes |
| laser | 5 | none | crowd | horse | 6.00 | 6.00 | -0.0% | yes |
| laser | 5 | stat | crowd | horse | 16.67 | 16.52 | -0.9% | yes |
| laser | 5 | proc | crowd | horse | 43.93 | 42.53 | -3.2% | yes |
| laser | 5 | none | sparse | horse | 6.00 | 6.08 | 1.3% | yes |
| miniTower | 1 | none | crowd | horse | 2.33 | 2.31 | -1.1% | yes |
| miniTower | 1 | stat | crowd | horse | 6.67 | 6.76 | 1.3% | yes |
| miniTower | 1 | proc | crowd | horse | 61.13 | 65.64 | 7.4% | yes |
| miniTower | 1 | none | sparse | horse | 2.33 | 2.40 | 2.9% | yes |
| miniTower | 1 | reach | crowd | horse | 2.92 | 2.98 | 2.2% | yes |
| miniTower | 5 | none | crowd | horse | 17.50 | 17.43 | -0.4% | yes |
| miniTower | 5 | stat | crowd | horse | 32.50 | 32.81 | 1.0% | yes |
| miniTower | 5 | proc | crowd | horse | 458.49 | 444.90 | -3.0% | yes |
| miniTower | 5 | none | sparse | horse | 17.50 | 17.75 | 1.4% | yes |
| miniTower | 5 | reach | crowd | horse | 24.38 | 24.44 | 0.3% | yes |
| ring | 1 | none | crowd | horse | 9.67 | 9.76 | 0.9% | yes |
| ring | 1 | stat | crowd | horse | 26.10 | 25.85 | -1.0% | yes |
| ring | 5 | none | crowd | horse | 69.70 | 67.81 | -2.7% | yes |
| ring | 5 | stat | crowd | horse | 103.41 | 103.41 | 0.0% | yes |
| leftClaw | 1 | none | crowd | horse | 4.84 | 5.15 | 6.3% | yes |
| leftClaw | 1 | stat | crowd | horse | 20.95 | 22.93 | 9.5% | yes |
| leftClaw | 5 | none | crowd | horse | 45.12 | 48.02 | 6.4% | yes |
| leftClaw | 5 | stat | crowd | horse | 188.00 | 197.29 | 4.9% | yes |
| rightClaw | 1 | none | crowd | horse | 3.64 | 3.65 | 0.3% | yes |
| rightClaw | 1 | stat | crowd | horse | 11.88 | 11.66 | -1.9% | yes |
| rightClaw | 5 | none | crowd | horse | 37.23 | 36.86 | -1.0% | yes |
| rightClaw | 5 | stat | crowd | horse | 80.05 | 79.36 | -0.9% | yes |
| dualClaw | 1 | none | crowd | horse | 141.64 | 140.15 | -1.1% | yes |
| dualClaw | 1 | stat | crowd | horse | 528.95 | 515.55 | -2.5% | yes |
| bite | 1 | none | crowd | horse | 4.95 | 5.08 | 2.8% | yes |
| bite | 1 | stat | crowd | horse | 16.52 | 16.77 | 1.5% | yes |
| bite | 5 | none | crowd | horse | 17.98 | 17.96 | -0.1% | yes |
| bite | 5 | stat | crowd | horse | 57.75 | 57.60 | -0.3% | yes |
| saw | 1 | none | crowd | horse | 6.21 | 6.40 | 3.1% | yes |
| saw | 1 | stat | crowd | horse | 23.13 | 23.31 | 0.8% | yes |
| saw | 1 | reach | crowd | horse | 13.34 | 13.51 | 1.2% | yes |
| saw | 5 | none | crowd | horse | 75.03 | 77.11 | 2.8% | yes |
| saw | 5 | stat | crowd | horse | 195.57 | 199.64 | 2.1% | yes |
| saw | 5 | reach | crowd | horse | 153.21 | 152.13 | -0.7% | yes |
| fireball | 5 | ceiling | crowd | horse | 1913.75 | 1812.18 | -5.3% | yes |
| fireball | 5 | ceiling | sparse | horse | 125.28 | 123.95 | -1.1% | yes |
| miniTower | 5 | ceiling | crowd | horse | 1528.12 | 1474.45 | -3.5% | yes |
| miniTower | 5 | ceiling | sparse | horse | 94.60 | 93.61 | -1.1% | yes |
| fireball | 1 | none | crowd | slime | 3.33 | 3.28 | -1.5% | yes |
| laser | 1 | none | crowd | mage | 0.71 | 0.71 | -0.3% | yes |
| leftClaw | 1 | none | crowd | knight | 5.24 | 5.66 | 8.0% | yes |

The fireball's proc cases sit 4–10% under the model on every seed tried (1–3). The model is slightly generous with heavy procs; no other case shows a bias beyond its noise.

## Per minute

| t | Stage | Spawn/s | Pressure HP/s | Near | Level (XP bound) | Floor DPS | Ceiling DPS | Floor / P | Ceiling / P | Flag | Ceiling build |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0:30 | Muster | 0.50 | 1.2 | 5.0 | 1 (2) | 1.6 | 1.6 | 1.33 | 1.33 |  | fireball 1 |
| 1:00 | Ooze | 0.60 | 3.2 | 5.0 | 1 (4) | 2.0 | 2.0 | 0.62 | 0.62 | unwinnable | fireball 1 |
| 1:30 | Ooze | 1.55 | 7.4 | 9.3 | 4 (8) | 2.9 | 8.2 | 0.39 | 1.11 |  | fireball 1, miniTower 1 · amount 1, might 1 |
| 2:00 | Arcana | 2.50 | 12.5 | 15.0 | 9 (13) | 6.6 | 27.8 | 0.53 | 2.22 |  | fireball 1, miniTower 5 · haste 1, might 1, split 1 |
| 2:30 | Arcana | 6.25 | 38.0 | 37.5 | 14 (21) | 17.1 | 94.6 | 0.45 | 2.49 |  | fireball 1, miniTower 5 · amount 1, might 1, split 3, haste 3 |
| 3:00 | Haunt | 10.00 | 101.0 | 60.0 | 23 (32) | 68.5 | 929.6 | 0.68 | 9.20 |  | fireball 5, miniTower 5, ring 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 3:30 | Haunt | 13.00 | 153.2 | 78.0 | 32 (45) | 211.7 | 1689.0 | 1.38 | 11.03 |  | fireball 5, laser 5, miniTower 5, ring 5 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 4:00 | Siege | 16.00 | 240.0 | 96.0 | 41 (59) | 313.8 | 2733.4 | 1.31 | 11.39 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 4:30 | Siege | 17.00 | 254.9 | 102.0 | 49 (73) | 331.2 | 2991.1 | 1.30 | 11.74 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |
| 5:00 | Siege | 18.00 | 357.2 | 108.0 | 60 (86) | 377.0 | 3546.5 | 1.06 | 9.93 |  | fireball 5, miniTower 5, ring 5, dualClaw 1 · area 3, explode 3, split 3, pierce 3 (exhaustive) |

## Per stage

| Stage | Minutes | Pressure HP/s | Worst floor / P | Worst ceiling / P | Ceiling DPS by weapon (last minute) |
|---|---|---|---|---|---|
| Muster | 0:30 | 1.2 | 1.33 | 1.33 | fireball 2 |
| Ooze | 1:00, 1:30 | 3.2, 7.4 | 0.39 | 0.62 | fireball 5, miniTower 4 |
| Arcana | 2:00, 2:30 | 12.5, 38.0 | 0.45 | 2.22 | miniTower 80, fireball 15 |
| Haunt | 3:00, 3:30 | 101.0, 153.2 | 0.68 | 9.20 | miniTower 1014, fireball 583, ring 49, laser 43 |
| Siege | 4:00, 4:30, 5:00 | 240.0, 254.9, 357.2 | 1.06 | 9.93 | miniTower 2117, fireball 1216, dualClaw 125, ring 89 |

### Sensitivity

The shape holds under the two assumptions most open to question. Ratios are floor / pressure and ceiling / pressure.

| t | Default | Crowd twice as dense (`--view-time 12`) | Levels at the XP bound (`--levels 2,4,8,13,21,32,45,59,73,86`) |
|---|---|---|---|
| 0:30 | 1.33 / 1.33 | 1.33 / 1.33 | 1.47 / 2.66 |
| 1:00 | 0.62 / 0.62 | 0.62 / 0.62 | 0.86 / 2.35 |
| 1:30 | 0.39 / 1.11 | 0.43 / 1.14 | 0.70 / 3.55 |
| 2:00 | 0.53 / 2.22 | 0.65 / 2.45 | 0.75 / 4.18 |
| 2:30 | 0.45 / 2.49 | 0.66 / 4.95 | 0.95 / 7.67 |
| 3:00 | 0.68 / 9.20 | 1.04 / 27.86 | 1.57 / 9.76 |
| 3:30 | 1.38 / 11.03 | 1.98 / 30.59 | 1.62 / 11.26 |
| 4:00 | 1.31 / 11.39 | 2.25 / 28.71 | 1.31 / 11.39 |
| 4:30 | 1.30 / 11.74 | 2.19 / 28.98 | 1.30 / 11.74 |
| 5:00 | 1.06 / 9.93 | 1.74 / 23.72 | 1.06 / 9.93 |

A denser crowd helps every area weapon, and the proc build above all. Higher levels close most of the Ooze gap: the floor reaches 0.70–0.86, but it is still below the pressure.

## Weapons per role (no buffs)

Single target: one knight-sized target where the weapon reaches it best, raw damage. Crowd: effective DPS in each stage's mid-minute field. The mini tower is ranked with a fireball at the same level, since its shots are the fireball's.

| Weapon | L | Single target DPS | Crowd Muster (0:30) | Crowd Ooze (1:30) | Crowd Arcana (2:30) | Crowd Haunt (3:30) | Crowd Siege (4:30) |
|---|---|---|---|---|---|---|---|
| dualClaw | 1 | 25.7 | 2.9 | 3.8 | 16.2 | 44.3 | 60.8 |
| ring | 5 | 11.7 | 1.8 | 2.3 | 11.6 | 33.8 | 53.0 |
| miniTower | 5 | 35.0 | 22.8 | 19.0 | 22.9 | 29.0 | 31.2 |
| saw | 5 | 10.0 | 1.5 | 2.0 | 9.4 | 26.1 | 39.1 |
| fireball | 5 | 20.0 | 9.5 | 7.8 | 12.9 | 16.6 | 17.8 |
| rightClaw | 5 | 12.9 | 1.8 | 2.3 | 7.7 | 16.0 | 18.6 |
| leftClaw | 5 | 5.6 | 0.9 | 1.2 | 5.8 | 15.5 | 22.7 |
| bite | 5 | 18.0 | 0.6 | 0.7 | 2.8 | 6.8 | 7.4 |
| ring | 1 | 2.0 | 0.3 | 0.5 | 2.2 | 5.7 | 8.3 |
| laser | 5 | 6.0 | 5.5 | 4.3 | 4.5 | 5.5 | 5.7 |
| saw | 1 | 1.3 | 0.2 | 0.2 | 1.0 | 2.8 | 4.0 |
| bite | 1 | 5.0 | 0.2 | 0.3 | 1.2 | 2.4 | 2.7 |
| miniTower | 1 | 2.3 | 1.6 | 2.0 | 2.1 | 2.4 | 2.5 |
| leftClaw | 1 | 1.5 | 0.2 | 0.3 | 1.0 | 2.3 | 3.1 |
| fireball | 1 | 2.2 | 1.6 | 1.9 | 2.0 | 2.3 | 2.3 |
| rightClaw | 1 | 3.6 | 0.7 | 0.8 | 1.8 | 2.2 | 2.3 |
| laser | 1 | 0.7 | 0.7 | 0.7 | 0.8 | 0.8 | 0.8 |

Ranked per role at the top level:

- **Single target:** mini tower 35, dual claw 25.7, fireball 20, bite 18, right claw 12.9, ring 11.7, saw 10, laser 6, left claw 5.6.
- **Crowd at Siege:** dual claw 60.8, ring 53, saw 39.1, mini tower 31.2, left claw 22.7, right claw 18.6, fireball 17.8, bite 7.4, laser 5.7.

## Hits to kill (plain tier, no buffs)

The slime column is the whole family (1 + 2 + 4 bodies).

| Weapon | L | Damage | Knight | Skeleton | Slime | Mage | Ghost knight | Ghost | Horse | Mounted knight |
|---|---|---|---|---|---|---|---|---|---|---|
| fireball | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| fireball | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| laser | 1 | 1 arcane | 3 | 1 | 11 | 4 | 10 | 1 | 2 | 15 |
| laser | 5 | 3 arcane | 1 | 1 | 7 | 2 | 4 | 1 | 1 | 8 |
| miniTower (fireball L1 shots) | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| miniTower (fireball L5 shots) | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| ring | 1 | 2 fire | 2 | 1 | 7 | 2 | 5 | 1 | 1 | 15 |
| ring | 5 | 4 fire | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| leftClaw | 1 | 2 physical | 2 | 1 | 11 | 2 | 5 | 2 | 1 | 30 |
| leftClaw | 5 | 5 physical | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |
| rightClaw | 1 | 4 physical | 1 | 1 | 8 | 1 | 4 | 2 | 1 | 15 |
| rightClaw | 5 | 9 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 6 |
| dualClaw | 1 | 9 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 6 |
| bite | 1 | 8 physical | 1 | 1 | 7 | 1 | 2 | 1 | 1 | 7 |
| bite | 5 | 18 physical | 1 | 1 | 7 | 1 | 1 | 1 | 1 | 4 |
| saw | 1 | 2 physical | 2 | 1 | 11 | 2 | 5 | 2 | 1 | 30 |
| saw | 5 | 5 physical | 1 | 1 | 7 | 1 | 3 | 1 | 1 | 10 |

## The five most striking imbalances (for T-029)

Each point gives the numbers and the levers it suggests; none was changed here.

1. **Proc stacking is multiplicative and decides the late game.**
   - Each hit can explode (rho × π(96 + r)² more hits with Area 3), split into two children that do the same, and pierce on. Measured in the sim with Explode 3, Split 3, Pierce 3 and Area 3, a level-5 fireball goes from 20 to 1,812 DPS (×90) in the crowd, and to 124 (×6) in the sparse field.
   - Every ceiling from 3:00 on is fireball 5 + mini tower 5 + those four buffs, at 9–12× the pressure. The other two weapon slots add under 10%.
   - It is all-or-nothing, because Pierce reaches fireballs only at L3 (D-7). A naive build rarely has it, so the floor and the ceiling are 8–14× apart from 3:00.
   - Levers: Split's recursion (children cannot explode, or gen ≥ 1 cannot split), the explosion radius under Area, Pierce's fire crossover.
2. **Mini tower L5 shoots faster than the fireball it copies.**
   - Four towers, each living 14 s and shooting every 0.4 s, one lobbed every 4 s: 8.75 shots/s, against the fireball L5's 3 shots per 0.6 s (5/s).
   - With a level-5 fireball it is the top single-target weapon (35 DPS), and its shots roll all the fireball's procs. It is the ceiling's pick from 1:30 to 2:30 in every variant.
   - Levers: `fireRate`, `maxActive` or `duration` at L4–5.
3. **The laser is dominated.**
   - At L5 (2 × 3 damage per 1.0 s) it does 6 DPS single target and about 5.7 in a crowd.
   - The ostensibly single-target weapons beat it 2–3× (bite 18, right claw 12.9), and so does the fireball (20). Arcane against plate does not close the gap: a mounted knight takes 8 laser hits against the bite's 4 and the right claw's 6.
   - It appears in a ceiling only as a filler in an empty fourth slot.
   - Levers: damage or cooldown at every level, or a base pierce chance (it never pierces without the buff).
4. **Ooze is a wall that levels reach too late.**
   - The pressure almost triples from 0:30 to 1:00 (1.2 → 3.2 HP/s), mostly slimes: 11 HP and 7 bodies per spawn, so at least 7 hits per spawn whatever the damage, and 11 with a level-1 physical weapon.
   - At the bots' levels, the floor covers 0.39–0.62 of the pressure from 1:00 to 1:30. At level 1, even the best build is below the pressure (0.62).
   - This matches the measured falls: 41 of 48 naive runs end to slimes, around 1:30–1:45.
   - Part of it is gem pickup: the bots are level 1 at 1:00 with 23 kills, because the gems drop where the fireball kills (300–420 px out). Collecting every gem would give level 4 by 1:00, which lifts the floor to 0.86 and the ceiling to 2.35.
   - Levers: the slime's weight or HP at 1:00, the XP curve's first levels, a pickup radius or gem drift toward the dragon.
5. **The late game is trivial, and level-ups run out.**
   - From 3:30 even the naive floor covers the pressure (1.06–1.38 by default, 1.7–2.3 in a denser crowd).
   - A full build costs 31 level-ups (level 32). The bots' survivors reach it by about 3:30, and the XP bound reaches 86 by 5:00, so the last 90 s of level-ups are Repair only.
   - The pressure grows 2.3× from 3:30 to 5:00 (153 → 357, the gold tier adding 40% at 5:00), while the ceiling is already 10× it.
   - This is the bimodal outcome T-016 measured: a run that gets past 3:00 takes almost no damage until the golem.
   - Levers: a steeper XP curve after level ~20, later or heavier silver/gold tiers, Siege spawn rates.

Also notable:

- **Melee weapons.** The dual claw is the strongest weapon alone (crowd 60.8 at Siege, 2.7× the left claw L5). The one-sided left claw at L1–2 and the bite are the weakest in crowds: the bite L5 does 18 DPS single target but 7.4 effective in a crowd, because its 18 damage overkills 1–3 HP bodies.
- **Area weapons.** The ring and the saw at L5 are the best area weapons without procs (53 and 39).

## Limits

- **Static crowd.** Enemies stand still in a Poisson field around a still dragon. Knockback is not modelled: in the game it pushes enemies out of the ring, claw and bite reach, so those models are upper bounds for a crowd the weapon keeps pushing.
- **Near-the-dragon assumption.** The default crowd (spawn rate × 6 s) is a judgement; the denser variant above shows how the numbers move with it.
- **Levels.** The level curve is the naive bots'. It is thin after 2:30, and the bots collect few early gems.
- **Ceiling.** "As if every card were offered": a real player at those levels is limited by the offers.
- **Not modelled.** Mage orbs, braziers and pickups, the golem and its poise.
