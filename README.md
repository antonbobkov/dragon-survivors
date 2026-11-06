# Dragon Survivors

A Vampire Survivors-style demo: fly an invulnerable dragon, keep the tethered tower alive, survive the horde past 5:00.

Plain JavaScript ES modules on an HTML canvas. No framework, no bundler, no runtime dependencies.

## Run

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>. Add `?debug=1` for debug tools and `?seed=N` to fix the RNG.

## Develop

| Command | Does |
|---|---|
| `npm run check` | static checks ([tools/check.mjs](tools/check.mjs)) |
| `npm test` | `npm test` |
| `npm run gate` | both; must be green before `main` moves |
| `npm run build:assets` | rebuild `assets/` from the dragongame pack (path in `tools/manifest.json`) |

## Documents

Start at [docs/README.md](docs/README.md). The spec, [docs/demo-spec.md](docs/demo-spec.md), is the authority for behaviour. How work is done: [docs/process/agent-workflow.md](docs/process/agent-workflow.md).
