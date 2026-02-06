/**
 * Boomer - Audio System
 * Synthesised sound effects using the Web Audio API.
 * No external assets required.
 */

let ctx = null;

function getCtx() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
}

/** Ensure audio context is resumed (must be called from a user gesture). */
export function resumeAudio() {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
}

/**
 * Play a short synthesised explosion sound.
 * @param {number} intensity 0-1, scales volume and duration.
 */
export function playExplosion(intensity = 1) {
    const c = getCtx();
    const now = c.currentTime;
    const dur = 0.15 + intensity * 0.35;

    // Noise burst via buffer
    const bufferSize = c.sampleRate * dur;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const source = c.createBufferSource();
    source.buffer = buffer;

    // Low-pass filter for bass rumble
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800 + intensity * 600, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + dur);

    const gain = c.createGain();
    gain.gain.setValueAtTime(0.25 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    source.start(now);
    source.stop(now + dur);
}

/**
 * Play a gunshot-style sound.
 * @param {'rocket'|'shotgun'|'grenade'|'sniper'|'cluster'} type
 */
export function playShot(type) {
    const c = getCtx();
    const now = c.currentTime;

    if (type === 'shotgun') {
        // Short sharp crack
        const dur = 0.08;
        const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
        }
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.setValueAtTime(0.2, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 1200;
        src.connect(f);
        f.connect(g);
        g.connect(c.destination);
        src.start(now);
        src.stop(now + dur);
    } else if (type === 'rocket') {
        // Whoosh
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
        const g = c.createGain();
        g.gain.setValueAtTime(0.12, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'sniper') {
        // Sharp high-pitched crack + brief echo
        const dur = 0.06;
        const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
        }
        const src = c.createBufferSource();
        src.buffer = buf;
        const g = c.createGain();
        g.gain.setValueAtTime(0.25, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        const f = c.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 2000;
        src.connect(f);
        f.connect(g);
        g.connect(c.destination);
        src.start(now);
        src.stop(now + dur);
        // Brief echo tail
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.04, now + 0.03);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(g2);
        g2.connect(c.destination);
        osc.start(now + 0.03);
        osc.stop(now + 0.15);
    } else if (type === 'cluster') {
        // Deep thunk (heavier than grenade)
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.18);
        const g = c.createGain();
        g.gain.setValueAtTime(0.18, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.18);
    } else {
        // Grenade thump
        const osc = c.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.15);
        const g = c.createGain();
        g.gain.setValueAtTime(0.15, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }
}

/** Play a short "hit" sound when a player takes damage. */
export function playHit() {
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

/** Simple jump sound. */
export function playJump() {
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.08);
}

/** Weapon switch click. */
export function playSwitch() {
    const c = getCtx();
    const now = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.02);
    const g = c.createGain();
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(now);
    osc.stop(now + 0.05);
}

/** Victory fanfare. */
export function playVictory() {
    const c = getCtx();
    const now = c.currentTime;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
        const osc = c.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, now + i * 0.15);
        g.gain.linearRampToValueAtTime(0.08, now + i * 0.15 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.4);
        osc.connect(g);
        g.connect(c.destination);
        osc.start(now + i * 0.15);
        osc.stop(now + i * 0.15 + 0.4);
    });
}
