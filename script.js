const COLORS = ['red', 'blue', 'green'];
const urlParams = new URLSearchParams(window.location.search);
const paramL = parseInt(urlParams.get('l'));
const MAX_SHAPES = isNaN(paramL) ? 64 : paramL;
const paramT = parseInt(urlParams.get('t'));
const SPAWN_INTERVAL = isNaN(paramT) ? 1500 : paramT;
const OFFLINE_SPAWN_LIMIT = MAX_SHAPES;
const CONTAINER = document.getElementById('game-container');

class GameState {
    constructor() {
        this.version = 1;
        this.shapes = []; // array of plain objects
        this.stats = {};  // existing stats structure
        this.lastActiveTime = null;
        this.rngSlots = this.getDefaultSlots();
    }

    getDefaultSlots() {
        return [
            { color: COLORS[0], sides: 2, attributes: ["spawner"] },
            { color: COLORS[1], sides: 2, attributes: ["spawner"] },
            { color: COLORS[2], sides: 2, attributes: ["spawner"] },
            null,
            null,
            null
        ];
    }

    recordSpawn(shapeData) {
        const { color, sides } = shapeData;
        if (!this.stats[color]) this.stats[color] = {};
        this.stats[color][sides] = (this.stats[color][sides] || 0) + 1;
    }

    reset() {
        this.shapes = [];
        this.stats = {};
        this.lastActiveTime = null;
        this.rngSlots = this.getDefaultSlots();
    }

    toJSON() {
        return {
            version: this.version,
            shapes: this.shapes,
            stats: this.stats,
            lastActiveTime: this.lastActiveTime,
            rngSlots: this.rngSlots
        };
    }

    static fromJSON(data) {
        const state = new GameState();
        state.version = data.version ?? 1;
        state.shapes = data.shapes ?? [];
        state.stats = data.stats ?? {};
        state.lastActiveTime = data.lastActiveTime ?? null;
        state.rngSlots = data.rngSlots ?? state.getDefaultSlots();
        return state;
    }
}

class StorageService {
    static save(state) {
        localStorage.setItem('game_state', JSON.stringify(state));
    }

    static load() {
        const raw = localStorage.getItem('game_state');
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to parse game state', e);
            return null;
        }
    }

    static clear() {
        localStorage.removeItem('game_state');
    }
}

class Shape {
    constructor(x, y, color, sides, id = null, attributes = []) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.color = color;
        this.sides = sides; // 2 for circle, 3 for triangle, 4 square, etc.
        this.attributes = attributes;
        this.width = 80;
        this.height = 80;
        this.element = null;

        this.init();
    }

    init() {
        this.element = document.createElement('div');
        this.element.classList.add('shape', this.color, 'spawn-anim');
        if (this.attributes.includes('spawner')) {
            this.element.classList.add('spawner');
        }
        this.element.style.left = `${this.x}px`;
        this.element.style.top = `${this.y}px`;
        this.element.dataset.id = this.id;

        const inner = document.createElement('div');
        inner.classList.add('shape-inner');

        // Apply Shape Geometry
        if (this.sides === 2) { // Circle
            inner.style.borderRadius = '50%';
        } else {
            inner.style.clipPath = Shape.getPolygonClipPath(this.sides);
        }

        this.element.appendChild(inner);
        CONTAINER.appendChild(this.element);
    }

    static getPolygonClipPath(sides) {
        // Generate regular polygon vertices
        let vertices = [];
        // Rotate squares by 45 degrees to make them axis-aligned (flat sides)
        const offset = sides === 4 ? Math.PI / 4 : 0;

        for (let i = 0; i < sides; i++) {
            // Angle starting from -90deg (top)
            const angle = (i * 2 * Math.PI / sides) - (Math.PI / 2) + offset;
            // Map -1..1 to 0..100%
            const x = 50 + 50 * Math.cos(angle);
            const y = 50 + 50 * Math.sin(angle);
            vertices.push(`${x.toFixed(1)}% ${y.toFixed(1)}%`);
        }
        return `polygon(${vertices.join(', ')})`;
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
    }

    destroy() {
        this.element.remove();
    }
}

class ShapeCounter {
    constructor(gameState) {
        this.state = gameState;
        this.element = document.getElementById('shape-counter');
        this.overlay = document.getElementById('stats-overlay');

        this.element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleStats();
        });
    }

    updateDisplay(count) {
        if (this.element) {
            this.element.textContent = count;
            if (count >= MAX_SHAPES) {
                this.element.classList.add('limit-reached');
            } else {
                this.element.classList.remove('limit-reached');
            }
        }
    }

    toggleStats() {
        if (this.overlay.classList.contains('hidden')) {
            this.renderStats();
            this.overlay.classList.remove('hidden');
        } else {
            this.overlay.classList.add('hidden');
        }
    }

    renderStats() {
        this.overlay.innerHTML = '';

        COLORS.forEach(color => {
            const colDiv = document.createElement('div');
            colDiv.classList.add('stat-column');

            const colorStats = this.state.stats[color] || {};
            const sides = Object.keys(colorStats).map(Number).sort((a, b) => a - b);

            sides.forEach(nSides => {
                const count = colorStats[nSides];
                const item = document.createElement('div');
                item.classList.add('stat-item');

                const val = document.createElement('span');
                val.textContent = count;

                const shapeDiv = document.createElement('div');
                shapeDiv.classList.add('mini-shape', color);
                const inner = document.createElement('div');
                inner.classList.add('shape-inner');

                if (nSides === 2) {
                    inner.style.borderRadius = '50%';
                } else {
                    inner.style.clipPath = Shape.getPolygonClipPath(nSides);
                }

                shapeDiv.appendChild(inner);
                item.appendChild(shapeDiv);
                item.appendChild(val);

                colDiv.appendChild(item);
            });

            this.overlay.appendChild(colDiv);
        });
    }
}

class RNG {
    constructor(state, onShapeDown) {
        this.state = state;
        this.onShapeDown = onShapeDown;
        this.diceBtn = document.getElementById('dice-btn');
        this.overlay = document.getElementById('rng-overlay');

        if (this.diceBtn) {
            this.diceBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggle();
            });
        }
    }

    roll() {
        const slots = this.state.rngSlots;
        const index = Math.floor(Math.random() * slots.length);

        // Visual Feedback
        if (this.overlay && !this.overlay.classList.contains('hidden')) {
            const slotElements = this.overlay.querySelectorAll('.rng-slot');
            if (slotElements[index]) {
                const el = slotElements[index];
                el.classList.remove('pulse-active');
                // Force reflow
                void el.offsetWidth;
                el.classList.add('pulse-active');
            }
        }

        const slot = slots[index];
        if (!slot) return null;

        return { ...slot, index };
    }

    checkDrop(x, y) {
        if (!this.overlay || this.overlay.classList.contains('hidden')) return -1;

        const slotElements = this.overlay.querySelectorAll('.rng-slot');
        for (let i = 0; i < slotElements.length; i++) {
            // Only consider empty slots
            if (this.state.rngSlots[i] !== null) continue;

            const rect = slotElements[i].getBoundingClientRect();
            if (x >= rect.left && x <= rect.right &&
                y >= rect.top && y <= rect.bottom) {
                return i;
            }
        }
        return -1;
    }

    clearSlot(index) {
        this.state.rngSlots[index] = null;
        this.render();
        StorageService.save(this.state.toJSON());
    }

    toggle() {
        if (this.overlay && this.overlay.classList.contains('hidden')) {
            this.render();
            this.overlay.classList.remove('hidden');
        } else if (this.overlay) {
            this.overlay.classList.add('hidden');
        }
    }

    render() {
        if (!this.overlay) return;
        this.overlay.innerHTML = '';
        const slots = this.state.rngSlots;

        slots.forEach((slot, index) => {
            const slotEl = document.createElement('div');
            slotEl.classList.add('rng-slot');

            if (!slot) {
                slotEl.classList.add('empty');
            } else {
                const shapeDiv = document.createElement('div');
                shapeDiv.classList.add('preview-shape', slot.color);
                if (slot.attributes && slot.attributes.includes('spawner')) {
                    shapeDiv.classList.add('spawner');
                }

                shapeDiv.addEventListener('pointerdown', (e) => {
                    // Prevent propagation so we don't trigger other things (though overlay covers game)
                    e.stopPropagation();
                    if (this.onShapeDown) this.onShapeDown(index, e);
                });

                const inner = document.createElement('div');
                inner.classList.add('shape-inner');

                if (slot.sides === 2) {
                    inner.style.borderRadius = '50%';
                } else {
                    inner.style.clipPath = Shape.getPolygonClipPath(slot.sides);
                }

                shapeDiv.appendChild(inner);
                slotEl.appendChild(shapeDiv);
            }

            this.overlay.appendChild(slotEl);
        });
    }
}

class Game {
    constructor() {
        // Load saved state
        const loaded = StorageService.load();
        this.state = loaded
            ? GameState.fromJSON(loaded)
            : new GameState();

        this.runtimeShapes = new Map(); // id -> Shape
        this.draggedShape = null;
        this.dragPointerId = null;
        this.dragOffset = { x: 0, y: 0 };

        this.rng = new RNG(this.state, (idx, e) => this.onRngShapeDown(idx, e));

        this.counter = new ShapeCounter(this.state);


        // Rehydrate Shapes
        this.rehydrateShapes();

        this.counter.updateDisplay(this.state.shapes.length);

        // Start Loops
        this.startSpawnLoop();

        // Event Listeners
        CONTAINER.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        window.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', (e) => this.onPointerUp(e));
        window.addEventListener('pointercancel', (e) => this.onPointerUp(e));

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.processOfflineSpawns();
                this.startSpawnLoop();
            } else {
                clearInterval(this.spawnInterval);
            }
        });

        this.processOfflineSpawns();
    }

    rehydrateShapes() {
        this.state.shapes.forEach(data => {
            const shape = new Shape(data.x, data.y, data.color, data.sides, data.id, data.attributes);
            this.runtimeShapes.set(data.id, shape);
        });
    }

    // Main Loop
    startSpawnLoop() {
        if (this.spawnInterval) clearInterval(this.spawnInterval);
        this.spawnInterval = setInterval(() => {
            this.processOfflineSpawns();
            // Update last active time to state
            this.state.lastActiveTime = Date.now();

            // Only spawn if we haven't reached limit
            if (this.state.shapes.length >= MAX_SHAPES) {
                StorageService.save(this.state.toJSON());
                return;
            }

            const spawnSlot = this.rng.roll();
            if (spawnSlot) {
                this.spawnShape(undefined, undefined, spawnSlot.color, spawnSlot.sides);
                // Consume spawn slot if not spawner
                if (!spawnSlot.attributes.includes('spawner')) {
                    this.rng.clearSlot(spawnSlot.index);
                }
            }
            StorageService.save(this.state.toJSON());
        }, SPAWN_INTERVAL);
    }

    spawnShape(x, y, color, sides = 2, attributes = []) {
        if (x === undefined) {
            x = Math.random() * (window.innerWidth - 100);
        }

        if (y === undefined) {
            y = Math.random() * (window.innerHeight - 100);
        }

        if (color === undefined) {
            color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }

        const id = Math.random().toString(36).substr(2, 9);
        const shapeData = { id, x, y, color, sides, attributes };

        // Update State
        this.state.shapes.push(shapeData);
        this.state.recordSpawn(shapeData);
        this.state.lastActiveTime = Date.now();

        // Create Runtime Shape
        const shape = new Shape(x, y, color, sides, id, attributes);
        this.runtimeShapes.set(id, shape);

        this.counter.updateDisplay(this.state.shapes.length);
        this.checkMerge(shape);
        return shape;
    }

    processOfflineSpawns() {
        const lastActive = this.state.lastActiveTime;
        if (!lastActive) return;

        const now = Date.now();
        const diff = now - lastActive;
        const spawnsNeeded = Math.floor(diff / SPAWN_INTERVAL);
        if (spawnsNeeded <= 2) return; // Skip if too few spawns needed
        const loopCount = Math.min(spawnsNeeded, OFFLINE_SPAWN_LIMIT);

        for (let i = 0; i < loopCount; i++) {
            if (this.state.shapes.length >= MAX_SHAPES) break;
            const spawnSlot = this.rng.roll();
            if (spawnSlot) {
                this.spawnShape(undefined, undefined, spawnSlot.color, spawnSlot.sides);
                // Consume spawn slot if not spawner
                if (!spawnSlot.attributes.includes('spawner')) {
                    this.rng.clearSlot(spawnSlot.index);
                }
            }
        }

        this.state.lastActiveTime = now;
        StorageService.save(this.state.toJSON());
    }

    onRngShapeDown(slotIndex, e) {
        const slot = this.state.rngSlots[slotIndex];
        if (!slot) return;

        // Consume Slot
        this.rng.clearSlot(slotIndex);

        // Spawn Shape at Cursor
        // Center the shape on the cursor (width/height is 80, so radius 40)
        const x = e.clientX - 40;
        const y = e.clientY - 40;
        const shape = this.spawnShape(x, y, slot.color, slot.sides, slot.attributes);

        // Initiate Drag
        this.draggedShape = shape;
        this.dragPointerId = e.pointerId;
        this.dragOffset = { x: 40, y: 40 }; // Center offset

        shape.element.style.transition = 'none';
        shape.element.style.zIndex = '3000';

        try {
            shape.element.setPointerCapture(e.pointerId);
        } catch (err) {
            console.warn('Failed to capture pointer', err);
        }
    }

    onPointerDown(e) {
        // Ignore if already dragging
        if (this.draggedShape) return;

        const target = e.target.closest('.shape');
        if (!target) return;

        const id = target.dataset.id;
        this.draggedShape = this.runtimeShapes.get(id);

        if (this.draggedShape) {
            this.dragPointerId = e.pointerId;
            // Calculate offset to prevent snapping to center
            const rect = target.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;


            // Remove transitions during drag for responsiveness
            this.draggedShape.element.style.transition = 'none';
            this.draggedShape.element.style.zIndex = '3000';

            // Capture the pointer to ensure we receive all events even if cursor moves off element
            target.setPointerCapture(e.pointerId);
        }
    }

    onPointerMove(e) {
        if (!this.draggedShape) return;
        if (e.pointerId !== this.dragPointerId) return;

        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;

        this.draggedShape.setPosition(x, y);

        // Update State Position
        const shapeData = this.state.shapes.find(s => s.id === this.draggedShape.id);
        if (shapeData) {
            shapeData.x = x;
            shapeData.y = y;
        }
    }

    onPointerUp(e) {
        if (!this.draggedShape) return;
        if (e.pointerId !== this.dragPointerId) return;

        // Restore transition
        this.draggedShape.element.style.transition = '';
        this.draggedShape.element.style.zIndex = '';

        // Check Drop on RNG Slot
        const dropSlotIndex = this.rng.checkDrop(e.clientX, e.clientY);
        if (dropSlotIndex !== -1) {
            // Update Slot
            this.state.rngSlots[dropSlotIndex] = {
                color: this.draggedShape.color,
                sides: this.draggedShape.sides,
                attributes: this.draggedShape.attributes
            };
            this.rng.render();

            // Destroy Shape (Sacrifice)
            this.draggedShape.destroy();
            this.runtimeShapes.delete(this.draggedShape.id);
            const idx = this.state.shapes.findIndex(s => s.id === this.draggedShape.id);
            if (idx > -1) this.state.shapes.splice(idx, 1);

            StorageService.save(this.state.toJSON());
            this.counter.updateDisplay(this.state.shapes.length);

            this.draggedShape = null;
            this.dragPointerId = null;
            return;
        }

        // Check Merges
        this.checkMerge(this.draggedShape);

        this.draggedShape = null;
        this.dragPointerId = null;
    }

    checkMerge(shape) {
        // Logic:
        // Level 2 (Circle) -> Needs 2 -> Makes Level 3
        // Level 3 (Tri) -> Needs 3 -> Makes Level 4
        // Level N -> Needs N -> Makes Level N+1

        const needed = shape.sides;
        const candidates = Array.from(this.runtimeShapes.values()).filter(s => {
            if (s === shape) return false;
            // Basic checks
            if (s.sides !== shape.sides || s.color !== shape.color) return false;

            // Attribute check (exact match required)
            const a1 = [...s.attributes].sort();
            const a2 = [...shape.attributes].sort();
            if (JSON.stringify(a1) !== JSON.stringify(a2)) return false;

            return this.isTouching(shape, s);
        });

        // We need (needed - 1) more shapes, because we have 'shape' itself.
        if (candidates.length >= needed - 1) {
            // We have a match!
            const shapesToMerge = [shape, ...candidates.slice(0, needed - 1)];

            // Calculate center
            let sumX = 0, sumY = 0;
            shapesToMerge.forEach(s => {
                sumX += s.x;
                sumY += s.y;
            });
            const centerX = sumX / shapesToMerge.length;
            const centerY = sumY / shapesToMerge.length;

            // Remove old shapes
            shapesToMerge.forEach(s => {
                s.destroy();
                this.runtimeShapes.delete(s.id);
                // Remove from state
                const idx = this.state.shapes.findIndex(d => d.id === s.id);
                if (idx > -1) this.state.shapes.splice(idx, 1);
            });

            // Spawn new shape
            const newSides = shape.sides + 1;
            const newShape = this.spawnShape(centerX, centerY, shape.color, newSides, shape.attributes);
            newShape.element.classList.add('merge-anim');

            // Trigger feedback sound or visual? (Visual is built-in spawn-anim)
        }
    }

    isTouching(s1, s2) {
        // Simple bounding box overlap or distance check
        // Using distance < width (assuming 80px) is good for circles, roughly okay for others.
        // Let's use distance between centers.
        // width matches CSS 80px.
        const d = Math.hypot(
            (s1.x + 40) - (s2.x + 40),
            (s1.y + 40) - (s2.y + 40)
        );
        return d < 80; // Touching if distance < diameter (or width)
    }

    reset() {
        // Destroy all runtime shapes
        this.runtimeShapes.forEach(shape => shape.destroy());
        this.runtimeShapes.clear();

        // Reset state
        this.state.reset();

        // Save once
        StorageService.save(this.state.toJSON());

        this.counter.updateDisplay(0);
        // Refresh UI if needed
        if (this.counter.overlay && !this.counter.overlay.classList.contains('hidden')) {
            this.counter.renderStats();
        }
    }
}

// Start Game
const game = new Game();

// UI Logic
const menuBtn = document.getElementById('menu-btn');
const menuDropdown = document.getElementById('menu-dropdown');
const resetBtn = document.getElementById('reset-btn');

menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('hidden');
});

resetBtn.addEventListener('click', (e) => {
    game.reset();
    menuDropdown.classList.add('hidden');
});

document.addEventListener('click', (e) => {
    if (!menuDropdown.contains(e.target) && e.target !== menuBtn) {
        menuDropdown.classList.add('hidden');
    }
});
