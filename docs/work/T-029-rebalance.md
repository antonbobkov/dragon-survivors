# T-029: Rebalance with the damage calculator and bots

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §11 · **Model:** Opus · **Depends on:** T-017–T-028

Planned. This file collects notes for the task as earlier tasks report them; the full brief is written when it starts.

## Notes from earlier tasks

- **T-018:** resistances have almost no effect while no weapon is physical and a L1 fireball one-shots a 2-HP slime (fire weakness invisible). Re-check once claws, bite and saw blade exist.
- **T-028:** gold rate `floor(score / 20)` gives ~65 gold for a 300 s, ~1000-kill run, while one armoury track costs 1,100 and all six 6,600. Tune the rate and/or costs so a player buys a first rank after 1–2 runs and fills a track in ~10–15 runs (judgement; say what you chose).
- **T-028:** `?debug=1` runs pay gold (F1–F5 could farm it). Decide whether debug runs should pay.
- **T-019 + its review:** the apparent "fireball knockback costs the aim bot" effect is build divergence, not knockback (see the [T-019 review](../../reports/reviews/2026-11-26-T-019-review.md) finding 4): with greedy picks, any position change reshuffles offers and per-seed tower loss is heavy-tailed. **Judge balance by medians and run-count targets, and test knock/number changes with fixed loadouts** (level-ups suppressed), not by means over picked builds.
- **T-019:** builds with Amount now hold the golem off to the 7:00 cap in up to 5/64 runs (each hit still pushes it 1 px). T-026 (poise) replaces that rule; re-measure after it.
- **T-019:** Might is +20/40/60% (was +25/50/80%).
