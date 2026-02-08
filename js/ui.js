/**
 * Boomer - UI System
 * Health bars, weapon HUD, menus, score display, damage numbers.
 */

import {
    CANVAS_WIDTH, CANVAS_HEIGHT, MAX_HEALTH, WEAPON_LIST,
    AI_DIFFICULTY, ROUNDS_TO_WIN,
    BUG_REPORT_URL, FEATURE_REQUEST_URL, FEEDBACK_FORM_URL,
} from './constants.js';
import { MAP_DEFS } from './maps.js';
import { clamp, lerp } from './utils.js';

// ── Damage Numbers ──────────────────────────────────────────────────

/** @typedef {{ x:number, y:number, text:string, life:number, maxLife:number }} DamageNumber */

/** @type {DamageNumber[]} */
let damageNumbers = [];

export function spawnDamageNumber(x, y, amount) {
    damageNumbers.push({
        x, y,
        text: `-${Math.round(amount)}`,
        life: 800,
        maxLife: 800,
    });
}

function updateDamageNumbers(dt) {
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        const d = damageNumbers[i];
        d.life -= dt;
        d.y -= 0.8 * (dt / 16);
        if (d.life <= 0) damageNumbers.splice(i, 1);
    }
}

function drawDamageNumbers(ctx) {
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const d of damageNumbers) {
        const alpha = clamp(d.life / d.maxLife, 0, 1);
        ctx.fillStyle = `rgba(255,80,60,${alpha})`;
        ctx.fillText(d.text, d.x, d.y);
    }
}

// ── Screen Shake ────────────────────────────────────────────────────

let shakeIntensity = 0;
let shakeDuration  = 0;
let shakeTimer     = 0;

export function triggerScreenShake(intensity, duration) {
    shakeIntensity = intensity;
    shakeDuration  = duration;
    shakeTimer     = duration;
}

export function getScreenShake() {
    if (shakeTimer <= 0) return { x: 0, y: 0 };
    const frac = shakeTimer / shakeDuration;
    return {
        x: (Math.random() - 0.5) * shakeIntensity * frac * 2,
        y: (Math.random() - 0.5) * shakeIntensity * frac * 2,
    };
}

export function updateScreenShake(dt) {
    if (shakeTimer > 0) shakeTimer -= dt;
}

// ── HUD Drawing ─────────────────────────────────────────────────────

/**
 * Draw in-game HUD (health bars, weapon info, score).
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./player.js').Player[]} players
 */
export function drawHUD(ctx, players) {
    updateDamageNumbers(16);
    drawDamageNumbers(ctx);

    for (const p of players) {
        if (p.dead) continue;
        _drawHealthBar(ctx, p);
    }

    // Weapon selector for player 0 (human)
    _drawWeaponHUD(ctx, players[0]);

    // Score
    _drawScore(ctx, players);

    // Exit hint
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('ESC: Menu', CANVAS_WIDTH - 10, 18);
}

function _drawHealthBar(ctx, player) {
    const barW = 40;
    const barH = 5;
    const x = player.cx - barW / 2;
    const y = player.y - 18;
    const frac = clamp(player.health / MAX_HEALTH, 0, 1);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 1, y - 1, barW + 2, barH + 2);

    // Health fill
    const r = Math.round(lerp(220, 60, frac));
    const g = Math.round(lerp(40, 200, frac));
    ctx.fillStyle = `rgb(${r},${g},40)`;
    ctx.fillRect(x, y, barW * frac, barH);

    // Health text
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(player.health)}`, player.cx, y - 2);
}

function _drawWeaponHUD(ctx, player) {
    const count = WEAPON_LIST.length;
    // Adaptive sizing: fit all weapons on screen
    const totalW = CANVAS_WIDTH - 20;
    const slotW = Math.min(140, Math.floor(totalW / count) - 4);
    const startX = 10;
    const y = CANVAS_HEIGHT - 50;

    ctx.textAlign = 'left';

    for (let i = 0; i < count; i++) {
        const w = WEAPON_LIST[i];
        const isActive = i === player.weaponIndex;
        const bx = startX + i * (slotW + 4);
        const ammoCount = player.ammo[w.id]; // null = unlimited, number = remaining
        const hasAmmo = ammoCount === null || ammoCount > 0;
        const isEmpty = !hasAmmo;

        // Background — dim empty weapons
        if (isEmpty) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
        } else {
            ctx.fillStyle = isActive ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.3)';
        }
        ctx.fillRect(bx, y, slotW, 36);

        if (isActive && !isEmpty) {
            ctx.strokeStyle = w.colour;
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, y, slotW, 36);
        } else if (isActive && isEmpty) {
            ctx.strokeStyle = '#600';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, y, slotW, 36);
        }

        // Key binding
        ctx.fillStyle = isEmpty ? '#555' : (isActive ? '#fff' : '#999');
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`[${i + 1}]`, bx + 3, y + 13);

        // Weapon name (cluster shows mode-dependent name)
        ctx.font = '10px monospace';
        ctx.fillStyle = isEmpty ? '#555' : (isActive ? '#fff' : '#999');
        const displayName = (w.id === 'cluster' && player.clusterMineMode) ? 'Cluster Mine' : w.name;
        ctx.fillText(displayName, bx + 26, y + 13);

        // Ammo count (right side)
        ctx.textAlign = 'right';
        ctx.font = 'bold 10px monospace';
        if (ammoCount === null) {
            ctx.fillStyle = '#666';
            ctx.fillText('\u221E', bx + slotW - 3, y + 13); // ∞
        } else if (ammoCount > 0) {
            ctx.fillStyle = ammoCount <= 1 ? '#f44' : '#ccc';
            ctx.fillText(`${ammoCount}`, bx + slotW - 3, y + 13);
        } else {
            ctx.fillStyle = '#600';
            ctx.fillText('0', bx + slotW - 3, y + 13);
        }
        ctx.textAlign = 'left';

        // Chargeable indicator (only if ammo available)
        if (w.chargeable && hasAmmo) {
            ctx.fillStyle = 'rgba(255,200,50,0.5)';
            ctx.font = '8px monospace';
            ctx.fillText('HOLD', bx + 26, y + 32);
        }

        // Cluster bomb/mine mode indicator
        if (w.id === 'cluster' && hasAmmo) {
            const modeLabel = player.clusterMineMode ? 'MINE' : 'BOMB';
            const modeColour = player.clusterMineMode ? 'rgba(255,100,30,0.7)' : 'rgba(255,200,50,0.4)';
            ctx.fillStyle = modeColour;
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(modeLabel, bx + slotW - 3, y + 32);
            ctx.textAlign = 'left';
        }

        // Sighted indicator (sniper — only if ammo available)
        if (w.sighted && hasAmmo) {
            ctx.fillStyle = 'rgba(255,80,60,0.5)';
            ctx.font = '8px monospace';
            ctx.fillText('SIGHT', bx + 26, y + 32);
        }

        // Cooldown bar
        if (isActive && hasAmmo) {
            const now = performance.now();
            const elapsed = now - player.lastFireTime;
            const coolFrac = clamp(elapsed / w.cooldown, 0, 1);
            ctx.fillStyle = coolFrac >= 1 ? '#4f4' : '#f44';
            ctx.fillRect(bx + 3, y + 28, (slotW - 6) * coolFrac, 4);
        }

        // Strikethrough for empty weapons
        if (isEmpty) {
            ctx.strokeStyle = 'rgba(255,60,60,0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(bx + 2, y + 18);
            ctx.lineTo(bx + slotW - 2, y + 18);
            ctx.stroke();
        }
    }

    // Note: no progress bar for sighted weapons (sniper) — the visible
    // laser sight on screen is the feedback.  Charge bar is only for
    // chargeable weapons (grenade / cluster).

    // ── Charge indicator (shown when actively charging) ──
    if (player.charging && player.weapon.chargeable) {
        const now = performance.now();
        const charge = player.getCharge(now);
        const barW = 80;
        const barH = 10;
        const barX = player.cx - barW / 2;
        const barY = player.y - 34;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

        // Gradient fill: yellow → red as charge increases
        const r = Math.round(lerp(255, 255, charge));
        const g = Math.round(lerp(220, 50, charge));
        const b = Math.round(lerp(50, 20, charge));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(barX, barY, barW * charge, barH);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round(charge * 100)}%`, player.cx, barY - 2);
    }
}

function _drawScore(ctx, players) {
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';

    const p0 = players[0];
    const p1 = players[1];

    // Player 0 score (left)
    ctx.fillStyle = p0.colour;
    ctx.fillText(`${p0.name}: ${p0.wins}`, CANVAS_WIDTH * 0.25, 28);

    // Player 1 score (right)
    ctx.fillStyle = p1.colour;
    ctx.fillText(`${p1.name}: ${p1.wins}`, CANVAS_WIDTH * 0.75, 28);

    // Round info
    ctx.fillStyle = '#ccc';
    ctx.font = '12px monospace';
    ctx.fillText(`First to ${ROUNDS_TO_WIN}`, CANVAS_WIDTH / 2, 28);
}

// ── Menu Screens ────────────────────────────────────────────────────

/**
 * Draw the main menu.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} selectedMap - Index into MAP_DEFS
 * @param {string} selectedDifficulty - Key into AI_DIFFICULTY
 * @param {Object} hover - { map: number|null, diff: string|null, start: boolean, wrap: boolean }
 * @param {boolean} wrapScreen - Whether screen wrapping is enabled
 */
export function drawMainMenu(ctx, selectedMap, selectedDifficulty, hover, wrapScreen = false) {
    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Decorative grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < CANVAS_WIDTH; x += 40) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_HEIGHT); ctx.stroke();
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }

    // Title
    ctx.fillStyle = '#ff6b35';
    ctx.font = 'bold 64px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('BOOMER', CANVAS_WIDTH / 2, 120);

    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText('1 vs 1 Arena Shooter', CANVAS_WIDTH / 2, 150);

    // Map selection
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Select Map', CANVAS_WIDTH / 2, 210);

    const mapStartX = CANVAS_WIDTH / 2 - (MAP_DEFS.length * 140) / 2;
    for (let i = 0; i < MAP_DEFS.length; i++) {
        const m = MAP_DEFS[i];
        const bx = mapStartX + i * 140;
        const by = 225;
        const bw = 125;
        const bh = 60;

        const isSelected = i === selectedMap;
        const isHovered  = hover.map === i;

        // Card
        ctx.fillStyle = isSelected ? 'rgba(255,107,53,0.3)' : isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(bx, by, bw, bh);

        if (isSelected) {
            ctx.strokeStyle = '#ff6b35';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
        }

        // Mini gradient preview
        const grad = ctx.createLinearGradient(bx, by, bx, by + 25);
        grad.addColorStop(0, m.bgGradientTop);
        grad.addColorStop(1, m.bgGradientBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(bx + 4, by + 4, bw - 8, 25);

        // Label
        ctx.fillStyle = isSelected ? '#fff' : '#aaa';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(m.name, bx + bw / 2, by + 50);
    }

    // Difficulty selection
    ctx.fillStyle = '#ddd';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AI Difficulty', CANVAS_WIDTH / 2, 340);

    const diffKeys = Object.keys(AI_DIFFICULTY);
    const diffStartX = CANVAS_WIDTH / 2 - (diffKeys.length * 150) / 2;
    for (let i = 0; i < diffKeys.length; i++) {
        const key = diffKeys[i];
        const d = AI_DIFFICULTY[key];
        const bx = diffStartX + i * 150;
        const by = 355;
        const bw = 135;
        const bh = 50;

        const isSelected = key === selectedDifficulty;
        const isHovered  = hover.diff === key;

        ctx.fillStyle = isSelected ? 'rgba(255,107,53,0.3)' : isHovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(bx, by, bw, bh);

        if (isSelected) {
            ctx.strokeStyle = '#ff6b35';
            ctx.lineWidth = 2;
            ctx.strokeRect(bx, by, bw, bh);
        }

        ctx.fillStyle = isSelected ? '#fff' : '#aaa';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, bx + bw / 2, by + 30);
    }

    // Screen wrap toggle
    const wrapX = CANVAS_WIDTH / 2 - 110;
    const wrapY = 430;
    const wrapW = 220;
    const wrapH = 40;

    ctx.fillStyle = hover.wrap
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(255,255,255,0.05)';
    ctx.fillRect(wrapX, wrapY, wrapW, wrapH);

    if (wrapScreen) {
        ctx.strokeStyle = '#ff6b35';
        ctx.lineWidth = 2;
        ctx.strokeRect(wrapX, wrapY, wrapW, wrapH);
    }

    // Checkbox visual
    const cbX = wrapX + 12;
    const cbY = wrapY + 12;
    const cbS = 16;
    ctx.strokeStyle = wrapScreen ? '#ff6b35' : '#777';
    ctx.lineWidth = 2;
    ctx.strokeRect(cbX, cbY, cbS, cbS);
    if (wrapScreen) {
        ctx.fillStyle = '#ff6b35';
        ctx.fillRect(cbX + 3, cbY + 3, cbS - 6, cbS - 6);
    }

    ctx.fillStyle = wrapScreen ? '#fff' : '#aaa';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Screen Wrap', cbX + cbS + 10, wrapY + 25);

    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    ctx.fillText('toroidal edges', cbX + cbS + 10, wrapY + 36);

    // Start button
    const startX = CANVAS_WIDTH / 2 - 100;
    const startY = 500;
    const startW = 200;
    const startH = 50;

    ctx.fillStyle = hover.start ? '#ff8c55' : '#ff6b35';
    ctx.fillRect(startX, startY, startW, startH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('START GAME', CANVAS_WIDTH / 2, startY + 32);

    // Controls info
    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WASD / Arrows: Move  |  Mouse: Aim  |  Click: Fire  |  1-6: Switch Weapon  |  Space: Jump', CANVAS_WIDTH / 2, 600);
    ctx.fillText('E: Dig/Melee  |  Q: Next Weapon  |  R: Restart  |  Hold: Charge (Grenade/Cluster) / Sight (Sniper)', CANVAS_WIDTH / 2, 620);

    // Feedback buttons
    const fbBtnW = 130;
    const fbBtnH = 28;
    const fbGap = 20;
    const fbTotalW = fbBtnW * 2 + fbGap;
    const fbStartX = CANVAS_WIDTH / 2 - fbTotalW / 2;
    const fbY = 650;

    // [!] Report Bug
    const bugX = fbStartX;
    ctx.fillStyle = hover.bugReport ? 'rgba(255,107,53,0.35)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(bugX, fbY, fbBtnW, fbBtnH);
    ctx.strokeStyle = hover.bugReport ? '#ff6b35' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bugX, fbY, fbBtnW, fbBtnH);
    ctx.fillStyle = hover.bugReport ? '#ff6b35' : '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[!] Report Bug', bugX + fbBtnW / 2, fbY + 18);

    // [+] Suggest Feature
    const featX = fbStartX + fbBtnW + fbGap;
    ctx.fillStyle = hover.suggestFeature ? 'rgba(255,107,53,0.35)' : 'rgba(255,255,255,0.08)';
    ctx.fillRect(featX, fbY, fbBtnW, fbBtnH);
    ctx.strokeStyle = hover.suggestFeature ? '#ff6b35' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(featX, fbY, fbBtnW, fbBtnH);
    ctx.fillStyle = hover.suggestFeature ? '#ff6b35' : '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('[+] Suggest Feature', featX + fbBtnW / 2, fbY + 18);

    // Google Form fallback link
    const formY = 690;
    ctx.fillStyle = hover.feedbackForm ? '#ff6b35' : '#555';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No GitHub account? Use this form', CANVAS_WIDTH / 2, formY);

    // Return clickable regions for the game to use
    return {
        mapRegions: MAP_DEFS.map((_, i) => ({
            x: mapStartX + i * 140, y: 225, w: 125, h: 60, index: i,
        })),
        diffRegions: diffKeys.map((key, i) => ({
            x: diffStartX + i * 150, y: 355, w: 135, h: 50, key,
        })),
        wrapRegion: { x: wrapX, y: wrapY, w: wrapW, h: wrapH },
        startRegion: { x: startX, y: startY, w: startW, h: startH },
        bugReportRegion: { x: bugX, y: fbY, w: fbBtnW, h: fbBtnH },
        suggestFeatureRegion: { x: featX, y: fbY, w: fbBtnW, h: fbBtnH },
        feedbackFormRegion: { x: CANVAS_WIDTH / 2 - 120, y: formY - 10, w: 240, h: 14 },
    };
}

/**
 * Draw round-over overlay.
 */
export function drawRoundOver(ctx, winner, loser) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = winner.colour;
    ctx.font = 'bold 48px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${winner.name} WINS THE ROUND!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

    ctx.fillStyle = '#aaa';
    ctx.font = '18px monospace';
    ctx.fillText('Next round starting...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
}

/**
 * Draw match-over screen.
 */
export function drawMatchOver(ctx, winner) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#ff6b35';
    ctx.font = 'bold 56px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MATCH OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

    ctx.fillStyle = winner.colour;
    ctx.font = 'bold 36px monospace';
    ctx.fillText(`${winner.name} WINS!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);

    ctx.fillStyle = '#ccc';
    ctx.font = '18px monospace';
    ctx.fillText('Click / ENTER / ESC to return to menu', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
}

/**
 * Draw countdown text.
 */
export function drawCountdown(ctx, text) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
}

/** Clear damage numbers between rounds. */
export function clearDamageNumbers() {
    damageNumbers = [];
}
