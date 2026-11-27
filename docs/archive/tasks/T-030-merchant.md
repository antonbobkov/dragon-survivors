# T-030: Merchant

**Source:** decision D-8 (accepted by the owner), [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §12; Peter's ideas ("merchants: drop power ups? … hard to kill … requires some strategy") · **Model:** Opus · **Depends on:** nothing open

## Why

A merchant gives the player a choice every 90 s: **trade** (stand by him, spend banked XP for a reroll, a chosen card or a heal) or **rob** him (he is fast and tanky; killing him drops a chest with a free upgrade). It pulls the player out of position (control) and creates a greed decision.

## What

1. **Spawn:** every `MERCHANT_INTERVAL = 90` s from 1:30 (*unmeasured*), one merchant appears just outside the view on a random side and walks **across** the field on a straight line that passes within ~200 px of the tower, at 50 px/s, and leaves (despawned once 1400 px from the tower). At most one at a time. He is an entity in his own list (`game.merchants`), not an enemy: enemies ignore him; player weapons **do** hit him (through `dealDamage`, so resistances apply: he resists everything 0.5) — robbing is a choice you make by aiming at him, but area weapons hit him too (the risk).
2. **Trade:** while the dragon stays within 40 px of him for 1.5 s continuously he stops and opens a **shop** (the world freezes like the level-up screen, through the sim, picks come through `tick(intent)`): three offers priced in **XP already banked** this level (cost in XP points, paid from `game.xp`, never dropping a level): (a) reroll the next level-up's offers, (b) a chosen card from the full pool (pick from the pool list), (c) heal the tower +30. Prices (*unmeasured*): 10 / 25 / 15 XP; unaffordable offers are greyed. After a trade, or on "leave", he walks on and cannot be traded with again.
3. **Rob:** HP 80, resists 0.5 to all types, mass 3; when hit he flees **away from the dragon** at 90 px/s for 3 s (then walks on). Killing him drops a **chest** pickup (collected like a brazier pickup) that opens a level-up screen of 3 cards **without** costing a level (a free pick). No XP gem.
4. **Art (new, pack style per `art/README.md`):** the pack has `trader/trader0000..0001.bmp` (walk) and `trader/merchant_die0000..0006.bmp` (die): import those. Draw a chest pickup (9 × 9 or 12 × 10) and a shop icon/bubble if useful. Iterate on grass in `tools/art-preview.html`.
5. **UI:** shop screen in the level-up style (keys 1/2/3, click, d-pad + A; Esc/B leaves); an off-screen edge marker for the merchant (reuse T-027's markers); bestiary: he is not an enemy (no card).
6. **Determinism:** document draws (spawn side, line offset); shop picks through the intent stream.
7. **Instrument:** bots ignore the merchant (note it for T-029) unless trivial to add "rob if in range".
8. **Spec:** a new section (e.g. §14.3) with all of the above; §2.1, §4.1, §5, §16, §17; plain text. Remove "merchants" from §22 / vision "proposed".

## Must not

Retune other numbers. Another agent (T-020: the damage calculator, `tools/dps.mjs`) works in parallel — no overlap expected. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule; when reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; trading and robbing both work in a run; spec updated; `Measured:` in the commit body; commit `T-030: …` with `Closes: T-030`.
