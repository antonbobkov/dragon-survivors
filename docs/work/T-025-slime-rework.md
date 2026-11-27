# T-025: Slime rework: two splits, sizes, megaslime fusion

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §5; owner notes 2 ("split up to twice and be slightly smaller each time… custom pixel art for each… > 100 slimes fuse into a megaslime, which just soaks up damage and doesn't hurt you") · **Model:** Opus · **Depends on:** T-017, T-018, T-019, T-021, T-024 — all merged

## Why

The owner likes slimes and wants them to split twice, shrinking each time with real pixel art for each size, and to fuse into a harmless damage-soaking megaslime when the screen floods.

## What

1. **Generations:** gen 0 (today's 16 px art, HP 3) → on death two gen 1 (**new 12 px art**, HP 2) → each on death two gen 2 (**new 9 px art**, HP 1, no further split). Radii 12 / 9 / 7 (*unmeasured*). Each generation plays its own split anim when it splits and its own die anim when it dies without splitting (gen 2). Children keep the existing placement rule (±20 px perpendicular to the path, scaled down per generation if it reads better) and inherit the tier.
2. **Fusion:** whenever more than `SLIME_FUSE_COUNT = 100` slimes are alive, at most once per second the 12 slimes nearest the slime with the most slime neighbours within 80 px fuse into a **megaslime** at their centroid: HP = 4 × the sum of their HP, contact DPS **0**, speed 15, radius 28, mass 4, XP = sum of theirs, resistances as slimes (design §2). It walks at the tower, never hurts it, and soaks shots and fire. Tier: the highest tier among the fused slimes. Play the pack's `mega_slime_reproduce` (or a fitting anim) as the fusion effect. The megaslime dies with the pack's `mega_slime_die` and does not split.
3. **Art:** gen 1 and gen 2 walk, split, die drawn new in `art/` in the pack's slime style (study `slime/slime*.bmp` with `tools/bmp-to-art.mjs`: same palette, same squash-and-stretch walk, fewer pixels — **never downscale** the 16 px frames); import the megaslime walk/die/reproduce from the pack (`slime/mega_slime_*.txt`). All slime anims get tier variants (manifest `tiers.anims`; T-021's test requires it to match `TIERED_ANIMS`). Iterate in `tools/art-preview.html` on grass until gen 1 and gen 2 clearly read as the same creature, smaller.
4. **Bestiary:** a `megaslime` card (10 types: T-024 says the layout holds up to 10 — check it fits); the slime card notes the three sizes.
5. **Fun feature:** add "megaslime fusion" to `docs/fun-features.md` with its test.
6. **Spec:** §8 table (slime generations, megaslime row), §8.4 slime rules, a fusion subsection with the choice rule and the once-per-second limit, §3.3 art, plain text.

## Determinism

Fusion choice is deterministic (ties by lower id); no random draws.

## Tests

Two splits then none; HP/radius/anims per generation; tier inheritance through both splits; fusion trigger at 101 slimes, once per second, the 12 nearest the densest, centroid, HP/XP sums, DPS 0 (never damages the tower), highest tier; megaslime death does not split; determinism and snapshot; every slime anim has tier variants; bestiary fits 10 types.

## Must not

Retune other numbers. Another agent (T-023: bite and saw blade) changes weapons, render and the atlas in parallel: expect a manifest/atlas merge; rebuild with `npm run build:assets` after merging main. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule (own port, own tab, pass `tabId`; if the sandbox refuses your port, the shared `game` server on 8000 can open your worktree at `/.claude/worktrees/<name>/index.html`). When reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; splits and a fusion visible in a run (`?debug=1`); spec updated; `Measured:` in the commit body; commit `T-025: …` with `Closes: T-025`.
