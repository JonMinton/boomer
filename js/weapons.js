/**
 * Boomer - Weapon & Projectile System
 * Manages active projectiles, collision with terrain/players, and explosions.
 * Supports chargeable weapons and cluster bomb splitting.
 */

import { WEAPON_LIST, WEAPONS, GRAVITY, WORLD_WIDTH, WORLD_HEIGHT } from './constants.js';
import { dist, angle, lerp, randRange } from './utils.js';
import { playExplosion, playShot } from './audio.js';

/** A single in-flight projectile. */
class Projectile {
    /**
     * @param {Object} weapon - Weapon definition from constants.
     * @param {number} x - Start x
     * @param {number} y - Start y
     * @param {number} vx - Velocity x
     * @param {number} vy - Velocity y
     * @param {number} ownerIndex - Index of player who fired (0 or 1)
     * @param {boolean} isSub - Is this a cluster sub-munition?
     */
    constructor(weapon, x, y, vx, vy, ownerIndex, isSub = false) {
        this.weapon     = weapon;
        this.x          = x;
        this.y          = y;
        this.vx         = vx;
        this.vy         = vy;
        this.ownerIndex = ownerIndex;
        this.alive      = true;
        this.age        = 0;
        this.bounces    = 0;
        this.distTravelled = 0;
        this.isSub      = isSub;  // cluster sub-munitions skip cluster split
    }
}

export class WeaponSystem {
    constructor(terrain, particleSystem) {
        this.terrain   = terrain;
        this.particles = particleSystem;

        /** @type {Projectile[]} */
        this.projectiles = [];

        /** Pending explosions to process this frame: [{x,y,weapon,ownerIndex,blastRadius,damage}] */
        this.pendingExplosions = [];
    }

    /**
     * Fire a weapon.
     * @param {Object} weapon - Weapon config
     * @param {number} x - Origin x
     * @param {number} y - Origin y
     * @param {number} aimAngle - Radians
     * @param {number} ownerIndex
     * @param {number} [chargeFraction=1] - 0-1 charge for chargeable weapons
     */
    fire(weapon, x, y, aimAngle, ownerIndex, chargeFraction = 1) {
        playShot(weapon.id);

        // Determine projectile speed
        let speed = weapon.speed;
        if (weapon.chargeable) {
            speed = lerp(weapon.minSpeed, weapon.maxSpeed, chargeFraction);
        }

        for (let i = 0; i < weapon.pellets; i++) {
            let spreadAngle = aimAngle;
            if (weapon.pellets > 1) {
                spreadAngle += (Math.random() - 0.5) * weapon.spread * 2;
            }

            const vx = Math.cos(spreadAngle) * speed;
            const vy = Math.sin(spreadAngle) * speed;

            this.projectiles.push(new Projectile(weapon, x, y, vx, vy, ownerIndex));
        }
    }

    /**
     * Update all projectiles.
     * @param {number} dt - Delta time in ms
     * @param {Object[]} players - Array of player objects for collision
     */
    update(dt, players) {
        this.pendingExplosions = [];
        const dtFactor = dt / 16; // normalise to ~60fps

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (!p.alive) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // Apply gravity
            p.vy += p.weapon.gravity * GRAVITY * dtFactor * 10;

            // Store old position for ray-stepping
            const oldX = p.x;
            const oldY = p.y;

            p.x += p.vx * dtFactor;
            p.y += p.vy * dtFactor;
            p.age += dt;
            p.distTravelled += dist(oldX, oldY, p.x, p.y);

            // Trail particles
            if (p.weapon.id === 'rocket') {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            } else if (p.weapon.id === 'sniper') {
                // Thin fast trail
                if (Math.random() < 0.6) {
                    this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
                }
            } else if (p.weapon.id === 'cluster' && !p.isSub) {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            } else if ((p.weapon.id === 'grenade' || (p.weapon.id === 'cluster' && p.isSub)) && Math.random() < 0.3) {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            }

            // Out of bounds check
            if (p.x < -50 || p.x > WORLD_WIDTH + 50 ||
                p.y < -200 || p.y > WORLD_HEIGHT + 50) {
                p.alive = false;
                continue;
            }

            // Max range (shotgun)
            if (p.weapon.maxRange && p.distTravelled > p.weapon.maxRange) {
                p.alive = false;
                continue;
            }

            // Fuse timer (grenades)
            if (p.weapon.fuseTime > 0 && p.age >= p.weapon.fuseTime) {
                this._explode(p);
                continue;
            }

            // Terrain collision via ray-stepping
            if (this._checkTerrainCollision(p, oldX, oldY)) {
                if (p.weapon.bounces > 0 && p.bounces < p.weapon.bounces) {
                    this._bounce(p, oldX, oldY);
                } else {
                    this._explode(p);
                }
                continue;
            }

            // Player collision
            for (let pi = 0; pi < players.length; pi++) {
                if (pi === p.ownerIndex && p.age < 200) continue; // grace period
                const plr = players[pi];
                if (!plr || plr.dead) continue;

                if (p.x >= plr.x && p.x <= plr.x + plr.width &&
                    p.y >= plr.y && p.y <= plr.y + plr.height) {
                    this._explode(p);
                    break;
                }
            }
        }
    }

    /** Ray-step terrain collision check. */
    _checkTerrainCollision(p, oldX, oldY) {
        const steps = Math.max(1, Math.ceil(dist(oldX, oldY, p.x, p.y)));
        for (let s = 1; s <= steps; s++) {
            const t  = s / steps;
            const sx = oldX + (p.x - oldX) * t;
            const sy = oldY + (p.y - oldY) * t;
            if (this.terrain.isSolid(Math.round(sx), Math.round(sy))) {
                p.x = sx;
                p.y = sy;
                return true;
            }
        }
        return false;
    }

    /** Bounce a projectile off terrain. */
    _bounce(p, oldX, oldY) {
        p.bounces++;

        const checkLeft  = this.terrain.isSolid(Math.round(p.x - 2), Math.round(p.y));
        const checkRight = this.terrain.isSolid(Math.round(p.x + 2), Math.round(p.y));
        const checkUp    = this.terrain.isSolid(Math.round(p.x), Math.round(p.y - 2));
        const checkDown  = this.terrain.isSolid(Math.round(p.x), Math.round(p.y + 2));

        if (checkDown || checkUp) {
            p.vy = -p.vy * 0.6;
        }
        if (checkLeft || checkRight) {
            p.vx = -p.vx * 0.6;
        }

        p.x = oldX;
        p.y = oldY;
    }

    /** Trigger explosion at projectile's position. */
    _explode(p) {
        p.alive = false;
        const w = p.weapon;

        // ── Cluster bomb: split into sub-munitions instead of normal explosion ──
        if (w.clusterCount && !p.isSub) {
            // Small initial pop
            this.particles.emitExplosion(p.x, p.y, 10, w.trailColour);
            playExplosion(0.3);

            // Spawn sub-munitions
            for (let i = 0; i < w.clusterCount; i++) {
                const ang = -Math.PI / 2 + (Math.random() - 0.5) * w.clusterSpread * 2;
                const spd = randRange(3, 6);
                const subProj = new Projectile(
                    w, p.x, p.y,
                    Math.cos(ang) * spd,
                    Math.sin(ang) * spd - randRange(1, 3),
                    p.ownerIndex,
                    true, // isSub
                );
                this.projectiles.push(subProj);
            }
            return;
        }

        // ── Normal explosion ──
        const radius = p.isSub ? (w.subBlastRadius || w.blastRadius) : w.blastRadius;
        const damage = p.isSub ? (w.subDamage || w.damage) : w.damage;
        const terrainDestruct = p.isSub ? (w.subTerrainDestruct || w.terrainDestruct) : w.terrainDestruct;
        const destructRadius = radius * terrainDestruct;

        // Destroy terrain
        this.terrain.destroyCircle(p.x, p.y, destructRadius, 3);

        // Particles
        const intensity = radius / 42;
        this.particles.emitExplosion(p.x, p.y, radius, w.trailColour);
        playExplosion(Math.min(1, intensity));

        // Queue explosion for damage processing by the game
        this.pendingExplosions.push({
            x: p.x,
            y: p.y,
            weapon: w,
            ownerIndex: p.ownerIndex,
            blastRadius: radius,
            damage: damage,
            knockback: w.knockback * (p.isSub ? 0.6 : 1),
        });
    }

    /** Draw all projectiles. */
    draw(ctx) {
        for (const p of this.projectiles) {
            if (!p.alive) continue;
            const w = p.weapon;

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(Math.atan2(p.vy, p.vx));

            if (w.id === 'rocket') {
                ctx.fillStyle = '#c44';
                ctx.fillRect(-6, -2, 12, 4);
                ctx.fillStyle = '#f80';
                ctx.fillRect(-8, -1.5, 3, 3);
            } else if (w.id === 'grenade') {
                ctx.fillStyle = '#4a4';
                ctx.beginPath();
                ctx.arc(0, 0, w.projRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#252';
                ctx.fillRect(-1, -w.projRadius - 2, 2, 3);
            } else if (w.id === 'sniper') {
                // Thin bright tracer
                ctx.strokeStyle = '#adf';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(-10, 0);
                ctx.lineTo(4, 0);
                ctx.stroke();
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
                ctx.fill();
            } else if (w.id === 'cluster') {
                if (p.isSub) {
                    // Small bomblet
                    ctx.fillStyle = '#fa5';
                    ctx.beginPath();
                    ctx.arc(0, 0, 3, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    // Main cluster body
                    ctx.fillStyle = '#e80';
                    ctx.beginPath();
                    ctx.arc(0, 0, w.projRadius, 0, Math.PI * 2);
                    ctx.fill();
                    // Stripe pattern
                    ctx.fillStyle = '#a50';
                    ctx.fillRect(-w.projRadius, -1, w.projRadius * 2, 2);
                }
            } else {
                // Shotgun pellet (default)
                ctx.fillStyle = '#ffa';
                ctx.beginPath();
                ctx.arc(0, 0, w.projRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.restore();
        }

        // Draw sniper tracer lines (brief flash effect)
        this._drawSniperTracers(ctx);
    }

    /** Brief tracer line for sniper shots (cosmetic). */
    _drawSniperTracers(ctx) {
        for (const p of this.projectiles) {
            if (!p.alive || p.weapon.id !== 'sniper') continue;
            if (p.age > 80) continue; // only show for first ~80ms

            const alpha = 1 - p.age / 80;
            ctx.strokeStyle = `rgba(180,210,255,${alpha * 0.4})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            // Line from roughly where it was fired to current position
            const backDist = Math.min(p.distTravelled, 200);
            const ang = Math.atan2(p.vy, p.vx);
            ctx.moveTo(p.x - Math.cos(ang) * backDist, p.y - Math.sin(ang) * backDist);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        }
    }

    /** Clear all projectiles. */
    clear() {
        this.projectiles.length = 0;
        this.pendingExplosions.length = 0;
    }
}
