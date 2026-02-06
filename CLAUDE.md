# Boomer — Agent Handover Context

## What this is

A 1v1 real-time arena shooter (human vs AI) built with HTML5 Canvas and vanilla JS (ES6 modules). Inspired by Worms but played in real time rather than turn-based. No external dependencies — all rendering, audio, and physics are implemented from scratch.

## How to run

Requires an HTTP server (ES6 modules need CORS headers). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

15 files, ~3,600 lines. All game code lives in `js/` as ES6 modules.

### File responsibilities

| File | Lines | Role |
|---|---|---|
| `main.js` | 20 | Entry point — creates `Game`, calls `start()` |
| `constants.js` | 219 | All tuning knobs: canvas size, physics, weapon definitions, AI difficulty presets, material types |
| `game.js` | 491 | **Main orchestrator** — game states (MENU/COUNTDOWN/PLAYING/ROUND_OVER/MATCH_OVER), main loop, input dispatch, explosion processing, world bounds/wrapping, drawing pipeline |
| `player.js` | 383 | Player entity: physics (gravity, AABB-terrain collision), movement, health, weapon/charge state, drawing (body, eyes, gun arm, name tag) |
| `ai.js` | 450 | State-machine AI: IDLE → ASSESS → MOVE → AIM → CHARGE → FIRE → DODGE. Difficulty-scaled reaction times, accuracy jitter, weapon selection |
| `weapons.js` | 357 | Projectile lifecycle: firing, ray-stepping collision, explosions, cluster splitting, sniper tracers. Owns `pendingExplosions` queue |
| `terrain.js` | 228 | Pixel-based destructible terrain: `Uint8Array` material grid, `destroyCircle()` with power falloff, ambient occlusion shading |
| `maps.js` | 311 | 4 map definitions (Grasslands, Desert, Urban, Volcanic) + procedural generation via value noise heightmaps |
| `particles.js` | 189 | Particle effects: debris, smoke, sparks, hit markers, projectile trails |
| `ui.js` | 457 | All UI: main menu (map/difficulty/wrap selectors), HUD (health bars, ammo, weapon slots), charge indicator, score, damage numbers, screen shake |
| `audio.js` | 232 | Synthesised sound via Web Audio API — no external assets. Per-weapon fire sounds, explosions, hits, victory jingle |
| `input.js` | 97 | Keyboard + mouse tracking with `justPressed` per-frame state |
| `utils.js` | 119 | Math helpers: clamp, lerp, dist, angle, randRange, generateHeightmap, aabbOverlap |
| `index.html` | 15 | Single canvas element, `type="module"` script tag |
| `style.css` | 32 | Dark background, centred canvas, crosshair cursor |

### Key design decisions

- **Pixel-based terrain destruction**: Each pixel in the terrain grid has a material type (AIR, DIRT, ROCK, GRASS, SAND, BRICK, LAVA, SNOW). Explosions call `destroyCircle()` which removes pixels based on weapon `terrainDestruct` power vs material `resistance`. This gives weapon-dependent destruction depth.
- **No external assets**: All audio is synthesised via Web Audio API oscillators. All visuals are canvas draw calls.
- **Charge-to-fire mechanic**: Grenade launcher and cluster bomb use hold-to-charge (Worms-style). Speed interpolates between `minSpeed` and `maxSpeed` over `maxChargeTime` ms. The physics were tuned so 75% charge at 45° covers the full screen width (~1200px), using the formula `Range ≈ S² / g_eff`.
- **World bounds ownership**: Horizontal bounds clamping (or wrapping) is handled in `game.js`, not `player.js`, so it can switch between modes cleanly.
- **Surface material effects**: Sand slows movement (0.6× speed mod), snow is slippery (1.1× speed mod, less friction), lava damages continuously.

### Weapons (5 total)

1. **Rocket Launcher** — medium speed, large blast radius, high terrain destruction
2. **Shotgun** — 6 pellets in a spread, short range (maxRange: 300), minimal terrain destruction
3. **Grenade Launcher** — chargeable arc weapon, good terrain destruction, gravity 0.07
4. **Sniper Rifle** — very fast projectile (speed 32), high damage (45), negligible terrain destruction, tracer visual
5. **Cluster Bomb** — chargeable, splits into 5 sub-munitions on impact (`isSub` flag prevents recursive splitting)

### AI state machine

States: IDLE → ASSESS → MOVE → AIM → CHARGE → FIRE → DODGE

The AI scales with three difficulty presets (EASY/MEDIUM/HARD) which affect: reaction delay, aim jitter, dodge probability, charge accuracy, and weapon selection intelligence. The CHARGE state calculates target charge duration based on distance to opponent and difficulty scaling.

### Screen wrapping

Toroidal horizontal wrapping, toggled from the main menu. When enabled:
- Players that exit one edge reappear on the opposite side (game.js post-physics step)
- Projectiles wrap similarly (weapons.js)
- Ghost sprites are drawn at the opposite edge when a player is near a boundary
- The vertical axis does not wrap (falling off the bottom still deals damage)

## Conventions

- British spellings in comments and user-facing text
- Commit messages follow conventional commits (`feat:`, `fix:`, etc.)
- Constants are centralised in `constants.js` — weapon stats, physics values, and difficulty presets should be tuned there rather than scattered through game logic
- No build step or bundling — just serve the directory

## Known quirks / potential issues

- Terrain wrapping is visual only for players/projectiles — the terrain itself doesn't tile. A projectile wrapping from right to left will not destroy terrain on the "seam". This could be addressed by duplicating explosion effects at wrapped coordinates.
- AI does not account for screen wrapping when pathfinding or aiming. It could fire the "wrong way round" to reach a wrapped opponent.
- The canvas is fixed at 1200×700. No responsive scaling.
- Lava pools in the Volcanic map damage players but have no dynamic behaviour (no pressure/breach/flow simulation yet).
