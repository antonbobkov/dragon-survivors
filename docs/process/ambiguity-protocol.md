# Ambiguity protocol

What an agent does when the spec does not settle a question.

1. **Search again.** Read the whole spec section, its neighbours, the vision docs in [`docs/00-vision/`](../00-vision/), and the work file. Many gaps are answered elsewhere (for example a radius in a table two sections away).
2. **Spec and code disagree:** unless the task says otherwise, the code is wrong. Fix the code.
3. **Spec is silent:** choose the most conservative reading: the one that changes the least, adds the least state, and is easiest to undo. Prefer behaviour the original dragongame had.
4. **Write it down.** Add the decision to the spec as plain spec text (no task ids), in the section it belongs to. Mark judgement numbers *unmeasured*.
5. **Pin it.** Add a test that holds the chosen behaviour, so a later change has to be deliberate.
6. **Report it.** List the decision in the commit body under `Spec edits:` and in the final report.

Do not stop to ask. Questions that only the owner can answer (taste, direction) go in the final report with a recommendation, and work continues on the recommended reading.
