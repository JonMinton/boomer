# Boomer World — Design Document

## Concept

A polar-coordinate evolution of Boomer 2D. The play arena is the inner surface of a circular world. Players walk along the circumference, gravity pulls towards the centre, and projectiles follow curved trajectories under radial gravity. The viewport shows only a segment of the ring (perhaps 60–90°), tracking the human player so their local "down" always feels like down.

The game logic, weapons, AI state machine, and destructible terrain concepts carry over from Boomer 2D. The major changes are the coordinate system, terrain representation, rendering pipeline, and camera.

## Open questions (to be informed by Boomer 2D playtesting)

These should be revisited once there's gameplay feedback from Boomer V1:

- **Arena radius**: How large should the ring be? A small ring (tight curvature) makes the world feel claustrophobic and projectile arcs very visible. A large ring (gentle curvature) feels more like flat Boomer with wrapping. Playtesting will show what screen-to-world ratio feels right.
- **Weapon balance**: Do chargeable arc weapons (grenade, cluster) need retuning for radial gravity? The range formula changes — a 45° shot in polar space doesn't behave the same as in Cartesian space.
- **AI difficulty**: Is the current state machine sufficient, or does polar navigation need a fundamentally different approach? Feedback on how the V1 AI "feels" will inform this.
- **Viewport size**: How many degrees of arc should be visible? Too narrow and you can't see incoming projectiles; too wide and the curvature distortion gets extreme.
- **Wrapping**: In a circular world, wrapping is inherent — walk far enough and you return to where you started. Is the ring circumference large enough that this takes meaningful time, or do players constantly encounter each other?
- **Terrain destructibility at scale**: Boomer 2D's terrain is ~1200×700 pixels. A ring with meaningful circumference might need a much larger terrain buffer. Does this affect performance?
- **Which weapons benefit/suffer**: Shotgun spread in polar space fans differently. Sniper shots curve. Grenades bounce along a curved surface. Playtesting flat Boomer will show which weapons feel satisfying and which need rethinking.

## Technical architecture

### Coordinate system

Everything stored in polar coordinates: `(θ, r)` where `θ` is angle around the ring (0 to 2π) and `r` is distance from centre. The ring surface sits at some radius `R`, with terrain extending inward (r < R) and open space above (r > R).

Player position: `(θ, r)` — angular position and radial height.
Player velocity: `(ω, vr)` — angular velocity and radial velocity.
Gravity: constant radial acceleration towards r = 0.

### Terrain representation

A 2D grid indexed by `(θ_index, r_index)` rather than `(x, y)`. Angular resolution determines how many "columns" around the full circle. Radial resolution determines terrain depth. Material types (DIRT, ROCK, SAND, etc.) carry over unchanged.

Destruction: `destroyCircle()` becomes `destroyDisc()` operating in polar space. A circular blast in world space maps to a roughly elliptical region in the (θ, r) grid, with aspect ratio depending on the local radius.

### Rendering pipeline

This is the main technical challenge. Two approaches:

**Option A — WebGL shader (recommended)**
Store the polar terrain as a texture. Write a fragment shader that, for each screen pixel, computes the corresponding (θ, r) coordinate based on the camera angle and viewport arc, then samples the terrain texture. This offloads the per-pixel coordinate transform to the GPU.

Players, projectiles, and particles are drawn as sprites/quads, positioned by transforming their (θ, r) positions to screen space via the inverse of the camera transform.

Likely implemented via PixiJS (for sprite management + WebGL context) with a custom shader for terrain.

**Option B — CPU-side Canvas 2D**
Each frame, iterate over screen pixels, compute (θ, r) for each, sample the polar terrain grid, write to an ImageData buffer, and blit it. This is the simpler code path but risks being too slow at 60fps for large viewports. Could be viable if the viewport arc is narrow (fewer columns to sample).

### Camera system

The camera tracks the human player's angular position. The viewport is defined by:
- `centreAngle`: the θ the camera is centred on (tracks player)
- `arcWidth`: how many radians of the ring are visible (e.g. π/3 for 60°)
- `innerRadius`, `outerRadius`: the radial range visible (terrain surface ± some margin)

The camera rotates the entire scene so the player's current angle maps to the bottom-centre of the screen. This means "down" on screen is always towards the ring centre, which should feel natural.

Camera smoothing: lerp the camera angle towards the player's angle each frame to avoid jarring snaps.

### Physics

Radial gravity replaces vertical gravity: `vr -= G * dt` (acceleration towards centre).

Angular movement replaces horizontal movement: `θ += ω * dt`. Angular velocity is affected by surface friction and input, analogous to horizontal movement in V1.

Projectile trajectories: integrate `(θ, r)` with angular and radial velocity components under radial gravity. The resulting paths are naturally curved, which looks dramatic for arc weapons.

Collision detection: sample the terrain grid at the projectile's `(θ_index, r_index)` each step, same as V1's pixel-stepping but in polar coordinates.

### What carries over from Boomer 2D

- Weapon definitions (damage, blast radius, cooldown, charge mechanics) — may need retuning but the structure is identical
- AI state machine (IDLE → ASSESS → MOVE → AIM → CHARGE → FIRE → DODGE) — needs polar-aware aiming but the states themselves are the same
- Material system (types, resistance, surface effects)
- Particle system (spawn at world positions, transform to screen for drawing)
- Audio system (entirely decoupled from coordinates)
- UI system (HUD, menus, health bars) — largely unchanged
- Input system — unchanged
- Charge-to-fire mechanic — unchanged

### What's new

- Polar terrain storage and generation
- WebGL or shader-based terrain rendering
- Camera system (angle tracking, viewport arc)
- Polar physics (radial gravity, angular velocity)
- Polar-aware `destroyCircle()` / blast mapping
- Map generation adapted for ring geometry (how do "grasslands" or "urban" translate to a circular world?)
- Potentially: minimap showing full ring with player positions
- Solar lighting system (see below)

### Solar lighting

A fixed Sun illuminates the ring from one direction. As the player traverses the circumference, the local brightness changes naturally based on the angle between the terrain surface normal (pointing radially outward) and the Sun direction vector.

**Implementation**: The terrain fragment shader already knows each pixel's angular position θ. The Sun has a fixed direction vector `sunDir = (cos(sunAngle), sin(sunAngle))`. The surface outward normal at any point is `(cos(θ), sin(θ))`. The lighting intensity is:

```
brightness = ambient + (1 - ambient) * max(0, dot(normal, sunDir))
```

Where `ambient` ≈ 0.15–0.25 prevents the dark side from being unplayable. The final pixel colour is `terrainColour * brightness`.

Players and projectile sprites receive the same treatment — their brightness is computed from their angular position in game.js and passed as a tint or alpha multiplier.

**Colour temperature shift**: Rather than just dimming, shift the colour palette. Sunlit side gets a warm tint (multiply by a soft gold, e.g. `rgb(1.0, 0.95, 0.85)`), shadow side gets a cool tint (`rgb(0.7, 0.75, 0.9)`). This sells the effect far more than brightness alone.

**Gameplay implications**:
- **Visibility asymmetry**: Players on the dark side are harder to spot. This could be purely cosmetic or mechanically significant (e.g. AI accuracy penalty in low light, sniper tracer more visible against dark terrain).
- **Tactical positioning**: The dark side becomes a stealth zone. Players might deliberately retreat into shadow. This creates a positional meta beyond just terrain height advantage.
- **Map-specific lighting**: Volcanic maps could have lava glow that provides ambient illumination on the dark side. Urban maps might have lit windows. Grasslands could have fireflies or bioluminescence as subtle light sources in shadow.
- **Dynamic Sun** (stretch goal): The Sun slowly orbits, so the light/dark zones shift over the course of a match. Forces players to adapt rather than camping in permanent shadow.

**Performance**: Negligible. The dot product and colour multiply are a few ALU ops per fragment — the shader is already doing a polar-to-screen coordinate transform which is far more expensive.

## Dependency / tooling

- **PixiJS** (or raw WebGL) for GPU-accelerated terrain rendering
- Everything else stays vanilla JS / ES6 modules
- No build step required (PixiJS available via CDN)
- Could share a monorepo with Boomer 2D, or fork into a sibling directory

## Milestones

### M1 — Proof of concept
- Render a static polar terrain ring segment on screen using WebGL/shader
- Camera rotates to follow a controllable player walking along the surface
- Radial gravity works (player falls towards centre, lands on terrain)
- Solar lighting: terrain brightness varies with angle from Sun
- No weapons, no AI, no destruction

### M2 — Core gameplay port
- Destructible terrain in polar coordinates
- At least one weapon firing and exploding
- Basic AI that can move and shoot
- Health bars and round structure

### M3 — Full weapon and AI port
- All 5 weapons ported with polar physics
- Charge mechanic working under radial gravity
- AI state machine fully adapted
- All material types and surface effects

### M4 — Maps and polish
- Multiple map themes adapted for ring geometry
- Particle effects
- Audio
- Menu system with ring-radius / arc-width options
- Minimap
- Colour temperature shift (warm sunlit side, cool shadow side)
- Map-specific ambient lighting (lava glow, lit windows, bioluminescence)
- Stretch: dynamic Sun orbit over match duration

## Feedback log

_Space for noting observations from Boomer V1 playtesting that affect World design decisions._

| Date | Observation | Implication for World |
|------|-------------|----------------------|
| | | |
