/**
 * Boomer - Map Definitions & Generator
 * Generates destructible terrain for each environment type.
 */

import {
    WORLD_WIDTH, WORLD_HEIGHT, MAT,
} from './constants.js';
import { generateHeightmap, randRange, randInt, clamp } from './utils.js';

/**
 * @typedef {Object} MapDef
 * @property {string} id
 * @property {string} name
 * @property {string} bgGradientTop - CSS colour
 * @property {string} bgGradientBottom - CSS colour
 * @property {function} generate - (terrain: Terrain) => void
 * @property {number[]} spawnLeft  - [x, y] approximate spawn
 * @property {number[]} spawnRight - [x, y] approximate spawn
 */

/** @type {MapDef[]} */
export const MAP_DEFS = [

    // ── 1. Grasslands ───────────────────────────────────────────────
    {
        id: 'grasslands',
        name: 'Grasslands',
        bgGradientTop: '#87ceeb',
        bgGradientBottom: '#d4e6b5',
        generate(terrain, wrap = false) {
            const w = terrain.width;
            const h = terrain.height;
            const baseY = h * 0.55;
            const heights = generateHeightmap(w, 5, 250, 0.45, wrap);

            for (let x = 0; x < w; x++) {
                const surfaceY = Math.round(baseY + heights[x] * 120);
                for (let y = surfaceY; y < h; y++) {
                    if (y === surfaceY) {
                        terrain.set(x, y, MAT.GRASS);
                    } else if (y < surfaceY + 3) {
                        terrain.set(x, y, MAT.GRASS);
                    } else if (y > h - 40) {
                        terrain.set(x, y, MAT.ROCK);
                    } else {
                        terrain.set(x, y, MAT.DIRT);
                    }
                }
            }

            // Add some rock outcrops
            for (let i = 0; i < 3; i++) {
                const ox = randInt(100, w - 100);
                const oy = Math.round(baseY + heights[clamp(ox, 0, w - 1)] * 120) - randInt(10, 30);
                _fillEllipse(terrain, ox, oy, randInt(15, 35), randInt(10, 25), MAT.ROCK);
            }

            // Underground tunnels
            for (let i = 0; i < 2; i++) {
                const tx = randInt(100, w - 100);
                const ty = Math.round(baseY + heights[clamp(tx, 0, w - 1)] * 120) + randInt(40, 80);
                _carveHorizontalTunnel(terrain, tx, ty, randInt(60, 150), randInt(12, 20));
            }
        },
        spawnLeft:  [100, 0],
        spawnRight: [WORLD_WIDTH - 120, 0],
    },

    // ── 2. Desert ───────────────────────────────────────────────────
    {
        id: 'desert',
        name: 'Desert',
        bgGradientTop: '#ffa94d',
        bgGradientBottom: '#f5deb3',
        generate(terrain, wrap = false) {
            const w = terrain.width;
            const h = terrain.height;
            const baseY = h * 0.6;
            const heights = generateHeightmap(w, 4, 300, 0.3, wrap);

            for (let x = 0; x < w; x++) {
                const surfaceY = Math.round(baseY + heights[x] * 80);
                for (let y = surfaceY; y < h; y++) {
                    if (y > h - 30) {
                        terrain.set(x, y, MAT.ROCK);
                    } else {
                        terrain.set(x, y, MAT.SAND);
                    }
                }
            }

            // Rocky pillars / outcrops
            for (let i = 0; i < 5; i++) {
                const px = randInt(80, w - 80);
                const baseSY = Math.round(baseY + heights[clamp(px, 0, w - 1)] * 80);
                const pillarH = randInt(40, 90);
                const pillarW = randInt(12, 25);
                for (let dy = 0; dy < pillarH; dy++) {
                    for (let dx = -pillarW / 2; dx < pillarW / 2; dx++) {
                        terrain.set(Math.round(px + dx), baseSY - dy, MAT.ROCK);
                    }
                }
            }

            // Cacti (small destructible features using GRASS material for colour contrast)
            for (let i = 0; i < 4; i++) {
                const cx = randInt(80, w - 80);
                const baseSY = Math.round(baseY + heights[clamp(cx, 0, w - 1)] * 80);
                const cactH = randInt(15, 30);
                for (let dy = 0; dy < cactH; dy++) {
                    terrain.set(cx, baseSY - dy, MAT.GRASS);
                    terrain.set(cx + 1, baseSY - dy, MAT.GRASS);
                }
                // Arms
                const armY = baseSY - Math.round(cactH * 0.6);
                for (let dx = 0; dx < randInt(5, 10); dx++) {
                    terrain.set(cx + 2 + dx, armY, MAT.GRASS);
                    terrain.set(cx + 2 + dx, armY - 1, MAT.GRASS);
                }
            }
        },
        spawnLeft:  [80, 0],
        spawnRight: [WORLD_WIDTH - 100, 0],
    },

    // ── 3. Urban ────────────────────────────────────────────────────
    {
        id: 'urban',
        name: 'Urban Ruins',
        bgGradientTop: '#555566',
        bgGradientBottom: '#333344',
        generate(terrain, wrap = false) {
            const w = terrain.width;
            const h = terrain.height;
            const groundY = Math.round(h * 0.75);

            // Flat ground
            for (let x = 0; x < w; x++) {
                for (let y = groundY; y < h; y++) {
                    terrain.set(x, y, y > h - 15 ? MAT.ROCK : MAT.BRICK);
                }
            }

            // Buildings
            const buildings = [];
            let bx = randInt(30, 80);
            while (bx < w - 60) {
                const bw = randInt(50, 100);
                const bh = randInt(60, 180);
                const by = groundY - bh;
                buildings.push({ x: bx, y: by, w: bw, h: bh });

                // Brick walls
                for (let y = by; y < groundY; y++) {
                    for (let x = bx; x < bx + bw; x++) {
                        terrain.set(x, y, MAT.BRICK);
                    }
                }

                // Cut windows
                for (let wy = by + 12; wy < groundY - 15; wy += 22) {
                    for (let wx = bx + 8; wx < bx + bw - 8; wx += 18) {
                        for (let dy = 0; dy < 10; dy++) {
                            for (let dx = 0; dx < 8; dx++) {
                                terrain.set(wx + dx, wy + dy, MAT.AIR);
                            }
                        }
                    }
                }

                // Cut doorway at ground level
                const doorX = bx + Math.round(bw / 2) - 6;
                for (let dy = 0; dy < 22; dy++) {
                    for (let dx = 0; dx < 12; dx++) {
                        terrain.set(doorX + dx, groundY - dy - 1, MAT.AIR);
                    }
                }

                bx += bw + randInt(40, 100);
            }

            // Rubble piles between buildings
            for (let i = 0; i < buildings.length - 1; i++) {
                const gap = buildings[i].x + buildings[i].w;
                const nextB = buildings[i + 1] ? buildings[i + 1].x : w;
                const mid = (gap + nextB) / 2;
                _fillEllipse(terrain, mid, groundY - 5, randInt(15, 30), randInt(5, 12), MAT.ROCK);
            }
        },
        spawnLeft:  [50, 0],
        spawnRight: [WORLD_WIDTH - 70, 0],
    },

    // ── 4. Volcanic ─────────────────────────────────────────────────
    {
        id: 'volcanic',
        name: 'Volcanic',
        bgGradientTop: '#1a0a0a',
        bgGradientBottom: '#3a1515',
        generate(terrain, wrap = false) {
            const w = terrain.width;
            const h = terrain.height;
            const baseY = h * 0.55;
            const heights = generateHeightmap(w, 5, 180, 0.5, wrap);

            for (let x = 0; x < w; x++) {
                const surfaceY = Math.round(baseY + heights[x] * 130);
                for (let y = surfaceY; y < h; y++) {
                    if (y > h - 20) {
                        terrain.set(x, y, MAT.LAVA);
                    } else if (y === surfaceY || y === surfaceY + 1) {
                        terrain.set(x, y, MAT.ROCK);
                    } else {
                        terrain.set(x, y, MAT.ROCK);
                    }
                }
            }

            // Lava pools in valleys
            // Find local minima in heightmap
            for (let x = 20; x < w - 20; x++) {
                const sy = Math.round(baseY + heights[x] * 130);
                const leftY  = Math.round(baseY + heights[Math.max(0, x - 30)] * 130);
                const rightY = Math.round(baseY + heights[Math.min(w - 1, x + 30)] * 130);

                if (sy > leftY + 15 && sy > rightY + 15) {
                    // Valley — fill bottom with lava
                    for (let dx = -20; dx < 20; dx++) {
                        const px = x + dx;
                        if (px < 0 || px >= w) continue;
                        const psy = Math.round(baseY + heights[px] * 130);
                        // Replace top few terrain rows with lava in the valley
                        for (let dy = 0; dy < 8; dy++) {
                            if (terrain.get(px, psy + dy) === MAT.ROCK) {
                                terrain.set(px, psy + dy, MAT.LAVA);
                            }
                        }
                    }
                }
            }

            // Jagged rock spires
            for (let i = 0; i < 6; i++) {
                const sx = randInt(60, w - 60);
                const baseSY = Math.round(baseY + heights[clamp(sx, 0, w - 1)] * 130);
                const spireH = randInt(30, 70);
                const spireW = randInt(6, 14);
                for (let dy = 0; dy < spireH; dy++) {
                    const taper = 1 - (dy / spireH) * 0.7;
                    const halfW = Math.round(spireW * taper / 2);
                    for (let dx = -halfW; dx <= halfW; dx++) {
                        terrain.set(sx + dx, baseSY - dy, MAT.ROCK);
                    }
                }
            }
        },
        spawnLeft:  [100, 0],
        spawnRight: [WORLD_WIDTH - 120, 0],
    },
];

// ── Helper functions for map generation ─────────────────────────────

/** Fill an elliptical area with a material. */
function _fillEllipse(terrain, cx, cy, rx, ry, mat) {
    for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
            if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
                terrain.set(cx + dx, cy + dy, mat);
            }
        }
    }
}

/** Carve a rough horizontal tunnel. */
function _carveHorizontalTunnel(terrain, startX, y, length, height) {
    const halfH = Math.floor(height / 2);
    const dir = Math.random() < 0.5 ? 1 : -1;

    for (let dx = 0; dx < length; dx++) {
        const x = startX + dx * dir;
        const wobble = Math.sin(dx * 0.08) * 4;
        for (let dy = -halfH; dy <= halfH; dy++) {
            terrain.set(Math.round(x), Math.round(y + dy + wobble), MAT.AIR);
        }
    }
}

/**
 * Apply a map definition to a terrain instance.
 * @param {MapDef} mapDef
 * @param {import('./terrain.js').Terrain} terrain
 * @param {boolean} wrap - Whether screen wrapping is enabled
 */
export function generateMap(mapDef, terrain, wrap = false) {
    terrain.clear();
    mapDef.generate(terrain, wrap);
    terrain.dirty = true;
}

/**
 * Find a safe spawn Y for a given X on the terrain (on top of the surface).
 * @param {import('./terrain.js').Terrain} terrain
 * @param {number} x
 * @param {number} playerHeight
 * @returns {number} y coordinate for the player's top-left
 */
export function findSpawnY(terrain, x, playerHeight) {
    const sy = terrain.surfaceY(Math.round(x));
    return sy - playerHeight - 2;
}
