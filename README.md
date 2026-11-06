# Dragon Survivors

A Vampire Survivors-style demo: walk an invulnerable dragon, keep the tethered tower alive, survive the horde past 5:00.

**Play it:** <https://antonbobkov.github.io/dragon-survivors/> (GitHub Pages, deployed from `main`).

Plain JavaScript ES modules on an HTML canvas. No framework, no bundler, no runtime dependencies.

## Run

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. Add `?seed=N` to fix the RNG.

| Action | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | WASD or arrows | left stick |
| Aim | mouse | right stick |
| Pick a level-up card | 1 / 2 / 3 or click | d-pad + A |
| Pause | Esc or P | Start |

With `?debug=1`: collision circles and a stats overlay, F1–F4 grant fireball / laser / mini tower / ring at level 5, F5 jumps to 4:50, `+` / `-` change game speed.

## Develop

| Command | Does |
|---|---|
| `npm run check` | static checks ([tools/check.mjs](tools/check.mjs)) |
| `npm test` | `npm test` |
| `npm run gate` | both; must be green before `main` moves |
| `npm run measure` | headless balance instrument ([tools/measure.mjs](tools/measure.mjs)) |
| `npm run build:assets` | rebuild `assets/` from the dragongame pack (path in `tools/manifest.json`) |

## Documents

Start at [docs/README.md](docs/README.md). The spec, [docs/demo-spec.md](docs/demo-spec.md), is the authority for behaviour. How work is done: [docs/process/agent-workflow.md](docs/process/agent-workflow.md).
