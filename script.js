const COLORS = ['red', 'blue', 'green'];
const urlParams = new URLSearchParams(window.location.search);
const paramL = parseInt(urlParams.get('l'));
const MAX_SHAPES = isNaN(paramL) ? 128 : paramL;
const paramT = parseInt(urlParams.get('t'));
const SPAWN_INTERVAL = isNaN(paramT) ? 3000 : paramT;
const CONTAINER = document.getElementById('game-container');

class Shape {
    constructor(x, y, color, sides, id = null) {
        this.id = id || Math.random().toString(36).substr(2, 9);
        this.x = x;
        this.y = y;
        this.color = color;
        this.sides = sides; // 2 for circle, 3 for triangle, 4 square, etc.
        this.width = 80;
        this.height = 80;
        this.element = null;

        this.init();
    }

    init() {
        this.element = document.createElement('div');
        this.element.classList.add('shape', this.color, 'spawn-anim');
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

        // Bind events if needed, but handled globally for better perf? 
        // Actually global pointer events are safer for dragging.
        // We just need to updating CSS on move.
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
    constructor() {
        this.stats = {};
        this.element = document.getElementById('shape-counter');
        this.overlay = document.getElementById('stats-overlay');
        this.loadStats();

        this.element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleStats();
        });
    }

    loadStats() {
        const saved = localStorage.getItem('shape_stats');
        if (saved) {
            try {
                this.stats = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to load stats', e);
                this.stats = {};
            }
        }
    }

    saveStats() {
        localStorage.setItem('shape_stats', JSON.stringify(this.stats));
    }

    reset() {
        this.stats = {};
        localStorage.removeItem('shape_stats');
        if (this.overlay && !this.overlay.classList.contains('hidden')) {
            this.renderStats();
        }
        this.updateDisplay(0);
    }

    trackSpawn(shape) {
        if (!this.stats[shape.color]) {
            this.stats[shape.color] = {};
        }
        this.stats[shape.color][shape.sides] = (this.stats[shape.color][shape.sides] || 0) + 1;
        this.saveStats();

        if (this.overlay && !this.overlay.classList.contains('hidden')) {
            this.renderStats();
        }
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

            const colorStats = this.stats[color] || {};
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

class Game {
    constructor() {
        this.shapes = [];
        this.draggedShape = null;
        this.dragPointerId = null;
        this.dragOffset = { x: 0, y: 0 };

        this.counter = new ShapeCounter();

        // Load saved state
        this.loadState();
        this.counter.updateDisplay(this.shapes.length); // Initial update after loading state

        // Start Loops
        setInterval(() => {
            if (this.shapes.length >= MAX_SHAPES) return;
            this.spawnShape();
        }, SPAWN_INTERVAL);

        // Event Listeners
        CONTAINER.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        window.addEventListener('pointermove', (e) => this.onPointerMove(e));
        window.addEventListener('pointerup', (e) => this.onPointerUp(e));
        window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    }



    spawnShape(x, y, color, sides = 2) {


        if (x === undefined) {
            x = Math.random() * (window.innerWidth - 100);
        }

        if (y === undefined) {
            y = Math.random() * (window.innerHeight - 100);
        }

        if (color === undefined) {
            color = COLORS[Math.floor(Math.random() * COLORS.length)];
        }

        const shape = new Shape(x, y, color, sides);
        this.shapes.push(shape);
        this.counter.trackSpawn(shape);
        this.counter.updateDisplay(this.shapes.length);
        this.checkMerge(shape);
        this.saveState();
        return shape;
    }

    onPointerDown(e) {
        // Ignore if already dragging
        if (this.draggedShape) return;

        const target = e.target.closest('.shape');
        if (!target) return;

        const id = target.dataset.id;
        this.draggedShape = this.shapes.find(s => s.id === id);

        if (this.draggedShape) {
            this.dragPointerId = e.pointerId;
            // Calculate offset to prevent snapping to center
            const rect = target.getBoundingClientRect();
            this.dragOffset.x = e.clientX - rect.left;
            this.dragOffset.y = e.clientY - rect.top;

            // Remove transitions during drag for responsiveness
            this.draggedShape.element.style.transition = 'none';

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
    }

    onPointerUp(e) {
        if (!this.draggedShape) return;
        if (e.pointerId !== this.dragPointerId) return;

        // Restore transition
        this.draggedShape.element.style.transition = '';

        // Check Merges
        this.checkMerge(this.draggedShape);
        this.saveState();

        this.draggedShape = null;
        this.dragPointerId = null;
    }

    checkMerge(shape) {
        // Logic:
        // Level 2 (Circle) -> Needs 2 -> Makes Level 3
        // Level 3 (Tri) -> Needs 3 -> Makes Level 4
        // Level N -> Needs N -> Makes Level N+1

        const needed = shape.sides;
        const candidates = this.shapes.filter(s =>
            s !== shape &&
            s.sides === shape.sides &&
            s.color === shape.color &&
            this.isTouching(shape, s)
        );

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
                const index = this.shapes.indexOf(s);
                if (index > -1) this.shapes.splice(index, 1);
            });

            // Spawn new shape
            const newSides = shape.sides + 1;
            const newShape = this.spawnShape(centerX, centerY, shape.color, newSides);
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

    saveState() {
        const state = this.shapes.map(s => ({
            id: s.id,
            x: s.x,
            y: s.y,
            color: s.color,
            sides: s.sides
        }));
        localStorage.setItem('shapes_state', JSON.stringify(state));
    }

    loadState() {
        const saved = localStorage.getItem('shapes_state');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    parsed.forEach(data => {
                        const shape = new Shape(data.x, data.y, data.color, data.sides, data.id);
                        this.shapes.push(shape);
                    });
                }
            } catch (e) {
                console.error('Failed to load state', e);
            }
        }
    }

    reset() {
        // Destroy all existing shapes
        this.shapes.forEach(shape => shape.destroy());
        this.shapes = [];

        // Purge local storage
        localStorage.removeItem('shapes_state');
        this.counter.reset();
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
