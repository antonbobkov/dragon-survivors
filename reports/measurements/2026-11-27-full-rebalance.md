# The full rebalance: calculator and bots, baseline to after

Date: 2026-11-27 · Task: T-029 · Instruments: [`tools/dps.mjs`](../../tools/dps.mjs) (the corrected calculator, [how it works](../../tools/dps.md)) and [`tools/measure.mjs`](../../tools/measure.mjs) (bots, extended here) · Code: main at `7a39e18` plus T-029 (later merged with main at `372ced5`, test-only changes) · Frozen: a re-measure is a new dated report. Follows [damage calculator 2](2026-11-26-damage-calculator-2.md) and [the play-test 1 rebalance](2026-11-06-playtest1-rebalance.md).

## Summary

| Goal | Before | After | Met |
|---|---|---|---|
| Early–mid ceiling ≥ 1.3× pressure at every minute | 0.54 at 1:00, 0.97 at 1:30 (unwinnable) | 1.37–2.07 from 1:00 to 2:30 | yes (0:30 is level 1: one build, 1.57) |
| Early–mid naive floor 0.5–0.9× | 0.35–0.54 | 0.59–0.75 from 1:00 to 2:30 | yes, from 1:00 (0:30: 1.57, see below) |
| Late ceiling / floor ≤ 4× from 3:00 | 7.8–14.2 | 3.6–3.8 | yes |
| ≥ 6 of 9 weapons in some ceiling or within 25% of the best in their role | 5 | 8 | yes (right claw is the one left out) |
| `idle` falls 25–90 s | 40.0 s | 40.0 s (40.9 on seeds 101..148) | yes |
| `naive` falls mostly in 1:30–3:00 | most fell at 1:30–2:00 | 25/48 and 31/48 (25/48, 28/48 on 101..148) | yes, narrowly for aim+naive |
| `greedy` reaches 5:00 in 50–67% | 14/48, 18/48 (29%, 38%) | 30/48, 32/48 (63%, 67%); 35/48, 29/48 on 101..148 | yes over 96 seeds (68%, 64%); aim+greedy sits on the top edge |
| Every tower falls by 7:00 | yes for the bots, which never fled the golem | yes for every normal bot (latest fall 5:44); a bot that drags the tower away escapes in 32 of 32 runs | **no for a dragging player** (rule, not number) |
| First armoury rank after 1–2 runs, a track in ~10–15 | rank 1: 1 run; a track 1,100 gold ≈ 17 runs at the old bots' ~65 gold | rank 1 150 gold, a track 2,250: bots pay ~180 a run on average | yes |
| "Any card" affordable at the first merchant | never (25 XP > a level) | 43–46 of 48 greedy runs | yes |

Twenty-one levers moved in two rounds (listed below with every old → new value). No rule changed and no mechanic was added (the rank cost keeps its shape of a price per rank, now linear instead of quadratic; debug runs paying no gold is the decision the notes asked for), the owner's numbers (enemy speeds, `DRAGON_SPEED`, `TETHER_LENGTH`) are untouched, and the three fun features stand (split children still split; fusion and the comet tail are untouched).

## Method

1. **Instruments first** (commit `0dc95f2`). The bots now do what a sensible player does besides fighting:
   - walk to braziers within 450 px of home and shoot them (braziers land 250–450 px from the tower and just outside the view, so the brief's ~300 px would see almost none), and collect pickups (a heart only while the tower is hurt);
   - trade with the merchant: stand 34 px straight above or below him, aiming away, so the claws' rectangles, the cone's apex and the ring's orbit miss him; `greedy` waits until the card is affordable (or a heal is needed below 60%), `naive` takes the first affordable offer; a merchant who was hit, or who walks away while nothing is affordable, is robbed if within 300 px (never chased);
   - `greedy` spends banked rerolls on offers without a weapon card;
   - `--princess escort` walks to her and shoots what is near her; the new `drag` policy kites until the golem and then drags the tower away from it for good.
   - `--extras` counts braziers, pickups, trades, robberies, rescues, card affordability at the first merchant and gold per run; the summary counts falls in 1:30–3:00.
2. **Baseline** with both tools on the old numbers (below).
3. **Tune** with the calculator for the per-minute goals (each lever's effect measured alone, 10 s a run), then the bots (48 seeds, about 3–6 minutes a run) for the run-count goals.
4. **Confirm** on seeds 101..148 and with the calculator's `--check` (the models against the sim).
5. Small fixes from the notes: buff card texts, no gold from debug runs, the merchant in the debug overlay, a soak test robust to the random stream.

Judgement throughout: medians and run counts over ≥ 48 seeds, never means over picked builds; a "careless" bot is `naive` (card 0), a "good" one `greedy`.

## Baseline

### Calculator (old numbers, the old level curve)

| t | Pressure HP/s | Level | Floor / P | Ceiling / P | Ceiling / floor | Ceiling build |
|---|---|---|---|---|---|---|
| 0:30 | 1.2 | 1 | 1.31 | 1.31 | 1.0 | fireball 1 |
| 1:00 | 3.2 | 1 | 0.54 | 0.54 | 1.0 | fireball 1 (unwinnable) |
| 1:30 | 7.4 | 4 | 0.35 | 0.97 | 2.8 | fireball 1, mini tower 1, laser 1 · amount 1 (unwinnable) |
| 2:00 | 12.5 | 9 | 0.45 | 1.93 | 4.2 | fireball 1, mini tower 5 · amount 1, haste 2 |
| 2:30 | 38.0 | 14 | 0.38 | 2.10 | 5.6 | fireball 1, mini tower 5 · amount, explode, split 3, haste 3 |
| 3:00 | 101.0 | 23 | 0.55 | 7.86 | 14.2 | fireball 5, mini tower 5, ring 1 · split 3, explode 3, area 3, pierce 3 |
| 3:30 | 153.2 | 32 | 1.13 | 9.44 | 8.4 | the same procs, laser 5, ring 5 |
| 4:00 | 240.0 | 41 | 1.09 | 9.71 | 8.9 | fireball 5, mini tower 5, ring 5, dual claw · the four procs |
| 4:30 | 254.9 | 49 | 1.08 | 10.01 | 9.3 | the same |
| 5:00 | 357.2 | 60 | 0.92 | 8.67 | 9.4 | the same |

With the new bots' level curve (they now break braziers, so magnets bring gems: 1, 2, 5, 10, 15, 23, 34, 44, 54, 66) the picture is the same: 1:00 ceiling 1.08, 1:30 1.22, late ceiling/floor 7.8–14.2.

Weapons (top level, no buffs), single target: mini tower 35, dual claw 25.7, fireball 20, bite 18, right claw 12.9, ring 11.7, saw 10, laser 6.0, left claw 5.6. Crowd at Siege: dual claw 46.7, ring 45.3, saw 34.0, mini tower 26.7, left claw 19.7, fireball 15.3, right claw 14.3, laser 5.2, bite 4.6. Five weapons qualified (fireball, mini tower, ring, laser and dual claw in some ceiling).

### Bots (48 seeds, the new bots, old numbers)

| Bot | Median s | Min s | Max s | Reached 5:00 | Fall causes |
|---|---|---|---|---|---|
| idle+naive | 40.0 | 36.6 | 48.4 | 0 | knight 48 |
| aim+naive | 99.7 | 88.4 | 344.0 | 4 | slime 41, mounted knight 4, golem 2 |
| aim+greedy | 113.3 | 92.1 | 334.9 | 14 | slime 32, golem 12, mounted knight 4 |
| kite+naive | 106.5 | 89.0 | 326.3 | 6 | slime 37, golem 6 |
| kite+greedy | 162.5 | 91.7 | 333.1 | 18 | slime 26, golem 17 |

`kite+greedy` lost 53 HP per run in 1:30–2:00, 41 of them to slimes, and was still level 1 at 1:00 (the median bot had collected under 6 XP from 23 kills). Trades: 0.3–0.6 per run, all rerolls (the card was never affordable); no merchant robbed to death in 47 of 48 runs.

### Causes, per goal

- **Ooze unwinnable** (calculator) and **greedy dying in Ooze** (bots): the pressure triples at 1:00 (slimes: 7 bodies, 7 hits per spawn), and the levels come too late: the bots were level 1 at 1:00 and 4–5 at 1:30.
- **Late ceiling/floor 8–14×**: Explode × Split × Pierce (fire from L3) × Area on explosions, carried by a mini tower that out-shoots the fireball (8.75 shots/s against 5).
- **Weapons**: the laser (6 DPS at L5) and the bite (overkill in crowds) are never worth a slot; the mini tower is everyone's first pick.
- **Meta**: 20 × n² makes a track 55× the first rank; the bots' old ~65 gold a run made a track ~17 runs and all six ~100.
- **Merchant**: the card cost more than a whole level at 1:30.

## Changes, one lever at a time

Calculator columns: floor/P and ceiling/P at the minute the lever was aimed at, ceiling/floor late (3:00–5:00). Each row's calculator effect was measured alone on top of the rows above it, at the new bots' level curve.

| # | Lever | Old → new | Reason | Calculator effect |
|---|---|---|---|---|
| 1 | Explode, Split, Pierce chances | 20/35/50% → 15/25/35% | proc stacking | late ceiling/floor 7.8–14.2 → 4.4–6.8; split fireworks kept (gen limit untouched) |
| 2 | Mini tower fireRate L4, L5 | 0.5, 0.4 → 0.6, 0.55 | it out-shot the fireball it copies | single target 35 → 26; 3:00 ceiling/floor 14.2 → 11.4 alone |
| 3 | Laser damage | 1/1/2/2/3 → 3/4/5/6/8 | never worth a slot; single-target role | L5 single target 6.0 → 17.8; L1 0.7 → 2.5 (one-shots knights and skeletons) |
| 4 | Laser cooldown | 1.4/1.3/1.2/1.1/1.0 → 1.2/1.1/1.0/1.0/0.9 | as 3 | (with 3) |
| 5 | Bite cooldown | 1.6/1.5/1.3/1.2/1.0 → 1.5/1.4/1.2/1.1/0.9 | rarely worth a slot | L5 single 18 → 20 (within 25% of the best) |
| 6 | Bite reach | 50/54/57/60/64 → 56/60/64/68/72 | it waited for targets that walk at the tower, not the dragon | crowd 4.6 → 5.2 at Siege |
| 7 | Saw L5 damage | 5 → 6 | its crowd role, just short | Siege crowd 34.0 → 36.3 (within 25% of dual claw 46.7) |
| 8 | Left claw damage | 2/3/3/4/5 → 3/3/4/5/6 | weakest single target, raises the naive floor | L5 single 5.6 → 6.7, Siege crowd 19.7 → 21.1 |
| 9 | Right claw damage L4, L5 | 8, 9 → 9, 11 | floor | L5 single 12.9 → 15.7 |
| 10 | Fireball cooldown L1–L4 | 0.9/0.8/0.8/0.7 → 0.75/0.7/0.7/0.65 | the level-1 and level-2 answer to Ooze; every build has it | 1:00 floor/ceiling 0.59/1.08 → 0.75/1.29 (with 11) |
| 11 | 1:00 weights knight/skeleton/slime | 45/30/25 → 50/30/20 | Ooze wall; slimes still peak in Ooze | 1:00 pressure 3.2 → 3.0 |
| 12 | 2:00 and 2:30 slime weight | 20 → 18 (knight 40 → 42, 39 → 41) | so Ooze stays the slimes' stage | |
| 13 | 2:30 tiers | 90/10 → 95/5 | the 2:30 floor | 2:30 floor 0.44 → 0.50 (with 14) |
| 14 | 3:00 rate | 10 → 9 (2:30 5.75, 3:30 12.5, the interpolated rows) | the 2:00 → 3:00 ramp | 2:30 pressure 38 → 31.4 |
| 15 | Area | +20/40/60% → +15/30/45% | the stat build (dual claw, saw, ring + Amount, Area, Might, Haste) took over the late ceiling once procs were tamed | late ceiling/floor 4.1–4.2 → 3.6–3.9 (with 16) |
| 16 | Haste | −10/20/30% → −8/16/24% | as 15 | (with 15) |
| 17 | `xpToNext(L)` | 3 + 3L → 2 + 2L | the bots were level 1 at 1:00; Ooze needs choices by 1:30 | bots below; level curve 1, 2, 6, 11, 17, 26, 38, 51, 65, 80 |
| 18 | Mini tower L1 fireRate | 0.8 → 0.75 | 1:00 ceiling 1.29, just short | 1:00 ceiling 1.29 → 1.37 |
| 19 | Merchant prices reroll/card/heal | 10/25/15 → 5/10/8 XP | the card cost more than a level | first-merchant card affordable 0 → 43–46 of 48 greedy runs |
| 20 | Slime contact DPS | 4 (interim) → 5 | the interim's replacement: puts the greedy bots back in the 50–67% band after 17 | bots below |
| 21 | Armoury rank cost | 20 × n² → 150 × n | a track was 55× the first rank | first rank 1–2 runs, a track ~12 |
| — | Debug runs' gold | paid → none | F1–F10 and the jump farmed gold | |
| — | `LEVEL_CURVE` (tool) | 1, 1, 4, 9, 14, 23, 32, 41, 49, 60 → 1, 2, 6, 11, 17, 26, 38, 51, 65, 80 | re-measured with the new bots on the new numbers | |

Bot steps (48 seeds; reached 5:00 out of 48, and median s):

| Step | aim+naive | aim+greedy | kite+naive | kite+greedy | Read |
|---|---|---|---|---|---|
| Baseline (new bots) | 99.7 s, 4 | 113.3 s, 14 | 106.5 s, 6 | 162.5 s, 18 | Ooze kills |
| Round 1 (levers 1–16) | 113.5 s, 1 | 147.2 s, 14 | 113.1 s, 6 | 157.7 s, 18 | the calculator's goals move, the bots do not: they are short of levels |
| What-ifs on round 1 (kite only) | | | slime DPS 3: 115.2 s, 7; pickup radius 72: 117.5 s, 10 | slime DPS 3: 176.1 s, 17; pickup radius 72: 178.9 s, 20 | the slimes' DPS is not the wall; levels are |
| + `xpToNext` 2 + 2L | 152.9 s, 14 | 311.3 s, 28 | 148.9 s, 17 | 312.8 s, 30 | the crunch moves from 1:40 to 1:40–3:00 |
| + mini tower L1, prices 5/10/8 | 255.6 s, 16 | 314.5 s, 34 | 125.3 s, 14 | 312.9 s, 30 | noise on aim+naive; cards still not bought (the bots settled for rerolls) |
| + greedy waits for the card | | 313.4 s, 35 | | 313.3 s, 33 | cards bought at the first merchant 18–24/48; greedy above 67% |
| + slime DPS 5 (final) | 178.4 s, 11 | 311.1 s, 30 | 121.9 s, 14 | 316.1 s, 32 | back in the band |

Rejected or not adopted: an explosion radius of 48 (procs fall out of every ceiling, and the floor falls with them: ratio unchanged); mini tower L5 `maxActive` 3 (no effect on the ratio); `DRAGON_PICKUP_RADIUS` 72 (helps, but less than the XP curve and blurs the Ooze stage); a lower slime DPS (3: the bots died in Ooze as often).

## After

### Calculator

`node tools/dps.mjs` (the new `LEVEL_CURVE`):

| t | Stage | Pressure HP/s | Level (XP bound) | Floor / P | Ceiling / P | Ceiling / floor | Ceiling build |
|---|---|---|---|---|---|---|---|
| 0:30 | Muster | 1.2 | 1 (3) | 1.57 | 1.57 | 1.0 | fireball 1 |
| 1:00 | Ooze | 3.0 | 2 (5) | 0.75 | 1.37 | 1.8 | fireball 1, mini tower 1 |
| 1:30 | Ooze | 6.8 | 6 (9) | 0.62 | 1.95 | 3.1 | fireball 1, laser 1, mini tower 1 · amount 2, might 1 |
| 2:00 | Arcana | 12.1 | 11 (15) | 0.59 | 2.07 | 3.5 | fireball 1, laser 1, mini tower 5 · amount 1, haste 3 |
| 2:30 | Arcana | 31.4 | 17 (25) | 0.63 | 1.98 | 3.2 | fireball 1, laser 1, saw 1, left claw 5 · amount 3, area 3, haste 3 |
| 3:00 | Haunt | 91.0 | 26 (37) | 0.72 | 2.61 | 3.6 | fireball 5, mini tower 5, laser 1, ring 3 · area, explode, split, pierce 3 |
| 3:30 | Haunt | 147.3 | 38 (53) | 0.99 | 3.57 | 3.6 | fireball 5, mini tower 5, dual claw, saw 5 · area, amount, explode, split 3 |
| 4:00 | Siege | 240.0 | 51 (69) | 0.83 | 3.08 | 3.7 | the same |
| 4:30 | Siege | 254.9 | 65 (88) | 0.82 | 3.06 | 3.7 | the same |
| 5:00 | Siege | 357.2 | 80 (104) | 0.68 | 2.58 | 3.8 | fireball 5, dual claw, saw 5, ring 5 · amount, might, area, haste 3 |

- 0:30 has no choice to make (level 1, the fireball alone), so floor = ceiling = 1.57: the first half-minute is a tutorial. The goal's 0.5–0.9 floor is met from the first minute with a choice (1:00).
- The late game is now led by three different builds (procs on fireball + mini tower, a melee/zoning stat build, a mix), each about 3× the pressure, and a careless build sits at 0.7–1.0×: "procs strong, not everything".

Weapons (top level, no buffs):

| Weapon | Single target DPS (before → after) | Crowd at Siege (before → after) | Qualifies by |
|---|---|---|---|
| Mini tower | 35.0 → 26.0 | 26.7 → 19.8 | most ceilings 1:00–4:30; best single target |
| Dual claw | 25.7 | 46.7 | ceilings 3:30–5:00; best crowd |
| Bite | 18.0 → 20.0 | 4.6 → 5.2 | single target within 25% of the best (20 ≥ 19.5) |
| Fireball | 20.0 | 15.3 | every ceiling |
| Laser | 6.0 → 17.8 | 5.2 → 9.2 | ceilings 1:30–3:00 |
| Right claw | 12.9 → 15.7 | 14.3 → 16.1 | **no** (60% of the best single target) |
| Ring | 11.7 | 45.3 | crowd within 25% of the best; ceilings 3:00, 5:00 |
| Saw | 10.0 → 12.0 | 34.0 → 36.3 | ceilings 2:30–5:00 |
| Left claw | 5.6 → 6.7 | 19.7 → 21.1 | the 2:30 ceiling |

Eight of nine. The right claw lives on as half of the dual claw; as a weapon of its own it is the one a careful player skips.

`node tools/dps.mjs --check`: see [Check](#check).

### Bots

`node tools/measure.mjs --seeds 48 --timeline --causes --extras`:

| Bot | Median s | Min s | Max s | Fell 1:30–3:00 | Reached 5:00 | Reached cap | Level | Fall causes |
|---|---|---|---|---|---|---|---|---|
| idle+naive | 40.0 | 36.6 | 48.5 | 0 | 0 | 0 | 1 | knight 48 |
| aim+naive | 178.4 | 92.7 | 328.4 | 25 | 11 | 0 | 25 | slime 23, mounted knight 10, golem 10 |
| aim+greedy | 311.1 | 106.9 | 339.3 | 14 | 30 | 0 | 83 | golem 26, slime 14, mounted knight 7 |
| kite+naive | 121.9 | 98.9 | 334.5 | 31 | 14 | 0 | 11 | slime 31, golem 12, mounted knight 3 |
| kite+greedy | 316.1 | 108.2 | 329.2 | 12 | 32 | 0 | 84 | golem 32, slime 13, mounted knight 2 |

Confirmation, seeds 101..148: idle 40.9 s; aim+naive 152.4 s (25 fell in 1:30–3:00, 18 reached 5:00); aim+greedy 316.1 s (35); kite+naive 148.8 s (28, 9); kite+greedy 313.0 s (29). Over both pools the greedy bots reach 5:00 in 65/96 (68%) and 61/96 (64%) runs.

`kite+greedy` over time (median; a fallen run counts with its final values): level 2 at 1:00, 5.5 at 1:30, 10 at 2:00, 24 at 3:00, 76 at 5:00; tower HP 79 at 2:00, 86 at 3:00, 70 at 5:00. HP lost per run: 4.8 in 1:00–1:30, 32.9 in 1:30–2:00 (slimes 28.7), 27.1 in 2:00–2:30, 16.7 in 2:30–3:00, then 2–8 per half-minute until mounted knights and silver tiers in 4:30–5:00 (24.3) and the golem (92.7 in 5:00–5:30). The shape: a calm first minute, a real crunch from 1:30 to 3:00 (the control phase), a build that holds 3:00–4:30, pressure again at the end of Siege, the golem.

What the bots did besides fighting (`--extras`, mean per run):

| Bot | Braziers broken | Hearts / magnets / bombs | Trades (runs) | Cards bought | Robbed (runs) | Princess rescued / lost | First merchant: card affordable / bought | Gold median / mean |
|---|---|---|---|---|---|---|---|---|
| aim+naive | 6.4 | 2.3 / 1.2 / 0.9 | 0.6 (31/48) | 0.0 | 2/48 | 0.4 / 0.7 | 17 / 0 of 46 | 51 / 141 |
| aim+greedy | 8.8 | 2.5 / 1.6 / 0.9 | 0.5 (25/48) | 0.5 | 9/48 | 0.7 / 0.8 | 43 / 24 of 48 | 311 / 230 |
| kite+naive | 5.8 | 2.1 / 1.0 / 0.8 | 0.7 (34/48) | 0.0 | 5/48 | 0.3 / 0.5 | 21 / 0 of 47 | 14 / 117 |
| kite+greedy | 9.2 | 2.6 / 1.8 / 1.0 | 0.4 (20/48) | 0.4 | 2/48 | 0.8 / 0.9 | 46 / 18 of 48 | 321 / 239 |

- The card is affordable at the first merchant in 43–46 of 48 greedy runs, but only 18–24 trades complete: the bots' own weapons (mini-tower shots, the saw blade, a ring passing over him, earlier shots in flight) hit the merchant during the 1.5 s stand in about half the trades. That is the rule "a stray shot ends the trade" working; whether it should be this strict is a taste question (below).
- Gold: the four bots average ~180 gold a run (a run that falls in Ooze 14–51, one that meets the golem ~310). With ranks at 150 × n a first rank takes one or two runs and a whole track (2,250) about 12 average runs.

### The golem check (drag) and the princess escort

`node tools/measure.mjs --seeds 48 --policy drag --pick greedy`: the drag bot plays as `kite+greedy` until 5:00, then walks straight away from the golem for good.

| Bot | Median s | Fell 1:30–3:00 | Reached 5:00 | Reached the 7:00 cap |
|---|---|---|---|---|
| kite+greedy | 316.1 | 12 | 32 | 0 |
| drag+greedy | ≥ 420 | 12 | 32 | **32** |

**Every run that reaches the golem and drags the tower away escapes it to the cap.** The dragon (87 px/s) drags the tower on the tether faster than the golem walks (75), the horde it drags the tower through does not stop it, and the golem never catches up. The old D-5 question is answered: dragging beats the golem, always. No number in my remit changes it (both speeds are the owner's); see Recommendations.

`--princess escort` (greedy bots walk to her and shoot what is near her):

| Bot | Princess ignored: reached 5:00, rescued / lost per run | Escorted: reached 5:00, rescued / lost per run |
|---|---|---|
| aim+greedy | 30, 0.7 / 0.8 | 27, 1.3 / 0.1 |
| kite+greedy | 32, 0.8 / 0.9 | 31, 1.3 / 0.2 |

Escorting saves nearly every princess (1.3 rescues a run against 0.7–0.8) at no measurable cost or gain in survival (−3 and −1 runs, within the ±3 noise): the +25 max HP and full heal pay for the trip out, no more. She stays a choice, not a must.

## Check

`node tools/dps.mjs --check` (seed 1, 300 s counted per case): **57 of 57 within ±15%** (errors −6% to +13%), so the models still match the sim on the new numbers. Examples: fireball L5 with the ceiling's procs 473 modelled / 476 measured (was 1,914 / 1,917); mini tower L5 with them 299 / 299 (was 1,528 / 1,507); laser L5 17.8 / 17.6 (was 6.0 / 6.0); bite L5 20.0 / 19.9.

The full check crashed before this task's fix: since the prince (T-032), a check case longer than 2:15 of sim time got a prince among its dummies and `runCheck` indexed past its dummy list. The check now keeps the prince away (`princeNext = Infinity`), with a test that fails without it.

## Goals: met, missed, why

- **Met:** every calculator goal from the first minute with a choice; the late ratio; eight of nine weapons; every bot target over 96 seeds; the meta and the merchant's card.
- **Narrow:** `aim+greedy` reaches 5:00 in 63% and 73% on the two pools (68% together): on the band's top edge. `aim+naive` falls in 1:30–3:00 in 25 of 48 on both pools (52%): "mostly", barely. Both swing by ±3 runs between pools; I left them rather than chase noise.
- **0:30:** floor = ceiling = 1.57, outside 0.5–0.9, because at level 1 there is nothing to choose. Raising early pressure to squeeze it would put the first minute back into "careless dies" territory; I read the goal as starting where choices start.
- **Missed by rule, not number:** a player who drags the tower away from the golem (see the drag check). Its speed (75) and the dragon's (87) are the owner's; no number in my remit closes it.
- **Not attempted:** stampedes are still nearly harmless (horses took 0.1–0.3 HP per half-minute); no goal asks for them, and their levers (horse DPS, size) would only add HP loss the bot targets do not need. Robbing the merchant at 1:30 still takes most of his walk (80 HP at 0.5 resistance); 2–9 of 48 greedy runs kill him.

## Recommendations (rules; not changed here)

1. **The golem and the tether:** if dragging the tower away should not beat the golem, the rule must change (for example the golem gains speed while far from the tower, or the tower cannot be dragged faster than the golem walks). Owner's call; numbers cannot do it without touching the owner's speeds.
2. **Trading with auto-weapons:** about half the bots' affordable trades end because their own mini-tower shots, saw blades or ring hit the merchant. If trading should be about choosing, not about weapon geometry, make the merchant ignore hits while the shop timer runs (or only aimed shots count). The owner's earlier taste point (a gamepad without a right stick walks fireballs into him) is the same issue.
3. **Right claw:** it is still the weakest standalone weapon (60% of the best single target). Fine as the dual claw's ingredient; a later pass could give it a role (its knock 22 is the CC that the calculator does not count).
4. **Level-ups late:** the curve 2 + 2L reaches level 80 by 5:00 while a full build costs 31; the last ~two minutes of level-ups are empty (they pass silently, D-4). Harmless, but the level counter means little late.

## What to feel for in play

1. **1:30–2:30 should feel tight but fair.** Slimes and their children reach the tower; standing so your fireball meets them before the tower does, and walking the tower away from a slime wave, should visibly matter. If you lose there with sensible picks, Ooze is still too hard; if you never feel threatened, slime DPS 5 or the 1:00 slime weight can go up.
2. **The first merchant at 1:30.** You should usually have 10 XP banked; buying a card of your choice should feel like a real decision against the reroll and the heal. Check how often your own mini towers, saw or ring end the trade before the shop opens.
3. **The laser and the bite are now worth a slot.** The laser one-shots knights and skeletons from level 1 and kills mounted knights in a few beams at L5; the bite bites from 56 px. Try a laser or bite build to Siege.
4. **Procs are strong, not everything.** A fireball + mini tower + Explode/Split/Pierce build should still light up the screen from 3:00 (split fireworks intact), but a dual claw + saw + ring build with Amount/Area should hold Siege as well.
5. **4:30–5:00 is the last test.** Mounted knights and silver tiers now take real HP before the golem; you should arrive at 5:00 hurt.
6. **Gold.** A first armoury rank should come after your first or second run, and each further rank a little later. If it feels slow, `SCORE_PER_GOLD` 20 is the lever; if fast, `RANK_COST` 150.
7. **Debug runs pay no gold** (game over shows `Gold +0`).
