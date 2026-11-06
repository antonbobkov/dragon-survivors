# Dragon Survivors: notes for agents

- **Authority:** [docs/demo-spec.md](docs/demo-spec.md). If code and spec disagree, the code is wrong. Spec gaps: [ambiguity protocol](docs/process/ambiguity-protocol.md).
- **Process:** [docs/process/agent-workflow.md](docs/process/agent-workflow.md). Tasks are rows in [docs/backlog.md](docs/backlog.md) with work files in `docs/work/`. Only the orchestrator edits the backlog, merges and pushes `main`.
- **Commits:** subject `T-NNN: …`; body sections `Spec edits:`, `Tests:`, `Expectations changed:`, `Gates:`, `Closes:`, `New rows:`.
- **Sim purity:** `src/sim/` has no DOM, canvas, `Date`, `performance` or `Math.random`; all randomness through `game.rng`. Enforced by `npm run check`.
- **No dependencies.** Node built-ins only for tools and tests; the browser loads ES modules directly.
- **Verify:** `npm run gate` (static checks + `npm test`), always locally. No GitHub Actions or other CI in this project. Never commit screenshots.
- **Windows:** the owner's machine is Windows; scripts must work there (use `node:path`, no shell-specific commands in npm scripts).
