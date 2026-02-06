/**
 * Boomer - Entry Point
 * Initialises the game and starts the loop.
 */

import { Game } from './game.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error('Boomer: #gameCanvas not found');
        return;
    }

    const game = new Game(canvas);
    game.start();

    // Expose for debugging
    window.__boomer = game;
});
