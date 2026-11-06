# Testing strategy

`node --test` with no dependencies. Tests live in `test/*.test.mjs` and import the sim directly; the sim has no DOM, so a test builds `new Game({ seed })` and calls `tick(intent)`.

## Kinds of tests

| Kind | What it pins | Example |
|---|---|---|
| Unit | one function or module | rng sequence, grid query, `xpToNext` |
| Scenario | a scripted situation played through `tick` | kill a gen-0 slime, expect two gen-1 slimes |
| Determinism | same seed + same intents ⇒ identical state digest | 300 s run, digest compared |
| Soak | long runs stay sane | 5 min with a circling dragon: no throw, cap respected, tower dies |
| Pipeline | build output matches what the game asks for | every atlas name in `content.js` exists in `assets/atlas.json` |

## Rules

- Every task adds or extends tests in the same commit as the code.
- A fix needs a test that fails on the old code.
- Tests that need the external asset pack (`E:\code\dragongame\assets`) skip when it is absent, so a checkout without the pack still passes. The committed `assets/atlas.json` is always checked.
- Randomness goes through `game.rng`; a test that needs a forced roll stubs `game.rng` (for example a function returning 0).
- Keep the whole suite under a minute on a laptop.

## Static checks

`npm run check` runs [`tools/check.mjs`](../../tools/check.mjs):

| Check | Fails when |
|---|---|
| syntax | any `.js`/`.mjs` file does not parse (`node --check`) |
| sim purity | a file under `src/sim/` mentions `window`, `document`, `Date`, `performance`, `Math.random`, `requestAnimationFrame`, or imports from outside `src/sim/` |
| atlas names | a name listed in `content.js` `ATLAS_NAMES` is missing from `assets/atlas.json` |
| docs links | a relative Markdown link under `docs/`, `README.md` or `CLAUDE.md` points at a missing file |
| conflict markers | any tracked text file contains a merge conflict marker |
