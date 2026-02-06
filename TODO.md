# Boomer — Iteration Backlog

## Stretch goals (user-requested)

### Polar / circular gravity mode
An alternative to toroidal screen wrapping. Players move circularly around the territory and gravity points towards the centre of the arena. The terrain would form a ring or disc, and "down" is always radially inward. This is a substantial rework — it would need:
- A polar coordinate system (or radial gravity applied in Cartesian space)
- Terrain stored/rendered as an annular ring
- Camera rotation or fixed-perspective rendering
- Projectile trajectories curving under radial gravity
- AI pathfinding adapted to curved surfaces

### Headshot / body-shot damage zones
Differentiate damage based on where a projectile hits a player. The player model has a distinct head and body region. Headshots (upper hitbox) would deal bonus damage (e.g. 1.5× multiplier), while body shots deal standard damage. This particularly rewards sniper accuracy and adds skill depth. Would need:
- Split player AABB into head and body sub-regions
- Explosion processing to check which zone the blast centre is nearest
- Headshot visual/audio feedback (different particle colour, "HEADSHOT!" damage number)
- AI aim adjustment per difficulty (harder AI aims for the head more often)

### Lava pressure simulation (Volcanic map)
Dynamic lava behaviour: terrain weakening from heat exposure → structural breach → lava spew/flow → cooling to solid magma. Would make the Volcanic map feel alive and add a time-pressure element.

## Gameplay improvements

### Terrain-aware wrapping
Currently screen wrapping only affects players and projectiles. Explosions near the screen edge don't wrap — a blast at x=1195 won't destroy terrain at x=5. Fix by duplicating `destroyCircle()` calls at wrapped coordinates when an explosion is near an edge.

### AI wrap awareness
The AI doesn't consider screen wrapping when choosing aim direction. It should evaluate whether firing "the other way round" gives a shorter path to the opponent, and adjust accordingly.

### Responsive canvas
The canvas is fixed at 1200×700. Consider scaling to fill the viewport while maintaining aspect ratio, or allowing configurable resolution.

### Additional weapons
Some ideas for future weapons:
- **Drill** — bores through terrain in a straight line, low damage to players but excellent for tunnelling
- **Homing missile** — slow, weak, but tracks the opponent with limited turn radius
- **Mine** — placed on terrain surface, detonates on proximity after an arming delay
- **Grapple hook** — mobility tool rather than weapon, lets players swing across the map

### Additional maps
- **Space station** — low gravity, metal/glass materials, floating platforms
- **Underwater** — high drag on projectiles, buoyancy physics, coral terrain
- **Ice cavern** — slippery surfaces throughout, stalactites that can be shot down

### Match options
- Best-of-N rounds (currently hardcoded to `ROUNDS_TO_WIN` in constants.js)
- Timer mode (most damage dealt within a time limit wins)
- Sudden death (terrain slowly collapses from the edges)

## Technical debt

- No unit tests — consider adding at least physics/collision tests
- No asset pipeline — if external sprites or sounds are ever added, will need a loading system
- `game.js` is the largest file (491 lines) and handles a lot of orchestration; could benefit from extracting explosion processing and drawing into separate modules
- Damage numbers and screen shake are managed as module-level state in `ui.js` rather than as part of a proper ECS or game-object system

## Completed

- [x] Initial implementation (5 weapons, 4 maps, 3 AI difficulties, destructible terrain)
- [x] Charge-to-fire mechanic for grenade launcher and cluster bomb
- [x] Sniper rifle and cluster bomb weapons
- [x] Physics rebalancing (75% charge at 45° covers full screen)
- [x] Toroidal screen wrapping with menu toggle
- [x] Exit game / return to menu (Escape key from any state)
- [x] Sniper rifle damage buff (45→65, two-hit kill)
