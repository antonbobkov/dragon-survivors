# Pending decisions

Only what is still open. A row is deleted once its answer is folded into the spec.

| Id | Question | Recommendation | Status |
|---|---|---|---|
| D-1 | Enemy facing: horizontal flip when moving left, or no flip as in the original? | Flip; drop it if it looks wrong in play | owner to judge in play |
| D-3 | Minion carriers under the tower | Stretch goal, visual only, after the demo plays well | deferred |
| D-4 | Late game is too forgiving: once the build is full, every level-up offers only Repair (+25 HP), so a run that survives 2:30 rarely loses before the golem. | Stop offering Repair when the build is full unless tower HP < 50%, and steepen `xpToNext` past level 20; measure with `tools/measure.mjs` (T-012) | open, decided in T-016 |
| D-5 | The golem (150 px/s) is slower than the tethered tower (200 px/s): a player can drag the tower away in a straight line forever. | Give the golem a rule, not a number: it speeds up by 10 px/s every 10 s after 5:00 (*unmeasured*). Wait for a play-test before changing it | owner to judge in play |
| D-6 | Mage orbs that hit the dragon damage the tower (the dragon cannot die). Is that the right penalty? | Keep it and judge in play; alternative: the orb slows the dragon for 1 s instead | owner to judge in play |
