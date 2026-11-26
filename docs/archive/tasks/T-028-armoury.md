# T-028: Armoury: out-of-game upgrades

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §9 · **Model:** Opus · **Depends on:** T-018 (merged: `meta` hook in `new Game({ meta })`, `dealDamage`)

## Why

The owner wants out-of-game upgrades: damage modifiers per attack type (fire, arcane, physical) or resistance reduction. They give runs a reason to repeat and make the matchup system (T-018) a long-term choice.

## What

1. **Gold:** at game over, `gold earned = floor(score / 20)` (*unmeasured*), shown on the game-over screen and added to the saved purse.
2. **Armoury screen,** reachable from the title (a second button / key `U`, gamepad `Y`) and returning to it: for each type (fire, arcane, physical) two tracks of 5 ranks, **Power** (+8% damage of that type per rank) and **Shred** (−0.1 to every enemy's resistance to that type per rank); rank `n` costs `20 × n²` gold. Shows purse, ranks, next cost, what each rank does in one line; buy with click / Enter / gamepad A; a **Reset** that refunds everything (confirm step). Uses the existing UI style; fits 960×600; keyboard, mouse and gamepad.
3. **Persistence:** `localStorage` key `dragon-survivors.armoury.v1` holding `{ gold, ranks }`, every read and write in try/catch; the game works (fresh purse each load) when storage is unavailable. Browser-only code; the sim never touches storage.
4. **Into the run:** the browser maps ranks to `meta` (`power = 1 + 0.08 × rank`, `shred = 0.1 × rank`) and passes it to `new Game({ seed, meta })`. Retry uses the current ranks.
5. **Instrument:** `tools/measure.mjs --meta fire:3/1,arcane:0/2,…` (power/shred ranks) so T-029 can measure with and without upgrades.
6. **Spec:** a section for gold and the armoury (screens, costs, storage, mapping to `meta`), plain text; remove "meta progression" from §22 out of scope.

## Decisions already made

- The bestiary already shows resistance after shred; keep that.
- `?seed=` runs still use the armoury (meta is part of the setup, recorded in the snapshot).
- No other currency or upgrade types in this task.

## Spec sections to read (whole)

§4.1 (meta), §12.1 (damage types), §13 (run end, score), §16, §17, §17.1, §18, §22.

## Tests

Gold from score; rank costs; buying and refunding (pure purse/ranks module tested under node); storage wrapper with a throwing fake storage; ranks → meta mapping; App flow title ↔ armoury and game-over gold; measure `--meta` parsing.

## Must not

Change sim behaviour beyond reading `meta` (already there). Another agent (T-017) changes `tools/build-atlas.mjs`, the manifest and the atlas in parallel: do not touch them. Do not edit `docs/backlog.md`, merge or push.

## Done means

`npm run gate` green; the armoury works in a browser across a reload; spec updated; commit `T-028: …` with `Closes: T-028`.
