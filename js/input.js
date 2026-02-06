/**
 * Boomer - Input Manager
 * Tracks keyboard state and mouse position/buttons relative to the game canvas.
 */

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;

        /** @type {Set<string>} Currently held keys (lowercase). */
        this.keys = new Set();
        /** @type {Set<string>} Keys pressed this frame (cleared each tick). */
        this.justPressed = new Set();

        /** Mouse position relative to canvas. */
        this.mouseX = 0;
        this.mouseY = 0;
        this.mouseDown = false;
        this.mouseJustPressed = false;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp   = this._onKeyUp.bind(this);
        this._onMouseMove = this._onMouseMove.bind(this);
        this._onMouseDown = this._onMouseDown.bind(this);
        this._onMouseUp   = this._onMouseUp.bind(this);
        this._onContextMenu = (e) => e.preventDefault();

        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);
        canvas.addEventListener('mousemove', this._onMouseMove);
        canvas.addEventListener('mousedown', this._onMouseDown);
        canvas.addEventListener('mouseup', this._onMouseUp);
        canvas.addEventListener('contextmenu', this._onContextMenu);
    }

    /** Call at the end of each game tick to reset per-frame state. */
    endFrame() {
        this.justPressed.clear();
        this.mouseJustPressed = false;
    }

    /** Is a key currently held? */
    isDown(key) {
        return this.keys.has(key.toLowerCase());
    }

    /** Was a key pressed this frame? */
    wasPressed(key) {
        return this.justPressed.has(key.toLowerCase());
    }

    destroy() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
        this.canvas.removeEventListener('mousemove', this._onMouseMove);
        this.canvas.removeEventListener('mousedown', this._onMouseDown);
        this.canvas.removeEventListener('mouseup', this._onMouseUp);
        this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    }

    // ── Private handlers ────────────────────────────────────────────

    _onKeyDown(e) {
        const key = e.key.toLowerCase();
        if (!this.keys.has(key)) {
            this.justPressed.add(key);
        }
        this.keys.add(key);
        // Prevent default for game keys to stop page scrolling etc.
        if (['arrowup','arrowdown','arrowleft','arrowright',' ','w','a','s','d','escape'].includes(key)) {
            e.preventDefault();
        }
    }

    _onKeyUp(e) {
        this.keys.delete(e.key.toLowerCase());
    }

    _onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        this.mouseY = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    }

    _onMouseDown(e) {
        if (e.button === 0) {
            this.mouseDown = true;
            this.mouseJustPressed = true;
        }
    }

    _onMouseUp(e) {
        if (e.button === 0) {
            this.mouseDown = false;
        }
    }
}
