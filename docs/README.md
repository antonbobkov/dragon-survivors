# Documents

| Path | Holds | Rule |
|---|---|---|
| [00-vision/](00-vision/) | [demo design](00-vision/demo-design.md), [Peter's ideas](00-vision/peter-ideas.md) | what the game is and is not |
| [demo-spec.md](demo-spec.md) | the implementation spec: engine, systems, content tables, constants | the authority for behaviour |
| [process/](process/) | [agent workflow](process/agent-workflow.md), [ambiguity protocol](process/ambiguity-protocol.md), [testing strategy](process/testing-strategy.md) | how work is done |
| [backlog.md](backlog.md) | every open task, one table | only the orchestrator edits it |
| [work/](work/) | one work file per open task | decisions, not open questions |
| [archive/](archive/) | closed tasks | history; never edited |
| [decisions.md](decisions.md) | decisions still pending | rows deleted once folded into the spec |
| [fun-features.md](fun-features.md) | mechanics kept for character | each removable only if it breaks the game |
| [`reports/`](../reports/) | measurements, reviews, gate reports, process sources | frozen once written |

Content lives in the spec's tables and in `src/sim/content.js`. While the game is a single demo, the spec stays one document; split it per system (`01-architecture/`, `02-systems/`) when it outgrows that.
