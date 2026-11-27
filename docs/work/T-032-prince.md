# T-032: Prince (rival)

**Source:** decision D-10 (accepted by the owner), [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §12 · **Model:** Opus · **Depends on:** T-030 (merchant pattern, merged)

## Why

A rival gives the player a priority target: a dragon-slayer prince who steals the gems around the dragon until you kill him. It is a "kill this first" threat (single-target role) that also rewards you when you answer it.

## What

1. **Spawn:** every `PRINCE_INTERVAL = 100` s from 2:15 (*unmeasured*), if none is alive, a prince appears just outside the view on a random side and walks at the **dragon** at 70 px/s (*unmeasured*; slower than the dragon). `game.princes` (at most one). Unlike the merchant he **is a foe**: target him like an enemy in every targeting rule (mini-tower targeting, claw cone slots, bite, bomb, explosions) — the simplest path may be to make him an enemy type (`prince`) in `ENEMIES` with special behaviour; decide and say why.
2. **Theft:** while within 60 px of the dragon, every 0.5 s he steals the nearest gem within 120 px of himself (it vanishes into his sack: add its value to `prince.stolen`), sound from the pack (`dropping`? pick a fitting one). Gems already homing to the dragon are safe.
3. **Combat:** HP 40, resistances physical 0.5 (fire 0, arcane 0), mass 1.5, contact DPS 0 to the tower (he does not attack the tower). He never dies to the golem or other enemies.
4. **Death:** pack `princess/prince_die.txt` anim; he drops **one gem worth all he stole + 5** (so killing him early pays little, late pays a lot), sound `ohno`? (pick a fitting pack sound).
5. **Art:** import the pack's `princess/prince.txt` (walk) and `princess/prince_die.txt` (die); tier variants not needed (he is not part of the tier scheme). Check on grass beside the dragon at 2×.
6. **UI:** edge marker (distinct colour), a sack counter or bubble showing stolen XP above him, bestiary card if he is an enemy type (11 types: check the layout fits, or show him in the merchant-style "not in the bestiary" list — decide).
7. **Determinism:** documented draws; state in the snapshot.
8. **Instrument:** bots treat him as an enemy only through generic targeting (note for T-029).
9. **Spec:** a new section (e.g. §14.5), §2.1, §4.1, §5, §8 (if an enemy type), §17; plain text; remove the prince from "proposed" lists.

## Must not

Retune other numbers. Another agent (T-031: princess) adds `game.princesses`, enemy lure logic and edge markers in parallel: expect a merge in `game.js`, `enemies.js`, `hud.js`, the spec and the manifest; rebuild with `npm run build:assets` after merging main. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule; when reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; a prince steals gems and drops them when killed, in a run; spec updated; `Measured:` in the commit body; commit `T-032: …` with `Closes: T-032`.
