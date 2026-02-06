/**
 * Boomer - Destructible Terrain System
 * Pixel-based terrain stored in a typed array with an offscreen canvas for rendering.
 * Each cell holds a material type (see MAT in constants.js).
 */

import {
    WORLD_WIDTH, WORLD_HEIGHT,
    MAT, MAT_RESISTANCE, MAT_COLOURS,
} from './constants.js';

export class Terrain {
    constructor() {
        this.width  = WORLD_WIDTH;
        this.height = WORLD_HEIGHT;

        /** Material data: one byte per pixel. */
        this.data = new Uint8Array(this.width * this.height);

        /** Offscreen canvas for compositing terrain visuals. */
        this.canvas = document.createElement('canvas');
        this.canvas.width  = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');

        /** ImageData buffer for fast pixel writes. */
        this.imageData = this.ctx.createImageData(this.width, this.height);
        this.pixels    = this.imageData.data; // Uint8ClampedArray (RGBA)

        this.dirty = true; // needs re-render
    }

    /** Clear all terrain to air. */
    clear() {
        this.data.fill(MAT.AIR);
        this.dirty = true;
    }

    /** Get material at (x, y). Returns AIR for out-of-bounds. */
    get(x, y) {
        x = x | 0;
        y = y | 0;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return MAT.AIR;
        return this.data[y * this.width + x];
    }

    /** Set material at (x, y). */
    set(x, y, mat) {
        x = x | 0;
        y = y | 0;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
        this.data[y * this.width + x] = mat;
        this.dirty = true;
    }

    /** Is the pixel at (x,y) solid (not air, not lava)? */
    isSolid(x, y) {
        const mat = this.get(x, y);
        return mat !== MAT.AIR && mat !== MAT.LAVA;
    }

    /** Is the pixel at (x,y) lava? */
    isLava(x, y) {
        return this.get(x, y) === MAT.LAVA;
    }

    /**
     * Destroy terrain in a circle.
     * @param {number} cx - Centre x
     * @param {number} cy - Centre y
     * @param {number} radius - Blast radius in pixels
     * @param {number} power - Destruction power (compared against material resistance)
     * @returns {number} Number of pixels destroyed
     */
    destroyCircle(cx, cy, radius, power) {
        cx = Math.round(cx);
        cy = Math.round(cy);
        const r  = Math.ceil(radius);
        const r2 = radius * radius;
        let destroyed = 0;

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r2) continue;
                const px = cx + dx;
                const py = cy + dy;
                if (px < 0 || px >= this.width || py < 0 || py >= this.height) continue;

                const idx = py * this.width + px;
                const mat = this.data[idx];
                if (mat === MAT.AIR) continue;
                if (mat === MAT.LAVA) continue; // lava is indestructible

                const resistance = MAT_RESISTANCE[mat] || 1;
                // Power falls off towards edge of blast
                const distFrac = Math.sqrt(dx * dx + dy * dy) / radius;
                const effectivePower = power * (1 - distFrac * 0.6);

                if (effectivePower >= resistance) {
                    this.data[idx] = MAT.AIR;
                    destroyed++;
                }
            }
        }

        if (destroyed > 0) this.dirty = true;
        return destroyed;
    }

    /**
     * Build the terrain ImageData from the material array.
     * Called lazily when dirty.
     */
    rebuild() {
        if (!this.dirty) return;
        const w = this.width;
        const h = this.height;
        const d = this.data;
        const p = this.pixels;

        for (let i = 0, len = w * h; i < len; i++) {
            const mat = d[i];
            const pi = i * 4;
            if (mat === MAT.AIR) {
                p[pi]     = 0;
                p[pi + 1] = 0;
                p[pi + 2] = 0;
                p[pi + 3] = 0; // transparent
            } else {
                const col = MAT_COLOURS[mat];
                if (col) {
                    // Add slight per-pixel noise for texture
                    const noise = ((i * 2654435761) >>> 24) / 255 * 20 - 10;
                    p[pi]     = Math.max(0, Math.min(255, col[0] + noise));
                    p[pi + 1] = Math.max(0, Math.min(255, col[1] + noise));
                    p[pi + 2] = Math.max(0, Math.min(255, col[2] + noise));
                    p[pi + 3] = 255;
                } else {
                    p[pi] = 100; p[pi+1] = 100; p[pi+2] = 100; p[pi+3] = 255;
                }
            }
        }

        this.ctx.putImageData(this.imageData, 0, 0);

        // Add subtle shading: darken pixels that have terrain above them
        // (very cheap ambient occlusion)
        this._applyShading();

        this.dirty = false;
    }

    /** Simple top-down shading for depth. */
    _applyShading() {
        const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
        const px = imgData.data;
        const w = this.width;

        for (let y = 1; y < this.height; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (px[idx + 3] === 0) continue; // skip air

                // Check if pixel above is also solid → darken slightly
                const aboveIdx = ((y - 1) * w + x) * 4;
                if (px[aboveIdx + 3] > 0) {
                    // Has terrain above — slightly darker
                    px[idx]     = Math.max(0, px[idx] - 8);
                    px[idx + 1] = Math.max(0, px[idx + 1] - 8);
                    px[idx + 2] = Math.max(0, px[idx + 2] - 8);
                }

                // Edge highlight: if pixel to the left is air, lighten
                if (x > 0) {
                    const leftIdx = (y * w + (x - 1)) * 4;
                    if (px[leftIdx + 3] === 0) {
                        px[idx]     = Math.min(255, px[idx] + 12);
                        px[idx + 1] = Math.min(255, px[idx + 1] + 12);
                        px[idx + 2] = Math.min(255, px[idx + 2] + 12);
                    }
                }
            }
        }

        this.ctx.putImageData(imgData, 0, 0);
    }

    /** Draw the terrain onto a target canvas context. */
    draw(targetCtx) {
        this.rebuild();
        targetCtx.drawImage(this.canvas, 0, 0);
    }

    /**
     * Find the surface Y at a given X (topmost solid pixel).
     * Returns WORLD_HEIGHT if no solid ground found.
     */
    surfaceY(x) {
        x = x | 0;
        if (x < 0 || x >= this.width) return this.height;
        for (let y = 0; y < this.height; y++) {
            if (this.isSolid(x, y)) return y;
        }
        return this.height;
    }

    /**
     * Check if a rectangular area collides with solid terrain.
     * @returns {boolean}
     */
    rectCollides(rx, ry, rw, rh) {
        const x0 = Math.max(0, Math.floor(rx));
        const y0 = Math.max(0, Math.floor(ry));
        const x1 = Math.min(this.width - 1, Math.floor(rx + rw));
        const y1 = Math.min(this.height - 1, Math.floor(ry + rh));

        // Sample edges rather than every pixel for performance
        for (let x = x0; x <= x1; x++) {
            if (this.isSolid(x, y0)) return true;
            if (this.isSolid(x, y1)) return true;
        }
        for (let y = y0; y <= y1; y++) {
            if (this.isSolid(x0, y)) return true;
            if (this.isSolid(x1, y)) return true;
        }
        return false;
    }
}
