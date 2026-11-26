# T-029: Rebalance with the damage calculator and bots

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §11 · **Model:** Opus · **Depends on:** T-017–T-028

Planned. This file collects notes for the task as earlier tasks report them; the full brief is written when it starts.

## Notes from earlier tasks

- **T-018:** resistances have almost no effect while no weapon is physical and a L1 fireball one-shots a 2-HP slime (fire weakness invisible). Re-check once claws, bite and saw blade exist.
- **T-028:** gold rate `floor(score / 20)` gives ~65 gold for a 300 s, ~1000-kill run, while one armoury track costs 1,100 and all six 6,600. Tune the rate and/or costs so a player buys a first rank after 1–2 runs and fills a track in ~10–15 runs (judgement; say what you chose).
- **T-028:** `?debug=1` runs pay gold (F1–F5 could farm it). Decide whether debug runs should pay.
