# Design: strategy depth (owner notes 2)

**Date:** 2026-11-26 · **Source:** [owner notes 2](../feedback/2026-11-26-owner-notes-2.md) · **Build:** `3f3e72a` · **Status:** proposal adopted by the orchestrator; each task folds its part into [demo-spec.md](../../docs/demo-spec.md), which then becomes the authority. Numbers here are *unmeasured* starting points; T-029 measures them.

## 1. Goal

The owner's direction: **early and mid game is about control (where you stand, what you shoot, which threat you answer first); late game is about the build.** Vampire Survivors mostly asks "which upgrade?". We add "which threat, with which tool, from where?".

Four levers make that happen, and every feature below pulls at least one:

| Lever | Means | Features |
|---|---|---|
| **Roles** | each weapon has a job: AOE (with a shape), single target, zoning, crowd control (CC) | new weapons, Force buff, golem poise |
| **Matchups** | enemies resist or are weak to damage types, so the right tool matters | damage types, resistances, stats panel, tiers |
| **Stages** | each minute of the run is led by a different threat that wants a different role | timeline stages, horses, mounted knights, slimes, ghosts |
| **Position** | the tether and the tower make placement a decision | saw blade from the tower, braziers, horse stampedes, orbs |

## 2. Damage types and resistances

Every hit has a type: **fire**, **arcane** or **physical**.

| Source | Type |
|---|---|
| Fireball, mini-tower shot, ring, fireball explosions | fire |
| Laser, laser explosions | arcane |
| Left claw, right claw, dual claw, bite, saw blade | physical |

Each enemy has a resistance per type, `r` in `[-0.5, 1]`: damage taken = `ceil(damage × (1 − r))`, so `r = −0.5` is a weakness (×1.5), `r = 0.5` halves, `r = 1` is immune. The golem has none (it cannot die; types do not change its poise).

| Enemy | Fire | Arcane | Physical | Reads as |
|---|---|---|---|---|
| Knight | 0 | 0 | 0.25 | armour |
| Skeleton | 0 | 0.25 | −0.5 | brittle bones |
| Slime (all sizes), megaslime | −0.5 | 0 | 0.5 | squishy, burns |
| Mage | 0 | 0.5 | −0.25 | warded, frail |
| Ghost knight | 0 | 0 | 0.25 | as knight |
| Ghost | 0.25 | −0.5 | 0.75 | incorporeal |
| Horse | 0 | 0 | 0 | plain |
| Mounted knight | 0.25 | −0.25 | 0.5 | heavy plate |

**Enemy stats panel:** press `Tab` (gamepad `Select`/`Back`) to pause and open a bestiary: every enemy type met in this run, its sprite (and tier colours seen), HP, speed, contact DPS, XP, and its three resistances as coloured bars (red = weak, grey = neutral, blue = resists, gold = immune). Types not met yet show as silhouettes.

## 3. Buffs: the generic set

Buff slots stay at 4 and levels at 3. Seven **generic** buffs apply to every weapon where the stat exists, three **proc** buffs to projectiles.

| Buff | Per level | Applies to |
|---|---|---|
| Might | +20% damage | all |
| Haste | −10% cooldown | all |
| Area | +20% size | AOE shapes, claws, bite reach, orbits, explosions, saw blade |
| Velocity | +20% speed and range | projectiles, saw blade |
| Duration | +25% | mini towers, saw blade dwell, brazier pickups' effects |
| Force | +50% knockback and poise damage | all hits |
| Amount | +1 | fireball and laser projectiles, ring balls, saw blades, mini towers' max active |
| Explode | 20/35/50% | fire projectiles; **at L3 also arcane** (lasers explode) |
| Split | 20/35/50% | fire projectiles |
| Pierce | 20/35/50% | arcane projectiles; **at L3 also fire** (fireballs pierce) |

**Decision D-7** (owner's first option): Explode belongs to fire, Pierce to arcane, and each crosses over at its max level. The laser keeps "no pierce without the buff" (play-test 1). Card text says so ("L3: lasers explode too").

**Knockback and CC:** every weapon has a `knock` (px) and each enemy a `mass`; a hit pushes the enemy `knock × force / mass` px away from the hit source. Horses are light (0.5), knights 1, mounted knights 2, megaslime 4. Claws and bite knock hard; the ring nudges; projectiles barely push.

## 4. Weapons: roles

Weapon slots stay at 4. Nine weapons; each owns a role.

| Weapon | Fires from | Aim | Role | Shape | Type |
|---|---|---|---|---|---|
| Fireball | dragon | aimed | AOE via procs | small circle | fire |
| Laser | dragon | aimed | single target, long line | small circle | arcane |
| Mini tower | tower | auto | zoning | turret | fire |
| Ring | dragon | none | close defence, CC nudge | orbiting balls | fire |
| **Left claw** | dragon | facing side | AOE, short | wide rectangle | physical |
| **Right claw** | dragon | aimed | single target, short | narrow cone, max targets | physical |
| **Dual claw** | dragon | both | AOE + single target | rectangle both sides + cone | physical |
| **Bite** | dragon | nearest | execute, CC | one target | physical |
| **Saw blade** | tower | tower → dragon line | zoning, line | travelling disc | physical |

- **Left claw** (like the VS whip): every cooldown, a slash rectangle 110 × 36 px on the side the dragon faces, hitting everything in it; L3+ also slashes the other side after 0.15 s. High knock.
- **Right claw:** every cooldown, a 60° cone, 80 px long, in the aim direction; hits the `maxTargets` nearest enemies in it (1 → 3 by level) for high damage. Very high knock.
- **Dual claw (evolution):** when both claws are L5, level-ups offer **Dual Claw** (weight 10) until taken; it replaces both claws (freeing a weapon slot): both-side rectangles plus the cone every cooldown, damage of the right claw, area of the left. Evolutions are a general table `{ result, requires: [a, b] }`; dual claw is the only entry for now.
- **Bite:** every cooldown, the dragon bites the nearest enemy within 50 px: heavy damage, ×2 against enemies below 30% HP (execute), knock 30. No target → no bite, cooldown waits.
- **Saw blade:** every cooldown, the tower launches a blade along the line from the tower **through the dragon**; it flies out 260 px, spins in place for `dwell` s, flies back to the tower. It hits everything it passes (per-enemy rehit 0.4 s), never stops. Where you stand relative to the tower aims it: a positional weapon.

## 5. Enemies

| Enemy | HP | Speed | Radius | DPS | XP | Mass | Behaviour |
|---|---|---|---|---|---|---|---|
| **Horse** | 2 | 120 | 10 | 4 | 1 | 0.5 | spawns in **stampedes**: a line of 5–8 horses from one side, each running straight at the tower's position at spawn time and on past it (no homing), despawned once 1400 px away. Faster than the dragon: you zone them, you do not chase them |
| **Mounted knight** | 30 | 60 | 16 | 15 | 8 | 2 | walks at the tower like a knight, drawn at 3× (bigger). Armoured: wants arcane or bite |

Both need new art (§10). Horses enter the timeline at 1:00, mounted knights at 2:30.

**Slimes rework:** a slime splits **twice**: gen 0 (16 px art, HP 3) → two gen 1 (12 px art, HP 2) → two gen 2 (9 px art, HP 1), each generation its own pixel art (not scaled). **Fusion:** whenever more than 100 slimes are alive, the 12 slimes nearest the densest one fuse into a **megaslime** at their centre (existing megaslime art, 32 px): HP = 4 × the sum of their HP, contact DPS **0**, speed 15, mass 4, XP = sum of theirs; it soaks fire and shots and hurts nothing. At most one fusion per second.

**Mega golem:** **poise** replaces per-hit knockback. Each hit adds `damage × force` poise; at 60 poise it **staggers**: knocked back 40 px over 0.3 s and stopped for 0.5 s, poise reset. On contact it **shoves the tower** 30 px back (once per second) as well as dealing damage. **Screen shake** on its arrival (strong, 0.6 s), on each footstep within 400 px of the dragon (weak) and on each stagger (medium). Shake is a render-only offset driven by sim events, off with `?shake=0`.

## 6. Tiers: the colour/scale scheme

Any enemy can come in four tiers; a tier is **colour + outline + size + multipliers**, so one sprite serves the whole run and a player learns to read danger at a glance.

| Tier | Name | Palette | Outline | Screen scale | HP | DPS | XP | Speed |
|---|---|---|---|---|---|---|---|---|
| 1 | plain | original | none | 2× | ×1 | ×1 | ×1 | ×1 |
| 2 | bronze | warm tint | 1 px bronze | 2× | ×2.5 | ×1.25 | ×2 | ×1 |
| 3 | silver | cold pale tint | 1 px silver | 3× | ×6 | ×1.5 | ×4 | ×0.9 |
| 4 | gold | gold tint | 1 px gold | 3× | ×15 | ×2 | ×8 | ×0.8 |

Tinted, outlined frames are generated at build time from the tier-1 art (a manifest option, like the orb's red/green swap); screen scale stays an integer so pixels stay crisp. Resistances do not change with tier. Timeline rows give tier weights alongside type weights (bronze from 2:30, silver from 3:30, gold after 5:00).

## 7. Stages

The 5:00 run becomes five stages, each led by a threat that rewards a role and a damage type:

| Stage | Time | Lead threat | Wants |
|---|---|---|---|
| 1 Muster | 0:00–1:00 | knights, skeletons | anything; physical shreds skeletons |
| 2 Ooze | 1:00–2:00 | slime waves + first horse stampedes | fire AOE, zoning |
| 3 Arcana | 2:00–3:00 | mages (orbs), skeleton summons, mounted knights from 2:30 | single target, dodging, arcane vs plate |
| 4 Haunt | 3:00–4:00 | ghost knights → ghosts, bronze tiers | arcane |
| 5 Siege | 4:00–5:00 | mixed, silver tiers, big stampedes | the build |
| — Golem | 5:00+ | golem + gold tiers | CC to stagger, then fall |

A stage banner ("Stage 2: Ooze") shows for 2 s at each boundary.

## 8. Braziers (the candlestick)

Every 25 s a **brazier** appears 250–450 px from the tower (never on screen edge-in-view: just outside the view, so you walk to it). Any hit breaks it and it drops one pickup: **heart** 60% (+20 tower HP), **magnet** 25% (every gem homes), **bomb** 15% (60 fire damage to every enemy on screen, no XP lost). Pickups are collected by the dragon like gems and last 30 s. New art: brazier (burning, using the pack's `burn` flame), heart, magnet, bomb.

## 9. Out-of-game upgrades

After each run, **gold** = `floor(score / 20)`. The title screen gets an **Armoury**: per damage type (fire, arcane, physical), two tracks of 5 ranks: **Power** (+8% damage of that type per rank) and **Bite-through** (−0.1 to every enemy's resistance to that type per rank, floor −0.5). Rank cost `20 × rank²` gold. Saved in `localStorage` (per browser) with a reset button; the sim receives the chosen ranks as a construction option, so runs stay deterministic and the bot instrument can measure with and without them.

## 10. New art

Created in this repo under `art/`, as text pixel grids with a palette key, matching the pack: side view facing right, black = transparent, 16 px for standard enemies, 2-frame walks, the pack's palette (sampled from its BMPs). `tools/build-atlas.mjs` reads them next to the BMPs. Never upscale or downscale existing sprites.

| Art | Size | Frames |
|---|---|---|
| horse walk, die | 20 × 14 | 2 + 5 |
| mounted knight walk, die (knight on horse) | 22 × 22 | 2 + 6 |
| slime gen 1 / gen 2 walk, die | 12 / 9 | 4 + 4 each |
| left claw slash, right claw cone slash, dual claw | 56 × 18, 40 × 40, both | 3 each |
| bite (jaws) | 16 × 16 | 3 |
| saw blade | 12 × 12 | 4 (spin) |
| brazier, heart, magnet, bomb | 12 × 16, 8 × 8 each | 2 (flicker), 1–2 |
| icons: left claw, right claw, dual claw, bite, saw, Might, Haste, Duration, Force, Amount | 9 × 9 | 1 |
| stats-panel resistance glyphs (fire, arcane, physical) | 7 × 7 | 1 |

## 11. Damage calculator

`tools/dps.mjs`, data-driven from `content.js`, answers "what can this build kill?" at each minute:

- **Model per weapon:** hits per second (cooldown, count, Amount, Haste) × damage (Might, ceil) × expected targets per hit, where expected targets = shape area (with Area) × enemy density at that minute, capped by `maxTargets`; plus proc expectations (Explode: chance × explosion area × density × damage; Split: chance × 2 × child hits; Pierce: extra hits), and resistance against the stage's enemy mix.
- **Floor and ceiling** per minute: floor = the weapons and levels a *naive* player has by then (level curve from the bot instrument), ceiling = the best allocation of the same number of level-ups.
- **Pressure:** incoming HP per second from the timeline (rate × mean HP × tier multipliers × resistance mix). The report prints DPS floor/ceiling vs pressure per minute and per stage.
- **Ground truth:** a `--check` mode places dummy enemies in the sim at a given density, runs each weapon for 30 s and compares measured damage with the model (within 15%, or the model is fixed).

## 12. Still the owner's (proposals, not started)

Built last, after the owner has had a chance to change them. Art exists in the pack for all three (walk and death).

| Id | Character | Proposal |
|---|---|---|
| D-8 | Merchant | Every 90 s a merchant crosses the field fleeing the horde. Stand next to him for 1.5 s to **trade**: spend gems on the ground near him for a reroll or a chosen card. Or **rob** him: he is fast and tanky (HP 80, resists everything 0.5) and drops a chest (one free upgrade). |
| D-9 | Princess | An **escort**: she appears at the screen edge and walks to the tower; enemies prefer her. If she arrives, the tower gains +25 max HP and heals fully. If she falls, nothing. |
| D-10 | Prince | A **rival**: a dragon-slayer who walks at the dragon and steals the gems around it; kill him first (HP 40, physical resist 0.5) and he drops all he stole. |

## 13. Tasks

| Id | Task | Depends on |
|---|---|---|
| T-017 | Pixel-art pipeline and first art (`art/`, palette, tint/outline variants, art guide) | — |
| T-018 | Damage types, resistances, enemy stats panel | — |
| T-019 | Generic buff set, knockback and mass, Explode/Pierce affinity (D-7) | T-018 |
| T-020 | Damage calculator (`tools/dps.mjs`, `--check`) | T-018, T-019 |
| T-021 | Tiers: colour/outline/scale scheme, timeline tier weights | T-017, T-018 |
| T-022 | Claws: left, right, dual (and the evolution table) | T-017, T-019 |
| T-023 | Bite and saw blade | T-017, T-019 |
| T-024 | Horses, mounted knights, stages and banners | T-017, T-021 |
| T-025 | Slime rework: two splits, sizes, megaslime fusion | T-017, T-018 |
| T-026 | Golem: poise and stagger, tower shove, screen shake | T-019 |
| T-027 | Braziers and pickups | T-017 |
| T-028 | Armoury: out-of-game upgrades | T-018 |
| T-029 | Rebalance with the damage calculator and the bots | all above |
| T-030–T-032 | Merchant, princess, prince | owner's answers to D-8–D-10 |
