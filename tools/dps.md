# Damage calculator (`tools/dps.mjs`)

What can a build kill at each point of the run? Bot runs answer that noisily (build divergence, heavy-tailed seeds); this tool answers it from formulas, and checks the formulas against the real sim. Spec: [§20](../docs/demo-spec.md#20-testing), "Damage calculator".

```
node tools/dps.mjs                      # the per-minute report (about 30 s)
node tools/dps.mjs --view-time 12       # a denser crowd near the dragon
node tools/dps.mjs --levels 2,3,6,13,21,32,45,59,73,86   # other levels at 0:30 … 5:00
node tools/dps.mjs --check              # every model against the sim (about a minute); exit 1 if any is off by > 15%
node tools/dps.mjs --check --weapon saw # one weapon's cases
```

Options: `--near N` (enemies near the dragon, fixed), `--view-time S` (default 6), `--min-near N` (5), `--radius PX` (350), `--seeds N` (naive builds per minute, 64), `--beam N` (search width, 48), `--trivial X` (3), `--levels` (ten levels); with `--check`: `--weapon ID`, `--seconds S` (counted time per case, 300), `--reshuffle S` (3), `--settle S` (1), `--seed N` (1).

Everything is read from `src/sim/content.js` and the sim's own helpers (`buffMods`, `buffDamage`, `procChance`, `fireballShot`, `damageTaken`, the card pool). A new weapon needs only an entry in `MODELS`.

## The field

Every model works in a field: enemies as a Poisson process of density `rho` inside a disk of radius `R` around the dragon, all of the mix's mean radius `r`, standing still (no walking, no knockback); the tower rests 50 px from the dragon. Aimed weapons (fireball, laser, right claw) and mini-tower shots aim at the enemy nearest their origin, as the bots do: the target is at the Poisson nearest-neighbour distance (averaged over its distribution), and nothing is nearer the shooter than its target. A still dragon faces its aim, so a one-sided claw slashes toward the nearest enemy.

## The models

| Weapon | Model |
|---|---|
| Fireball, laser | Volleys every cooldown × Haste. A shot whose lateral offset from the aim line at the target is below `r_p + r` hits the target; the others fly as random shots. Random hits come as a Poisson process of rate `rho × 2(r_p + r)` per px of path (range × Velocity, cut at the field's edge). Each hit rolls the procs its damage type allows (§12 affinity): Explode adds `rho ×` the explosion circle's area (radius 60 × Area + `r`, inside the field, minus the empty disk around the dragon); Split adds two children at ±45° with the range left (gen < 2); Pierce lets the shot go on, so the chain beyond a point survives with `p^hits`. The expectation is integrated numerically (Gauss–Legendre over the hit position, exact geometry for children and the field's edge). |
| Mini tower | Steady state: a lob every cooldown × Haste; each tower shoots for `min(duration × Duration, (maxActive + Amount) × cooldown − 0.5 s lob)`, every fireRate × Haste, counted on the sim's own timer pattern. A shot is the fireball at the fireball's level, aimed at the enemy nearest the mini tower (about 94 px from the dragon); no enemy within 300 px, no shot. |
| Ring | The passes over an enemy at radius `orbit × Area + δ` are replayed tick by tick with the per-enemy rehit; `rho × ∫ hits/s × 2π(orbit + δ) dδ` over the annulus. |
| Left claw | Rectangles `w × h` (× Area) grown by `r`: `rho × (wh + 2(w + h)r + πr²)` each. With `sides` 2 both sides; with one, the side the dragon faces (toward the nearest enemy when its aim is clearly horizontal): that enemy if it overlaps, plus the field outside the empty disk. `1 + Amount` rectangles per side. |
| Right claw | Aimed at the nearest: hits it when it is within reach × Area + `r`, plus `min(Poisson(rho × cone area grown by r), maxTargets + Amount − 1)` others. |
| Dual claw | Both rectangles and the cone. |
| Bite | `min(Poisson(rho × π(reach × Area + r)²), 1 + Amount)` targets per bite; a bite with no target counts as lost. The execute shortens the hits to kill (below). |
| Saw blade | The blade's path (out at speed × Velocity to range × Velocity, dwell × Duration, back to the tower) is replayed tick by tick; every enemy position in its corridor is integrated with the per-blade rehit (0.4 s). `count + Amount` blades per volley. |

Not modelled: knockback, mage orbs, braziers and pickups, the golem (it takes no damage; its poise is not estimated), the movement of the dragon and the crowd.

## Damage, mix and pressure

- **Raw damage** per hit: `ceil(base × Might)`, then the damage function's `ceil(× (1 − r))` per enemy type. `--check` compares raw damage.
- **Effective damage** (the report): HP removed. Hits land on bodies (a type at a tier; a slime is its 7 bodies, a ghost knight brings its ghost, a mage one cast of 4 skeletons) in proportion to spawn rate × HP; a hit removes `hp / hits-to-kill`, so overkill is lost; the bite's execute is applied in the hits to kill.
- **Pressure**: Σ spawn rate × body HP at the minute (the timeline's interpolated rate, the row's type and tier weights, stampede horses at their average rate).
- **Near the dragon**: `max(--min-near, spawn rate × --view-time)` enemies in a disk of `--radius` px: the enemies that arrive in that many seconds.

## Floor and ceiling

- **Level** at each minute: `LEVEL_CURVE`, the median level of the naive bots still standing (aim+naive and kite+naive, seeds 1..48; thin after 2:30), or `--levels`. The table also prints the level every gem spawned so far would give (an upper bound).
- **Floor**: the median effective DPS of 64 naive builds after that many level-ups, each drawn with the real card pool taking card 0 (as the naive bot).
- **Ceiling**: the best build for that minute's field, as if every card were on offer: a beam search over layers of picks spent, stepping by one pick or by taking an item to its top level, and an exhaustive search of every build whose items all stand at their top level (the fireball at 1 or 5) within the picks, the best eight of which spend the picks left greedily. The exhaustive part matters: Explode, Split, Pierce and Area multiply each other on fireballs, and Pierce reaches fireballs only at L3, so no single pick toward that build pays and a beam alone misses it. Its build is printed, `(exhaustive)` when that search won.
- **Flags**: ceiling below the pressure: `unwinnable`; floor above 3× the pressure: `trivial`.

## The check

Each case runs a `Game` with no spawns, only the weapon (and the buff set), the dragon still at the centre of a 400 px disk of dummies (a type, HP 10⁹, never walking, put back after knockback) and aiming at the nearest. The dummies are redrawn every 1.5–4.5 s (random, so the windows never lock to a cooldown) and the first second of each layout is not counted (fresh dummies have no rehit timers; the models are steady states). 300 s are counted per case after a 10 s warm-up. Cases: every weapon at L1 and its top level with no buffs and with a stat set (Might 2, Haste 1, Area 1, Amount 1); projectile weapons also with a proc set (Explode 3, Split 2, Pierce 3, Velocity 1) and in a sparse field; saw and mini tower with a reach set (Velocity 2, Duration 2, Area 2, Haste 2); the fireball and mini tower at L5 with the late ceilings' loadout (Explode 3, Split 3, Pierce 3, Area 3) in both fields; and three cases against resistant dummies. Seed-to-seed noise is about ±5% (±6% for the one-sided left claw).
