# T-022: Claws: left claw, right claw, dual claw evolution

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §4; owner notes 2 (weapons) · **Model:** Opus · **Depends on:** T-017 (art pipeline), T-018 (`dealDamage`, types), T-019 (buffs, knockback) — all merged

## Why

The owner asked for a left claw (unaimed, like the VS whip), a right claw (aimed, a short cone, more single-target) and a dual claw as their evolution. They are the first **physical** weapons, so the resistance matchups (skeletons weak, slimes and ghosts resist) start to matter, and they are close-range AOE and single-target roles with strong knockback.

## What

1. **Left claw** (`leftClaw`, physical, fires from the dragon, unaimed): every cooldown a slash **rectangle** on the side the dragon faces (`dragon.flip`), `width × height` px, starting at the dragon's centre and extending sideways; hits every enemy overlapping it once per slash. From L3 it also slashes the other side 0.15 s later. High knock.
2. **Right claw** (`rightClaw`, physical, fires from the dragon, aimed): every cooldown a **cone** of `angle` degrees and `reach` px in the aim direction; hits the `maxTargets` nearest enemies in it (ties to the lower id). Higher damage, very high knock.
3. **Dual claw** (`dualClaw`, evolution): when the player owns **both** claws at L5, the level-up pool adds a **Dual Claw** card (weight 10) that, when picked, **replaces both claws** with the dual claw (frees a weapon slot). Every cooldown it slashes both sides (left-claw shape, right-claw damage) and the cone (right-claw shape and `maxTargets`); one level only (it is already max). Build a general evolution table `EVOLUTIONS = [{ result, requires: [a, b] }]` in content so later evolutions are data.
4. **Starting numbers** (*unmeasured*; put them in the §10 tables):

| Weapon | L | cooldown | damage | shape | knock | other |
|---|---|---|---|---|---|---|
| Left claw | 1→5 | 1.3 → 0.9 | 2 → 5 | 110×36 → 140×44 | 14 | both sides from L3 |
| Right claw | 1→5 | 1.1 → 0.7 | 4 → 9 | 60°, 80 px → 75°, 100 px | 22 | maxTargets 1 → 3 |
| Dual claw | — | 0.7 | 9 | both rectangles 140×44 + cone 75°, 100 px | 22 | maxTargets 3 |

   Area scales the shapes (rectangle sides, cone reach); Might, Haste, Force apply; Amount adds one extra slash per volley (left: another rectangle 0.1 s later; right: +1 maxTargets); procs do not apply (physical has no affinity).
5. **Hits** go through `dealDamage(game, e, amount, 'physical', source, knock)` with `source` the dragon's position (so knockback pushes away from the dragon), knock × Force.
6. **Art (new, `art/`, pack style per `art/README.md`):** a slash effect for each shape: left-claw swipe (three curved claw streaks, ~56 × 18 source, 3 frames), right-claw cone slash (~40 × 40, 3 frames), and the dual claw reusing both. Effects are drawn at the slash position and facing, stretched only by integer screen scale (shape size changes with Area: either draw the effect at the matching integer scale step or keep the sprite and show the hitbox in `?debug=1` — your call, say which). Weapon icons 9 × 9: `icon.leftclaw`, `icon.rightclaw`, `icon.dualclaw` for cards and the HUD. Iterate in `tools/art-preview.html` on grass until they read clearly. Sounds: pick fitting ones from the pack (any WAV there may be copied in; add it to the manifest's sound list).
7. **Level-up:** both claws enter the weapon pool like other weapons; the evolution card has its own text ("Evolve: Left + Right Claw → Dual Claw").
8. **Debug:** the debug grant keys get the new weapons (extend F-keys or add a debug menu line; your call); `?debug=1` draws the claw hitboxes.
9. **Instrument:** `tools/measure.mjs` greedy policy learns the claws and takes the evolution card when offered.
10. **Spec:** §10 new subsections (10.5 left claw, 10.6 right claw, 10.7 dual claw and evolutions), §11/§12 notes (no procs on physical), §14.1 card pool (evolution), §17 HUD icons, §19 debug, plain text.

## Spec sections to read (whole)

§4.1, §5, §6.3 (facing), §8.7 (knockback), §10 (all), §11, §12, §12.1, §14, §14.1, §17, §19, §20; `art/README.md`.

## Tests

Shapes (rectangle side by facing, both sides from L3, cone membership and maxTargets nearest with ties), damage through resistances (skeleton weak, slime resists), knockback away from the dragon, every buff's effect, evolution offered only with both at L5 and replacing both, determinism and snapshot, render (effects drawn, render writes no state).

## Must not

Retune existing numbers. Another agent (T-027, braziers) adds `game.braziers`/`game.pickups` and hooks claws must also break braziers: if T-027 has merged when you finish, make claw hits break braziers; otherwise leave a clear hook and say so. Do not edit `docs/backlog.md`, merge or push. Follow the browser-checks rule (own port, own tab, pass `tabId`).

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; claws visible and working in a run; spec updated; `Measured:` in the commit body; commit `T-022: …` with `Closes: T-022`.
