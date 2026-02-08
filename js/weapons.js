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
        this.isMine     = false;  // set true for mine-mode sub-munitions
        this.landed     = false;  // true once a mine has settled on terrain
        this.mineMode   = false;  // parent cluster carries this from player state
    }
}

export class WeaponSystem {
    constructor(terrain, particleSystem) {
        this.terrain   = terrain;
        this.particles = particleSystem;
        this.wrapScreen = false;

        /** @type {Projectile[]} */
        this.projectiles = [];

        /** Pending explosions to process this frame: [{x,y,weapon,ownerIndex,blastRadius,damage}] */
        this.pendingExplosions = [];

        /** Players array — set by Game for hitscan collision checks. */
        this.players = [];

        /** Brief hitscan tracer lines for visual feedback: [{x1,y1,x2,y2,age,maxAge}] */
        this.hitscanTracers = [];
    }

    /**
     * Fire a weapon.
     * @param {Object} weapon - Weapon config
     * @param {number} x - Origin x
     * @param {number} y - Origin y
     * @param {number} aimAngle - Radians
     * @param {number} ownerIndex
     * @param {number} [chargeFraction=1] - 0-1 charge for chargeable weapons
     * @param {boolean} [mineMode=false] - Cluster mine mode
     */
    fire(weapon, x, y, aimAngle, ownerIndex, chargeFraction = 1, mineMode = false) {
        playShot(weapon.id);

        // Melee weapons resolve instantly in a short arc
        if (weapon.melee) {
            this._fireMelee(weapon, x, y, aimAngle, ownerIndex);
            return;
        }

        // Hitscan weapons resolve instantly via raycast
        if (weapon.hitscan) {
            this._fireHitscan(weapon, x, y, aimAngle, ownerIndex);
            return;
        }

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

            const proj = new Projectile(weapon, x, y, vx, vy, ownerIndex);
            proj.mineMode = mineMode;
            this.projectiles.push(proj);
        }
    }

    /**
     * Fire a melee weapon: destroy terrain in a short arc and damage nearby players.
     */
    _fireMelee(weapon, x, y, aimAngle, ownerIndex) {
        const range = weapon.meleeRange || 40;
        const hitX = x + Math.cos(aimAngle) * (range * 0.42);
        const hitY = y + Math.sin(aimAngle) * (range * 0.42);

        // Destroy terrain at the dig point
        const destructRadius = weapon.blastRadius * weapon.terrainDestruct;
        this.terrain.destroyCircle(hitX, hitY, destructRadius, 2);

        // Emit dirt/debris particles
        this.particles.emitExplosion(hitX, hitY, weapon.blastRadius * 0.5, weapon.trailColour);

        // Check for player hits within melee range and arc
        for (let i = 0; i < this.players.length; i++) {
            if (i === ownerIndex) continue;
            const p = this.players[i];
            if (!p.alive) continue;

            const px = p.x + p.width / 2;
            const py = p.y + p.height / 2;
            const d = dist(x, y, px, py);
            if (d > range) continue;

            // Check within melee arc
            const angleToPlayer = angle(x, y, px, py);
            let angleDiff = angleToPlayer - aimAngle;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            if (Math.abs(angleDiff) > (weapon.meleeArc || 0.8)) continue;

            // Queue damage via pendingExplosions
            this.pendingExplosions.push({
                x: px, y: py,
                weapon,
                ownerIndex,
                blastRadius: range,
                damage: weapon.damage,
                knockback: weapon.knockback,
                directHitPlayerIdx: i,
            });
        }
    }

    /**
     * Fire a hitscan weapon: instant raycast from muzzle along aim angle.
     * Checks terrain and player bodies — first hit along the ray wins.
     */
    _fireHitscan(weapon, x, y, aimAngle, ownerIndex) {
        const cosA = Math.cos(aimAngle);
        const sinA = Math.sin(aimAngle);
        const step = 2;   // px — small enough to never skip a 20px-wide player
        const maxDist = 1500;

        let hitX = x;
        let hitY = y;
        let hitPlayerIdx = -1;

        for (let d = step; d < maxDist; d += step) {
            const rx = x + cosA * d;
            const ry = y + sinA * d;

            // Off-screen → end of ray
            if (rx < -20 || rx > WORLD_WIDTH + 20 ||
                ry < -200 || ry > WORLD_HEIGHT + 20) {
                hitX = rx;
                hitY = ry;
                break;
            }

            // Check terrain
            if (this.terrain.isSolid(Math.round(rx), Math.round(ry))) {
                hitX = rx;
                hitY = ry;
                break;
            }

            // Check player bodies
            for (let pi = 0; pi < this.players.length; pi++) {
                if (pi === ownerIndex) continue; // can't hitscan yourself
                const plr = this.players[pi];
                if (!plr || plr.dead) continue;

                if (rx >= plr.x && rx <= plr.x + plr.width &&
                    ry >= plr.y && ry <= plr.y + plr.height) {
                    hitX = rx;
                    hitY = ry;
                    hitPlayerIdx = pi;
                    break;
                }
            }
            if (hitPlayerIdx >= 0) break; // player hit — stop the ray

            hitX = rx;
            hitY = ry;
        }

        // Create visual tracer (fading line from muzzle to impact)
        this.hitscanTracers.push({
            x1: x, y1: y,
            x2: hitX, y2: hitY,
            age: 0,
            maxAge: 200,  // ms
        });

        // Terrain destruction at impact point
        const destructRadius = weapon.blastRadius * weapon.terrainDestruct;
        this.terrain.destroyCircle(hitX, hitY, destructRadius, 3);

        // Particles and sound
        const intensity = weapon.blastRadius / 42;
        this.particles.emitExplosion(hitX, hitY, weapon.blastRadius, weapon.trailColour);
        playExplosion(Math.min(1, intensity));

        // Queue explosion for damage processing
        this.pendingExplosions.push({
            x: hitX,
            y: hitY,
            weapon,
            ownerIndex,
            blastRadius: weapon.blastRadius,
            damage: weapon.damage,
            knockback: weapon.knockback,
            directHitPlayerIdx: hitPlayerIdx,
        });
    }

    /**
     * Update all projectiles.
     * @param {number} dt - Delta time in ms
     * @param {Object[]} players - Array of player objects for collision
     */
    update(dt, players) {
        // NOTE: pendingExplosions is NOT cleared here — hitscan weapons add
        // to it during fire() (before update runs). The Game clears it after
        // processing all explosions each frame.
        const dtFactor = dt / 16; // normalise to ~60fps

        // Age and cull hitscan tracers
        for (let i = this.hitscanTracers.length - 1; i >= 0; i--) {
            this.hitscanTracers[i].age += dt;
            if (this.hitscanTracers[i].age >= this.hitscanTracers[i].maxAge) {
                this.hitscanTracers.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            if (!p.alive) {
                this.projectiles.splice(i, 1);
                continue;
            }

            // ── Landed mine: skip movement, check proximity ──
            if (p.isMine && p.landed) {
                p.age += dt;

                // Auto-detonate after lifetime
                if (p.age >= (p.weapon.mineLifetime || 10000)) {
                    this._explode(p);
                    continue;
                }

                // Proximity check against ALL players (including owner — self-damage)
                const proxDist = p.weapon.mineProximity || 30;
                let triggered = false;
                for (let pi = 0; pi < players.length; pi++) {
                    const plr = players[pi];
                    if (!plr || plr.dead) continue;
                    const d = dist(p.x, p.y, plr.cx, plr.cy);
                    if (d < proxDist) {
                        this._explode(p, pi);
                        triggered = true;
                        break;
                    }
                }
                if (triggered) continue;

                // Mines stay put — skip rest of update
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

            // Trail particles (sniper uses hitscan, so no projectile trail)
            if (p.weapon.id === 'rocket') {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            } else if (p.weapon.id === 'cluster' && !p.isSub) {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            } else if ((p.weapon.id === 'grenade' || (p.weapon.id === 'cluster' && p.isSub)) && Math.random() < 0.3) {
                this.particles.emitTrail(p.x, p.y, p.weapon.trailColour);
            }

            // Out of bounds / wrapping
            if (this.wrapScreen) {
                // Horizontal wrap
                if (p.x < 0) p.x += WORLD_WIDTH;
                else if (p.x > WORLD_WIDTH) p.x -= WORLD_WIDTH;
                // Still die if falling off bottom or flying too high
                if (p.y < -400 || p.y > WORLD_HEIGHT + 50) {
                    p.alive = false;
                    continue;
                }
            } else {
                if (p.x < -50 || p.x > WORLD_WIDTH + 50 ||
                    p.y < -200 || p.y > WORLD_HEIGHT + 50) {
                    p.alive = false;
                    continue;
                }
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
                // Mine sub-munitions land on terrain instead of exploding
                if (p.isMine && p.isSub) {
                    p.landed = true;
                    p.vx = 0;
                    p.vy = 0;
                    // Nudge up so mine sits on surface
                    p.y = oldY;
                    continue;
                }
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
                    this._explode(p, pi); // pass hit player index
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
    /**
     * Explode a projectile.
     * @param {Projectile} p
     * @param {number} [directHitPlayerIdx=-1] - Player index if this was a direct body hit
     */
    _explode(p, directHitPlayerIdx = -1) {
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
                subProj.isMine = p.mineMode;
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
            directHitPlayerIdx,
        });
    }

    /** Draw all projectiles. */
    draw(ctx) {
        for (const p of this.projectiles) {
            if (!p.alive) continue;
            const w = p.weapon;

            // Landed mine: draw as a small pulsing circle on terrain
            if (p.isMine && p.landed) {
                const pulse = 0.7 + 0.3 * Math.sin(p.age * 0.006);
                ctx.save();
                ctx.translate(p.x, p.y);
                // Outer glow
                ctx.fillStyle = `rgba(255,100,30,${0.2 * pulse})`;
                ctx.beginPath();
                ctx.arc(0, 0, 8, 0, Math.PI * 2);
                ctx.fill();
                // Core
                ctx.fillStyle = `rgba(255,180,50,${0.7 * pulse})`;
                ctx.beginPath();
                ctx.arc(0, 0, 4, 0, Math.PI * 2);
                ctx.fill();
                // Centre dot
                ctx.fillStyle = '#f44';
                ctx.beginPath();
                ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                continue;
            }

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

        // Draw hitscan tracer lines (brief flash effect)
        this._drawHitscanTracers(ctx);
    }

    /** Draw fading hitscan tracer lines (sniper). */
    _drawHitscanTracers(ctx) {
        for (const t of this.hitscanTracers) {
            const frac = 1 - t.age / t.maxAge;

            // Bright core line
            ctx.strokeStyle = `rgba(180,210,255,${frac * 0.7})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.stroke();

            // Wider glow
            ctx.strokeStyle = `rgba(140,180,255,${frac * 0.2})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(t.x1, t.y1);
            ctx.lineTo(t.x2, t.y2);
            ctx.stroke();

            // Impact flash (first 60ms)
            if (t.age < 60) {
                const flashAlpha = (1 - t.age / 60) * 0.8;
                ctx.fillStyle = `rgba(220,240,255,${flashAlpha})`;
                ctx.beginPath();
                ctx.arc(t.x2, t.y2, 6 * (1 - t.age / 60), 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /** Clear all projectiles and tracers. */
    clear() {
        this.projectiles.length = 0;
        this.pendingExplosions.length = 0;
        this.hitscanTracers.length = 0;
    }
}
