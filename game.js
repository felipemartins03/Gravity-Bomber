const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 50;
const ROWS = 13;
const COLS = 13;

// Map constants
const EMPTY = 0;
const WALL = 1;
const CRATE = 2;

let map = [];
let bombs = [];
let explosions = [];
let enemies = [];
let level = 1;

let door = { r: -1, c: -1 };
let doorRevealed = false;

const player = {
    x: 0, // Set in init
    y: 0,
    width: TILE_SIZE * 0.7, // slightly smaller than a tile
    height: TILE_SIZE * 0.7,
    speed: 3,
    color: '#00BFFF',
    isAlive: true
};

const keys = {};

window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        dropBomb();
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

function initLevel() {
    map = [];
    bombs = [];
    explosions = [];
    enemies = [];
    doorRevealed = false;

    player.x = 1 * TILE_SIZE + (TILE_SIZE - player.width) / 2;
    player.y = 1 * TILE_SIZE + (TILE_SIZE - player.height) / 2;
    player.isAlive = true;

    generateMap();
}

function generateMap() {
    let cratesPositions = [];
    let emptyPositions = [];

    for (let r = 0; r < ROWS; r++) {
        let row = [];
        for (let c = 0; c < COLS; c++) {
            if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) {
                row.push(WALL); // Border walls
            } else if (r % 2 === 0 && c % 2 === 0) {
                row.push(WALL); // Inner solid pillars
            } else {
                // Random destructible crates, leave top-left open for player spawn
                if ((r === 1 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 1)) {
                    row.push(EMPTY); // Safe zone for spawn
                } else {
                    const isCrate = Math.random() < 0.3;
                    row.push(isCrate ? CRATE : EMPTY);
                    if (isCrate) cratesPositions.push({ r, c });
                    else emptyPositions.push({ r, c });
                }
            }
        }
        map.push(row);
    }

    // Hide a door under a random crate
    if (cratesPositions.length > 0) {
        const idx = Math.floor(Math.random() * cratesPositions.length);
        door.r = cratesPositions[idx].r;
        door.c = cratesPositions[idx].c;
    }

    // Spawn enemies based on level
    const numEnemies = Math.min(level * 2, emptyPositions.length);
    for (let i = 0; i < numEnemies; i++) {
        if (emptyPositions.length === 0) break;

        // Pick random empty position far from player if possible
        const idx = Math.floor(Math.random() * emptyPositions.length);
        const pos = emptyPositions.splice(idx, 1)[0];

        // Ensure distance from player spawn (1, 1)
        if (pos.r > 3 || pos.c > 3) {
            enemies.push({
                x: pos.c * TILE_SIZE + (TILE_SIZE - TILE_SIZE * 0.7) / 2,
                y: pos.r * TILE_SIZE + (TILE_SIZE - TILE_SIZE * 0.7) / 2,
                width: TILE_SIZE * 0.7,
                height: TILE_SIZE * 0.7,
                speed: 1.5 + (level * 0.2), // Increase speed slightly per level
                dx: Math.random() < 0.5 ? (Math.random() < 0.5 ? -1 : 1) : 0,
                dy: 0,
                color: '#9b59b6' // Purple/Pink enemies
            });
            // If dx was 0, set dy
            if (enemies[i].dx === 0) {
                enemies[i].dy = Math.random() < 0.5 ? -1 : 1;
            }
        } else {
            i--; // try again
        }
    }
}

function dropBomb() {
    if (!player.isAlive) return;

    // Snap bomb to grid center based on player's center
    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;

    const gridX = Math.floor(playerCenterX / TILE_SIZE);
    const gridY = Math.floor(playerCenterY / TILE_SIZE);

    // Check if bomb already exists at this location
    const bombExists = bombs.some(b => b.gridX === gridX && b.gridY === gridY);
    if (!bombExists) {
        bombs.push({
            gridX,
            gridY,
            timer: 3000, // 3 seconds
            spawnTime: Date.now()
        });
    }
}

function canMove(newX, newY) {
    // Check all 4 corners of player bounding box against the map
    const left = Math.floor((newX + 2) / TILE_SIZE);
    const right = Math.floor((newX + player.width - 2) / TILE_SIZE);
    const top = Math.floor((newY + 2) / TILE_SIZE);
    const bottom = Math.floor((newY + player.height - 2) / TILE_SIZE);

    if (left < 0 || right >= COLS || top < 0 || bottom >= ROWS) return false;

    if (map[top][left] !== EMPTY ||
        map[top][right] !== EMPTY ||
        map[bottom][left] !== EMPTY ||
        map[bottom][right] !== EMPTY) {
        return false;
    }

    return true;
}

function update() {
    if (!player.isAlive) return;

    let dx = 0;
    let dy = 0;

    if (keys['ArrowLeft'] || keys['KeyA']) dx = -player.speed;
    if (keys['ArrowRight'] || keys['KeyD']) dx = player.speed;
    if (keys['ArrowUp'] || keys['KeyW']) dy = -player.speed;
    if (keys['ArrowDown'] || keys['KeyS']) dy = player.speed;

    // Independent axis collision for smooth moving against walls
    if (dx !== 0 && canMove(player.x + dx, player.y)) {
        player.x += dx;
    }
    if (dy !== 0 && canMove(player.x, player.y + dy)) {
        player.y += dy;
    }

    const now = Date.now();
    for (let i = bombs.length - 1; i >= 0; i--) {
        const bomb = bombs[i];
        if (now - bomb.spawnTime >= bomb.timer) {
            explode(bomb);
            bombs.splice(i, 1);
        }
    }

    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        if (now - exp.spawnTime >= exp.duration) {
            explosions.splice(i, 1);
        } else {
            checkExplosionCollision(exp);
        }
    }

    updateEnemies();

    // Check level complete
    if (doorRevealed && enemies.length === 0) {
        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const doorCenterX = door.c * TILE_SIZE + TILE_SIZE / 2;
        const doorCenterY = door.r * TILE_SIZE + TILE_SIZE / 2;

        // Simple distance check to door center
        if (Math.hypot(px - doorCenterX, py - doorCenterY) < TILE_SIZE / 2) {
            level++;
            initLevel();
        }
    }
}

function updateEnemies() {
    for (const enemy of enemies) {
        let newX = enemy.x + enemy.dx * enemy.speed;
        let newY = enemy.y + enemy.dy * enemy.speed;

        // Need custom collision for enemy using bounds
        const canMoveEnemy = (nx, ny) => {
            const left = Math.floor((nx + 2) / TILE_SIZE);
            const right = Math.floor((nx + enemy.width - 2) / TILE_SIZE);
            const top = Math.floor((ny + 2) / TILE_SIZE);
            const bottom = Math.floor((ny + enemy.height - 2) / TILE_SIZE);

            if (left < 0 || right >= COLS || top < 0 || bottom >= ROWS) return false;
            if (map[top][left] !== EMPTY || map[top][right] !== EMPTY ||
                map[bottom][left] !== EMPTY || map[bottom][right] !== EMPTY) {
                return false;
            }
            // Check bomb blocking
            const hasBomb = bombs.some(b =>
                (left <= b.gridX && right >= b.gridX && top <= b.gridY && bottom >= b.gridY)
            );
            return !hasBomb;
        };

        if (canMoveEnemy(newX, newY)) {
            enemy.x = newX;
            enemy.y = newY;

            // Randomly change directions at intersections
            if (Math.random() < 0.02) {
                changeEnemyDirection(enemy, canMoveEnemy);
            }
        } else {
            // Hit a wall, change direction
            changeEnemyDirection(enemy, canMoveEnemy);
        }

        // Touch player
        if (player.isAlive) {
            if (enemy.x < player.x + player.width - 4 &&
                enemy.x + enemy.width > player.x + 4 &&
                enemy.y < player.y + player.height - 4 &&
                enemy.y + enemy.height > player.y + 4) {
                player.isAlive = false;
            }
        }
    }
}

function changeEnemyDirection(enemy, canMoveFn) {
    const dirs = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 }
    ];
    // Shuffle
    dirs.sort(() => Math.random() - 0.5);

    for (const d of dirs) {
        if (canMoveFn(enemy.x + d.dx * 2, enemy.y + d.dy * 2)) {
            enemy.dx = d.dx;
            enemy.dy = d.dy;
            return;
        }
    }
    // Stuck
    enemy.dx = 0;
    enemy.dy = 0;
}

function createExplosionTiles(centerGridX, centerGridY) {
    const range = 2; // radius
    const directions = [
        { dx: 0, dy: -1 }, // North
        { dx: 0, dy: 1 },  // South
        { dx: -1, dy: 0 }, // West
        { dx: 1, dy: 0 }   // East
    ];

    const tiles = [{ x: centerGridX, y: centerGridY }]; // Center

    for (const dir of directions) {
        for (let i = 1; i <= range; i++) {
            const tx = centerGridX + dir.dx * i;
            const ty = centerGridY + dir.dy * i;

            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break;

            if (map[ty][tx] === WALL) {
                break; // Stopped by indestructible block
            }

            tiles.push({ x: tx, y: ty });

            if (map[ty][tx] === CRATE) {
                map[ty][tx] = EMPTY; // Destroy destructible crate
                if (ty === door.r && tx === door.c) {
                    doorRevealed = true;
                }
                break;
            }
        }
    }

    return tiles;
}

function explode(bomb) {
    const tiles = createExplosionTiles(bomb.gridX, bomb.gridY);

    explosions.push({
        tiles: tiles,
        spawnTime: Date.now(),
        duration: 500 // 0.5s screen time
    });
}

function checkExplosionCollision(explosion) {
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    for (const tile of explosion.tiles) {
        const tx = tile.x * TILE_SIZE;
        const ty = tile.y * TILE_SIZE;

        // Player collision
        if (px < tx + TILE_SIZE - 2 && px + pw > tx + 2 &&
            py < ty + TILE_SIZE - 2 && py + ph > ty + 2) {
            player.isAlive = false;
        }

        // Enemies collision
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            if (e.x < tx + TILE_SIZE - 2 && e.x + e.width > tx + 2 &&
                e.y < ty + TILE_SIZE - 2 && e.y + e.height > ty + 2) {
                enemies.splice(i, 1);
            }
        }
    }
}

function drawMap() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let color = '#333';
            if (map[r][c] === WALL) color = '#7f8c8d';
            if (map[r][c] === CRATE) color = '#8B4513';

            if (map[r][c] !== EMPTY) {
                ctx.fillStyle = color;
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                // Border effects
                ctx.strokeStyle = '#222';
                ctx.lineWidth = 2;
                ctx.strokeRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            } else if (doorRevealed && r === door.r && c === door.c) {
                // Draw door if revealed
                ctx.fillStyle = '#f1c40f'; // Gold Door
                ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);

                // Draw lock / handle
                ctx.fillStyle = '#2c3e50';
                ctx.beginPath();
                ctx.arc(c * TILE_SIZE + TILE_SIZE / 2 + 5, r * TILE_SIZE + TILE_SIZE / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
}

function drawBombs() {
    ctx.fillStyle = '#2c3e50';
    for (const bomb of bombs) {
        ctx.beginPath();
        const cx = bomb.gridX * TILE_SIZE + TILE_SIZE / 2;
        const cy = bomb.gridY * TILE_SIZE + TILE_SIZE / 2;
        ctx.arc(cx, cy, TILE_SIZE * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing spark
        const now = Date.now();
        const timeLeft = Math.max(0, bomb.timer - (now - bomb.spawnTime));
        const blinkInterval = timeLeft > 1000 ? 500 : (timeLeft > 500 ? 250 : 100);

        if (Math.floor(now / blinkInterval) % 2 === 0) {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(cx, cy - TILE_SIZE * 0.3, TILE_SIZE * 0.1, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#2c3e50';
        }
    }
}

function drawExplosions() {
    ctx.fillStyle = 'rgba(230, 126, 34, 0.8)'; // Orange fire
    for (const exp of explosions) {
        for (const tile of exp.tiles) {
            ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
    }
}

function drawPlayer() {
    ctx.fillStyle = player.isAlive ? player.color : '#e74c3c';
    ctx.fillRect(player.x, player.y, player.width, player.height);
}

function drawEnemies() {
    for (const enemy of enemies) {
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        const cx = enemy.x + enemy.width / 2;
        const cy = enemy.y + enemy.height / 2;
        ctx.arc(cx, cy, enemy.width / 2, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx - 5, cy - 5, 3, 0, Math.PI * 2);
        ctx.arc(cx + 5, cy - 5, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawHUD() {
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Level: ${level}`, 10, 25);
    ctx.fillText(`Enemies: ${enemies.length}`, 10, 50);
}

function drawGameOver() {
    if (!player.isAlive) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2);

        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.fillText('Refresh page to restart', canvas.width / 2, canvas.height / 2 + 50);
    }
}

function draw() {
    ctx.fillStyle = '#2c3e50'; // Background color inside canvas
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawMap();
    drawBombs();
    drawExplosions();
    drawEnemies();
    drawPlayer();
    drawHUD();
    drawGameOver();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Initiate first level
initLevel();
loop();
