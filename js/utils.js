/**
 * Boomer - Utility Functions
 * Math helpers, noise generation, and common operations.
 */

/** Clamp value between min and max. */
export function clamp(val, min, max) {
    return val < min ? min : val > max ? max : val;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/** Distance between two points. */
export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Angle from (x1,y1) to (x2,y2) in radians. */
export function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

/** Random float in [min, max). */
export function randRange(min, max) {
    return min + Math.random() * (max - min);
}

/** Random integer in [min, max]. */
export function randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
}

/** Random item from array. */
export function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Normalise an angle to [-PI, PI]. */
export function normaliseAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

// ── Simple 1D Perlin-ish noise (value noise with smoothing) ────────

/**
 * Generate a smooth heightmap array of the given width.
 * @param {number} width - Number of samples
 * @param {number} octaves - Layers of noise
 * @param {number} baseWavelength - Wavelength of the lowest frequency
 * @param {number} persistence - Amplitude falloff per octave
 * @param {boolean} wrap - If true, ensure heights[0] ≈ heights[width-1] for toroidal maps
 * @returns {Float64Array}
 */
export function generateHeightmap(width, octaves = 5, baseWavelength = 200, persistence = 0.5, wrap = false) {
    const result = new Float64Array(width);

    for (let o = 0; o < octaves; o++) {
        const wavelength = baseWavelength / Math.pow(2, o);
        const amplitude  = Math.pow(persistence, o);
        const nSamples   = Math.ceil(width / wavelength) + 2;
        const samples    = new Float64Array(nSamples);

        for (let i = 0; i < nSamples; i++) {
            samples[i] = Math.random() * 2 - 1;
        }

        for (let x = 0; x < width; x++) {
            const pos   = x / wavelength;
            const index = Math.floor(pos);
            const frac  = pos - index;
            // Cubic interpolation
            const p0 = samples[Math.max(0, index - 1)];
            const p1 = samples[index];
            const p2 = samples[Math.min(nSamples - 1, index + 1)];
            const p3 = samples[Math.min(nSamples - 1, index + 2)];
            const t = frac;
            const t2 = t * t;
            const t3 = t2 * t;
            const v = 0.5 * (
                (2 * p1) +
                (-p0 + p2) * t +
                (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            );
            result[x] += v * amplitude;
        }
    }

    // Blend edges so the terrain wraps smoothly with no discontinuity
    if (wrap) {
        const blendW = Math.min(80, Math.floor(width / 6));
        const leftOrig  = new Float64Array(blendW);
        const rightOrig = new Float64Array(blendW);
        for (let i = 0; i < blendW; i++) {
            leftOrig[i]  = result[i];
            rightOrig[i] = result[width - 1 - i];
        }
        for (let i = 0; i < blendW; i++) {
            const t = i / blendW;                       // 0 at edge, 1 at interior
            const smooth = t * t * (3 - 2 * t);         // smoothstep
            const avg = (leftOrig[0] + rightOrig[0]) / 2;
            result[i]             = lerp(avg, leftOrig[i],  smooth);
            result[width - 1 - i] = lerp(avg, rightOrig[i], smooth);
        }
    }

    return result;
}

/**
 * Smoothly ease-in-out (cubic).
 */
export function easeInOut(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Create an RGBA colour string.
 */
export function rgba(r, g, b, a = 1) {
    return `rgba(${r},${g},${b},${a})`;
}

/**
 * Check AABB overlap.
 */
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
