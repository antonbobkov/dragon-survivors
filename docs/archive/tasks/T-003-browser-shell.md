# T-003: Browser shell

**Source:** [demo-spec.md](../../demo-spec.md) milestones 1–2 · **Model:** Opus · **Depends on:** T-001 (atlas), T-002 (sim core)

## Why

The sim and the atlas exist but nothing is on screen. This task makes milestones 1 and 2 playable in a browser: the dragon flies over grass, the tower follows, knights march in, the fireball fires, the tower falls, Retry works.

## What

| File | Scope |
|---|---|
| `index.html` | one canvas 960×600, CSS that fits it to the window keeping aspect (integer scale when the window allows, else fractional), `image-rendering: pixelated`, dark page background, `<script type="module" src="src/main.js">` |
| `src/main.js` | load assets, read `?seed=N` (else a random seed; `Math.random` is fine outside `src/sim/`), build `Game`, start the loop on the title screen |
| `src/loop.js` | fixed-step accumulator at 60 Hz, at most 4 ticks per frame (drop the rest), render every `requestAnimationFrame`; ticks stop while the title, pause or level-up screen is open (§4) |
| `src/input.js` | keyboard, mouse, gamepad → `Intent` (§4, §16): last device wins; mouse aim is the mouse position relative to the dragon **on screen**, converted from CSS pixels to internal pixels; right-stick deadzone 0.25; edge-triggered `confirm` and `pick` |
| `src/assets.js` | fetch `assets/atlas.png`, `assets/atlas.json`, decode every WAV in `assets/sounds/` |
| `src/audio.js` | Web Audio, `play(name, { volume })`, 16-voice cap, 50 ms per-sound minimum interval, `resume()` on the Start click (§18) |
| `src/render/draw.js` | background tile, tether ring, the §5 draw order, 2× sprites, `flip`, `alpha`, `scale`, dragon `dirFrame` + bob, 16-direction projectiles via `dirFrame`, tower with its 4 px HP bar (§5, §6.3, §7.3) |
| `src/render/hud.js` | timer, tower HP bar, XP bar + level, weapon and buff icons with level pips (§17) |
| `src/render/screens.js` | title (Start), pause, game over with time, level, kills, score and Retry (§13); the level-up screen is T-005 |

Plays `game.events` sounds after each tick. Plays `start_game` on Start.

## Decisions already made

- **Camera:** centred on the dragon, integer-rounded offset so sprites do not shimmer. World → screen: `sx = x − dragon.x + 480`, `sy = y − dragon.y + 300`. Sprites are drawn centred on the entity position at 2× (§5).
- **Background:** the grass tile uses its own `mulberry32` from `src/sim/rng.js` with a fixed seed, so it never touches `game.rng`.
- **Gem sprite** (procedural, §3.3) is drawn by `draw.js` as a 6 px diamond in two colours (at 2×, 12 px on screen). Gems arrive in T-005; draw whatever `game.gems` holds.
- **Weapon HUD icons:** fireball → first frame of `fireball.anim`; laser → frame 12 (right) of `laser.dir`; mini tower → `castle` at 1×; ring → `icon.ring`. Buff icons as in §11. Write this into §17.
- **Pause:** Esc/P/Start toggles; the pause screen shows "Paused" and the controls. Window blur also pauses.
- **Retry:** builds a new `Game` with a new random seed (or the same `?seed` if one was given) and skips the title.
- **Hidden tab:** the accumulator clamps, so returning to the tab does not fast-forward.
- **Render purity:** render code reads `game` and never writes to it. Sprite lookups go through a small helper (`drawAnim(ctx, name, frame, x, y, { flip, alpha, scale })`).
- **Testing browser code:** pure parts get unit tests under node (no DOM): intent building from a key/mouse/pad snapshot, CSS→internal coordinate conversion, the loop's accumulator (driven by fake timestamps), the audio throttle (fake clock). DOM glue stays thin.

## Spec sections to read (whole)

§2, §3.3 (names and sizes), §4 and §4.1 (sim state, written by T-002), §5, §6.3, §7.3, §13, §16, §17, §18.

## Verify

`npm run gate`. Then serve (`python -m http.server 8000`) and load the page in a browser if you can; the orchestrator will also check it in a browser after the merge. No screenshots in commits.

## Must not

Edit `docs/backlog.md`, merge, push `main`; change sim behaviour (a sim bug you find becomes a `T-NEW-<slug>.md`, unless it blocks you, then fix it minimally and say so).

## Done means

The game is playable to game over and Retry in a browser with keyboard+mouse and with a gamepad; `npm run gate` green; spec §17 updated; commit `T-003: …` with `Closes: T-003`.

## What T-002 left you

Read spec §4.1 for the state interface. Highlights: `game.phase` (`play`/`dying`/`over`), `game.events` (`{ type: 'sound', name }`, cleared each tick), `dragon.anim = 'dragon.dir'` with `frame = dirFrame` and a `bob` of ±1 to draw (the sim position does not bob), `tower.anim = 'castle'`, effects with `scale, alpha, flip, hold`, projectiles with `dirFrame` for 16-direction sprites, `game.score()`. Enemy types: `knight, skeleton, slime, mage, ghostKnight, ghost, golem`. `content.js` exports `ATLAS_NAMES`, `SOUND_NAMES`, the weapon and buff tables; intent `confirm` and `pick` are ignored by the sim core today.
