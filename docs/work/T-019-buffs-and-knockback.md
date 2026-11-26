# T-019: Generic buff set, knockback and mass, Explode/Pierce affinity

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §3; decision D-7 · **Model:** Opus · **Depends on:** T-017 (icons, merged), T-018 (`dealDamage`, damage types, merged)

## Why

The owner asked for a decided set of generic buffs and for crowd control ("pushback and stuff"). Later weapons (claws, bite, saw blade) and the golem's poise build on the knockback system this task adds.

## What

1. **Buff set** (ids, names, card text, icons) replacing today's four stat buffs; levels 1–3, 4 slots unchanged:

| Id | Name | Per level | Applies to | Icon |
|---|---|---|---|---|
| `might` | Might | +20% damage | every damage source | `icon.might` (new) |
| `haste` | Haste | −10% cooldown and mini-tower fire interval | all weapons | today's cooldown icon, or `bonus/bonusmulti8.bmp` if it reads better (T-017's tip) |
| `area` | Area | +20% size | projectile radius, explosions, ring orbit (and later AOE shapes) | today's, or `bonus/bonusnuke.bmp` (T-017's tip) |
| `velocity` | Velocity | +20% speed and range | projectiles | today's speed icon |
| `duration` | Duration | +25% | mini-tower life (later: saw dwell, pickups) | `icon.duration` (new) |
| `force` | Force | +50% knockback | all hits | `icon.force` (new) |
| `amount` | Amount | +1 | fireball and laser projectiles per volley, ring balls, mini towers' max active | `icon.amount` (new) |
| `explode` | Explode | 20/35/50% | fire projectiles; **at L3 also arcane** (lasers explode) | today's |
| `split` | Split | 20/35/50% | fire projectiles | today's |
| `pierce` | Pierce | 20/35/50% | arcane projectiles; **at L3 also fire** (fireballs pierce) | today's |

   Damage becomes `ceil(base × (1 + 0.2 × might))`; check whether the old damage table (+25/50/80%) was relied on by tests and update them (list under `Expectations changed`). Amount's extra projectiles widen the fan by the weapon's spread step (fireball) or add a parallel laser (±6 px offsets as today's count 2). The card text for Explode/Pierce L3 says the crossover ("L3: lasers explode too").
2. **Affinity (D-7):** proc gating uses the projectile's damage type and the buff level: Explode applies to `fire` always and to `arcane` at L3; Pierce to `arcane` always and to `fire` at L3; Split to `fire` only. A game without chance buffs still draws no proc rolls.
3. **Knockback:** every weapon (and the explosion) has a `knock` in px and every enemy type a `mass`. A hit pushes the enemy `knock × (1 + 0.5 × force) / mass` px straight away from the hit source (the projectile's position, the explosion centre, the ring ball), applied in `dealDamage` (or its `onEnemyHit` path) right after damage. Starting numbers (*unmeasured*): knock fireball 4, laser 2, mini-tower shot 4, ring 8, explosion 10; mass knight 1, skeleton 0.7, slime 0.8, mage 1, ghost knight 1, ghost 0.6. **The golem keeps today's knockback rule unchanged** (T-026 replaces it with poise).
4. **Bestiary:** add `mass` to the cards (e.g. "heavy"/"light" or the number).
5. **Instrument:** update `tools/measure.mjs` greedy policy for the new buff ids; keep its decisions sensible (the greedy order is yours).
6. **Spec:** §10–§12, §14.1 (card text, icons), §8 (mass column), §17 (HUD icons), plain text. Add the icons to `ATLAS_NAMES`.

## Decisions already made

- Buff levels stay 1–3; slots stay 4.
- Knockback is instantaneous displacement (no velocity state), clamped so an enemy is never pushed more than its knock in one hit; separation sorts out overlaps next tick.
- No new random draws.

## Spec sections to read (whole)

§4.1, §8, §10, §11, §12, §12.1, §14, §14.1, §17, §17.1, §20.

## Tests

Each buff's maths; Amount per weapon; affinity gating at L1/L2/L3 (incl. no rolls without the buff); knockback direction and magnitude by mass and Force; golem unchanged; card texts; determinism. Update existing tests that name old buff ids.

## Must not

Change enemy HP, weapon base damage, cooldowns or the timeline (T-029 rebalances; report anything that becomes trivially strong). Another agent (T-028, the armoury) works in `src/app.js`, `src/main.js`, `src/render/screens.js` and `tools/measure.mjs` (`--meta`) in parallel: keep your edits there small and expect a merge. Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; spec updated; `Measured:` summary in the commit body; commit `T-019: …` with `Closes: T-019`.
