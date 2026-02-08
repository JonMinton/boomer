/**
 * Boomer - Main Game Controller
 * Manages game states, the main loop, and orchestrates all systems.
 */

import {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    MAX_HEALTH, WEAPON_LIST, ROUNDS_TO_WIN, ROUND_START_DELAY,
    AI_DIFFICULTY,
    BUG_REPORT_URL, FEATURE_REQUEST_URL, FEEDBACK_FORM_URL,
} from './constants.js';
import { dist, clamp } from './utils.js';
import { InputManager } from './input.js';
import { Terrain } from './terrain.js';
import { ParticleSystem } from './particles.js';
import { WeaponSystem } from './weapons.js';
import { Player } from './player.js';
import { AIController } from './ai.js';
import { MAP_DEFS, generateMap, findSpawnY } from './maps.js';
import {
    drawHUD, drawMainMenu, drawRoundOver, drawMatchOver,
    drawCountdown, spawnDamageNumber, clearDamageNumbers,
    triggerScreenShake, getScreenShake, updateScreenShake,
} from './ui.js';
import { resumeAudio, playExplosion, playHit, playVictory, playPickup } from './audio.js';
import { PickupSystem } from './pickups.js';

// ── Game States ─────────────────────────────────────────────────────

const STATE = Object.freeze({
    MENU:       'menu',
    COUNTDOWN:  'countdown',
    PLAYING:    'playing',
    ROUND_OVER: 'round_over',
    MATCH_OVER: 'match_over',
});

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        canvas.width  = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;

        // Core systems
        this.input     = new InputManager(canvas);
        this.terrain   = new Terrain();
        this.particles = new ParticleSystem();
        this.weapons   = new WeaponSystem(this.terrain, this.particles);
        this.pickups   = new PickupSystem();

        // Players
        this.players = [
            new Player(0, 100, 100, '#4488ff', 'Player'),
            new Player(1, CANVAS_WIDTH - 120, 100, '#ff4444', 'Bot'),
        ];

        // Give weapon system access to players for hitscan collision
        this.weapons.players = this.players;

        // AI
        this.ai = new AIController(
            this.players[1], this.players[0],
            this.terrain, this.weapons, 'MEDIUM'
        );

        // Game state
        this.state       = STATE.MENU;
        this.lastTime    = 0;
        this.roundWinner = null;

        // Menu state
        this.selectedMap        = 0;
        this.selectedDifficulty = 'MEDIUM';
        this.wrapScreen         = false;
        this.menuHover = { map: null, diff: null, start: false, wrap: false, bugReport: false, suggestFeature: false, feedbackForm: false };
        this.menuRegions = null;

        // Countdown
        this.countdownTimer = 0;
        this.countdownText  = '';

        // Round over timer
        this.roundOverTimer = 0;

        // Training mode heal tracking
        this._trainingHealTimer = 0;
        this._trainingLastHP    = MAX_HEALTH;

        // Background gradient cache
        this._bgGrad = null;
        this._bgMapId = null;

        // Bind loop
        this._loop = this._loop.bind(this);
    }

    /** Start the game loop. */
    start() {
        this.lastTime = performance.now();
        requestAnimationFrame(this._loop);
    }

    /** Main loop. */
    _loop(timestamp) {
        const dt = Math.min(timestamp - this.lastTime, 50); // cap delta
        this.lastTime = timestamp;

        this._update(dt, timestamp);
        this._draw(timestamp);

        this.input.endFrame();
        requestAnimationFrame(this._loop);
    }

    // ── Update ──────────────────────────────────────────────────────

    _update(dt, now) {
        switch (this.state) {
            case STATE.MENU:
                this._updateMenu(dt, now);
                break;
            case STATE.COUNTDOWN:
                this._updateCountdown(dt, now);
                break;
            case STATE.PLAYING:
                this._updatePlaying(dt, now);
                break;
            case STATE.ROUND_OVER:
                this._updateRoundOver(dt, now);
                break;
            case STATE.MATCH_OVER:
                this._updateMatchOver(dt, now);
                break;
        }
    }

    _updateMenu(dt, now) {
        // Check hover regions
        if (this.menuRegions) {
            const mx = this.input.mouseX;
            const my = this.input.mouseY;
            this.menuHover = { map: null, diff: null, start: false, wrap: false, bugReport: false, suggestFeature: false, feedbackForm: false };

            for (const r of this.menuRegions.mapRegions) {
                if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                    this.menuHover.map = r.index;
                    if (this.input.mouseJustPressed) {
                        this.selectedMap = r.index;
                        resumeAudio();
                    }
                }
            }

            for (const r of this.menuRegions.diffRegions) {
                if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
                    this.menuHover.diff = r.key;
                    if (this.input.mouseJustPressed) {
                        this.selectedDifficulty = r.key;
                        resumeAudio();
                    }
                }
            }

            // Wrap toggle
            if (this.menuRegions.wrapRegion) {
                const wr = this.menuRegions.wrapRegion;
                if (mx >= wr.x && mx <= wr.x + wr.w && my >= wr.y && my <= wr.y + wr.h) {
                    this.menuHover.wrap = true;
                    if (this.input.mouseJustPressed) {
                        this.wrapScreen = !this.wrapScreen;
                        resumeAudio();
                    }
                }
            }

            const sr = this.menuRegions.startRegion;
            if (mx >= sr.x && mx <= sr.x + sr.w && my >= sr.y && my <= sr.y + sr.h) {
                this.menuHover.start = true;
                if (this.input.mouseJustPressed) {
                    resumeAudio();
                    this._startMatch();
                }
            }

            // Feedback buttons
            const br = this.menuRegions.bugReportRegion;
            if (br && mx >= br.x && mx <= br.x + br.w && my >= br.y && my <= br.y + br.h) {
                this.menuHover.bugReport = true;
                if (this.input.mouseJustPressed) {
                    window.open(BUG_REPORT_URL, '_blank');
                    resumeAudio();
                }
            }

            const sf = this.menuRegions.suggestFeatureRegion;
            if (sf && mx >= sf.x && mx <= sf.x + sf.w && my >= sf.y && my <= sf.y + sf.h) {
                this.menuHover.suggestFeature = true;
                if (this.input.mouseJustPressed) {
                    window.open(FEATURE_REQUEST_URL, '_blank');
                    resumeAudio();
                }
            }

            const ff = this.menuRegions.feedbackFormRegion;
            if (ff && mx >= ff.x && mx <= ff.x + ff.w && my >= ff.y && my <= ff.y + ff.h) {
                this.menuHover.feedbackForm = true;
                if (this.input.mouseJustPressed) {
                    window.open(FEEDBACK_FORM_URL, '_blank');
                    resumeAudio();
                }
            }
        }

        // Enter key to start
        if (this.input.wasPressed('enter')) {
            resumeAudio();
            this._startMatch();
        }
    }

    _updateCountdown(dt, now) {
        if (this.input.wasPressed('escape')) {
            this._returnToMenu();
            return;
        }

        this.countdownTimer -= dt;

        if (this.countdownTimer > 1500) {
            this.countdownText = '3';
        } else if (this.countdownTimer > 1000) {
            this.countdownText = '2';
        } else if (this.countdownTimer > 500) {
            this.countdownText = '1';
        } else if (this.countdownTimer > 0) {
            this.countdownText = 'FIGHT!';
        } else {
            this.state = STATE.PLAYING;
        }
    }

    _updatePlaying(dt, now) {
        // ── Human input ─────────────────────────────────────────────
        const human = this.players[0];
        let moveDir = 0;
        if (this.input.isDown('a') || this.input.isDown('arrowleft'))  moveDir -= 1;
        if (this.input.isDown('d') || this.input.isDown('arrowright')) moveDir += 1;
        const jump = this.input.isDown('w') || this.input.isDown('arrowup') || this.input.isDown(' ');
        human.applyInput(moveDir, jump);
        human.aimAt(this.input.mouseX, this.input.mouseY);

        // Fire — branched by weapon type
        if (human.weapon.sighted) {
            // Sighted weapon (sniper): hold to aim with laser, release to fire
            if (this.input.mouseJustPressed && human.canFire(now)) {
                human.startSighting(now);
            }
            if (human.sighting) {
                // Auto-fire at max sight time
                const frac = human.getSightFraction(now);
                if (!this.input.mouseDown || frac >= 1) {
                    human.releaseSighting();
                    const muzzle = human.getMuzzle();
                    this.weapons.fire(human.weapon, muzzle.x, muzzle.y, human.aimAngle, human.index);
                    human.consumeAmmo();
                    human.lastFireTime = now;
                }
            }
        } else if (human.weapon.chargeable) {
            // Chargeable weapon: hold to charge, release to fire
            if (this.input.mouseJustPressed && human.canFire(now)) {
                human.startCharge(now);
            }
            if (human.charging && !this.input.mouseDown) {
                // Released — fire with charge
                const charge = human.releaseCharge(now);
                const muzzle = human.getMuzzle();
                this.weapons.fire(human.weapon, muzzle.x, muzzle.y, human.aimAngle, human.index, charge);
                human.consumeAmmo();
                human.lastFireTime = now;
            }
        } else if (human.weapon.melee) {
            // Melee weapon: fire on click, push player into cleared space if digging horizontally
            if (this.input.mouseDown && human.canFire(now)) {
                const muzzle = human.getMuzzle();
                this.weapons.fire(human.weapon, muzzle.x, muzzle.y, human.aimAngle, human.index);
                human.consumeAmmo();
                human.lastFireTime = now;

                // Push player forward if digging within ±30° of horizontal
                const absAngle = Math.abs(human.aimAngle);
                const nearHorizontal = absAngle < Math.PI / 6 || absAngle > (Math.PI - Math.PI / 6);
                if (nearHorizontal) {
                    const pushDist = human.weapon.meleeRange * 0.4;
                    human.x += Math.cos(human.aimAngle) * pushDist;
                    human.y += Math.sin(human.aimAngle) * pushDist;
                }
            }
        } else {
            // Non-chargeable: fire on click
            if (this.input.mouseDown && human.canFire(now)) {
                const muzzle = human.getMuzzle();
                this.weapons.fire(human.weapon, muzzle.x, muzzle.y, human.aimAngle, human.index);
                human.consumeAmmo();
                human.lastFireTime = now;
            }
        }

        // Weapon switching (cancel charge/sighting if switching)
        const switchWeapon = (idx) => { human.charging = false; human.sighting = false; human.setWeapon(idx); };
        if (this.input.wasPressed('1')) switchWeapon(0);
        if (this.input.wasPressed('2')) switchWeapon(1);
        if (this.input.wasPressed('3')) switchWeapon(2);
        if (this.input.wasPressed('4')) switchWeapon(3);
        if (this.input.wasPressed('5')) switchWeapon(4);
        if (this.input.wasPressed('6')) switchWeapon(5);
        if (this.input.wasPressed('e')) switchWeapon(0);  // E = quick-switch to Dig
        if (this.input.wasPressed('q')) { human.charging = false; human.sighting = false; human.nextWeapon(); }

        // ── AI update ───────────────────────────────────────────────
        this.ai.update(dt, now);

        // ── Physics ─────────────────────────────────────────────────
        for (const p of this.players) {
            p.updatePhysics(dt, this.terrain);
        }

        // ── Weapons / Projectiles ───────────────────────────────────
        this.weapons.update(dt, this.players);

        // Process explosions → damage + knockback
        for (const exp of this.weapons.pendingExplosions) {
            const blastR = exp.blastRadius;
            const dmgBase = exp.damage;
            const kb = exp.knockback;
            for (const p of this.players) {
                if (p.dead) continue;
                const d = dist(exp.x, exp.y, p.cx, p.cy);

                // Direct hit: projectile collided with this player's hitbox
                const isDirectHit = exp.directHitPlayerIdx === p.index;

                if (isDirectHit || d < blastR) {
                    const falloff = isDirectHit ? 1 : 1 - (d / blastR);
                    const dmg = dmgBase * falloff;
                    p.takeDamage(dmg);
                    p.applyKnockback(exp.x, exp.y, kb, blastR);
                    spawnDamageNumber(p.cx, p.y - 10, dmg);
                    playHit();
                    this.particles.emitHit(p.cx, p.cy);
                }
            }

            // Damage parachutes
            this.pickups.damageParachutes(exp.x, exp.y, blastR, dmgBase);

            // Screen shake proportional to blast
            triggerScreenShake(blastR * 0.15, 200);
        }
        this.weapons.pendingExplosions.length = 0;

        // ── Pickups ────────────────────────────────────────────────
        const cratesBefore = this.pickups.crates.length;
        this.pickups.update(dt, this.players, this.terrain);
        // Play pickup sound if a crate was collected
        if (this.pickups.crates.length < cratesBefore) {
            playPickup();
        }

        // ── Particles ───────────────────────────────────────────────
        this.particles.update(dt);
        updateScreenShake(dt);

        // ── Training mode: restore bot HP after heal delay ─────────
        const diff = AI_DIFFICULTY[this.selectedDifficulty];
        if (diff && diff.passive) {
            const bot = this.players[1];
            if (!bot.dead && bot.health < MAX_HEALTH) {
                if (bot.health < this._trainingLastHP) {
                    // New damage — reset heal timer
                    this._trainingHealTimer = 0;
                }
                this._trainingHealTimer += dt;
                if (this._trainingHealTimer >= (diff.healDelay || 2000)) {
                    bot.health = MAX_HEALTH;
                    this._trainingHealTimer = 0;
                }
            }
            this._trainingLastHP = bot.health;
        }

        // ── Check round end ─────────────────────────────────────────
        for (const p of this.players) {
            if (p.dead) {
                const winner = this.players.find(pl => !pl.dead);
                if (winner) {
                    winner.wins++;
                    this.roundWinner = winner;

                    if (winner.wins >= ROUNDS_TO_WIN) {
                        this.state = STATE.MATCH_OVER;
                        playVictory();
                    } else {
                        this.state = STATE.ROUND_OVER;
                        this.roundOverTimer = ROUND_START_DELAY;
                    }
                }
                break;
            }
        }

        // ── World bounds / screen wrapping ────────────────────────
        for (const p of this.players) {
            if (p.dead) continue;
            if (this.wrapScreen) {
                if (p.x + p.width < 0) p.x += CANVAS_WIDTH;
                else if (p.x > CANVAS_WIDTH) p.x -= CANVAS_WIDTH;
            } else {
                p.x = clamp(p.x, 0, CANVAS_WIDTH - p.width);
            }
        }

        // ── Restart / Exit ────────────────────────────────────────────
        if (this.input.wasPressed('r')) {
            this._startRound();
        }
        if (this.input.wasPressed('escape')) {
            this._returnToMenu();
        }
    }

    _updateRoundOver(dt, now) {
        if (this.input.wasPressed('escape')) {
            this._returnToMenu();
            return;
        }

        this.roundOverTimer -= dt;
        this.particles.update(dt);
        updateScreenShake(dt);

        if (this.roundOverTimer <= 0) {
            this._startRound();
        }
    }

    _updateMatchOver(dt, now) {
        this.particles.update(dt);

        if (this.input.mouseJustPressed || this.input.wasPressed('enter') ||
            this.input.wasPressed('escape')) {
            this._returnToMenu();
        }
    }

    /** Cleanly return to the main menu from any game state. */
    _returnToMenu() {
        for (const p of this.players) p.wins = 0;
        this.weapons.clear();
        this.particles.clear();
        this.pickups.clear();
        clearDamageNumbers();
        this.roundWinner = null;
        this.state = STATE.MENU;
    }

    // ── Drawing ─────────────────────────────────────────────────────

    _draw(now) {
        const ctx = this.ctx;

        if (this.state === STATE.MENU) {
            this.menuRegions = drawMainMenu(
                ctx, this.selectedMap, this.selectedDifficulty,
                this.menuHover, this.wrapScreen
            );
            return;
        }

        // Apply screen shake
        const shake = getScreenShake();
        ctx.save();
        ctx.translate(shake.x, shake.y);

        // Background
        this._drawBackground(ctx);

        // Terrain
        this.terrain.draw(ctx);

        // Laser sight (draw before players so it's behind them)
        for (const p of this.players) {
            if (p.sighting && !p.dead) {
                this._drawLaserSight(ctx, p, now);
            }
        }

        // Players (with wrap ghost)
        for (const p of this.players) {
            p.draw(ctx, now);
            if (this.wrapScreen && !p.dead) {
                // Draw ghost on opposite edge when near a boundary
                if (p.x < p.width) {
                    ctx.save();
                    ctx.translate(CANVAS_WIDTH, 0);
                    p.draw(ctx, now);
                    ctx.restore();
                } else if (p.x + p.width > CANVAS_WIDTH - p.width) {
                    ctx.save();
                    ctx.translate(-CANVAS_WIDTH, 0);
                    p.draw(ctx, now);
                    ctx.restore();
                }
            }
        }

        // Pickups (behind projectiles)
        this.pickups.draw(ctx);

        // Projectiles
        this.weapons.draw(ctx);

        // Particles (on top)
        this.particles.draw(ctx);

        // HUD
        drawHUD(ctx, this.players);

        ctx.restore();

        // Overlay states
        if (this.state === STATE.COUNTDOWN) {
            drawCountdown(ctx, this.countdownText);
        } else if (this.state === STATE.ROUND_OVER) {
            const loser = this.players.find(p => p.dead);
            drawRoundOver(ctx, this.roundWinner, loser);
        } else if (this.state === STATE.MATCH_OVER) {
            drawMatchOver(ctx, this.roundWinner);
        }
    }

    _drawBackground(ctx) {
        const mapDef = MAP_DEFS[this.selectedMap];
        if (!this._bgGrad || this._bgMapId !== mapDef.id) {
            this._bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
            this._bgGrad.addColorStop(0, mapDef.bgGradientTop);
            this._bgGrad.addColorStop(1, mapDef.bgGradientBottom);
            this._bgMapId = mapDef.id;
        }
        ctx.fillStyle = this._bgGrad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Parallax decorations based on map
        if (mapDef.id === 'grasslands') {
            this._drawClouds(ctx);
        } else if (mapDef.id === 'volcanic') {
            this._drawEmbers(ctx);
        }
    }

    _drawClouds(ctx) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        const t = performance.now() * 0.00003;
        for (let i = 0; i < 5; i++) {
            const x = ((i * 300 + t * (200 + i * 50)) % (CANVAS_WIDTH + 200)) - 100;
            const y = 40 + i * 35;
            ctx.beginPath();
            ctx.ellipse(x, y, 60 + i * 10, 18, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawEmbers(ctx) {
        const t = performance.now();
        ctx.fillStyle = 'rgba(255,120,20,0.3)';
        for (let i = 0; i < 15; i++) {
            const phase = i * 1234.5;
            const x = (Math.sin(t * 0.001 + phase) * 0.5 + 0.5) * CANVAS_WIDTH;
            const y = CANVAS_HEIGHT - ((t * 0.03 + phase * 10) % CANVAS_HEIGHT);
            const size = 1 + Math.sin(t * 0.003 + i) * 0.5;
            ctx.fillRect(x, y, size, size);
        }
    }

    /**
     * Draw a red laser sight line from the player's muzzle along the aim
     * angle until it hits terrain or exits the canvas.
     */
    _drawLaserSight(ctx, player, now) {
        const muzzle = player.getMuzzle();
        const cosA = Math.cos(player.aimAngle);
        const sinA = Math.sin(player.aimAngle);
        const step = 3;
        const maxDist = 1400; // slightly beyond canvas diagonal

        // Ray-march to find the first solid pixel or canvas exit
        let endX = muzzle.x;
        let endY = muzzle.y;
        for (let d = 0; d < maxDist; d += step) {
            const rx = muzzle.x + cosA * d;
            const ry = muzzle.y + sinA * d;
            if (rx < -10 || rx > CANVAS_WIDTH + 10 || ry < -10 || ry > CANVAS_HEIGHT + 10) {
                endX = rx;
                endY = ry;
                break;
            }
            if (this.terrain.isSolid(Math.round(rx), Math.round(ry))) {
                endX = rx;
                endY = ry;
                break;
            }
            endX = rx;
            endY = ry;
        }

        // Intensity ramps up with sighting duration and pulses gently
        const frac = player.getSightFraction(now);
        const pulse = 0.85 + 0.15 * Math.sin(now * 0.008);
        const baseAlpha = clamp(0.2 + frac * 0.6, 0, 1) * pulse;

        // Thin bright core
        ctx.save();
        ctx.strokeStyle = `rgba(255,40,30,${baseAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Wider glow
        ctx.strokeStyle = `rgba(255,80,60,${baseAlpha * 0.3})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(muzzle.x, muzzle.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Dot at impact point
        ctx.fillStyle = `rgba(255,60,40,${baseAlpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(endX, endY, 3 + frac * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // ── Game flow ───────────────────────────────────────────────────

    _startMatch() {
        // Reset scores
        for (const p of this.players) p.wins = 0;

        // Set AI difficulty
        this.ai.setDifficulty(this.selectedDifficulty);

        // Sync wrap mode to weapon system
        this.weapons.wrapScreen = this.wrapScreen;

        this._startRound();
    }

    _startRound() {
        const mapDef = MAP_DEFS[this.selectedMap];

        // Generate terrain
        generateMap(mapDef, this.terrain, this.wrapScreen);

        // Spawn players
        const p0 = this.players[0];
        const p1 = this.players[1];

        const spawnY0 = findSpawnY(this.terrain, mapDef.spawnLeft[0], p0.height);
        const spawnY1 = findSpawnY(this.terrain, mapDef.spawnRight[0], p1.height);

        p0.reset(mapDef.spawnLeft[0], spawnY0);
        p1.reset(mapDef.spawnRight[0], spawnY1);

        // Reset training mode heal tracking
        this._trainingHealTimer = 0;
        this._trainingLastHP    = MAX_HEALTH;

        // Clear systems
        this.weapons.clear();
        this.particles.clear();
        this.pickups.clear();
        clearDamageNumbers();
        this.roundWinner = null;
        this._bgMapId = null; // force bg rebuild

        // Re-link AI
        this.ai.self   = p1;
        this.ai.target = p0;
        this.ai.terrain = this.terrain;
        this.ai.weapons = this.weapons;

        // Spawn initial ammo crates
        this.pickups.spawnInitial(this.players);

        // Countdown
        this.state = STATE.COUNTDOWN;
        this.countdownTimer = 2500;
    }
}
