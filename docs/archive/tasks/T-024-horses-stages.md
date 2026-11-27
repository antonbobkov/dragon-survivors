# T-024: Horses, mounted knights, stages and banners

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §5, §7; owner notes 2 (enemies; "different stages require different strategies") · **Model:** Opus · **Depends on:** T-017 (art), T-018 (resistances), T-019 (mass), T-021 (tiers) — all merged

## Why

The owner asked for mounted knights (bigger, faster, tankier) and plain horses (very fast), and for stages that each demand a different strategy. Horses are the first enemy you cannot chase: you zone them. Mounted knights are armoured: they want arcane or a bite.

## What

1. **Horse** (`horse`): HP 2, speed 120 px/s (faster than the dragon), radius 10, contact DPS 4, XP 1, mass 0.5, resistances all 0 (design §5 table). Horses come in **stampedes**: a line of `n` horses (5–8, *unmeasured*) spawned together just outside the view on one side, 24 px apart perpendicular to their run, each running in a **straight line** toward where the tower was when the stampede spawned, and on past it (no homing, no turning); despawned once 1400 px from the tower (no budget refund: stampedes are not budget spawns). They collide with the tower like any enemy while crossing it. Stampede schedule: a timeline column or a separate table (e.g. one every 20 s from 1:00, larger later) — your design, documented and deterministic (draw the side/angle and `n` from `game.rng`, in a documented order).
2. **Mounted knight** (`mountedKnight`): HP 30, speed 60, radius 16, contact DPS 15, XP 8, mass 2, resistances fire 0.25, arcane −0.25, physical 0.5; walks at the tower like a knight; drawn at **3× screen scale** at tier 1 (bigger), so its tier 3–4 variants also stay integer (3× → choose 3× or 4×; say which and why). Enters the normal spawner weights from 2:30.
3. **Stages** (design §7): five named stages (Muster, Ooze, Arcana, Haunt, Siege) as timeline rows/labels; at each stage start a **banner** ("Stage 2: Ooze") shows for 2 s at the top centre (render only, driven by a sim event or `t`). Restructure the timeline's type weights so each stage is led by its threat (design §7 table): Ooze slime-heavy with the first stampedes, Arcana mages + mounted knights from 2:30, Haunt ghost knights + bronze, Siege mixed + silver + big stampedes. **Keep the current rate curve** (`rate` per row) — rates are T-029's to tune; move only weights, tiers and add stampedes.
4. **Tiers:** both new types get tier variants (add their anims to the manifest `tiers.anims`; T-021: a test requires that list to equal `TIERED_ANIMS` built from the `ENEMIES` anim fields). A stampede's horses share a tier drawn from the row's tier weights (one draw per stampede, only when the row has tier weights).
5. **Art (new, `art/`, pack style per `art/README.md`):** horse walk (2 frames, ~20 × 14, running gait readable at 2×) and die (4–5 frames); mounted knight walk (2 frames, ~22 × 22: the pack's knight riding a horse in the same style — study `knight/knight*.bmp` with `tools/bmp-to-art.mjs` and reuse its rider's look and palette) and die (~6 frames, rider and horse falling). Both face right (the renderer flips them). Iterate in `tools/art-preview.html` on grass, beside the knight, until they read clearly as a horse and a mounted knight; check the tier variants too.
6. **Bestiary:** the two new types appear (9 types; T-021: cards are 87 px high at 9–10 types — check it fits).
7. **Instrument:** `tools/measure.mjs` bots unchanged except whatever is needed to keep running; report how stampedes hit the tower.
8. **Spec:** §8 table rows, a §8.x stampede subsection, §9 timeline (stages, stampede schedule, draw order), §5 draw sizes, §17 banner, §3.3 art, plain text.

## Spec sections to read (whole)

§2.1, §3.3–§3.5, §4.1, §5, §7.2, §8 (all subsections, incl. §8.6 tiers, §8.7 knockback), §9, §12.1, §17, §17.1, §20; `art/README.md`.

## Tests

Horse straight-line run (no homing), stampede line geometry and size, despawn without refund, tower contact while crossing; mounted knight stats, resistances, mass, scale; stage banner timing; stage weights per row; tier draw per stampede only with weights; determinism and snapshot; every new anim has tier variants; bestiary fits 9 types.

## Must not

Change rates or other enemies' stats (T-029). Another agent (T-022, claws) changes `src/sim/{weapons,levelup}.js`, the manifest and the atlas in parallel: expect an atlas/manifest merge (rebuild after merging main with `npm run build:assets`). Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule (own port, own tab, pass `tabId`; if the sandbox refuses a server, say so).

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; horses, stampedes, mounted knights and banners visible in a run (`?debug=1`, F5); spec updated; `Measured:` in the commit body; commit `T-024: …` with `Closes: T-024`.
