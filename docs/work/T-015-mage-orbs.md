# T-015: Mages shoot green orbs at the dragon

**Source:** [owner play-test 1](../../reports/feedback/2026-11-06-owner-playtest-1.md), item 6 · **Model:** Opus · **Depends on:** T-013 (dragon speed, facing), T-014 (projectile code)

## Why

Peter's notes ask for enemies that shoot so that dodging becomes a mechanic. The owner asked for mages to shoot green orbs at the dragon. The dragon still cannot die (spec §6).

## What

1. **Sprite:** `orb.green`, built from `fireball/fireball.txt` with red and green channels swapped. Add a manifest option `"swap": "rg"` to `tools/build-atlas.mjs` (frame keys get a `#rg` suffix so they do not collide with the originals); test the option; rebuild the atlas.
2. **Firing:** a mage that is not casting and is within `MAGE_ORB_RANGE = 320` px of the dragon fires one orb every `MAGE_ORB_INTERVAL = 3` s (its own timer, starting at a random offset in `[0, interval)` drawn when the mage spawns, so a pack of mages does not fire in volleys). The orb aims at the dragon's position at the moment of firing (no lead).
3. **Orb:** kind `orb`, in a new `game.enemyShots` array (drawn above enemies, below the dragon), speed `MAGE_ORB_SPEED = 110` px/s (faster than the dragon's 87, slower than a fireball, dodgeable by moving sideways), radius 6, range 400 px, animation `orb.green`. Player projectiles and the ring do not touch orbs.
4. **Hit:** an orb that overlaps the dragon (dragon radius `DRAGON_RADIUS = 12` px, new) is removed and the **tower** takes `MAGE_ORB_DAMAGE = 5` HP (*unmeasured*), sound `slime_poke` (or another existing sound that reads as a hit; say which). Orbs ignore the tower itself.
5. **Spec:** a new subsection under §8 for mage orbs, the new array in §4.1 and §2.1 (orbs move in step 7, hit in step 8), the draw order in §5, the sprite in §3.3. Add decision D-6 to `docs/decisions.md`: "Mage orbs that hit the dragon damage the tower — owner to judge in play; alternative: the orb slows the dragon for 1 s instead." Spec text stays plain.
6. **Re-measure** with `node tools/measure.mjs` and paste the summary into the commit body. Do not tune.

## Determinism

The firing offset is the only new random draw, and it happens once per mage spawn. State lives in the snapshot (the generic snapshot test enforces it).

## Tests

Mage fires only within range and not while casting; interval and offset; orb flies straight at the dragon's firing-time position; hit damages the tower by `MAGE_ORB_DAMAGE` and removes the orb; a dodged orb expires at its range; no extra rng draws without mages; atlas `swap` option.

## Must not

Edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; orbs visible in the browser; commit `T-015: …` with `Closes: T-015`.
