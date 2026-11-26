# T-018: Damage types, resistances, enemy stats panel

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §2 · **Model:** Opus · **Depends on:** nothing open

## Why

The owner wants matchups: enemies with elemental resistances and weaknesses, visible in an easy-access stats panel, so the right weapon for the stage matters. Later tasks (armoury, tiers, new weapons, calculator) build on this.

## What

1. **Damage types** `fire`, `arcane`, `physical`. Every damage event in the sim carries one: fireball, mini-tower shots, ring and fireball explosions are fire; laser (and any laser explosion) arcane. Put the type in the weapon/projectile data (content), not in code branches.
2. **One damage function** in the sim through which **every** hit goes (projectile, ring, explosion, and later claws/bite/saw): `dealDamage(game, enemy, amount, type, source)` → applies resistance, returns damage dealt, keeps the golem rules (no damage, knockback via the existing hook) and kill bookkeeping. Refactor the existing hit paths onto it.
3. **Resistances** per enemy type, `r` in `[-0.5, 1]`, table from design §2 (horse and mounted knight rows can wait for T-024; slimes' row covers all generations). Damage taken = `ceil(amount × (1 − r))`; `r = 1` means 0 damage (immune). Content table + spec §8 table columns.
4. **Armoury hook:** `new Game({ ..., meta })` accepts per-type damage multipliers and resistance offsets (default neutral); `dealDamage` applies them (`amount × power[type]`, `r − shred[type]`, floor −0.5). T-028 builds the UI; you only add the hook and test it.
5. **Seen types:** `game.seen` records enemy types met this run (in the snapshot), so the panel can show silhouettes for the rest.
6. **Stats panel** (bestiary): `Tab` (gamepad Back/Select) opens it and pauses; `Tab`/`Esc` closes. One row or card per enemy type: sprite (animated walk), name, HP, speed, contact DPS, XP, and the three resistances as coloured bars with text (red = weak, grey = neutral, blue = resists, gold = immune; show the percentage). Unseen types as dark silhouettes with "???". Fits 960×600; readable at 2× text. Lives in `src/render/` (screen) and `src/app.js` (state), pure helpers tested under node.
7. **Spec:** a new section for damage types (where it fits, e.g. §12.1 or a new §12a), resistance columns in §8, the panel in §16/§17, `meta` in §4.1. Plain spec text.

## Decisions already made

- Rounding: `ceil` after all multipliers; a resisted hit still does at least 1 unless `r ≥ 1`.
- Explosions inherit the projectile's type.
- No new random draws. Determinism and the generic snapshot test must hold.
- The golem has no resistances and is unaffected.
- Mage orbs (enemy shots) do not use the damage function (they hit the tower, not an enemy).

## Spec sections to read (whole)

§4.1, §8 (incl. §8.4, §8.5), §10, §11, §12, §14.1 (card text), §16, §17, §19, §20.

## Tests

Every weapon's hits carry the right type; resistance maths incl. weakness, immune, rounding; meta multipliers and shred (floor −0.5); golem untouched; `game.seen`; panel helpers (layout, bar colours, silhouettes) under node; determinism unchanged for a run with no meta.

## Must not

Change weapon numbers or enemy HP (rebalance is T-029; record what you see if resistances make something trivially easy or hard). Another agent (T-017) changes `tools/build-atlas.mjs`, `tools/manifest.json` and the atlas in parallel: do not touch those. Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; the panel works in the browser; spec updated; `node tools/measure.mjs` summary in the commit body under `Measured:` (no tuning); commit `T-018: …` with `Closes: T-018`.
