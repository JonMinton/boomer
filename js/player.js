/**
 * Boomer - Player Entity
 * Handles movement, physics integration, health, weapon state, and rendering.
 */

import {
    PLAYER_WIDTH, PLAYER_HEIGHT, PLAYER_SPEED, JUMP_FORCE,
    MAX_HEALTH, GRAVITY, TERMINAL_VELOCITY, FRICTION, AIR_FRICTION,
    WEAPON_LIST, DAMAGE_FLASH_DURATION,
} from './constants.js';
import { clamp, angle } from './utils.js';
import { playJump, playSwitch } from './audio.js';

export class Player {
    /**
     * @param {number} index - 0 = human, 1 = AI (typically)
     * @param {number} spawnX
     * @param {number} spawnY
     * @param {string} colour - CSS colour for the player
     * @param {string} name
     */
    constructor(index, spawnX, spawnY, colour, name) {
        this.index   = index;
        this.name    = name;
        this.colour  = colour;

        // Position & physics
        this.x       = spawnX;
        this.y       = spawnY;
        this.vx      = 0;
        this.vy      = 0;
        this.width   = PLAYER_WIDTH;
        this.height  = PLAYER_HEIGHT;
        this.onGround = false;

        // Health
        this.health  = MAX_HEALTH;
        this.dead    = false;

        // Weapon
        this.weaponIndex = 0;
        this.weapon      = WEAPON_LIST[0];
        this.lastFireTime = 0;

        // Charge-to-fire state
        this.charging    = false;
        this.chargeStart = 0;

        // Laser sight state (sniper)
        this.sighting    = false;
        this.sightStart  = 0;

        // Ammo tracking: { weaponId: count } — null entries mean unlimited
        this.ammo = {};
        this._initAmmo();

        // Cluster mine mode toggle
        this.clusterMineMode = false;

        // Aiming
        this.aimAngle = index === 0 ? 0 : Math.PI; // face opponent initially
        this.facingRight = index === 0;

        // Visual
        this.damageFlashEnd = 0;

        // Spawn
        this.spawnX = spawnX;
        this.spawnY = spawnY;

        // Surface modifier (updated each physics tick)
        this.surfaceSpeedMod = 1.0;

        // Score
        this.wins = 0;
    }

    /** Initialise ammo counts from weapon definitions. */
    _initAmmo() {
        this.ammo = {};
        for (const w of WEAPON_LIST) {
            this.ammo[w.id] = w.ammo; // null for unlimited, number for finite
        }
    }

    /** Centre x of the player. */
    get cx() { return this.x + this.width / 2; }
    /** Centre y of the player. */
    get cy() { return this.y + this.height / 2; }

    /** Reset for a new round (keep score). */
    reset(spawnX, spawnY) {
        this.x = spawnX;
        this.y = spawnY;
        this.vx = 0;
        this.vy = 0;
        this.health = MAX_HEALTH;
        this.dead = false;
        this.weaponIndex = 0;
        this.weapon = WEAPON_LIST[0];
        this.lastFireTime = 0;
        this.charging = false;
        this.chargeStart = 0;
        this.sighting = false;
        this.sightStart = 0;
        this.clusterMineMode = false;
        this.damageFlashEnd = 0;
        this.onGround = false;
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this._initAmmo();
    }

    /** Switch to the next weapon. */
    nextWeapon() {
        this.weaponIndex = (this.weaponIndex + 1) % WEAPON_LIST.length;
        this.weapon = WEAPON_LIST[this.weaponIndex];
        playSwitch();
    }

    /** Switch to a specific weapon by index. */
    setWeapon(idx) {
        if (idx >= 0 && idx < WEAPON_LIST.length && idx !== this.weaponIndex) {
            this.weaponIndex = idx;
            this.weapon = WEAPON_LIST[idx];
            playSwitch();
        } else if (idx === this.weaponIndex && this.weapon.id === 'cluster') {
            // Toggle mine mode when pressing cluster key again
            this.clusterMineMode = !this.clusterMineMode;
            playSwitch();
        }
    }

    /** Does the current weapon have ammo remaining? */
    hasAmmo() {
        const a = this.ammo[this.weapon.id];
        return a === null || a > 0; // null = unlimited
    }

    /** Consume one round of the current weapon's ammo. */
    consumeAmmo() {
        const id = this.weapon.id;
        if (this.ammo[id] !== null && this.ammo[id] > 0) {
            this.ammo[id]--;
        }
    }

    /** Can this player fire right now? (cooldown + ammo) */
    canFire(now) {
        return !this.dead &&
            (now - this.lastFireTime) >= this.weapon.cooldown &&
            this.hasAmmo();
    }

    /** Begin charging a chargeable weapon. */
    startCharge(now) {
        if (this.weapon.chargeable && !this.charging) {
            this.charging = true;
            this.chargeStart = now;
        }
    }

    /** Get current charge fraction (0-1). Returns 0 for non-chargeable weapons. */
    getCharge(now) {
        if (!this.charging || !this.weapon.chargeable) return 0;
        const elapsed = now - this.chargeStart;
        return clamp(elapsed / this.weapon.maxChargeTime, 0, 1);
    }

    /** Release charge and return the speed multiplier. Resets charge state. */
    releaseCharge(now) {
        if (!this.weapon.chargeable) {
            this.charging = false;
            return 1;
        }
        const charge = this.getCharge(now);
        this.charging = false;
        this.chargeStart = 0;
        return charge;
    }

    // ── Laser sight (sniper) ─────────────────────────────────────────

    /** Begin sighting a sighted weapon. */
    startSighting(now) {
        if (this.weapon.sighted && !this.sighting) {
            this.sighting = true;
            this.sightStart = now;
        }
    }

    /** Get sighting duration fraction (0-1). */
    getSightFraction(now) {
        if (!this.sighting || !this.weapon.sighted) return 0;
        const elapsed = now - this.sightStart;
        return clamp(elapsed / this.weapon.maxSightTime, 0, 1);
    }

    /** Release sight and fire. Resets sighting state. */
    releaseSighting() {
        this.sighting = false;
        this.sightStart = 0;
    }

    /**
     * Apply movement input (called by InputManager for human, AI for bot).
     * @param {number} moveDir - -1 left, 0 none, +1 right
     * @param {boolean} jump
     */
    applyInput(moveDir, jump) {
        if (this.dead) return;

        // Horizontal movement (scaled by surface material)
        if (moveDir !== 0) {
            this.vx += moveDir * PLAYER_SPEED * 0.4 * this.surfaceSpeedMod;
            this.facingRight = moveDir > 0;
        }

        // Jump
        if (jump && this.onGround) {
            this.vy = JUMP_FORCE;
            this.onGround = false;
            playJump();
        }
    }

    /**
     * Physics update: gravity, friction, terrain collision.
     * @param {number} dt - Delta time in ms
     * @param {import('./terrain.js').Terrain} terrain
     */
    updatePhysics(dt, terrain) {
        if (this.dead) return;
        const dtFactor = dt / 16;

        // Gravity
        this.vy += GRAVITY * dtFactor;
        this.vy = clamp(this.vy, -TERMINAL_VELOCITY, TERMINAL_VELOCITY);

        // Surface material effects
        const surfaceMat = this.onGround
            ? terrain.get(Math.round(this.cx), Math.round(this.y + this.height + 1))
            : 0;
        let frictionMod = 1.0;
        this.surfaceSpeedMod = 1.0;
        if (surfaceMat === 4) {       // SAND — slower movement
            this.surfaceSpeedMod = 0.6;
            frictionMod = 1.2;        // more friction (lower vx multiplier)
        } else if (surfaceMat === 7) { // SNOW — slippery
            this.surfaceSpeedMod = 1.1;
            frictionMod = 0.4;        // less friction (slide more)
        }

        // Friction
        if (this.onGround) {
            this.vx *= Math.pow(FRICTION, frictionMod);
        } else {
            this.vx *= AIR_FRICTION;
        }

        // Horizontal movement + terrain collision
        this.x += this.vx * dtFactor;
        this._resolveHorizontal(terrain);

        // Vertical movement + terrain collision
        this.y += this.vy * dtFactor;
        this._resolveVertical(terrain);

        // World bounds (horizontal clamping handled by Game to support wrap mode)

        // Fell off the bottom → take damage
        if (this.y > terrain.height + 50) {
            this.takeDamage(MAX_HEALTH); // instant death from falling off map
        }

        // Lava check
        this._checkLava(terrain);
    }

    /** Resolve horizontal terrain collisions. */
    _resolveHorizontal(terrain) {
        // Check feet, middle, and head on the leading edge
        const edge = this.vx > 0 ? this.x + this.width : this.x;
        const checks = [this.y + 2, this.y + this.height / 2, this.y + this.height - 2];

        for (const cy of checks) {
            if (terrain.isSolid(Math.round(edge), Math.round(cy))) {
                // Push back
                if (this.vx > 0) {
                    this.x = Math.floor(edge) - this.width;
                } else {
                    this.x = Math.ceil(edge);
                }
                this.vx = 0;
                break;
            }
        }
    }

    /** Resolve vertical terrain collisions. */
    _resolveVertical(terrain) {
        this.onGround = false;

        if (this.vy >= 0) {
            // Falling / on ground — check bottom edge
            for (let dx = 1; dx < this.width - 1; dx += 4) {
                const checkX = Math.round(this.x + dx);
                const checkY = Math.round(this.y + this.height);
                if (terrain.isSolid(checkX, checkY)) {
                    this.y = Math.floor(checkY) - this.height;
                    this.vy = 0;
                    this.onGround = true;
                    return;
                }
            }
        } else {
            // Rising — check top edge
            for (let dx = 1; dx < this.width - 1; dx += 4) {
                const checkX = Math.round(this.x + dx);
                const checkY = Math.round(this.y);
                if (terrain.isSolid(checkX, checkY)) {
                    this.y = Math.ceil(checkY) + 1;
                    this.vy = 0;
                    return;
                }
            }
        }
    }

    /** Check if standing in lava. */
    _checkLava(terrain) {
        const feetY = Math.round(this.y + this.height);
        for (let dx = 0; dx < this.width; dx += 4) {
            if (terrain.isLava(Math.round(this.x + dx), feetY) ||
                terrain.isLava(Math.round(this.x + dx), feetY - 1)) {
                this.takeDamage(0.5); // continuous lava damage
            }
        }
    }

    /**
     * Take damage.
     * @param {number} amount
     */
    takeDamage(amount) {
        if (this.dead) return;
        this.health -= amount;
        this.damageFlashEnd = performance.now() + DAMAGE_FLASH_DURATION;
        if (this.health <= 0) {
            this.health = 0;
            this.dead = true;
        }
    }

    /**
     * Apply explosion knockback.
     * @param {number} ex - Explosion centre x
     * @param {number} ey - Explosion centre y
     * @param {number} force
     * @param {number} radius
     */
    applyKnockback(ex, ey, force, radius) {
        if (this.dead) return;
        const dx = this.cx - ex;
        const dy = this.cy - ey;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius || d === 0) return;

        const falloff = 1 - (d / radius);
        const nx = dx / d;
        const ny = dy / d;
        this.vx += nx * force * falloff;
        this.vy += ny * force * falloff - 2; // slight upward bias
        this.onGround = false;
    }

    /**
     * Aim towards a point.
     */
    aimAt(tx, ty) {
        this.aimAngle = angle(this.cx, this.cy, tx, ty);
        this.facingRight = tx > this.cx;
    }

    /** Get the muzzle position (tip of the gun). */
    getMuzzle() {
        const gunLen = 18;
        return {
            x: this.cx + Math.cos(this.aimAngle) * gunLen,
            y: this.cy + Math.sin(this.aimAngle) * gunLen,
        };
    }

    /**
     * Draw the player.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} now - Current timestamp
     */
    draw(ctx, now) {
        if (this.dead) return;

        const flashing = now < this.damageFlashEnd;

        ctx.save();

        // Body
        ctx.fillStyle = flashing ? '#fff' : this.colour;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Head
        const headR = 7;
        const headX = this.cx;
        const headY = this.y + headR + 1;
        ctx.beginPath();
        ctx.arc(headX, headY, headR, 0, Math.PI * 2);
        ctx.fillStyle = flashing ? '#fff' : this.colour;
        ctx.fill();

        // Eyes
        const eyeDir = this.facingRight ? 1 : -1;
        ctx.fillStyle = '#fff';
        ctx.fillRect(headX + eyeDir * 2 - 1.5, headY - 2, 3, 3);
        ctx.fillStyle = '#000';
        ctx.fillRect(headX + eyeDir * 3 - 1, headY - 1, 2, 2);

        // Gun arm
        const muzzle = this.getMuzzle();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.cx, this.cy - 2);
        ctx.lineTo(muzzle.x, muzzle.y);
        ctx.stroke();

        // Gun tip
        ctx.fillStyle = this.weapon.colour;
        ctx.beginPath();
        ctx.arc(muzzle.x, muzzle.y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Name tag
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.cx, this.y - 8);

        ctx.restore();
    }
}
