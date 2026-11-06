# Owner play-test feedback 1

**Date:** 2026-11-06 · **Build:** `dd432d0` (public demo) · **From:** the owner, verbatim list

1. Enemies should move half the speed, the dragon should move about 1/3 the speed, and the tether range should be 30% smaller.
2. The tower should follow the dragon even before the dragon hits the tether range.
3. Fireballs should not have a mini explosion; you must get the explosion powerup for it to explode.
4. The mini tower shoots the same fireball as your fireball.
5. The laser should not pierce by default; you must get the pierce powerup.
6. Mages should shoot green orbs at the dragon.
7. Use the dragon walk animation instead of the flying animation.
8. Lasers should never explode for now.

## Orchestrator's readings (decided, see the work files)

| # | Reading |
|---|---|
| 1 | Every enemy speed × 0.5 (golem included); `DRAGON_SPEED` 260 → 87; `TETHER_LENGTH` 150 → 105. |
| 2 | The tower always walks toward the dragon at a follow speed below the dragon's, stops at a rest distance, and the tether stays a hard maximum (the tower is dragged when the dragon is at the tether). |
| 3 | No projectile hit spawns a hit effect; explosions come only from the Explode buff. |
| 4 | Mini-tower shots are copies of the dragon's fireball at its current level and buffs (damage, speed, range, radius, sprite, procs). |
| 5, 8 | The laser stops at its first hit; the Pierce buff gives it a pierce chance like the fireball; Explode never applies to the laser. |
| 6 | Mages periodically fire a dodgeable green orb at the dragon. The dragon still cannot die: an orb that hits it damages the **tower** (the dragon is the tower's lifeline). New decision D-6 for the owner to judge in play. |
| 7 | `dragon/walk.txt` (2 frames, 20 px, one facing) replaces the 16-direction fly sheet; flipped horizontally to face left, animated only while moving. |
