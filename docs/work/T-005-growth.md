# T-005: Growth: gems, XP, level-up, weapons, buffs, procs

**Source:** [demo-spec.md](../demo-spec.md) milestone 3 · **Model:** Opus · **Depends on:** T-003 (browser shell), T-004 (roster: golem proc immunity, knockback hook)

## Why

Without growth the run is a fixed fireball against a rising horde. This task adds the Vampire Survivors loop: kill → gems → level-up cards → a build of up to 4 weapons and 4 buffs with procs.

## What

Sim (`src/sim/`), through the hooks T-002 left (`dropGem`, `stepGems` in `gems.js`; `buffMods`, `fireLaser`, `fireMiniTower`, `spinRing` in `weapons.js`; `rollProcs` in `projectiles.js`; `levelup.js` is new):

1. **Gems and XP** (§14): drop, attract, collect, `xpToNext`, `MAX_GEMS` merge, `pendingLevelUps`.
2. **Level-up** (§14.1): card pool with weights, 3 distinct cards, applying a pick.
3. **Weapons** (§10.2–10.4): laser, mini tower, ring, all 5 levels.
4. **Buffs** (§11): the 4 stat buffs through `buffMods`, the 3 chance buffs.
5. **Procs** (§12): explode, split, pierce, golem immunity.

Browser:

6. **Level-up screen** in `src/render/screens.js`: 3 cards with icon, name, `NEW` or `L<n>`, one line of effect text; choose with mouse click, keys 1/2/3, gamepad d-pad left/right + A; sound `powerup`. HUD weapon and buff icons with level pips already exist from T-003; check they show the new weapons and buffs.

## Decisions already made (write them into the spec as plain text)

- **Level-up flow, one entry point:** whenever `pendingLevelUps > 0`, `game.offers` holds the current cards and `tick(intent)` does **not** advance the world (no step runs, `tickCount` unchanged, `events` still cleared). If `intent.pick` is a valid index into `offers`, the card is applied, `pendingLevelUps` decreases, sound `powerup`, and the next offers are rolled if any level-ups remain. So picks are part of the intent stream and replays stay deterministic. The loop shows the level-up screen while `game.offers.length > 0` and keeps calling `tick` with the pick (the world is frozen by the sim, not by the loop).
- **Offers are rolled** with `game.rng` at the moment a level-up is queued (end of the gems step) and after each pick. Draw without replacement by weight from the pool; the repair card is always in the pool (weight 1), so the pool is never empty; show `min(3, pool size)` cards.
- **Card shape:** `{ kind: 'weapon' | 'buff' | 'repair', id, level }` where `level` is the level after the pick (1 = NEW). `cardInfo(card)` in `levelup.js` returns `{ name, icon: { anim, frame, scale }, tag, text }` for the screen (pure data, no DOM).
- **Names:** weapons Fireball, Laser, Mini Tower, Ring; buffs Damage, Cooldown, Area, Projectile Speed, Explode, Split, Pierce; Repair.
- **Icons:** weapons as §17 says (fireball `fireball.anim` frame 0, laser `laser.dir` frame 12, mini tower `castle` at 1×, ring `icon.ring`); buffs as §11.
- **Repair:** +25 HP, capped at `maxHp`.
- **Gems:** `{ id, x, y, value, homing }`. A gem that comes within `DRAGON_PICKUP_RADIUS` starts homing and keeps homing at 500 px/s until collected, even if the dragon flies away. Collected when within `GEM_COLLECT_RADIUS = 12 px` (*unmeasured*) of the dragon. Enemies with XP 0 (golem) drop nothing. XP overflow carries over; several level-ups in one tick all queue.
- **Gem merge:** when a drop would exceed `MAX_GEMS`, the oldest gem is removed and its value added to the gem nearest to it (ties: lower id).
- **Buff maths:** damage = `ceil(base × (1 + d))`; cooldown and mini-tower `fireRate` × `(1 − c)`; area multiplies projectile radius, explosion radius and ring orbit; speed multiplies projectile speed and range. Ring damage also takes the damage buff.
- **Proc rolls:** each roll is `game.rng() < chance`, in the order damage → explode → split → pierce, and a roll happens only if the projectile's kind can have that proc (so a game without chance buffs draws no extra numbers).
- **Explode:** radius `60 × area`, damage = the projectile's damage, every enemy in the circle once except the one just hit; the golem is not affected by explosions at all (immune to procs). Effect `explosion.big` (or `explosion.laserbig` for lasers) with `scale` so the sprite's diameter matches the circle. Sound `explosion01`.
- **Split:** two `fireball` projectiles at ±45° from the hit point, same damage and radius, range = the parent's **remaining** range, `gen + 1`, and their `hits` start with the enemy just hit. `gen >= 2` cannot split.
- **Pierce:** fireball and mini-tower shots survive the hit on a successful roll. The laser never rolls: it survives until it has hit `maxHits + pierceBonus` enemies (+1/+2/+3 at buff L1–3).
- **Laser:** no fan; with `count` 2, the two lasers are parallel, offset ±6 px perpendicular to the aim (*unmeasured*). Kind `laser`, `dirFrame` sprite, effect `explosion.laser` on each hit, sound `laser01`.
- **Ring:** the ring weapon keeps `angle` and a `balls` array of positions updated every tick (the renderer draws `balls`). Rehit timers are a per-weapon map `enemyId → tick when it may be hit again`, pruned of dead ids. No procs; the golem is knocked back by ring hits.
- **Mini tower:** `game.miniTowers = [{ id, x, y, fromX, fromY, lobTicks, life, timer }]`. Lobbed from the tower to a point 80 px toward the nearest enemy (random direction if none); during the 0.5 s lob it does not fire; `duration` counts from landing. Shots are kind `miniShot` (fireball sprite), speed 380, range 300, both × speed buff, radius 6 × area. Targets the nearest enemy within 300 px via the grid.

## Spec sections to read (whole)

§4, §4.1, §10, §11, §12, §14, §15, §16 (card picking), §17, §20 (procs test).

## Tests

- §20 **Procs:** with `game.rng = () => 0`, a fireball with explode L1 spawns an explosion that damages a second enemy in range.
- Gems: drop on kill, homing starts inside the radius, collect, XP overflow and multiple level-ups, merge at the cap.
- Level-up: offers respect slot limits and level caps; a full build offers only Repair; world frozen while offers are open (digest unchanged by ticks without a pick); a pick applies the card.
- Each weapon fires per its table at levels 1 and 5; ring rehit timer; mini tower lob, life and `maxActive`.
- Buff maths for every buff; laser pierce bonus; split generation cap; golem untouched by explosions but knocked back by hits.
- Determinism with level-up picks in the intent stream.
- Pure UI helpers (card hit-testing, d-pad selection) under node.

## Must not

Edit `docs/backlog.md`, merge, push `main`.

## Done means

`npm run gate` green; playable level-ups in the browser; spec updated; commit `T-005: …` with `Closes: T-005`.

## What T-002 and T-004 left you

- Hooks: `dropGem(game, enemy)` and `stepGems(game)` in `gems.js`; `buffMods(game)`, `fireLaser`, `fireMiniTower`, `spinRing` in `weapons.js` (already dispatched from `stepWeapons`); `rollProcs(game, p, e)` in `projectiles.js` returns whether the projectile survives. `resolveHit` already records `p.hits` (max 8). Intent `confirm`/`pick` are normalised but unused.
- The golem has `procImmune: true`, `unkillable: true` and `hp = GOLEM_HP` (reset after every hit). Knockback goes through `onEnemyHit(game, e, source)`; for explosions pass the explosion centre as the source (spec §8.4).
- Effects have `life` (minimum length, holds the last frame) and `hold`.
- A projectile hits at most one enemy per tick (nearest, ties to the lower id). The grid stores enemy centres; queries add the largest stored radius.
- The aim (`dragon.aimX/aimY`) is always a unit vector.
- The enemy count may briefly exceed `MAX_ENEMIES` (slime children, ghosts, golem); only the spawner respects the cap.
- **Browser side (T-003):** screen flow and ticking live in `src/app.js` (no DOM, tested in `test/shell.test.mjs`); viewport maths in `src/viewport.js`. The renderer already draws `game.gems`, `game.miniTowers` and ring `w.balls` if present. Gamepad d-pad edges arrive as `nav`; a pick or confirm press is held until the next tick runs, so sending the pick through `tick` works at any frame rate. `?debug=1` exposes the App as `window.app`.
- **In parallel:** T-009 is tuning early-game numbers (timeline rate, knight DPS, tower HP, knight HP) in `content.js` and the spec. Do not change those numbers; expect a small merge in `content.js`.
