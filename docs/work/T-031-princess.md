# T-031: Princess (escort)

**Source:** decision D-9 (accepted by the owner), [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §12 · **Model:** Opus · **Depends on:** nothing open

## Why

An escort is a control objective: protect someone walking through the horde, rewarded with a stronger tower. The pack has a princess (walk and death) and the original game's princess sounds.

## What

1. **Spawn:** every `PRINCESS_INTERVAL = 120` s from 2:00 (*unmeasured*), if none is alive, a princess appears just outside the view on a random side and walks straight to the **tower** (re-aiming at the tower's current position each step) at 40 px/s (*unmeasured*). `game.princesses` (at most one), not an enemy.
2. **Threat:** she has HP 20 (*unmeasured*) and takes contact damage from enemies overlapping her exactly like the tower does (enemy DPS × tier, golem included). **Enemies prefer her:** an enemy whose centre is within `PRINCESS_LURE = 160` px of her walks at her instead of the tower (stampede horses keep their lines; the golem keeps the tower). Player weapons never hurt her.
3. **Arrival:** when she reaches the tower (overlap), she is rescued: tower `maxHp` +25 and the tower heals to full; sound `princess_arrive` (copy it from the pack root into `assets/sounds/` via the manifest's sound list); a short sparkle effect (reuse a pack anim or draw one).
4. **Death:** at 0 HP she plays the pack's death anim, sound `princess_capture` (or another fitting pack sound), nothing else is lost.
5. **Art:** import the pack's `princess/princess.txt` (walk) and `princess/die.txt` (die); no tiers. Check they read on grass at 2× next to the dragon; draw nothing new unless something is missing.
6. **UI:** an off-screen edge marker for her (reuse T-027's markers, a distinct colour), and a small HP bar above her (like the tower's).
7. **Determinism:** document draws (spawn side); state in the snapshot.
8. **Instrument:** bots ignore her (note it for T-029).
9. **Spec:** a new section (e.g. §14.4), §2.1 tick placement, §4.1, §5 draw order, §7.2 (max HP can grow), §17; plain text; remove the princess from "proposed" lists.

## Must not

Retune other numbers. Another agent (T-030: merchant) adds `game.merchants`, a shop screen and edge markers in parallel: expect a merge in `game.js`, `hud.js`, the spec and the manifest; rebuild with `npm run build:assets` after merging main. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule; when reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; a princess can be escorted to the tower (max HP up, full heal) and can die, in a run; spec updated; `Measured:` in the commit body; commit `T-031: …` with `Closes: T-031`.
