# Dragon Survivors: demo design (high level)

**Written:** 2026-11-06 · **Scope:** a 5-minute playable demo · **Source:** [peter-ideas.md](peter-ideas.md), the dragongame asset pack at `E:\code\dragongame\assets`

## Pitch

A Vampire Survivors run with one twist: you play an invulnerable dragon, but the thing that can die is the **tower** tethered to you. Auto-firing weapons mow down hordes; aimed weapons reward twin-stick skill; the tower drags behind you and is what the horde is actually after.

## What we take from Vampire Survivors

- **The loop.** Survive a fixed-length run against an ever-growing horde. Enemies drop XP gems. Collecting gems levels you up. Each level-up offers 3 random upgrades. Power snowballs until the screen is chaos.
- **Build pressure.** Weapons have a level cap. Passive buffs multiply across all weapons. Picking a build matters more than any single fight.
- **The wall.** When the timer hits zero, an unkillable boss (our mega golem) arrives and ends the run. The demo is "how far did you get".

## Direction (owner notes 2)

Early and mid game is about **control**: which threat to answer, with which tool, from where. Late game is about the **build**. Weapons have roles (AOE shapes, single target, zoning, crowd control), enemies resist or fear damage types (fire, arcane, physical), and each stage of the run is led by a threat that wants a different role. Design: [strategy-depth design](../../reports/designs/2026-11-26-strategy-depth-design.md).

## What we take from Peter's vision (the demo subset)

| Mechanic | In demo | Notes |
|---|---|---|
| Dragon + tethered tower | Yes | Dragon takes no damage. Tower has HP and is the lose condition. Tower always trails the dragon, slower than it, and is dragged when the tether is tight. Minions carrying it: visual only. |
| Twin-stick controls | Yes | Left stick / WASD moves. Right stick / mouse aims. |
| Aimed vs. auto weapons | Yes | Fireball (aimed, from dragon). Laser (aimed, fast, from dragon). Mini tower (auto, fires your fireball from the tower). Ring (auto, orbits the dragon). |
| Weapon roles | Yes | Plus left claw (whip-like AOE), right claw (aimed cone, single target), dual claw (their evolution), bite (execute), saw blade (zoning line from the tower). |
| Proc-chance buffs | Yes, 3 | Explode (fire; lasers at max level), split, pierce (arcane; fireballs at max level). |
| VS-style stat buffs | Yes, 7 | Might, Haste, Area, Velocity, Duration, Force (knockback, CC), Amount. |
| Damage types | Yes | Fire, arcane, physical; enemy resistances and weaknesses; an in-game bestiary panel shows them. |
| Animated enemies with death effects | Yes | Every enemy uses its walk and die animation from the asset pack. |
| Enemy roster | 7 | Knight (basic), skeleton (fast, weak), slime (splits twice; 100+ fuse into a harmless megaslime), mage (summons skeletons, shoots orbs), ghost knight (becomes a ghost), horse (very fast stampedes), mounted knight (big, fast, tanky). Four colour tiers scale any of them into the late game. |
| Stages | Yes, 5 | Muster, Ooze, Arcana, Haunt, Siege; each led by a different threat. |
| Boss / timer wall | Mega golem | Unkillable; staggers when hit hard enough, shoves the tower, shakes the screen. Spawns at the 5-minute mark. |
| Heals | Yes | Braziers (the VS candlestick) drop hearts, magnets and bombs. |
| Out-of-game upgrades | Yes | Armoury: per-damage-type power and resistance shred, bought with gold earned per run. |
| Terrain | No | Open field only. |
| Merchant | Yes | Every 90 s from 1:30 he crosses the field: stand by him to spend banked XP on a reroll, a card of your choice or a heal, or rob him (tanky, runs) for a chest with a free pick. |
| Princess, prince | Proposed | Mechanics are the owner's call (decisions D-9–D-10). |
| Ninja frog, fireball lob | No | Post-demo. |

## The run

1. Start with the fireball weapon, 1 tower, 5 minutes on the clock.
2. Enemies spawn off-screen, density rising with time. Mages appear at minute 2, ghost knights at minute 3.
3. XP gems drop, you level up, you pick from 3 cards: a new weapon, a weapon level, or a buff. Max 4 weapons and 4 buffs.
4. Enemies that reach the tower damage it. The dragon can body-block but cannot be hurt.
5. At 5:00 the mega golem arrives. Run ends when the tower falls. Score is time survived plus kills.

## Asset map (all from the dragongame pack)

- **Player:** `dragon` walk (2 frames, 20px, mirrored to face left); `dragon_fly` (16-direction fly sheet, 25px) is not used.
- **Tower:** `castle` (30px) plus its destruction animation for the lose moment.
- **Enemies:** `knight`, `skelly`, `slime` + `megaslime`, `mage` (walk, die, spell), `ghostnight` (24 frames: knight, burn, ghost), `golem` (64px, 7-frame walk, 21-frame death). All 16px except golem and megaslime. `trader`, `princess` and `prince` exist for later.
- **New art (this repo, `art/`):** anything the pack lacks is drawn new in the pack's style (horses, mounted knights, small slimes, claws, bite, saw blade, braziers, pickups, new icons).
- **Weapons and FX:** `fireball` (8px), `fireball_big`, `laser_big` + `laserball`, `explosion`, `laser_explosion`, `burn`.
- **Upgrade icons:** the `bonus` set already has icons for laser, explode, split, ring, speed, big, pershot and more. Level-up cards reuse them.
- **Audio:** shoot, laser, explosion, death, pickup, powerup, golem hit and megaslime sounds all exist.

Frame lists are the `.txt` files next to each sprite set (one bmp per line, `FANCY` variant adds a per-frame duration).

## Deliberately out of scope for the demo

Terrain, controller rumble, mobile. Each is a natural next step once the loop feels good.

## Open decisions

- **Engine.** Not chosen. Assumption until the owner says otherwise: browser, HTML canvas, TypeScript, no framework. BMPs get converted to a PNG sprite sheet at build time. Fastest to iterate and to share a demo link.
- **Tether distance and tower HP.** Judgement numbers, marked *unmeasured* until play-tested.
- **Why fireball over laser** (Peter's open question). Demo answer: the fireball can explode and split; the laser is faster and longer-ranged and pierces with the Pierce buff, but explodes only at Explode L3 (fireballs pierce only at Pierce L3). The buff cards decide which carries the build.
