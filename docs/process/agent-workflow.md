# Agent workflow

How work moves from a request to merged code. Adapted from the Deepholm process ([frozen copy](../../reports/process/2026-11-06-deepholm-dev-process.md)); this page is the rule for this project.

## Authority

[`docs/demo-spec.md`](../demo-spec.md) is the authority for behaviour. If code and spec disagree and the task does not say which is right, the code is wrong. [`docs/00-vision/`](../00-vision/) says what the game is and is not.

## Roles

| Role | Does | Does not |
|---|---|---|
| Owner | sets direction, makes taste calls | write code or manage tasks |
| Orchestrator (main Claude session) | writes work files, dispatches agents, reviews small diffs, merges, runs the gate, pushes `main`, keeps the backlog, reports | do large tasks itself (only docs, process and small fixes) |
| Implementer (subagent in its own worktree) | reads the work file and the spec sections it names, writes code + tests + spec edits, commits | edit `docs/backlog.md`, merge, push `main` |
| Reviewer (read-only subagent) | reads the diff of a risky change, reports confirmed faults | change code |

At most two implementers and one reviewer run at a time.

## The life of a task

1. **Source.** An owner request, a spec milestone, a report in `reports/`, or an agent's finding.
2. **Backlog row + work file.** One id series (`T-001`, `T-002`, …). The row goes in [`docs/backlog.md`](../backlog.md); the work file `docs/work/T-NNN-<slug>.md` holds why, what, the decisions already made, which spec sections change, and what "done" means. Open questions are decided before work starts.
3. **Work.** The implementer reads the work file, then every spec section it names (whole), then only the code it touches. Code, tests and spec change together. Something worth fixing outside the task becomes `docs/work/T-NEW-<slug>.md`, not a fix in passing.
4. **Commit.** Subject `T-NNN: <summary>`. Body, in order: what and why; `Spec edits:`; `Tests:`; `Expectations changed:` (each loosened or changed assertion and why); `Gates:`; `Closes: T-NNN`; `New rows:` (any `T-NEW` files). Commit work in progress as you go.
5. **Review.** Every change under `src/` or `tools/` is read by someone other than its author. Diffs under ~150 lines the orchestrator reads; larger ones, or anything touching the tick order, collisions, procs or determinism, go to the review agent.
6. **Merge and gate.** The orchestrator merges `--no-ff`, runs `node tools/close-task.mjs T-NNN` (archives the work file to `docs/archive/tasks/`, deletes the backlog row), numbers any `T-NEW` files, runs `npm run gate`, and pushes `main` only when it is green.

## Briefing an implementer

The dispatch prompt names: the work file and reading order; what earlier tasks left (seams, helpers, gotchas); hard constraints (determinism, sim purity, no dependencies); how to verify; the authority to decide without asking; what not to do (edit the backlog, merge, push `main`); and the report shape (short and high-level first, then figures).

## Spec and reports

- **Spec text is plain spec text.** No task ids, dates or "changed from" inside spec sections. After a task closes, the spec alone describes the game. History is git's job.
- **Numbers set by judgement are marked *unmeasured*** until a measurement replaces them.
- **Reports are frozen.** A re-measure or correction is a new dated report.

## Verification

- Before every commit: `npm run check` and the tests of every module changed.
- The gate is `npm run gate` (all static checks + the whole `node --test` suite). It runs locally because the whole suite takes well under a minute; CI (`.github/workflows/ci.yml`) runs the same gate on every push as a backstop. Long instruments, if any appear, go to CI.
- Screenshots are never committed.
- A fix needs a test that fails on the old code; otherwise say the evidence is a probe.

## Pacing and reporting

Updates to the owner are short and high-level: what moved, decisions made, real problems. Tables for comparisons. The orchestrator decides spec gaps itself and reports them; it asks the owner only about major obstacles or real taste questions.
