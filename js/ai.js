/**
 * Boomer - AI Controller
 * State-machine based AI with configurable difficulty.
 * States: IDLE → ASSESS → MOVE → AIM → CHARGE → FIRE → DODGE
 */

import { AI_DIFFICULTY, WEAPON_LIST, WORLD_WIDTH, WORLD_HEIGHT, GRAVITY } from './constants.js';
import { dist, angle, randRange, normaliseAngle, clamp, lerp } from './utils.js';

const STATE = Object.freeze({
    IDLE:   'idle',
    ASSESS: 'assess',
    MOVE:   'move',
    AIM:    'aim',
    CHARGE: 'charge',
    SIGHT:  'sight',
    FIRE:   'fire',
    DODGE:  'dodge',
});

export class AIController {
    /**
     * @param {import('./player.js').Player} self - The AI-controlled player
     * @param {import('./player.js').Player} target - The human player
     * @param {import('./terrain.js').Terrain} terrain
     * @param {import('./weapons.js').WeaponSystem} weaponSystem
     * @param {string} difficultyKey - 'EASY' | 'MEDIUM' | 'HARD'
     */
    constructor(self, target, terrain, weaponSystem, difficultyKey = 'MEDIUM') {
        this.self      = self;
        this.target    = target;
        this.terrain   = terrain;
        this.weapons   = weaponSystem;
        this.setDifficulty(difficultyKey);

        this.state     = STATE.IDLE;
        this.stateTime = 0;        // ms spent in current state
        this.moveDir   = 0;        // -1, 0, 1
        this.wantJump  = false;
        this.wantFire  = false;
        this.aimTarget = { x: 0, y: 0 };

        // Timers
        this.reactionTimer   = 0;
        this.assessCooldown  = 0;
        this.weaponSwitchTimer = 0;

        // Tactical memory
        this.lastTargetX = 0;
        this.lastTargetY = 0;
        this.targetVelX  = 0;
        this.targetVelY  = 0;
        this.hasLineOfSight = false;
        this.preferredRange  = 250; // desired distance from target
    }

    /** Set difficulty. */
    setDifficulty(key) {
        this.difficulty = AI_DIFFICULTY[key] || AI_DIFFICULTY.MEDIUM;
        this.difficultyKey = key;
    }

    /**
     * Update AI every frame.
     * @param {number} dt - Delta time ms
     * @param {number} now - Current timestamp
     */
    update(dt, now) {
        if (this.self.dead || this.target.dead) {
            this.moveDir  = 0;
            this.wantJump = false;
            this.wantFire = false;
            return;
        }

        // Passive mode (training dummy): stand still, do nothing
        if (this.difficulty.passive) {
            this.moveDir  = 0;
            this.wantJump = false;
            this.wantFire = false;
            return;
        }

        this.stateTime += dt;
        this._trackTarget(dt);
        this._checkLineOfSight();

        // Weapon switching
        this.weaponSwitchTimer += dt;
        if (this.weaponSwitchTimer > 2000) {
            this.weaponSwitchTimer = 0;
            if (Math.random() < this.difficulty.weaponSwitch) {
                this._chooseWeapon();
            }
        }

        // State machine
        switch (this.state) {
            case STATE.IDLE:    this._stateIdle(dt, now); break;
            case STATE.ASSESS:  this._stateAssess(dt, now); break;
            case STATE.MOVE:    this._stateMove(dt, now); break;
            case STATE.AIM:     this._stateAim(dt, now); break;
            case STATE.CHARGE:  this._stateCharge(dt, now); break;
            case STATE.SIGHT:   this._stateSight(dt, now); break;
            case STATE.FIRE:    this._stateFire(dt, now); break;
            case STATE.DODGE:   this._stateDodge(dt, now); break;
        }

        // Apply inputs to player
        this.self.applyInput(this.moveDir, this.wantJump);
        this.self.aimAt(this.aimTarget.x, this.aimTarget.y);
        this.wantJump = false; // jump is one-shot
    }

    // ── State handlers ──────────────────────────────────────────────

    _stateIdle(dt, now) {
        this.moveDir = 0;
        this.wantFire = false;

        // Wait for reaction time before doing anything
        this.reactionTimer += dt;
        if (this.reactionTimer >= this.difficulty.reactionTime) {
            this.reactionTimer = 0;
            this._transition(STATE.ASSESS);
        }
    }

    _stateAssess(dt, now) {
        const d = this._distToTarget();
        const skill = this.difficulty.moveSkill;

        // Should we dodge incoming projectiles?
        if (this._shouldDodge()) {
            this._transition(STATE.DODGE);
            return;
        }

        // Determine action based on distance and line of sight
        if (this.hasLineOfSight && d < 500) {
            // In range and can see target → aim and fire
            this._transition(STATE.AIM);
        } else {
            // Need to reposition
            this._transition(STATE.MOVE);
        }
    }

    _stateMove(dt, now) {
        const d = this._distToTarget();
        const skill = this.difficulty.moveSkill;
        const s = this.self;
        const t = this.target;

        // Move towards preferred range from target
        if (d > this.preferredRange + 80) {
            // Too far — move closer
            this.moveDir = t.cx > s.cx ? 1 : -1;
        } else if (d < this.preferredRange - 60) {
            // Too close — back off
            this.moveDir = t.cx > s.cx ? -1 : 1;
        } else {
            // Good range — stop and aim
            this.moveDir = 0;
            this._transition(STATE.AIM);
            return;
        }

        // Jump over obstacles or terrain gaps
        if (this._shouldJump()) {
            this.wantJump = true;
        }

        // Avoid edges
        if (s.x < 40) this.moveDir = 1;
        if (s.x > WORLD_WIDTH - 60) this.moveDir = -1;

        // Aim roughly at target while moving
        this.aimTarget.x = t.cx;
        this.aimTarget.y = t.cy;

        // Time limit on movement phase
        if (this.stateTime > 1500 / skill) {
            this._transition(STATE.ASSESS);
        }

        // If we gain line of sight, transition to aim
        if (this.hasLineOfSight && d < 500) {
            this._transition(STATE.AIM);
        }
    }

    _stateAim(dt, now) {
        this.moveDir = 0;
        const s = this.self;
        const t = this.target;
        const w = s.weapon;

        // Predict target position based on velocity
        const predictionTime = dist(s.cx, s.cy, t.cx, t.cy) / w.speed;
        const predMult = clamp(this.difficulty.moveSkill, 0, 1);
        const predX = t.cx + this.targetVelX * predictionTime * predMult * 0.5;
        const predY = t.cy + this.targetVelY * predictionTime * predMult * 0.5;

        // Add inaccuracy based on difficulty
        const offset = this.difficulty.aimOffset;
        const noiseX = (Math.random() - 0.5) * offset * 100;
        const noiseY = (Math.random() - 0.5) * offset * 100;

        this.aimTarget.x = predX + noiseX;
        this.aimTarget.y = predY + noiseY;

        // Compensate for grenade/cluster arc (heavy gravity)
        if (w.id === 'grenade' || w.id === 'cluster') {
            this.aimTarget.y -= dist(s.cx, s.cy, t.cx, t.cy) * 0.3;
        }

        // Compensate for rocket drop (light gravity)
        if (w.id === 'rocket') {
            this.aimTarget.y -= dist(s.cx, s.cy, t.cx, t.cy) * 0.05;
        }

        // Sniper: minimal compensation, but tighter aim window
        if (w.id === 'sniper') {
            // Reduce noise for sniper (precision weapon)
            this.aimTarget.x = predX + noiseX * 0.5;
            this.aimTarget.y = predY + noiseY * 0.5;
        }

        // Wait a beat, then fire (branched by weapon type)
        if (this.stateTime > 200 + (1 - this.difficulty.moveSkill) * 400) {
            if (w.sighted) {
                this._transition(STATE.SIGHT);
            } else if (w.chargeable) {
                this._transition(STATE.CHARGE);
            } else {
                this._transition(STATE.FIRE);
            }
        }

        // Dodge check even while aiming
        if (this._shouldDodge()) {
            this._transition(STATE.DODGE);
        }
    }

    _stateCharge(dt, now) {
        // AI charges a chargeable weapon for a duration based on distance and difficulty
        this.moveDir = 0;
        const s = this.self;
        const w = s.weapon;

        if (!s.charging && s.canFire(now)) {
            s.startCharge(now);
            // Determine target charge based on distance + difficulty
            const d = this._distToTarget();
            // Farther targets need more charge; skill affects optimal charge
            const idealCharge = clamp(d / 500, 0.3, 0.95);
            // Store target charge duration
            this._targetChargeDuration = idealCharge * w.maxChargeTime * lerp(0.5, 1.0, this.difficulty.moveSkill);
        }

        // Continue aiming while charging
        const t = this.target;
        this.aimTarget.x = t.cx;
        this.aimTarget.y = t.cy - this._distToTarget() * 0.25; // arc compensation

        // Release when target charge reached
        if (s.charging) {
            const elapsed = now - s.chargeStart;
            if (elapsed >= (this._targetChargeDuration || 500)) {
                // Self-damage safety check — abort charge if shot would land too close
                if (this._wouldSelfDamage(s.getCharge(now))) {
                    s.releaseCharge(now); // discard the charge without firing
                    this._transition(STATE.ASSESS);
                    return;
                }
                const charge = s.releaseCharge(now);
                const muzzle = s.getMuzzle();
                this.weapons.fire(w, muzzle.x, muzzle.y, s.aimAngle, s.index, charge);
                s.consumeAmmo();
                s.lastFireTime = now;
                this.reactionTimer = -w.cooldown * (1 / this.difficulty.fireRateMult);
                this._transition(STATE.IDLE);
                return;
            }
        } else {
            // Can't fire yet — reassess
            this._transition(STATE.ASSESS);
        }

        // Dodge even while charging (abort charge)
        if (this._shouldDodge()) {
            s.charging = false;
            this._transition(STATE.DODGE);
        }
    }

    _stateSight(dt, now) {
        // AI holds the laser sight for a difficulty-scaled duration, then fires
        this.moveDir = 0;
        const s = this.self;
        const w = s.weapon;

        if (!s.sighting && s.canFire(now)) {
            s.startSighting(now);
            // Higher-skill AI holds sight longer for better aim stabilisation
            const baseDuration = lerp(300, 800, this.difficulty.moveSkill);
            // Add some randomness so it's not robotic
            this._targetSightDuration = baseDuration + randRange(-150, 200);
        }

        // Continue tracking the target while sighting
        const t = this.target;
        const predTime = dist(s.cx, s.cy, t.cx, t.cy) / w.speed;
        const predMult = clamp(this.difficulty.moveSkill, 0, 1);
        const offset = this.difficulty.aimOffset;
        // Reduce jitter during sighting — the longer we sight, the steadier
        const sightFrac = s.getSightFraction(now);
        const jitterReduction = lerp(1, 0.3, clamp(sightFrac * 3, 0, 1));
        this.aimTarget.x = t.cx + this.targetVelX * predTime * predMult * 0.5
                         + (Math.random() - 0.5) * offset * 50 * jitterReduction;
        this.aimTarget.y = t.cy + this.targetVelY * predTime * predMult * 0.5
                         + (Math.random() - 0.5) * offset * 50 * jitterReduction;

        // Release and fire when target duration reached
        if (s.sighting) {
            const elapsed = now - s.sightStart;
            if (elapsed >= (this._targetSightDuration || 500)) {
                s.releaseSighting();
                const muzzle = s.getMuzzle();
                this.weapons.fire(w, muzzle.x, muzzle.y, s.aimAngle, s.index);
                s.consumeAmmo();
                s.lastFireTime = now;
                this.reactionTimer = -w.cooldown * (1 / this.difficulty.fireRateMult);
                this._transition(STATE.IDLE);
                return;
            }
        } else {
            // Can't fire yet — reassess
            this._transition(STATE.ASSESS);
        }

        // Dodge even while sighting (abort)
        if (this._shouldDodge()) {
            s.releaseSighting();
            this._transition(STATE.DODGE);
        }
    }

    _stateFire(dt, now) {
        this.moveDir = 0;

        if (this.self.canFire(now)) {
            // Self-damage safety check — abort if shot would land too close
            if (this._wouldSelfDamage()) {
                this._transition(STATE.ASSESS);
                return;
            }

            this.wantFire = true;

            // Fire the weapon (non-chargeable)
            const muzzle = this.self.getMuzzle();
            this.weapons.fire(
                this.self.weapon,
                muzzle.x, muzzle.y,
                this.self.aimAngle,
                this.self.index,
            );
            this.self.consumeAmmo();
            this.self.lastFireTime = now;
            this.wantFire = false;

            // Cooldown before next action cycle
            this.reactionTimer = -this.self.weapon.cooldown * (1 / this.difficulty.fireRateMult);
            this._transition(STATE.IDLE);
        } else {
            // Weapon on cooldown — reassess
            this._transition(STATE.ASSESS);
        }
    }

    _stateDodge(dt, now) {
        // Move away from nearest projectile
        const nearest = this._nearestIncomingProjectile();
        if (nearest) {
            this.moveDir = nearest.x > this.self.cx ? -1 : 1;

            // Jump to dodge
            if (Math.random() < 0.15) {
                this.wantJump = true;
            }
        } else {
            this.moveDir = Math.random() < 0.5 ? -1 : 1;
        }

        // Short dodge duration
        if (this.stateTime > 400 + Math.random() * 300) {
            this._transition(STATE.ASSESS);
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────

    _transition(newState) {
        this.state = newState;
        this.stateTime = 0;
    }

    _distToTarget() {
        return dist(this.self.cx, this.self.cy, this.target.cx, this.target.cy);
    }

    _trackTarget(dt) {
        const t = this.target;
        this.targetVelX = (t.cx - this.lastTargetX) / (dt / 16 || 1);
        this.targetVelY = (t.cy - this.lastTargetY) / (dt / 16 || 1);
        this.lastTargetX = t.cx;
        this.lastTargetY = t.cy;
    }

    _checkLineOfSight() {
        const s = this.self;
        const t = this.target;
        const d = dist(s.cx, s.cy, t.cx, t.cy);
        const steps = Math.ceil(d / 4);

        for (let i = 0; i < steps; i++) {
            const frac = i / steps;
            const x = s.cx + (t.cx - s.cx) * frac;
            const y = s.cy + (t.cy - s.cy) * frac;
            if (this.terrain.isSolid(Math.round(x), Math.round(y))) {
                this.hasLineOfSight = false;
                return;
            }
        }
        this.hasLineOfSight = true;
    }

    _shouldJump() {
        const s = this.self;
        if (!s.onGround) return false;

        // Check if there's a wall ahead
        const aheadX = s.cx + this.moveDir * (s.width + 4);
        const aheadY = s.y + s.height - 4;
        if (this.terrain.isSolid(Math.round(aheadX), Math.round(aheadY))) {
            return true;
        }

        // Check if there's a gap ahead
        const gapX = s.cx + this.moveDir * (s.width + 8);
        const gapY = s.y + s.height + 4;
        if (!this.terrain.isSolid(Math.round(gapX), Math.round(gapY))) {
            // Gap ahead — jump over it if it's not too wide
            return true;
        }

        return false;
    }

    _shouldDodge() {
        if (Math.random() > this.difficulty.dodgeChance) return false;

        const proj = this._nearestIncomingProjectile();
        if (!proj) return false;

        const d = dist(this.self.cx, this.self.cy, proj.x, proj.y);
        return d < 150;
    }

    _nearestIncomingProjectile() {
        let nearest = null;
        let minDist = Infinity;

        for (const p of this.weapons.projectiles) {
            if (p.ownerIndex === this.self.index) continue;
            const d = dist(this.self.cx, this.self.cy, p.x, p.y);
            if (d < minDist) {
                minDist = d;
                nearest = p;
            }
        }

        return nearest;
    }

    /**
     * Estimate whether firing the current weapon would result in self-damage.
     * Simulates a simplified projectile trajectory and checks if the impact
     * point is within the weapon's blast radius of the AI.
     * @param {number} [chargeFraction=1] - For chargeable weapons
     * @returns {boolean} true if firing would likely cause self-damage
     */
    _wouldSelfDamage(chargeFraction = 1) {
        const s = this.self;
        const w = s.weapon;

        // Only check explosive weapons with meaningful blast radii
        if (w.blastRadius < 10) return false;

        const muzzle = s.getMuzzle();
        const speed = w.chargeable
            ? w.minSpeed + (w.maxSpeed - w.minSpeed) * chargeFraction
            : w.speed;

        let px = muzzle.x;
        let py = muzzle.y;
        let vx = Math.cos(s.aimAngle) * speed;
        let vy = Math.sin(s.aimAngle) * speed;
        const grav = w.gravity * GRAVITY * 10;

        // Simulate up to 120 steps (~2 seconds of flight)
        for (let step = 0; step < 120; step++) {
            vy += grav;
            px += vx;
            py += vy;

            // Off-screen vertically — no concern
            if (py > WORLD_HEIGHT + 50 || py < -100) return false;

            // Hit terrain?
            if (this.terrain.isSolid(Math.round(px), Math.round(py))) {
                const blastR = w.blastRadius;
                const d = dist(s.cx, s.cy, px, py);
                // Dangerous if impact is within blast radius (with a small safety margin)
                return d < blastR + 15;
            }
        }

        return false;
    }

    /** Check if the AI has ammo for a weapon at the given index. */
    _hasAmmo(idx) {
        const w = WEAPON_LIST[idx];
        const a = this.self.ammo[w.id];
        return a === null || a > 0;
    }

    /** Try to set weapon; fall back to alternatives if out of ammo. */
    _trySetWeapon(preferred, ...fallbacks) {
        if (this._hasAmmo(preferred)) {
            this.self.setWeapon(preferred);
            return;
        }
        for (const fb of fallbacks) {
            if (this._hasAmmo(fb)) {
                this.self.setWeapon(fb);
                return;
            }
        }
        // Last resort: rocket (unlimited) or shotgun (unlimited)
        this.self.setWeapon(this._hasAmmo(1) ? 1 : 2);
    }

    _chooseWeapon() {
        const d = this._distToTarget();
        // Weapon indices: 0=Dig, 1=Rocket, 2=Shotgun, 3=Grenade, 4=Sniper, 5=Cluster

        if (d < 50) {
            // Melee range → dig
            this._trySetWeapon(0, 2, 1);
        } else if (d < 120) {
            // Close range → shotgun
            this._trySetWeapon(2, 1);
        } else if (d > 500 && this.hasLineOfSight) {
            // Very long range with LOS → sniper
            this._trySetWeapon(4, 1, 3);
        } else if (d > 350) {
            // Long range
            if (!this.hasLineOfSight) {
                // No LOS → grenade or cluster to arc over cover
                const pick = Math.random() < 0.5 ? 3 : 5;
                this._trySetWeapon(pick, pick === 3 ? 5 : 3, 1);
            } else {
                // LOS → rocket or sniper
                const pick = Math.random() < 0.6 ? 1 : 4;
                this._trySetWeapon(pick, pick === 1 ? 4 : 1);
            }
        } else if (d > 200) {
            // Mid range → varied: rocket, cluster, or grenade
            const roll = Math.random();
            if (roll < 0.4) this._trySetWeapon(1, 3, 5);
            else if (roll < 0.65) this._trySetWeapon(5, 3, 1);
            else if (roll < 0.85) this._trySetWeapon(3, 5, 1);
            else this._trySetWeapon(4, 1, 3);
        } else {
            // Short-mid range → shotgun or rocket
            const pick = Math.random() < 0.6 ? 2 : 1;
            this._trySetWeapon(pick, pick === 2 ? 1 : 2);
        }

        // Update preferred range based on chosen weapon
        const wid = this.self.weapon.id;
        if (wid === 'digger')       this.preferredRange = 40;
        else if (wid === 'shotgun') this.preferredRange = 110;
        else if (wid === 'sniper')  this.preferredRange = 400;
        else if (wid === 'cluster') this.preferredRange = 280;
        else if (wid === 'grenade') this.preferredRange = 280;
        else                        this.preferredRange = 230;
    }
}
