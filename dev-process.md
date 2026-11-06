# How Deepholm is built: the development process

**Written:** 2026-11-06, at commit `c23b76cc` · **For:** someone starting a new project the same way · **Governing documents:** [agent-workflow.md](../../docs/process/agent-workflow.md), [ambiguity-protocol.md](../../docs/process/ambiguity-protocol.md), [testing-strategy.md](../../docs/process/testing-strategy.md), [tooling.md](../../docs/04-implementation/tooling.md)

This is a portable summary. The documents linked above are the rules; this page explains how they fit together and why, with the lessons that shaped them.

## The idea in one paragraph

The game is built by AI agents from a written specification. The specification in `docs/` is the authority: if the code and the spec disagree, the code is wrong. One agent, the **orchestrator**, talks to the owner, writes the briefs and decisions, sends work to **implementer agents** in their own git worktrees, has a **review agent** check risky changes, merges, runs the gate and reports. Every change starts from a written source, becomes a numbered task with a work file, lands as code + tests + spec edits together, and ends with the task archived and the spec describing the new behaviour on its own.

## Roles

| Role | Who | Does | Does not |
|---|---|---|---|
| Owner | the person | sets direction, makes taste calls, answers the few questions only they can | write code or manage tasks |
| Orchestrator | one long-running Claude session | turns requests into tasks and decisions, writes briefs, dispatches agents, reviews small diffs, merges, gates, pushes, reports, keeps the backlog | do large tasks itself (only small doc and process edits) |
| Implementer | a Claude subagent per task, in its own worktree | reads the work file and spec, writes code, tests and spec edits, measures, commits with `Closes:` | edit the backlog, merge, or push `master` |
| Reviewer | a separate Claude subagent, read-only | reads the diff of a risky change and reports confirmed faults | change code |

**Standing rules from the owner** (kept in the orchestrator's memory):
- **Decide without asking.** The orchestrator makes the judgement calls on spec gaps, fixes and dispatch, writes them down, and reports them. It asks only for real taste questions (for example, "should a well-armed squad be able to beat a raid?").
- **At most two working agents plus one review agent** at a time. Opus for complex or seam-crossing work, Sonnet for mechanical work.
- **Short, high-level updates.** Big picture first; omit minor details. Tables for comparisons.

## The documents

| Path | Holds | Rule |
|---|---|---|
| `docs/00-vision/` | vision, pillars, scope, glossary | what the game is and is not |
| `docs/01-architecture/` | the engine: tick, events, saves, content pipeline | |
| `docs/02-systems/` | one document per game system: rules, state, interfaces, player-facing behaviour, constants | the authority for behaviour |
| `docs/03-content/` | every row of content as Markdown tables (materials, creatures, recipes…) | the source; `npm run content:export` writes the JSON the game loads |
| `docs/04-implementation/` | schemas, algorithms, tick order, event and command catalogs, save format, tooling | |
| `docs/process/` | how work is done | |
| `docs/backlog.md` | every open task, one table | only the orchestrator edits it |
| `docs/work/` | one work file per open task | decisions, not open questions |
| `docs/archive/` | closed tasks and old plans | history; never edited |
| `docs/decisions.md` | only what is still pending | rows are deleted once folded into the spec |
| `docs/fun-features.md` | mechanics kept for character, each removable | see § Fun features |
| `docs/balance-status.md` | the latest measurement per balance measure | overwritten by remeasures |
| `reports/` | audits, designs, measurements, data, gate reports, summaries | frozen once written |

Two properties hold the whole thing together:
- **Spec text is plain spec text.** No task ids, dates or "changed from" in the spec. After a task closes, the spec alone says how the game behaves. History is git's job.
- **Reports are frozen.** A re-measure or correction is a new dated report. Evidence never moves under a decision that cited it.

## The life of a task

```
source ──► backlog row ──► work file ──► code + tests + spec edits ──► review ──► merge + gate ──► archive
(report,    (backlog.md,     (docs/work/,    (agent's worktree,           (risky      (orchestrator)    (docs/archive/tasks/)
 audit,      next free id)    decisions)      one or more commits)          changes)
 request)
```

1. **A source.** Every task has one: an audit, a measurement, a design proposal, an agent's finding, or an owner request. Sources live in `reports/`.
2. **A backlog row and a work file.** One id series for everything (`T-101`, `T-102`, …). The work file says why, what to do, the decisions already made, which spec sections change, and what "done" means. Open questions are decided before the work starts and written in.
3. **The work.** The implementer reads the work file, its source, every spec section it names (whole), the schemas, and only the code it will touch. It changes code, tests and spec together. Something worth fixing outside the task becomes a new work file (`T-NEW-<slug>.md`), not a fix in passing; the orchestrator numbers it at the merge.
4. **The commit.** Subject `T-123: …`. The body lists, in order: what and why, `Spec edits:`, `Tests:`, `Expectations changed:` (each loosened or changed assertion, with why it was exactly the old behaviour), `golden:`, `Gates:`, `Closes:` and `New rows:`.
5. **Review.** Every change under `src/` is read by someone other than its author. Small diffs the orchestrator reads itself; larger or seam-crossing ones (about 150 lines or more, or anything touching jobs, movement, generation, saves or combat) go to the review agent.
6. **Merge and gate.** The orchestrator merges `--no-ff`, closes the task with `node scripts/close-task.mjs` (archives the work file, deletes the backlog row, repoints links), numbers the `T-NEW` files, runs the gate, and pushes `master` only if everything is green.

**Large features** go through a low-level design first. Runecraft (the magic system) started as an owner's design proposal in `reports/designs/`; a design task checked every claim against the code, wrote `docs/02-systems/25-runecraft.md`, listed every change from the design with its reason, and split the work into twelve tasks with their dependencies. Each later task built from the spec alone.

## Briefing an agent

A dispatch prompt is short and self-contained. It names:
- the task's work file, and the reading order (work file, its source, the spec sections);
- what earlier tasks left the agent: the seams, helper names, gotchas found on the way;
- the hard constraints: what must not change (for example "combat with no magic in play must draw the same random numbers"), determinism, content-row rules;
- how to verify, which runs go to GitHub, and what to measure;
- the authority to decide, and "do not ask questions";
- what it must not do: edit the backlog, merge, push `master`, commit screenshots;
- the shape of the final report: short and high-level first, then figures and run ids.

Agents commit work in progress as they go, so a usage-limit stop loses little. A stopped agent is resumed with a message saying what was lost (for example a killed background run).

## Decisions and ambiguity

- **The owner's taste decides taste.** The orchestrator brings real questions to the owner with a recommendation; everything else it decides.
- **When the spec is silent** ([ambiguity protocol](../../docs/process/ambiguity-protocol.md)): search again, choose the most conservative reading, write it into the spec, and pin it with a test.
- **When the spec and the code disagree** and the task does not say which is right, the code is wrong.
- **Numbers set by judgement are marked *unmeasured*** until a task measures them.
- **The owner's numbers are guidance.** For runecraft the owner said the design's numbers and details were guidance, not strict rules; the design task changed 38 of them, each with a one-line reason.

## Verification

**Before every commit, locally:** the six static checks (lint, typecheck, content, strings, interface, docs links) and the tests of every module changed.

**Long runs go to GitHub Actions** (since 2026-11-05, an experiment that has held up):
- always for anything of ten minutes or more: the full `npm test` (four parallel shards), the e2e suite, the annual instrument, the twenty-seed survival sweep;
- five to ten minutes by judgement, preferring GitHub;
- locally for new tests, quickly failing ones and fast iteration, and for timing tests that need a quiet machine.

Agents push their own task branches to run these; only the orchestrator moves `master`.

**The merge gate:** merge locally, run the six static checks, push the merge to a `gate/<sha>` branch, run CI there, and push `master` only when CI passes. A local gate script is the fallback if GitHub is down for a long stretch.

**Kinds of tests** ([testing-strategy.md](../../docs/process/testing-strategy.md)): unit, scenario (scripted fortresses that play the game by commands), property, golden (world hashes and rendered cell buffers that move only on purpose), e2e in a browser, and performance budgets. Every task adds or extends tests in the same commit as the code.

## Measuring a simulation

A colony sim is chaotic: a one-tick change reshuffles everything downstream. The project learned to measure against that:

- **Instruments, not anecdotes.** The annual wildlife instrument (twelve seeded fortresses for a year) and the twenty-seed three-year sweep each have a written set rule (for example "all alive at year 1, every peaceful fortress grown, at most one with a hunger death").
- **Judge pooled samples, not one run.** The same code shifted by one tick moved the instrument's sum of living dwarves from 118 to 157. A third of single runs failed the old bounds by chance. The instrument now plays eight shifted samples in one command and judges their pooled figures against tolerances set from measured noise. The sweep is getting the same treatment.
- **Prove "nothing changed" exactly.** Where a feature must not affect play without it (for example a fortress with no magic), tests pin byte-for-byte digests of arenas and of a defence scenario, and compare every random stream.
- **Separate random streams.** Each system has its own stream; a new feature draws on its own, only in the case it serves, so it does not reshuffle everything else.
- **Look before tuning.** A surprising figure gets a journal of one seed and a named cause before any number changes. Several "balance" problems turned out to be script faults (a kitchen 58 tiles from the food, a cave farm dug into unreachable rock).

## Fun features

The owner values character over tidiness. [`docs/fun-features.md`](../../docs/fun-features.md) lists mechanics kept for character (careless low-skill shooters who hit their own line, pets heaping by the hearth, hungry dwarves eating the herbs grown for draughts). Each is a real rule with a test, marked removable only if it breaks game logic. A trade-off that is sometimes worse (a fearsome axe that makes a squad chase and swing less) is kept, not tuned away. Agents report goofy behaviour as a feature, and say so when a task would cut one for cost.

## Communication and pacing

- **Updates are short and high-level.** What moved, any decision that needs the owner, any real problem.
- **Timers are background shell loops** in the orchestrator's session (`until [ time ]; do sleep 60; done`), which proved more reliable than one-shot cron jobs.

## Lessons that became rules

| What happened | The rule it produced |
|---|---|
| A docs-only merge broke a unit test that counted documents | Run the unit tests on every merge, docs included |
| A merge was committed with conflict markers in a spec file | The gate checks for conflict markers before anything else |
| An agent committed regenerated e2e screenshots | Screenshots are never committed outside a gate report |
| Parallel heavy runs on one machine were too slow, and the owner stopped them | One heavy local process at a time; long runs on GitHub |
| A pushed commit had broken links | Push only after `docs:check` passes |
| A single instrument sample blocked, then passed, the same kind of change | Pool shifted samples and set tolerances from measured noise |
| Adding a content row would have silently corrupted old saves (rows were numbered by sorted id) | New rows number last, through a checked `row-order.md`; the baseline file is never edited |
| A feature drew one extra random number per spawn and reshuffled later raids | A new feature draws only on its own stream, only when it acts |
| An agent's test passed before and after its fix | A fix needs a test that fails on the old code; otherwise the evidence is the probe, stated as such |

## Starting a new project this way

1. Write the vision, scope and pillars first, then one document per system with rules, state, interfaces and constants, then content as tables.
2. Set up the six static checks, including a link checker and a check that each system document's interfaces match the code.
3. Create `backlog.md`, `docs/work/`, `docs/archive/`, `decisions.md` and `reports/` with the freezing rule.
4. Write the agent workflow (this project's [agent-workflow.md](../../docs/process/agent-workflow.md) is a good template) and the ambiguity protocol.
5. Put long tests on CI from the start, with a workflow that takes a branch and a suite name.
6. Decide early how to measure: seeded scenarios, set rules, and pooled samples for anything chaotic.
7. Keep the orchestrator's standing rules in its memory: the owner's preferences, the agent limits, the reporting style.
