# T-021: Enemy tiers: the colour/outline/scale scheme

**Source:** [strategy-depth design](../../../reports/designs/2026-11-26-strategy-depth-design.md) §6 · **Model:** Opus · **Depends on:** T-017 (art variants: `from`, `tint`, `outline`; merged), T-018 (bestiary, resistances; merged)

## Why

The owner asked for a predictable colour/scale/texture scheme that scales enemy HP and damage into the late game, so one sprite serves the whole run and a player reads danger at a glance.

## What

1. **Tiers 1–4** (plain, bronze, silver, gold), design §6 table: palette tint + 1 px outline colour + screen scale (2×, 2×, 3×, 3×) + multipliers (HP ×1/2.5/6/15, DPS ×1/1.25/1.5/2, XP ×1/2/4/8, speed ×1/1/0.9/0.8). Pick the bronze/silver/gold tint and outline colours from `art/palette.txt` (or add named colours there) so they read on the grass; check them in `tools/art-preview.html` on grass for **every** enemy type, adjust `tintStrength` per tier until each tier is clearly distinct and the sprite's shading survives (T-017: keep 0.5–0.7; outlines fill thin sprites' gaps).
2. **Atlas:** generated variants for every enemy anim (walk, die, spell, summon, split, burn, ghost…) at tiers 2–4 via manifest `from` entries, named `<anim>@t2` … `@t4` (or a scheme you document). Write a small generator (a script or manifest expansion) rather than hand-listing ~100 entries; keep the manifest readable.
3. **Sim:** `enemy.tier` (1–4, in the snapshot); HP, contact DPS, XP and speed from the tier multipliers; radius × 1.5 at tiers 3–4 (bigger sprite, bigger body). Children inherit the parent's tier (slime split children, the ghost from a ghost knight, a mage's summoned skeletons take the mage's tier). The golem is always tier 1. Death effects use the tier's die anim.
4. **Timeline:** rows get optional tier weights (`tiers: { 1: 100, 2: 0, … }`); a row without them spawns tier 1 **and draws no extra random number**, so runs before the first tier row are unchanged. Starting rows (*unmeasured*): bronze from 2:30, silver from 3:30, gold from 5:00 (design §6). The spawner draws type, then tier (only when the row has tier weights), then angle; write the draw order into §9.
5. **Render:** tier anim and screen scale; flip and alpha as today.
6. **Bestiary:** each card shows the tiers met for that type (small coloured pips or the tier sprites) and the tier multipliers in one line.
7. **Spec:** a tiers section (§8.x) with the table, the naming, the draw order; §9 timeline columns; plain text.

## Decisions already made

- Resistances do not change with tier.
- Integer screen scales only (2× or 3×); never scale source art.
- Gems drop at the enemy's XP after the multiplier.

## Spec sections to read (whole)

§3.3–§3.5 (art variants), §5, §8 (all subsections), §9, §14 (XP), §17.1, §20.

## Tests

Tier multipliers and radius; inheritance through split, ghost, summon; no extra draw without tier weights (digest of an early run unchanged); draw order with tier weights; every tier anim exists in the atlas for every enemy anim; bestiary tier display helpers; render picks the tier anim and scale.

## Must not

Retune existing numbers (T-029). Another agent (T-019) changes buffs, knockback and `src/sim/{damage,weapons,projectiles,levelup,content}.js` in parallel: keep your `content.js` edits to enemy tier data and the timeline, and expect a merge. Do not edit `docs/backlog.md`, merge or push. Follow the browser-checks rule (own port, own tab, pass `tabId`).

## Done means

`npm run gate` green; `npm run build:assets` reproduces the atlas; tiers visible and distinct in the art preview and in a run (`?debug=1`, F5 to 4:50 shows bronze and silver); spec updated; `Measured:` summary in the commit body; commit `T-021: …` with `Closes: T-021`.
