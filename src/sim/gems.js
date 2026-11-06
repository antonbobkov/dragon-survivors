// XP gems (§14). Filled by the growth task (T-005); the sim core only calls these hooks.

// Called once per killed enemy (step 9), at its death position, before its death effect.
export function dropGem(game, enemy) {}

// Step 10: attract gems within DRAGON_PICKUP_RADIUS, collect, add XP, queue level-ups.
export function stepGems(game) {}
