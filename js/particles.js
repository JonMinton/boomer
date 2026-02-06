/**
 * Boomer - Particle Effects System
 * Lightweight particles for explosions, debris, smoke, and hit effects.
 */

import { MAX_PARTICLES, GRAVITY } from './constants.js';
import { randRange } from './utils.js';

/**
 * Individual particle.
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} life       - Remaining life in ms
 * @property {number} maxLife    - Total lifetime in ms
 * @property {number} size
 * @property {number[]} colour   - [r, g, b]
 * @property {number} gravity    - Gravity multiplier for this particle
 * @property {string} type       - 'debris' | 'smoke' | 'spark' | 'blood'
 */

export class ParticleSystem {
    constructor() {
        /** @type {Particle[]} */
        this.particles = [];
    }

    /** Update all particles. Remove dead ones. */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.vy += GRAVITY * p.gravity * (dt / 16);
            p.x += p.vx * (dt / 16);
            p.y += p.vy * (dt / 16);

            // Friction for smoke
            if (p.type === 'smoke') {
                p.vx *= 0.96;
                p.vy *= 0.96;
            }
        }
    }

    /** Draw all particles onto the canvas context. */
    draw(ctx) {
        for (const p of this.particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            const [r, g, b] = p.colour;
            ctx.globalAlpha = alpha;

            if (p.type === 'smoke') {
                const size = p.size * (1 + (1 - alpha) * 2);
                ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.4})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'spark') {
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(p.x, p.y, p.size * alpha, p.size * alpha);
            } else {
                // debris / blood
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
        }
        ctx.globalAlpha = 1;
    }

    /**
     * Spawn an explosion burst.
     * @param {number} x
     * @param {number} y
     * @param {number} radius - Determines spread
     * @param {number[]} baseColour - [r, g, b]
     */
    emitExplosion(x, y, radius, baseColour = [255, 160, 50]) {
        const count = Math.min(30, Math.floor(radius * 1.5));

        // Debris
        for (let i = 0; i < count && this.particles.length < MAX_PARTICLES; i++) {
            const ang = randRange(0, Math.PI * 2);
            const spd = randRange(1, 4 + radius * 0.1);
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - randRange(1, 3),
                life: randRange(300, 700),
                maxLife: 700,
                size: randRange(1.5, 3.5),
                colour: [
                    Math.min(255, baseColour[0] + randRange(-30, 30)),
                    Math.min(255, baseColour[1] + randRange(-30, 30)),
                    Math.min(255, baseColour[2] + randRange(-20, 20)),
                ],
                gravity: 0.6,
                type: 'debris',
            });
        }

        // Smoke
        const smokeCount = Math.min(12, Math.floor(radius * 0.5));
        for (let i = 0; i < smokeCount && this.particles.length < MAX_PARTICLES; i++) {
            const ang = randRange(0, Math.PI * 2);
            const spd = randRange(0.3, 1.5);
            this.particles.push({
                x: x + randRange(-radius * 0.3, radius * 0.3),
                y: y + randRange(-radius * 0.3, radius * 0.3),
                vx: Math.cos(ang) * spd,
                vy: -randRange(0.5, 2),
                life: randRange(500, 1200),
                maxLife: 1200,
                size: randRange(4, 8),
                colour: [80, 80, 80],
                gravity: -0.05,
                type: 'smoke',
            });
        }

        // Sparks
        for (let i = 0; i < 8 && this.particles.length < MAX_PARTICLES; i++) {
            const ang = randRange(0, Math.PI * 2);
            const spd = randRange(3, 7);
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: randRange(150, 400),
                maxLife: 400,
                size: randRange(1, 2.5),
                colour: [255, 255, randRange(100, 255)],
                gravity: 0.3,
                type: 'spark',
            });
        }
    }

    /**
     * Emit hit/damage particles.
     */
    emitHit(x, y) {
        for (let i = 0; i < 6 && this.particles.length < MAX_PARTICLES; i++) {
            const ang = randRange(-Math.PI, 0); // upward arc
            const spd = randRange(1, 3);
            this.particles.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                life: randRange(200, 450),
                maxLife: 450,
                size: randRange(1.5, 3),
                colour: [220, 50, 30],
                gravity: 0.5,
                type: 'blood',
            });
        }
    }

    /**
     * Emit a trail puff behind a projectile.
     */
    emitTrail(x, y, colour = [200, 200, 200]) {
        if (this.particles.length >= MAX_PARTICLES) return;
        this.particles.push({
            x: x + randRange(-1, 1),
            y: y + randRange(-1, 1),
            vx: randRange(-0.3, 0.3),
            vy: randRange(-0.5, 0),
            life: randRange(100, 250),
            maxLife: 250,
            size: randRange(2, 4),
            colour,
            gravity: -0.02,
            type: 'smoke',
        });
    }

    /** Remove all particles. */
    clear() {
        this.particles.length = 0;
    }
}
