const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const TILE_SIZE = 40;
const ROWS = 13;
const COLS = 13;

// Map constants
const EMPTY = 0;
const WALL = 1;
const CRATE = 2;

// Troll mode specific
const FAKE_DOOR = 3;
const TROLL_POWERUP = 4;

let map = [];
let bombs = [];
let explosions = [];
let enemies = [];
let level = 1;
let gameState = 'MENU'; // 'MENU', 'PLAYING', 'GAMEOVER'
let selectedMode = 0; // 0 for Normal, 1 for Troll
let trollMode = false;

let door = { r: -1, c: -1 };
let doorRevealed = false;
let fakeDoors = [];
let powerups = [];

let messages = []; // { text, time, x, y, duration }
let destroyedCrates = 0;

const player = {
    x: 0, // Set in init
    y: 0,
    visualX: 0,
    visualY: 0,
    width: TILE_SIZE, // full size for absolute grid snapping
    height: TILE_SIZE,
    speed: 3,
    color: '#00BFFF',
    isAlive: true,
    lives: 3,
    maxBombs: 1,
    bombPower: 1,
    hasRemoteBomb: false,
    passBombTime: 0,
    invertedControlsTime: 0,
    powerupsCollected: 0
};

const keys = {};

const SPRITE_SIZE = 16;
const PALETTE = {
    'B': '#000000', // Black
    'W': '#FFFFFF', // White
    'C': '#00BFFF', // Cyan (player color)
    'c': '#008bbf', // Cyan darker (shadow)
    'P': '#FFDAB9', // Peach (skin)
    'p': '#E6BEA5', // Peach darker
    'E': '#9B59B6', // Purple (enemy)
    'e': '#723e87', // Purple dark
    'R': '#E74C3C', // Red
    'r': '#c0392b', // Red dark
    'D': '#34495e', // Dark bomb
    'd': '#2c3e50', // Darker bomb
    'G': '#BDC3C7', // Grey highlight
};

function createPixelSprite(pixelArray) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = TILE_SIZE;
    tempCanvas.height = TILE_SIZE;
    const tctx = tempCanvas.getContext('2d');
    const pixelW = TILE_SIZE / SPRITE_SIZE;
    const pixelH = TILE_SIZE / SPRITE_SIZE;

    for (let r = 0; r < SPRITE_SIZE; r++) {
        for (let c = 0; c < SPRITE_SIZE; c++) {
            let char = pixelArray[r]?.[c] || '.';
            if (char !== '.' && PALETTE[char]) {
                tctx.fillStyle = PALETTE[char];
                tctx.fillRect(c * pixelW, r * pixelH, Math.ceil(pixelW), Math.ceil(pixelH));
            }
        }
    }
    return tempCanvas;
}

const playerPixels = [
    "....BBBBBBBB....",
    "...BWWWWWWWWB...",
    "..BWBBWWWWBBWB..",
    "..BWBBWWWWBBWB..",
    "...BWWWWWWWWB...",
    "....BBBBBBBB....",
    "....BCCCCCCB....",
    "...PCCCCCCCP....",
    "..P.cBcCCcB.P...",
    "..p.cccccccc.p..",
    "....BBrrrrBB....",
    "....RRrRRrRR....",
    "....B.BBBB.B....",
    "...BB.B..B.BB...",
    "..RrR.B..B.RrR..",
    "..rBR.B..B.rBR.."
];

const enemyPixels = [
    "....BBBBBBBB....",
    "...BEEEEEEEEB...",
    "..BEEEEEEEEEEB..",
    ".BeEEBBEEBBeEEB.",
    "BeeeBWWBBWWeeeEB",
    "BeeeBWBBBWeeeEEB",
    "BeeeEBBEEBBeeeEB",
    "BEEeeeeeeeeeeEEB",
    "BEEeeeeeeeeeeEEB",
    ".BEEEEEEEEEEEEB.",
    "..BBEbeBBEbeBB..",
    "...B.B.B..B.B...",
    "...b.b.b..b.b...",
    "................",
    "................",
    "................"
];

const bombPixels = [
    ".......rR.......",
    "......r..B......",
    ".......B.B......",
    ".....BBBBBB.....",
    "...BBDDDDDDBB...",
    "..BDDdddGGdDDB..",
    ".BDDddGGGGGddDB.",
    ".BDddGGGGdGdddDB",
    "BDDddGGGGddddDDB",
    "BDDdddGdddddddDB",
    "BDDdddddddddddDB",
    ".BDDddddddddddB.",
    ".BddddddddddddB.",
    "..BddddddddddB..",
    "...BBddddddBB...",
    ".....BBBBBB....."
];

const sprites = {
    player: createPixelSprite(playerPixels),
    enemy: createPixelSprite(enemyPixels),
    bomb: createPixelSprite(bombPixels)
};

const THEMES = [
    { name: 'Grass', bg: '#27ae60', wall: '#2c3e50', crate: '#f1c40f' },
    { name: 'Ice', bg: '#bdc3c7', wall: '#2980b9', crate: '#ecf0f1' },
    { name: 'Desert', bg: '#e67e22', wall: '#8e44ad', crate: '#f39c12' },
    { name: 'Dungeon', bg: '#34495e', wall: '#c0392b', crate: '#7f8c8d' }
];

let currentTheme = THEMES[0];
let spawnX = 1;
let spawnY = 1;

function rectIntersect(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
}

window.addEventListener('keydown', (e) => {
    if (gameState === 'MENU') {
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
            selectedMode = selectedMode === 0 ? 1 : 0;
        }
        if (e.code === 'Enter' || e.code === 'Space') {
            trollMode = (selectedMode === 1);
            gameState = 'PLAYING';
            level = 1;
            initLevel();
        }
        return;
    }

    if (gameState === 'GAMEOVER') {
        gameState = 'MENU';
        return;
    }

    if (gameState !== 'PLAYING') return;

    // Grid movement parsing
    let dx = 0;
    let dy = 0;
    const now = Date.now();

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') dx = -TILE_SIZE;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') dx = TILE_SIZE;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') dy = -TILE_SIZE;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') dy = TILE_SIZE;

    // Powerups handling (Troll inverted controls)
    if (player.invertedControlsTime > now) {
        let temp = dx;
        dx = -dx;
        // dy could also be inverted but prompt only says "Esquerda vira Direita", let's invert both to be maximally troll.
        dy = -dy;
    }

    if (dx !== 0 && canMoveGrid(player.x + dx, player.y)) {
        player.x += dx;
    } else if (dy !== 0 && canMoveGrid(player.x, player.y + dy)) {
        player.y += dy;
    }

    if (e.code === 'Space') {
        const remoteBombs = bombs.filter(b => b.isRemote);
        if (remoteBombs.length > 0) {
            remoteBombs.forEach(b => {
                b.timer = 0; // explode immediately
                b.spawnTime = 0;
            });
        } else {
            dropBomb();
        }
    }
});

function showMessage(text, x, y, duration = 3000) {
    messages.push({ text, x, y, time: Date.now(), duration });
}

function initLevel() {
    map = [];
    bombs = [];
    explosions = [];
    enemies = [];
    fakeDoors = [];
    powerups = [];
    messages = [];
    doorRevealed = false;
    destroyedCrates = 0;

    // Reset temporary buffs
    player.passBombTime = 0;
    player.invertedControlsTime = 0;
    player.isAlive = true;

    currentTheme = THEMES[(level - 1) % THEMES.length];

    // Pick random corner for spawn
    const corners = [
        { r: 1, c: 1 },
        { r: 1, c: COLS - 2 },
        { r: ROWS - 2, c: 1 },
        { r: ROWS - 2, c: COLS - 2 }
    ];
    const spawnPoint = corners[Math.floor(Math.random() * corners.length)];
    spawnX = spawnPoint.c;
    spawnY = spawnPoint.r;

    player.x = spawnX * TILE_SIZE;
    player.y = spawnY * TILE_SIZE;
    player.visualX = player.x;
    player.visualY = player.y;
    if (player.lives <= 0) {
        player.lives = 3;
        player.maxBombs = 1;
        player.bombPower = 1;
        player.hasRemoteBomb = false;
        player.powerupsCollected = 0;
    }
    player.isAlive = true;

    generateMap();

    if (trollMode) {
        showMessage("MODO TROLL. Boa sorte. Você vai precisar.", canvas.width / 2, canvas.height / 2, 5000);
    } else {
        showMessage("MODO NORMAL: Ache a porta para vencer. Bônus por rapidez e estratégia.", canvas.width / 2, canvas.height / 2, 5000);
    }
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
                // Determine if this cell is part of the 3x3 L-shape safe zone around spawn point
                const isSafeRow = (r === spawnY && (c === spawnX || c === spawnX + 1 || c === spawnX - 1));
                const isSafeCol = (c === spawnX && (r === spawnY || r === spawnY + 1 || r === spawnY - 1));

                if (isSafeRow || isSafeCol) {
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
        cratesPositions.splice(idx, 1);
    }

    if (trollMode) {
        // Spawn 2 fake doors under random remaining crates
        for (let i = 0; i < 2 && cratesPositions.length > 0; i++) {
            const idx = Math.floor(Math.random() * cratesPositions.length);
            const pos = cratesPositions.splice(idx, 1)[0];
            fakeDoors.push({ r: pos.r, c: pos.c, revealed: false });
        }
    }

    // Spawn enemies based on level
    const numEnemies = Math.min(level * 2, emptyPositions.length);
    for (let i = 0; i < numEnemies; i++) {
        if (emptyPositions.length === 0) break;

        // Pick random empty position far from player if possible
        const idx = Math.floor(Math.random() * emptyPositions.length);
        const pos = emptyPositions.splice(idx, 1)[0];

        // Ensure distance from player spawn (must be > 3 tiles away)
        const distToSpawn = Math.abs(pos.c - spawnX) + Math.abs(pos.r - spawnY);
        if (distToSpawn > 3) {
            enemies.push({
                x: pos.c * TILE_SIZE + (TILE_SIZE - TILE_SIZE * 0.8) / 2,
                y: pos.r * TILE_SIZE + (TILE_SIZE - TILE_SIZE * 0.8) / 2,
                width: TILE_SIZE * 0.8,
                height: TILE_SIZE * 0.8,
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

    // Check remote bomb limit or normal limit
    if (bombs.length >= player.maxBombs) return;

    const gridX = Math.floor(player.x / TILE_SIZE);
    const gridY = Math.floor(player.y / TILE_SIZE);

    // Check if bomb already exists at this location
    const bombExists = bombs.some(b => b.gridX === gridX && b.gridY === gridY);
    if (!bombExists) {
        bombs.push({
            gridX,
            gridY,
            timer: player.hasRemoteBomb ? Infinity : 3000,
            isRemote: player.hasRemoteBomb,
            power: player.bombPower,
            spawnTime: Date.now()
        });
    }
}

function canMoveGrid(newX, newY) {
    // Prevent moving if we haven't finished previous walk animation
    if (Math.abs(player.visualX - player.x) > 2 || Math.abs(player.visualY - player.y) > 2) return false;

    // Boundary snap to ensure JS decimals don't break us
    newX = Math.round(newX);
    newY = Math.round(newY);

    const pGridX = Math.floor(newX / TILE_SIZE);
    const pGridY = Math.floor(newY / TILE_SIZE);

    if (pGridX < 0 || pGridX >= COLS || pGridY < 0 || pGridY >= ROWS) return false;

    if (map[pGridY][pGridX] !== EMPTY) {
        return false;
    }

    // Bomb collision
    const now = Date.now();
    const canPassBombs = player.passBombTime > now;

    if (!canPassBombs) {
        for (const b of bombs) {
            if (b.gridX === pGridX && b.gridY === pGridY) {
                // If the player mapped exactly onto a bomb that was just placed (we already exist there), ignore.
                // But since this is grid movement, you can't walk IN to a bomb.
                const playerCurrentGridX = Math.floor(player.x / TILE_SIZE);
                const playerCurrentGridY = Math.floor(player.y / TILE_SIZE);
                if (playerCurrentGridX !== b.gridX || playerCurrentGridY !== b.gridY) {
                    return false;
                }
            }
        }
    }

    return true;
}

function update() {
    if (gameState !== 'PLAYING') return;

    if (!player.isAlive) {
        if (gameState !== 'GAMEOVER') gameState = 'GAMEOVER';
        return;
    }

    // Movement is now fully handled in the keydown listener (Grid Based)

    // Smooth visual interpolation for movement
    player.visualX += (player.x - player.visualX) * 0.45;
    player.visualY += (player.y - player.visualY) * 0.45;

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
    const pGridX = Math.floor(player.x / TILE_SIZE);
    const pGridY = Math.floor(player.y / TILE_SIZE);

    // Troll Mode: Porta Fugitiva (runs away if player comes within 2 tiles)
    if (trollMode && doorRevealed) {
        const dist = Math.max(Math.abs(pGridX - door.c), Math.abs(pGridY - door.r));
        if (dist <= 2) {
            showMessage("OPS! TCHAU!", canvas.width / 2, canvas.height / 2, 2000);
            door.r = ROWS - 1 - door.r;
            door.c = COLS - 1 - door.c;

            // make sure it isn't completely inside a wall, just move it generally
            if (map[door.r][door.c] === WALL) {
                // fallback simple placement
                door.r = Math.floor(ROWS / 2);
                door.c = Math.floor(COLS / 2);
            }
        }
    }

    // Checking fake doors
    if (trollMode) {
        for (let i = fakeDoors.length - 1; i >= 0; i--) {
            const fd = fakeDoors[i];
            if (fd.revealed && pGridX === fd.c && pGridY === fd.r) {
                showMessage("PEGADINHA! BUUM!", canvas.width / 2, canvas.height / 2, 2000);
                fakeDoors.splice(i, 1);
                explode({ gridX: fd.c, gridY: fd.r, power: 5 }); // 5x5 explosion
                break;
            }
        }
    }

    // Checking Powerups collection
    for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        if (pGridX === pu.c && pGridY === pu.r) {
            if (trollMode && pu.type === TROLL_POWERUP) {
                showMessage("POWER-UP... OU NÃO?", canvas.width / 2, canvas.height / 2, 2000);
                player.invertedControlsTime = Date.now() + 15000;
            } else {
                player.powerupsCollected++;
            }
            powerups.splice(i, 1);
        }
    }

    // Check level complete
    if (doorRevealed && enemies.length === 0) {
        if (pGridX === door.c && pGridY === door.r) {
            level++;
            initLevel();
        }
    } else if (doorRevealed && !trollMode) {
        // Player steps on real door in Normal Mode but enemies still alive
        if (pGridX === door.c && pGridY === door.r) {
            // Recompensa Estratégia
            if (player.passBombTime <= now) { // Only award it once properly
                showMessage("RECOMPENSA DE ESTRATÉGIA!", canvas.width / 2, canvas.height / 2, 3000);
                player.passBombTime = now + 30000;
            }
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
            // Check bomb blocking (enemies can't walk onto bombs)
            for (const b of bombs) {
                const bombX = b.gridX * TILE_SIZE;
                const bombY = b.gridY * TILE_SIZE;

                const intersectsNew = rectIntersect(nx + 2, ny + 2, enemy.width - 4, enemy.height - 4, bombX, bombY, TILE_SIZE, TILE_SIZE);
                const intersectsOld = rectIntersect(enemy.x + 2, enemy.y + 2, enemy.width - 4, enemy.height - 4, bombX, bombY, TILE_SIZE, TILE_SIZE);

                if (intersectsNew && !intersectsOld) {
                    return false;
                }
            }
            return true;
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
                handlePlayerDeath();
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

function createExplosionTiles(centerGridX, centerGridY, power) {
    const range = power;
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
                destroyedCrates++;

                checkReveals(ty, tx);

                break;
            }
        }
    }

    return tiles;
}

function checkReveals(r, c) {
    // Real door
    if (r === door.r && c === door.c) {
        doorRevealed = true;
        if (!trollMode && destroyedCrates <= 3) {
            showMessage("SORTE GRANDE! POWER-UPS CONCEDIDOS!", canvas.width / 2, canvas.height / 2, 3000);
            player.speed++;
            player.maxBombs++;
            player.hasRemoteBomb = true;
        }
    }

    // Fake doors
    if (trollMode) {
        for (const fd of fakeDoors) {
            if (fd.r === r && fd.c === c) {
                fd.revealed = true;
            }
        }

        // Randomly spawn Troll Powerup occasionally when crate is broken
        if (Math.random() < 0.15) {
            powerups.push({ r, c, type: TROLL_POWERUP });
        }
    }
}

function explode(bomb) {
    const tiles = createExplosionTiles(bomb.gridX, bomb.gridY, bomb.power);

    explosions.push({
        tiles: tiles,
        spawnTime: Date.now(),
        duration: 500 // 0.5s screen time
    });
}

function handlePlayerDeath() {
    if (!player.isAlive) return; // Prevent double trigger

    player.isAlive = false;
    player.lives--;

    if (player.lives > 0) {
        // Respawn logic (keep exact score and powers, but restart level map)
        showMessage("VOCÊ MORREU! Vidas restantes: " + player.lives, canvas.width / 2, canvas.height / 2, 3000);
        setTimeout(() => {
            initLevel();
        }, 10);
    } else {
        gameState = 'GAMEOVER';
        showMessage("Pressione qualquer botão para jogar novamente.", canvas.width / 2, canvas.height / 2 + 20, 5000);
    }
}

function checkExplosionCollision(explosion) {
    const pGridX = Math.floor(player.x / TILE_SIZE);
    const pGridY = Math.floor(player.y / TILE_SIZE);

    for (const tile of explosion.tiles) {
        // Player collision
        if (pGridX === tile.x && pGridY === tile.y) {
            // Invincibility check if on door
            const isOnDoor = doorRevealed && pGridX === door.c && pGridY === door.r && !trollMode;
            if (!isOnDoor && player.isAlive) {
                handlePlayerDeath();
            }
        }

        // Enemies collision
        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i];
            const eGridX = Math.floor((e.x + e.width / 2) / TILE_SIZE);
            const eGridY = Math.floor((e.y + e.height / 2) / TILE_SIZE);
            if (eGridX === tile.x && eGridY === tile.y) {
                enemies.splice(i, 1);
            }
        }
    }
}

function drawMap() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            let color = currentTheme.bg; // Default background is slightly varied usually, but we draw flat here
            if (map[r][c] === WALL) color = currentTheme.wall;
            if (map[r][c] === CRATE) color = currentTheme.crate;

            if (map[r][c] !== EMPTY) {
                // Shadow for depth
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(c * TILE_SIZE + 4, r * TILE_SIZE + 4, TILE_SIZE, TILE_SIZE);

                // Main block
                ctx.fillStyle = color;
                ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);

                // Highlight/Border retro effect
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.lineWidth = 2;
                ctx.strokeRect(c * TILE_SIZE + 1, r * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            }

            // Draw real door
            if (doorRevealed && r === door.r && c === door.c) {
                // Aura if not troll mode
                if (!trollMode) {
                    ctx.fillStyle = 'rgba(52, 152, 219, 0.4)'; // Blue aura
                    ctx.fillRect(c * TILE_SIZE, r * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                }

                ctx.fillStyle = '#f1c40f'; // Gold Door
                ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
                // Draw lock / handle
                ctx.fillStyle = '#2c3e50';
                ctx.beginPath();
                ctx.arc(c * TILE_SIZE + TILE_SIZE / 2 + 5, r * TILE_SIZE + TILE_SIZE / 2, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Draw fake doors
            for (const fd of fakeDoors) {
                if (fd.revealed && fd.r === r && fd.c === c) {
                    ctx.fillStyle = '#e67e22'; // Bad Door
                    ctx.fillRect(c * TILE_SIZE + 5, r * TILE_SIZE + 5, TILE_SIZE - 10, TILE_SIZE - 10);
                    ctx.fillStyle = '#2c3e50';
                    ctx.beginPath();
                    ctx.arc(c * TILE_SIZE + TILE_SIZE / 2 + 5, r * TILE_SIZE + TILE_SIZE / 2, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Draw powerups
            for (const pu of powerups) {
                if (pu.r === r && pu.c === c) {
                    if (pu.type === TROLL_POWERUP) {
                        ctx.fillStyle = '#e74c3c'; // Troll powerup body
                        ctx.beginPath();
                        ctx.arc(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 12, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#fff';
                        ctx.font = '14px Arial';
                        ctx.fillText('?', c * TILE_SIZE + TILE_SIZE / 2 - 4, r * TILE_SIZE + TILE_SIZE / 2 + 5);
                    }
                }
            }
        }
    }
}

function drawBombs() {
    for (const bomb of bombs) {
        const bombSize = TILE_SIZE * 0.6;
        const offset = (TILE_SIZE - bombSize) / 2;
        const bx = bomb.gridX * TILE_SIZE + offset;
        const by = bomb.gridY * TILE_SIZE + offset;

        ctx.drawImage(sprites.bomb, bx, by, bombSize, bombSize);

        // Pulsing spark effect over the sprite
        const now = Date.now();
        const timeLeft = Math.max(0, bomb.timer - (now - bomb.spawnTime));
        const blinkInterval = timeLeft > 1000 ? 500 : (timeLeft > 500 ? 250 : 100);

        if (Math.floor(now / blinkInterval) % 2 === 0) {
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            const cx = bx + bombSize / 2;
            const cy = by + bombSize * 0.2;
            ctx.arc(cx, cy, bombSize * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawExplosions() {
    ctx.fillStyle = 'rgba(230, 126, 34, 0.8)'; // Orange fire
    for (const exp of explosions) {
        for (const tile of exp.tiles) {
            // Fire center or arm
            const isCenter = exp.tiles[0].x === tile.x && exp.tiles[0].y === tile.y;
            ctx.fillStyle = isCenter ? '#f39c12' : '#e67e22'; // Orange/Yellow fire
            ctx.fillRect(tile.x * TILE_SIZE, tile.y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

            // Inner bright heat
            ctx.fillStyle = '#f1c40f'; // Bright yellow core
            ctx.fillRect(tile.x * TILE_SIZE + 10, tile.y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);

            // Smoke bits (simple random grey squares around the tile bounds, pseudo-random tied to tile position)
            ctx.fillStyle = 'rgba(149, 165, 166, 0.7)'; // Grey smoke
            const seedX = (tile.x * 13) % 40;
            const seedY = (tile.y * 17) % 40;
            ctx.fillRect(tile.x * TILE_SIZE + seedX, tile.y * TILE_SIZE + seedY, 10, 10);
            ctx.fillRect(tile.x * TILE_SIZE + ((seedX + 20) % 40), tile.y * TILE_SIZE + ((seedY + 20) % 40), 10, 10);
        }
    }
}

function drawPlayer() {
    if (player.isAlive) {
        ctx.imageSmoothingEnabled = false;
        const renderSize = TILE_SIZE * 0.8;
        const offsetX = (TILE_SIZE - renderSize) / 2;
        const offsetY = (TILE_SIZE - renderSize) / 2;

        // Bobbing animation if moving visually
        const isMoving = Math.abs(player.visualX - player.x) > 1 || Math.abs(player.visualY - player.y) > 1;
        let pY = player.visualY + offsetY;
        if (isMoving) {
            pY += Math.sin(Date.now() / 40) * 3; // bobbing effect
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(player.visualX + offsetX + 8, pY + renderSize - 10, renderSize - 16, 10);

        ctx.drawImage(sprites.player, player.visualX + offsetX, pY, renderSize, renderSize);
    } else {
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(player.visualX, player.visualY, player.width, player.height);
    }
}

function drawEnemies() {
    ctx.imageSmoothingEnabled = false;
    for (const enemy of enemies) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(enemy.x + 8, enemy.y + enemy.height - 10, enemy.width - 16, 10);

        ctx.drawImage(sprites.enemy, enemy.x, enemy.y, enemy.width, enemy.height);
    }
}

function drawHUD() {
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Cenário: ${currentTheme.name} | Vidas: ${player.lives}`, 10, 20);
    ctx.fillText(`Atributos: Bombas Máx: ${player.maxBombs} | Troca(Troll): ${player.powerupsCollected}`, 10, 40);

    // Draw active messages
    const now = Date.now();
    ctx.textAlign = 'center';
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (now - msg.time > msg.duration) {
            messages.splice(i, 1);
            continue;
        }

        // Float logic
        const progress = (now - msg.time) / msg.duration;
        const fy = msg.y - progress * 30;

        ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress})`;
        ctx.font = 'bold 16px Arial';

        // Text Outline
        ctx.strokeStyle = `rgba(0, 0, 0, ${1 - progress})`;
        ctx.lineWidth = 2;
        ctx.strokeText(msg.text, msg.x, fy);
        ctx.fillText(msg.text, msg.x, fy);
    }
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 20);

    ctx.fillStyle = '#fff';
    ctx.font = '18px Arial';
    ctx.fillText('Pressione qualquer botão para voltar', canvas.width / 2, canvas.height / 2 + 20);
}

function drawMenu() {
    // Menu Background (Grid retro feel)
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += TILE_SIZE) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Shadow Logo
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = 'bold 40px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GRAVITY BOMBER', canvas.width / 2 + 3, 73);

    // Main Logo
    ctx.fillStyle = '#00BFFF';
    const beat = 1 + Math.sin(Date.now() / 200) * 0.03;
    ctx.save();
    ctx.translate(canvas.width / 2, 70);
    ctx.scale(beat, beat);
    ctx.fillText('GRAVITY BOMBER', 0, 0);
    ctx.restore();

    // Draw Sprites
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprites.player, canvas.width / 2 - 100, 120, 60, 60);
    ctx.drawImage(sprites.bomb, canvas.width / 2 - 25, 150, 50, 50);
    ctx.drawImage(sprites.enemy, canvas.width / 2 + 40, 120, 60, 60);

    // Box highlight for selection
    const boxY = selectedMode === 0 ? 305 : 365;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(canvas.width / 2 - 125, boxY - 25, 250, 40);

    ctx.font = '24px Arial';
    ctx.fillStyle = selectedMode === 0 ? '#f1c40f' : '#fff';
    ctx.fillText((selectedMode === 0 ? '▶ ' : '') + 'Modo Normal', canvas.width / 2, 305);

    ctx.fillStyle = selectedMode === 1 ? '#e74c3c' : '#fff';
    ctx.fillText((selectedMode === 1 ? '▶ ' : '') + 'Modo Troll', canvas.width / 2, 365);

    ctx.font = '16px Arial';
    ctx.fillStyle = '#bdc3c7';
    ctx.fillText('Use W/S ou Setas para selecionar', canvas.width / 2, 450);
    ctx.fillStyle = '#ecf0f1';
    ctx.fillText('Pressione ESPAÇO ou ENTER para jogar', canvas.width / 2, 480);
}

function draw() {
    if (gameState === 'MENU') {
        drawMenu();
    } else {
        ctx.fillStyle = currentTheme.bg; // Background color inside canvas depending on theme
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawMap();
        drawBombs();
        drawExplosions();
        drawEnemies();
        drawPlayer();
        drawHUD();
        if (gameState === 'GAMEOVER') drawGameOver();
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Initiate first level
initLevel();
loop();
