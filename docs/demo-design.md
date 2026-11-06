# Dragon Survivors: demo design (high level)

**Written:** 2026-11-06 · **Scope:** a 5-minute playable demo · **Source:** [peter_ideas.md](../peter_ideas.md), the dragongame asset pack at `E:\code\dragongame\assets`

## Pitch

A Vampire Survivors run with one twist: you fly an invulnerable dragon, but the thing that can die is the **tower** tethered to you. Auto-firing weapons mow down hordes; aimed weapons reward twin-stick skill; the tower drags behind you and is what the horde is actually after.

## What we take from Vampire Survivors

- **The loop.** Survive a fixed-length run against an ever-growing horde. Enemies drop XP gems. Collecting gems levels you up. Each level-up offers 3 random upgrades. Power snowballs until the screen is chaos.
- **Build pressure.** Weapons have a level cap. Passive buffs multiply across all weapons. Picking a build matters more than any single fight.
- **The wall.** When the timer hits zero, an unkillable boss (our mega golem) arrives and ends the run. The demo is "how far did you get".

## What we take from Peter's vision (the demo subset)

| Mechanic | In demo | Notes |
|---|---|---|
| Dragon + tethered tower | Yes | Dragon takes no damage. Tower has HP and is the lose condition. Tower follows when the dragon is further than X. Minions carrying it: stretch goal (visual only). |
| Twin-stick controls | Yes | Left stick / WASD moves. Right stick / mouse aims. |
| Aimed vs. auto weapons | Yes | Fireball (aimed, from dragon). Laser (aimed, pierces, from dragon). Mini tower (auto, fires from the tower). Ring (auto, orbits the dragon). |
| Proc-chance buffs | Yes, 3 | Explode chance, split chance, pierce chance. |
| VS-style stat buffs | Yes, 4 | Damage, cooldown, area, projectile speed. |
| Animated enemies with death effects | Yes | Every enemy uses its walk and die animation from the asset pack. |
| Enemy roster | 5 | Knight (basic), skeleton (fast, weak), slime (splits on death), mage (summons skeletons if alive too long), ghost knight (becomes a ghost on death, must be killed twice). |
| Boss / timer wall | Mega golem | Unkillable, knocked back by hits. Spawns at the 5-minute mark and walks at the tower. |
| Terrain | No | Open field only. |
| Elements, merchants, princes, ninja frog, fireball lob | No | Post-demo. |

## The run

1. Start with the fireball weapon, 1 tower, 5 minutes on the clock.
2. Enemies spawn off-screen, density rising with time. Mages appear at minute 2, ghost knights at minute 3.
3. XP gems drop, you level up, you pick from 3 cards: a new weapon, a weapon level, or a buff. Max 4 weapons and 4 buffs.
4. Enemies that reach the tower damage it. The dragon can body-block but cannot be hurt.
5. At 5:00 the mega golem arrives. Run ends when the tower falls. Score is time survived plus kills.

## Asset map (all from the dragongame pack)

- **Player:** `dragon_fly` (16-frame fly cycle, 25px), `dragon` perch frames.
- **Tower:** `castle` (30px) plus its destruction animation for the lose moment.
- **Enemies:** `knight`, `skelly`, `slime` + `megaslime`, `mage` (walk, die, spell), `ghostnight` (24 frames: knight, burn, ghost), `golem` (64px, 7-frame walk, 21-frame death). All 16px except golem and megaslime.
- **Weapons and FX:** `fireball` (8px), `fireball_big`, `laser_big` + `laserball`, `explosion`, `laser_explosion`, `burn`.
- **Upgrade icons:** the `bonus` set already has icons for laser, explode, split, ring, speed, big, pershot and more. Level-up cards reuse them.
- **Audio:** shoot, laser, explosion, death, pickup, powerup, golem hit and megaslime sounds all exist.

Frame lists are the `.txt` files next to each sprite set (one bmp per line, `FANCY` variant adds a per-frame duration).

## Deliberately out of scope for the demo

Meta progression between runs, multiple stages, weapon evolutions, elemental damage, terrain, controller rumble, mobile. Each is a natural next step once the loop feels good.

## Open decisions

- **Engine.** Not chosen. Assumption until the owner says otherwise: browser, HTML canvas, TypeScript, no framework. BMPs get converted to a PNG sprite sheet at build time. Fastest to iterate and to share a demo link.
- **Tether distance and tower HP.** Judgement numbers, marked *unmeasured* until play-tested.
- **Why fireball over laser** (Peter's open question). Demo answer: fireball gets the explode proc, laser gets pierce by default. Both exist; the buff cards decide which carries the build.
