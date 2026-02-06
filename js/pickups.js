/**
 * Boomer - Pickup System
 * Manages ammo crate spawning, parachute descent, collection, and rendering.
 */

import {
    CANVAS_WIDTH, CANVAS_HEIGHT, CRATE, WEAPON_LIST,
} from './constants.js';
import { clamp, randRange } from './utils.js';

// ── Crate object factory ─────────────────────────────────────────────

/**
 * Create a new ammo crate.
 * @param {number} x - Horizontal spawn position
 * @param {number} startY - Vertical spawn position (typically off-screen top)
 */
function createCrate(x, startY = -20) {
    return {
        x,
        y:            startY,
        vy:           0,
        hasParachute: true,
        parachuteHp:  CRATE.PARACHUTE_HP,
        landed:       false,
        collected:    false,
        destroyed:    false,
        age:          0,       // ms since spawn (for bobble animation once landed)
    };
}

// ── Pickup System ────────────────────────────────────────────────────

export class PickupSystem {
    constructor() {
        /** @type {ReturnType<typeof createCrate>[]} */
        this.crates = [];

        /** ms until next periodic spawn */
        this.spawnTimer = CRATE.SPAWN_INTERVAL;
    }

    /** Remove all crates and reset timer. */
    clear() {
        this.crates = [];
        this.spawnTimer = CRATE.SPAWN_INTERVAL;
    }

    /**
     * Spawn a crate at a random x position, avoiding proximity to players.
     * @param {Array} players - Player array for distance checks
     */
    spawnCrate(players) {
        const margin = 60;
        let x, attempts = 0;

        // Try to find a position far enough from all players
        do {
            x = randRange(margin, CANVAS_WIDTH - margin);
            attempts++;
        } while (
            attempts < 30 &&
            players.some(p => !p.dead && Math.abs(p.cx - x) < CRATE.MIN_PLAYER_DIST)
        );

        this.crates.push(createCrate(x));
    }

    /**
     * Spawn initial crates for a round.
     * @param {Array} players
     */
    spawnInitial(players) {
        for (let i = 0; i < CRATE.INITIAL_CRATES; i++) {
            this.spawnCrate(players);
        }
    }

    /**
     * Update all crates: descent, landing, collection, periodic spawn.
     * @param {number} dt - Frame delta in ms
     * @param {Array} players - Player array
     * @param {Object} terrain - Terrain instance
     */
    update(dt, players, terrain) {
        const dtSec = dt / 1000;

        // Periodic spawn timer
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
            this.spawnTimer = CRATE.SPAWN_INTERVAL;
            this.spawnCrate(players);
        }

        for (let i = this.crates.length - 1; i >= 0; i--) {
            const c = this.crates[i];
            if (c.collected || c.destroyed) {
                this.crates.splice(i, 1);
                continue;
            }

            c.age += dt;

            if (!c.landed) {
                // Descent
                if (c.hasParachute) {
                    // Gentle drift downward
                    c.vy = CRATE.PARACHUTE_SPEED;
                } else {
                    // Freefall with gravity
                    c.vy += CRATE.FREEFALL_GRAVITY * dtSec * 60;
                    c.vy = Math.min(c.vy, CRATE.TERMINAL_VEL);
                }

                c.y += c.vy * (dt / 16);

                // Check terrain collision (bottom of crate)
                const cx = Math.round(c.x);
                const bottomY = Math.round(c.y + CRATE.HEIGHT);

                if (bottomY >= 0 && bottomY < CANVAS_HEIGHT &&
                    cx >= 0 && cx < CANVAS_WIDTH) {
                    // Check a few pixels across the crate width for terrain
                    const halfW = Math.floor(CRATE.WIDTH / 2);
                    let hitTerrain = false;
                    for (let dx = -halfW; dx <= halfW; dx += 4) {
                        const sx = clamp(cx + dx, 0, CANVAS_WIDTH - 1);
                        if (terrain.get(sx, bottomY) !== 0) {
                            hitTerrain = true;
                            break;
                        }
                    }

                    if (hitTerrain) {
                        // Land or smash
                        if (c.vy > CRATE.LAND_DESTROY_VEL) {
                            c.destroyed = true;
                            continue;
                        }
                        c.landed = true;
                        c.vy = 0;
                        c.hasParachute = false; // parachute detaches on landing
                        // Snap to surface
                        c.y = bottomY - CRATE.HEIGHT;
                    }
                }

                // Fell off screen
                if (c.y > CANVAS_HEIGHT + 50) {
                    c.destroyed = true;
                    continue;
                }
            } else {
                // Landed — check if terrain beneath has been destroyed
                const cx = Math.round(c.x);
                const belowY = Math.round(c.y + CRATE.HEIGHT + 2);
                if (belowY < CANVAS_HEIGHT && cx >= 0 && cx < CANVAS_WIDTH) {
                    if (terrain.get(cx, belowY) === 0) {
                        // Terrain gone — start falling again
                        c.landed = false;
                        c.vy = 0;
                    }
                }
            }

            // Collection: player walks over crate
            if (!c.destroyed) {
                for (const p of players) {
                    if (p.dead) continue;
                    if (p.x < c.x + CRATE.WIDTH / 2 &&
                        p.x + p.width > c.x - CRATE.WIDTH / 2 &&
                        p.y < c.y + CRATE.HEIGHT &&
                        p.y + p.height > c.y) {
                        // Collect — refill weapon with lowest ammo
                        this._collectCrate(c, p);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Handle a player collecting a crate.
     * Refills the finite weapon with the lowest ammo proportion.
     */
    _collectCrate(crate, player) {
        crate.collected = true;

        // Find the finite weapon with the lowest ammo fraction
        let bestIdx = -1;
        let bestFrac = Infinity;

        for (let i = 0; i < WEAPON_LIST.length; i++) {
            const w = WEAPON_LIST[i];
            if (w.ammo === null) continue; // skip unlimited weapons
            const current = player.ammo[w.id] ?? 0;
            const maxAmmo = w.ammo;        // starting ammo = effective max
            const frac = current / maxAmmo;
            if (frac < bestFrac) {
                bestFrac = frac;
                bestIdx = i;
            }
        }

        if (bestIdx >= 0) {
            const w = WEAPON_LIST[bestIdx];
            const current = player.ammo[w.id] ?? 0;
            // Allow stacking slightly above starting ammo (1.5× cap)
            const cap = Math.ceil(w.ammo * 1.5);
            player.ammo[w.id] = Math.min(current + w.ammoPickup, cap);
        }
    }

    /**
     * Apply explosion damage to parachutes.
     * @param {number} ex - Explosion x
     * @param {number} ey - Explosion y
     * @param {number} blastRadius - Explosion radius
     * @param {number} damage - Explosion damage
     */
    damageParachutes(ex, ey, blastRadius, damage) {
        for (const c of this.crates) {
            if (!c.hasParachute || c.landed || c.collected || c.destroyed) continue;

            // Parachute is above the crate
            const px = c.x;
            const py = c.y - 15; // parachute centre relative to crate
            const dx = ex - px;
            const dy = ey - py;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < blastRadius + 20) {
                const falloff = 1 - Math.min(dist / (blastRadius + 20), 1);
                c.parachuteHp -= damage * falloff;
                if (c.parachuteHp <= 0) {
                    c.hasParachute = false;
                }
            }
        }
    }

    /**
     * Draw all active crates and their parachutes.
     * @param {CanvasRenderingContext2D} ctx
     */
    draw(ctx) {
        for (const c of this.crates) {
            if (c.collected || c.destroyed) continue;

            const cx = c.x;
            const cy = c.y;

            // Parachute (if still attached)
            if (c.hasParachute && !c.landed) {
                const sway = Math.sin(c.age * 0.002) * 3;

                // Canopy
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.beginPath();
                ctx.ellipse(cx + sway, cy - 20, 18, 10, 0, Math.PI, 0);
                ctx.fill();

                // Canopy outline
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.ellipse(cx + sway, cy - 20, 18, 10, 0, Math.PI, 0);
                ctx.stroke();

                // Suspension lines
                ctx.strokeStyle = 'rgba(180,180,180,0.7)';
                ctx.lineWidth = 0.5;
                for (const dx of [-8, -3, 3, 8]) {
                    ctx.beginPath();
                    ctx.moveTo(cx + sway + dx, cy - 20);
                    ctx.lineTo(cx + (dx > 0 ? CRATE.WIDTH / 4 : -CRATE.WIDTH / 4), cy);
                    ctx.stroke();
                }
            }

            // Crate body
            const bx = cx - CRATE.WIDTH / 2;
            const by = cy;

            // Bobble when landed
            const bobble = c.landed ? Math.sin(c.age * 0.003) * 0.5 : 0;

            ctx.fillStyle = '#8B6914';
            ctx.fillRect(bx, by + bobble, CRATE.WIDTH, CRATE.HEIGHT);

            // Crate highlight
            ctx.fillStyle = '#A67C1A';
            ctx.fillRect(bx + 1, by + bobble + 1, CRATE.WIDTH - 2, 3);

            // Cross straps
            ctx.strokeStyle = '#6B4F10';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx, by + bobble);
            ctx.lineTo(bx + CRATE.WIDTH, by + bobble + CRATE.HEIGHT);
            ctx.moveTo(bx + CRATE.WIDTH, by + bobble);
            ctx.lineTo(bx, by + bobble + CRATE.HEIGHT);
            ctx.stroke();

            // Ammo symbol
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('A', cx, by + bobble + CRATE.HEIGHT - 3);
        }
    }
}
