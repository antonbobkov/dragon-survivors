# T-026: Golem: poise and stagger, tower shove, screen shake

**Source:** [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md) §5; owner notes 2 ("mega golem needs push back and screen shaking and stuff??") · **Model:** Opus · **Depends on:** T-019 (knockback, Force; merged)

## Why

The golem is the wall at 5:00 but feels inert: hits barely push it (1 px each since the rebalance) and nothing shakes. The owner wants push back and screen shake. A poise/stagger rule makes crowd control (Force, heavy hitters like the bite and claws) matter against it.

## What

1. **Poise** replaces the 1 px per-hit rule: each hit on the golem adds `knock` (after Force, as `dealDamage` already passes it) to `golem.poise`; at `GOLEM_POISE = 60` (*unmeasured*) it **staggers**: pushed 40 px straight away from the dragon over 0.3 s (18 ticks, eased, never into another enemy's body beyond separation's usual handling), then stands still for 0.5 s, poise reset to 0. Hits during a stagger add no poise. Poise decays by 10 per second when not hit (so chip damage alone does not stack forever). Sound `hit_golem` on stagger (and keep it on hits, throttled as today).
2. **Tower shove:** while the golem overlaps the tower, besides its contact damage, it shoves the tower 30 px straight away from itself once per second (the tether then pulls the tower back toward the dragon as usual; the shove may push the tower past the tether length for that tick — the tether rule clamps it on the next step; say how).
3. **Screen shake** (render only, from sim events): a strong shake (amplitude 8 px, 0.6 s) when the golem spawns, a weak one (2 px, 0.15 s) on each golem footstep while it is within 400 px of the dragon (a footstep = each time its walk anim reaches a contact frame; pick the frames), a medium one (5 px, 0.3 s) on each stagger. Shakes add (capped at 10 px), decay linearly, offset the whole world camera (not the HUD), use a deterministic pattern (no `Math.random` needed in render either, but render may use it if you prefer; say which). `?shake=0` turns shake off.
4. **Bestiary:** the golem's card shows poise instead of "KNOCKBACK 1" (e.g. "POISE 60 · staggers 40 px").
5. **Debug:** `?debug=1` overlay shows the golem's poise bar.
6. **Spec:** §13 (golem), §8.7 (knockback note), §5 / §17 (shake), §19, plain text; remove `GOLEM_KNOCKBACK` from the spec and content if no longer used.

## Spec sections to read (whole)

§2.1, §4.1, §5, §7, §8.4, §8.7, §12.1, §13, §17.1, §19, §20.

## Tests

Poise accumulation with Force, stagger at the threshold, push distance/direction and duration, no poise during stagger, decay, reset; shove once per second while overlapping, tether behaviour after; shake events emitted at spawn/footstep/stagger and the render offset maths (amplitude, decay, cap, off with `?shake=0`) under node; determinism and snapshot; render writes no state.

## Must not

Retune other numbers (report what you see for T-029: how long a full build can hold the golem now). Another agent (T-025: slime rework) changes `src/sim/enemies.js`, the manifest and the atlas in parallel: keep golem code separate where you can and expect a merge. Do not edit `docs/backlog.md`, merge into main or push. Follow the browser-checks rule; when reverting experiments, restore from your own backup copy, not `git checkout`.

## Done means

`npm run gate` green; the golem staggers, shoves and shakes in a run (`?debug=1`, F5); spec updated; `Measured:` in the commit body; commit `T-026: …` with `Closes: T-026`.
