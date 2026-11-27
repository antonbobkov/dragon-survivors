# Fun features

Mechanics kept for character. Each is a real rule with a test, removable only if it breaks game logic. Agents report goofy behaviour here as a feature, and say so when a task would cut one.

| Feature | Rule | Where | Test |
|---|---|---|---|
| Split fireworks | a split child can split again, so one lucky gen-0 shot becomes up to 7 fireballs; mini-tower shots are copies of the dragon's fireball, so they split the same way | spec §12 Split | `test/growth.test.mjs` "procs: split spawns two fireballs…" |
| Megaslime fusion | while more than 100 slimes are alive, once a second the 12 nearest the densest one fuse into a magenta megaslime that cannot hurt the tower and just soaks up damage: a flood of splits ends as slow blobs walking at the walls, worth all their gems at once | spec §8.9 | `test/slimes.test.mjs` "fusion: …" |
| Gem comet tail | a gem that started homing chases the dragon across the map, so a fast pass drags a stream of gems behind it | spec §14 | `test/growth.test.mjs` "gems: homing starts inside the pickup radius and continues…" |
