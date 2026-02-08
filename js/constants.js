/**
 * Boomer - Game Constants & Configuration
 * All tuneable values live here for easy balancing.
 */

// ── Canvas / World ──────────────────────────────────────────────────
export const CANVAS_WIDTH  = 1200;
export const CANVAS_HEIGHT = 700;
export const WORLD_WIDTH   = CANVAS_WIDTH;
export const WORLD_HEIGHT  = CANVAS_HEIGHT;

// ── Physics ─────────────────────────────────────────────────────────
export const GRAVITY          = 0.35;
export const TERMINAL_VELOCITY = 12;
export const FRICTION         = 0.85;
export const AIR_FRICTION     = 0.98;

// ── Player ──────────────────────────────────────────────────────────
export const PLAYER_WIDTH   = 20;
export const PLAYER_HEIGHT  = 34;
export const PLAYER_SPEED   = 2.8;
export const JUMP_FORCE     = -7.5;
export const MAX_HEALTH     = 100;
export const RESPAWN_TIME   = 3000;        // ms
export const DAMAGE_FLASH_DURATION = 150;  // ms

// ── Material types (terrain) ────────────────────────────────────────
export const MAT = Object.freeze({
    AIR:   0,
    DIRT:  1,
    ROCK:  2,
    GRASS: 3,
    SAND:  4,
    BRICK: 5,
    LAVA:  6,
    SNOW:  7,
});

// Destruction resistance per material (higher = harder to destroy)
// 0 = indestructible background, used as passable
export const MAT_RESISTANCE = Object.freeze({
    [MAT.AIR]:   0,
    [MAT.DIRT]:  1.0,
    [MAT.ROCK]:  2.5,
    [MAT.GRASS]: 0.8,
    [MAT.SAND]:  0.6,
    [MAT.BRICK]: 2.0,
    [MAT.LAVA]:  0,     // lava is not destructible but is passable (damages)
    [MAT.SNOW]:  0.4,
});

// Material colours (RGBA)
export const MAT_COLOURS = Object.freeze({
    [MAT.DIRT]:  [139, 90, 43, 255],
    [MAT.ROCK]:  [128, 128, 128, 255],
    [MAT.GRASS]: [60, 150, 40, 255],
    [MAT.SAND]:  [210, 190, 130, 255],
    [MAT.BRICK]: [180, 80, 60, 255],
    [MAT.LAVA]:  [230, 60, 20, 255],
    [MAT.SNOW]:  [235, 240, 248, 255],
});

// ── Weapon definitions ──────────────────────────────────────────────
export const WEAPONS = Object.freeze({
    ROCKET_LAUNCHER: {
        id:              'rocket',
        name:            'Rocket Launcher',
        damage:          35,
        blastRadius:     42,
        terrainDestruct: 1.0,   // multiplier on blast radius for terrain removal
        speed:           9,
        gravity:         0.08,
        cooldown:        1400,  // ms
        knockback:       8,
        pellets:         1,
        spread:          0,
        bounces:         0,
        fuseTime:        0,     // 0 = explode on contact
        trailColour:     [255, 150, 50],
        projRadius:      4,
        colour:          '#e84',
        ammo:            null,    // unlimited
    },
    SHOTGUN: {
        id:              'shotgun',
        name:            'Shotgun',
        damage:          9,
        blastRadius:     6,
        terrainDestruct: 0.5,
        speed:           12,
        gravity:         0.05,
        cooldown:        800,
        knockback:       2.5,
        pellets:         8,
        spread:          0.26,  // radians (≈15°)
        bounces:         0,
        fuseTime:        0,
        trailColour:     [255, 255, 180],
        projRadius:      2,
        maxRange:        400,
        colour:          '#cc8',
        ammo:            null,    // unlimited
    },
    GRENADE_LAUNCHER: {
        id:              'grenade',
        name:            'Grenade',
        damage:          28,
        blastRadius:     34,
        terrainDestruct: 0.85,
        speed:           12,
        gravity:         0.07,    // light arc — 75% charge at 45° ≈ full screen
        cooldown:        1100,
        knockback:       6,
        pellets:         1,
        spread:          0,
        bounces:         3,
        fuseTime:        2500,  // ms before auto-explode
        trailColour:     [100, 200, 100],
        projRadius:      5,
        colour:          '#6b4',
        // Charge-to-fire mechanic
        chargeable:      true,
        minSpeed:        1.5,
        maxSpeed:        22,
        maxChargeTime:   1500,  // ms to reach full charge
        ammo:            8,      // starting rounds
        ammoPickup:      4,      // rounds per crate
    },
    SNIPER_RIFLE: {
        id:              'sniper',
        name:            'Sniper',
        damage:          65,
        blastRadius:     3,
        terrainDestruct: 0.1,
        speed:           32,
        gravity:         0.005,
        cooldown:        2000,
        knockback:       3,
        pellets:         1,
        spread:          0,
        bounces:         0,
        fuseTime:        0,
        trailColour:     [180, 210, 255],
        projRadius:      1.5,
        // Laser sight: hold to aim (visible red line), release to fire
        sighted:         true,
        maxSightTime:    3000,  // ms before auto-fire (prevents indefinite holding)
        hitscan:         true,  // instant raycast — no travelling projectile
        colour:          '#8af',
        ammo:            3,       // starting rounds
        ammoPickup:      2,       // rounds per crate
    },
    CLUSTER_BOMB: {
        id:              'cluster',
        name:            'Cluster Bomb',
        damage:          15,       // per bomblet
        blastRadius:     18,
        terrainDestruct: 0.7,
        speed:           12,
        gravity:         0.08,    // slightly heavier than grenade
        cooldown:        1800,
        knockback:       4,
        pellets:         1,
        spread:          0,
        bounces:         0,
        fuseTime:        0,        // split on first impact
        trailColour:     [255, 200, 50],
        projRadius:      5,
        colour:          '#fa5',
        // Charge-to-fire mechanic
        chargeable:      true,
        minSpeed:        1.5,
        maxSpeed:        23,
        maxChargeTime:   1500,
        // Cluster split config
        clusterCount:    5,
        clusterSpread:   0.8,      // radians of scatter
        subBlastRadius:  14,
        subDamage:       15,
        subTerrainDestruct: 0.5,
        ammo:            2,       // starting rounds
        ammoPickup:      1,       // rounds per crate
    },
});

export const WEAPON_LIST = [
    WEAPONS.ROCKET_LAUNCHER,
    WEAPONS.SHOTGUN,
    WEAPONS.GRENADE_LAUNCHER,
    WEAPONS.SNIPER_RIFLE,
    WEAPONS.CLUSTER_BOMB,
];

// ── AI difficulty presets ───────────────────────────────────────────
export const AI_DIFFICULTY = Object.freeze({
    TRAINING: {
        label:        'Training',
        passive:       true,    // bot stands still, does not fire
        aimOffset:     1.0,
        reactionTime:  99999,
        fireRateMult:  0,
        moveSkill:     0,
        dodgeChance:   0,
        weaponSwitch:  0,
        healDelay:     2000,    // ms before bot restores to full HP after last hit
    },
    EASY: {
        label:        'Easy',
        aimOffset:     0.45,   // radians of random aim deviation
        reactionTime:  1400,   // ms before acting
        fireRateMult:  0.5,
        moveSkill:     0.3,    // 0-1 how well AI positions
        dodgeChance:   0.1,
        weaponSwitch:  0.05,   // chance per second of switching weapon
    },
    MEDIUM: {
        label:        'Medium',
        aimOffset:     0.18,
        reactionTime:  700,
        fireRateMult:  0.8,
        moveSkill:     0.6,
        dodgeChance:   0.35,
        weaponSwitch:  0.15,
    },
    HARD: {
        label:        'Hard',
        aimOffset:     0.06,
        reactionTime:  250,
        fireRateMult:  1.0,
        moveSkill:     0.9,
        dodgeChance:   0.65,
        weaponSwitch:  0.3,
    },
});

// ── Particle presets ────────────────────────────────────────────────
export const PARTICLE_LIFETIME = 800;  // ms base
export const MAX_PARTICLES     = 300;

// ── Ammo crate config ──────────────────────────────────────────────
export const CRATE = Object.freeze({
    WIDTH:            16,
    HEIGHT:           12,
    PARACHUTE_SPEED:  0.4,    // px per ms (slow drift)
    FREEFALL_GRAVITY: 0.25,   // px per ms² after parachute destroyed
    TERMINAL_VEL:     6,      // max freefall speed
    PARACHUTE_HP:     10,     // damage to destroy parachute
    SPAWN_INTERVAL:   18000,  // ms between periodic spawns
    INITIAL_CRATES:   2,      // crates spawned at round start
    MIN_PLAYER_DIST:  180,    // min px from any player when spawning
    LAND_DESTROY_VEL: 4,      // if landing faster than this, crate is destroyed
});

// ── Round / scoring ─────────────────────────────────────────────────
export const ROUNDS_TO_WIN = 3;
export const ROUND_START_DELAY = 2000; // ms

// ── Feedback ───────────────────────────────────────────────────────
export const GITHUB_REPO_URL = 'https://github.com/JonMinton/boomer';
export const BUG_REPORT_URL = `${GITHUB_REPO_URL}/issues/new?labels=bug&title=%5BBug%5D+`;
export const FEATURE_REQUEST_URL = `${GITHUB_REPO_URL}/issues/new?labels=enhancement&title=%5BFeature%5D+`;
export const FEEDBACK_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfnxxXzTiH8ziVEGQHsMt2LzNqZSvNFzDA1mR2pn2qn4rqh9Q/viewform';
