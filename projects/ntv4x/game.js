"use strict";

const COLS = 8;
const VISIBLE_ROWS = 16;
const HIDDEN_ROWS = 1;
const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
const CELL = 40;
const COLORS = ["red", "yellow", "blue"];
const COLOR_HEX = {
  red: "#e45353",
  yellow: "#f2ca52",
  blue: "#4f8edb"
};
const COLOR_RGB = {
  red: [228, 83, 83],
  yellow: [242, 202, 82],
  blue: [79, 142, 219]
};
const DARK_HEX = {
  red: "#8f282c",
  yellow: "#947223",
  blue: "#285189"
};
const DIFFICULTY = {
  easy: { speed: 980, virusBase: 7 },
  medium: { speed: 820, virusBase: 10 },
  high: { speed: 660, virusBase: 14 }
};
const LOCK_DELAY = 520;
const DAS_DELAY = 170;
const ARR_DELAY = 58;
const ROTATION_BUFFER = 140;
const FIRST_CAPSULE_GRACE = 520;
const LEVEL_CLEAR_PAUSE = 1050;

function metricFeature(feature, stage) {
  if (window.ledsecMetrics) window.ledsecMetrics.feature(feature, stage);
}
const NECK_CELLS = [
  [3, 0],
  [4, 0],
  [3, 1],
  [4, 1]
];
const BOTTLE_BODY_START_ROW = HIDDEN_ROWS + 2;
const NECK_MIN_COL = 3;
const NECK_MAX_COL = 4;
const VIRUS_START_ROW = HIDDEN_ROWS + 6;
const DX_SWAP_DURATION = 620;
const DX_SHOCK_DURATION = 240;
const DX_EXIT_DURATION = 760;
const DX_POOF_START = 260;

const canvas = document.getElementById("game");
const boardWrap = document.querySelector(".board-wrap");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const nextMobileCanvas = document.getElementById("nextMobile");
const nextMobileCtx = nextMobileCanvas.getContext("2d");
const virusWindowCanvas = document.getElementById("virusWindow");
const virusWindowCtx = virusWindowCanvas.getContext("2d");
const virusMobileCanvas = document.getElementById("virusMobile");
const virusMobileCtx = virusMobileCanvas.getContext("2d");
const cutscene = document.getElementById("cutscene");
const cutsceneCanvas = document.getElementById("cutsceneCanvas");
const cutCtx = cutsceneCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const virusesEl = document.getElementById("viruses");
const mobileScoreEl = document.getElementById("mobileScore");
const mobileLevelEl = document.getElementById("mobileLevel");
const mobileVirusesEl = document.getElementById("mobileViruses");
const difficultyEl = document.getElementById("difficulty");
const statusText = document.getElementById("statusText");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayButton = document.getElementById("overlayButton");
const overlayMenuButton = document.getElementById("overlayMenuButton");
const pauseButton = document.getElementById("pause");
const mobilePauseButton = document.getElementById("mobilePause");
const newGameButton = document.getElementById("newGame");
const continueButton = document.getElementById("continue");
const musicToggle = document.getElementById("musicToggle");
const musicTrack = document.getElementById("musicTrack");
const startScreen = document.getElementById("startScreen");
const startButton = document.getElementById("startButton");
const startDifficulty = document.getElementById("startDifficulty");
const startMusic = document.getElementById("startMusic");
const menuArtCanvas = document.getElementById("menuArt");
const menuArtCtx = menuArtCanvas.getContext("2d");

const state = {
  board: [],
  active: null,
  next: null,
  pairSeq: 1,
  score: 0,
  level: 1,
  viruses: 0,
  started: false,
  demo: false,
  demoPlan: null,
  demoTimer: 0,
  paused: false,
  gameOver: false,
  resolving: false,
  dropTimer: 0,
  lockTimer: 0,
  lastTime: 0,
  cutsceneFrame: 0,
  message: "",
  messageTimer: 0,
  clearFlash: new Map(),
  rotationBuffer: null,
  openingGraceTimer: 0,
  dxTrio: {
    initialized: false,
    slots: {},
    previousSlots: {},
    transitionStart: 0,
    shockUntil: 0,
    visible: {},
    exiting: {},
    lastCounts: null
  },
  input: {
    left: false,
    right: false,
    activeDir: 0,
    dasTimer: 0,
    arrTimer: 0
  },
  audio: {
    context: null,
    master: null,
    enabled: false,
    track: "cool",
    gameTrack: "cool",
    beat: 0,
    nextNoteTime: 0,
    cueEndTime: 0
  }
};

const boardGesture = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  lastX: 0,
  startTime: 0,
  moved: false
};

let previewFrameTime = 0;
let menuArtFrameTime = 0;

const MUSIC = window.NTV4X_MUSIC?.tracks;
if (!MUSIC) throw new Error("NTv4x music data did not load.");

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function midiToHz(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function makeCapsule() {
  return {
    a: randomColor(),
    b: randomColor(),
    orientation: 0,
    x: 3,
    y: 0,
    pairId: state.pairSeq++
  };
}

function boardToCanvasY(y) {
  return (y - HIDDEN_ROWS) * CELL;
}

function cellsFor(piece = state.active) {
  if (!piece) return [];
  const offsets = [
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1]],
    [[0, 0], [-1, 0]],
    [[0, 0], [0, -1]]
  ][piece.orientation];
  return [
    { x: piece.x + offsets[0][0], y: piece.y + offsets[0][1], color: piece.a, part: "a" },
    { x: piece.x + offsets[1][0], y: piece.y + offsets[1][1], color: piece.b, part: "b" }
  ];
}

function collides(piece) {
  return cellsFor(piece).some((cell) => {
    return !isPlayableCell(cell.x, cell.y) || state.board[cell.y][cell.x];
  });
}

function isPlayableCell(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false;
  if (y < BOTTLE_BODY_START_ROW) return x >= NECK_MIN_COL && x <= NECK_MAX_COL;
  return true;
}

function spawn() {
  state.active = state.next || makeCapsule();
  state.active.x = 3;
  state.active.y = 0;
  state.active.orientation = 0;
  state.active.pairId = state.pairSeq++;
  state.next = makeCapsule();
  if (isNeckBlocked() || collides(state.active)) {
    state.gameOver = true;
    if (!state.demo) {
      playMusicCue("loss");
      metricFeature("ntv4x-game", "loss");
    }
    showOverlay("Game Over", "Restart", "Menu");
    if (state.demo) startDemo();
  } else if (state.demo) {
    planDemoMove();
  }
}

function isNeckBlocked() {
  return NECK_CELLS.some(([x, y]) => state.board[y][x]);
}

function isDangerZoneOccupied() {
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.board[y][x]) return true;
    }
  }
  return false;
}

function virusTarget() {
  const settings = DIFFICULTY[difficultyEl.value];
  return Math.min(72, settings.virusBase + (state.level - 1) * 3);
}

function seedViruses() {
  let placed = 0;
  const target = virusTarget();
  let guard = 0;
  while (placed < target && guard < 3000) {
    guard++;
    const x = Math.floor(Math.random() * COLS);
    const y = VIRUS_START_ROW + Math.floor(Math.random() * (ROWS - VIRUS_START_ROW));
    if (state.board[y][x]) continue;
    const color = randomColor();
    state.board[y][x] = { type: "virus", color };
    if (findMatches().length) {
      state.board[y][x] = null;
      continue;
    }
    placed++;
  }
  state.viruses = placed;
}

function startGame(resetLevel = true) {
  metricFeature("ntv4x-game", "abandon");
  metricFeature("ntv4x-game", "start");
  state.demo = false;
  state.demoPlan = null;
  state.started = true;
  state.board = emptyBoard();
  state.active = null;
  state.pairSeq = 1;
  state.next = makeCapsule();
  state.score = resetLevel ? 0 : state.score;
  state.level = resetLevel ? 1 : state.level;
  state.paused = false;
  state.gameOver = false;
  state.resolving = false;
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.message = "ready";
  state.messageTimer = FIRST_CAPSULE_GRACE + 260;
  state.rotationBuffer = null;
  state.openingGraceTimer = FIRST_CAPSULE_GRACE;
  resetHorizontalInput();
  state.clearFlash.clear();
  resetDxTrio();
  seedViruses();
  spawn();
  hideOverlay();
  cutscene.classList.add("is-hidden");
  startScreen.classList.add("is-hidden");
  restoreGameplayMusic();
  updateHud();
  draw();
}

function showMenu() {
  metricFeature("ntv4x-game", "abandon");
  startDemo();
  startScreen.classList.remove("is-hidden");
  pauseButton.textContent = "Pause";
  mobilePauseButton.textContent = "Pause";
  drawMenuArt();
  if (state.audio.enabled) setCurrentMusicTrack("menu");
}

function startDemo() {
  state.demo = true;
  state.started = false;
  state.paused = false;
  state.gameOver = false;
  state.resolving = false;
  state.board = emptyBoard();
  state.active = null;
  state.pairSeq = 1;
  state.next = makeCapsule();
  state.score = 0;
  state.level = 1;
  state.viruses = 0;
  state.dropTimer = 0;
  state.lockTimer = 0;
  state.demoTimer = 0;
  state.demoPlan = null;
  state.message = "";
  state.messageTimer = 0;
  state.openingGraceTimer = 0;
  state.clearFlash.clear();
  resetDxTrio();
  resetHorizontalInput();
  hideOverlay();
  cutscene.classList.add("is-hidden");
  seedViruses();
  spawn();
  if (startScreen.classList.contains("is-hidden")) restoreGameplayMusic();
  updateHud();
  draw();
}

function startFromMenu() {
  difficultyEl.value = startDifficulty.value;
  if (startMusic.value === "cool" || startMusic.value === "heat") {
    musicTrack.value = startMusic.value;
    setGameplayTrack(startMusic.value);
  } else {
    setGameplayTrack(musicTrack.value || "cool");
  }
  startGame(true);
  setMusicEnabled(startMusic.value !== "off");
}

function lockPiece() {
  for (const cell of cellsFor()) {
    state.board[cell.y][cell.x] = { type: "capsule", color: cell.color, pairId: state.active.pairId };
  }
  state.active = null;
  if (isNeckBlocked()) {
    state.gameOver = true;
    if (!state.demo) {
      playMusicCue("loss");
      metricFeature("ntv4x-game", "loss");
    }
    showOverlay("Game Over", "Restart", "Menu");
    return;
  }
  resolveBoard();
}

function tryMove(dx, dy) {
  if (!state.active || state.resolving || state.paused || state.gameOver) return false;
  const moved = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (collides(moved)) return false;
  state.active = moved;
  state.lockTimer = 0;
  return true;
}

function tryRotate(dir) {
  if (!state.active || state.resolving || state.paused || state.gameOver) return false;
  const base = { ...state.active, orientation: (state.active.orientation + dir + 4) % 4 };
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    const rotated = { ...base, x: base.x + kick };
    if (!collides(rotated)) {
      state.active = rotated;
      state.lockTimer = 0;
      return true;
    }
  }
  return false;
}

function queueRotation(dir) {
  if (tryRotate(dir)) {
    state.rotationBuffer = null;
    return;
  }
  state.rotationBuffer = { dir, timer: ROTATION_BUFFER };
}

function hardDrop() {
  if (!state.active || state.resolving || state.paused || state.gameOver) return;
  while (tryMove(0, 1)) {
    state.score += 1;
  }
  lockPiece();
}

function tickDrop() {
  if (!tryMove(0, 1)) {
    if (state.lockTimer >= LOCK_DELAY) lockPiece();
  }
}

function activeCanFall() {
  if (!state.active) return false;
  return !collides({ ...state.active, y: state.active.y + 1 });
}

function playableInputState() {
  return (state.started || state.demo) && state.active && !state.resolving && !state.paused && !state.gameOver && cutscene.classList.contains("is-hidden");
}

function playerInputState() {
  return state.started && !state.demo && state.active && !state.resolving && !state.paused && !state.gameOver && cutscene.classList.contains("is-hidden");
}

function planDemoMove() {
  if (!state.active) return;
  const orientation = Math.random() < 0.7 ? 0 : 1;
  const maxX = orientation === 0 ? COLS - 2 : COLS - 1;
  state.demoPlan = {
    targetX: Math.floor(Math.random() * (maxX + 1)),
    targetOrientation: orientation
  };
}

function updateDemoAutoplay(delta) {
  if (!state.demo || !state.active || state.resolving || state.gameOver) return;
  if (!state.demoPlan) planDemoMove();
  state.demoTimer += delta;
  if (state.demoTimer < 115) return;
  state.demoTimer = 0;

  const plan = state.demoPlan;
  if (state.active.orientation !== plan.targetOrientation) {
    tryRotate(1);
    return;
  }
  if (state.active.x < plan.targetX) {
    tryMove(1, 0);
    return;
  }
  if (state.active.x > plan.targetX) {
    tryMove(-1, 0);
    return;
  }
  if (!activeCanFall()) {
    state.lockTimer = Math.max(state.lockTimer, LOCK_DELAY);
  } else if (Math.random() < 0.35) {
    tryMove(0, 1);
  }
}

function resetHorizontalInput() {
  state.input.left = false;
  state.input.right = false;
  state.input.activeDir = 0;
  state.input.dasTimer = 0;
  state.input.arrTimer = 0;
}

function setHorizontalInput(dir, pressed) {
  if (!playerInputState()) return;
  if (dir < 0) state.input.left = pressed;
  if (dir > 0) state.input.right = pressed;

  if (pressed) {
    state.input.activeDir = dir;
    state.input.dasTimer = 0;
    state.input.arrTimer = 0;
    tryMove(dir, 0);
    return;
  }

  if (state.input.activeDir === dir) {
    state.input.activeDir = state.input.left ? -1 : state.input.right ? 1 : 0;
    state.input.dasTimer = 0;
    state.input.arrTimer = 0;
  }
}

function updateHorizontalInput(delta) {
  const dir = state.input.activeDir;
  if (!dir || !playableInputState()) return;
  const previousDas = state.input.dasTimer;
  state.input.dasTimer += delta;
  if (state.input.dasTimer < DAS_DELAY) return;
  if (previousDas < DAS_DELAY) {
    tryMove(dir, 0);
    state.input.arrTimer = 0;
    return;
  }
  state.input.arrTimer += delta;
  while (state.input.arrTimer >= ARR_DELAY) {
    tryMove(dir, 0);
    state.input.arrTimer -= ARR_DELAY;
  }
}

function updateRotationBuffer(delta) {
  if (!state.rotationBuffer || !playableInputState()) return;
  if (tryRotate(state.rotationBuffer.dir)) {
    state.rotationBuffer = null;
    return;
  }
  state.rotationBuffer.timer -= delta;
  if (state.rotationBuffer.timer <= 0) state.rotationBuffer = null;
}

function gestureStepSize() {
  return Math.max(24, boardWrap.getBoundingClientRect().width / COLS * 0.58);
}

function beginBoardGesture(event) {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (!state.started || state.paused || state.gameOver || state.resolving) return;
  event.preventDefault();
  boardGesture.active = true;
  boardGesture.pointerId = event.pointerId;
  boardGesture.startX = event.clientX;
  boardGesture.startY = event.clientY;
  boardGesture.lastX = event.clientX;
  boardGesture.startTime = performance.now();
  boardGesture.moved = false;
  boardWrap.setPointerCapture(event.pointerId);
}

function moveBoardGesture(event) {
  if (!boardGesture.active || event.pointerId !== boardGesture.pointerId) return;
  event.preventDefault();
  const step = gestureStepSize();
  let dx = event.clientX - boardGesture.lastX;
  while (Math.abs(dx) >= step) {
    const dir = dx > 0 ? 1 : -1;
    tryMove(dir, 0);
    boardGesture.lastX += step * dir;
    boardGesture.moved = true;
    dx = event.clientX - boardGesture.lastX;
  }
  updateHud();
  draw();
}

function endBoardGesture(event) {
  if (!boardGesture.active || event.pointerId !== boardGesture.pointerId) return;
  event.preventDefault();
  const elapsed = performance.now() - boardGesture.startTime;
  const dx = event.clientX - boardGesture.startX;
  const dy = event.clientY - boardGesture.startY;
  const distance = Math.hypot(dx, dy);
  const downwardVelocity = dy / Math.max(1, elapsed);
  const step = gestureStepSize();

  if (dy > step * 1.15 && Math.abs(dy) > Math.abs(dx) * 1.25 && (elapsed < 420 || downwardVelocity > 0.42)) {
    hardDrop();
  } else if (dy > step * 0.85 && Math.abs(dy) > Math.abs(dx) * 1.2) {
    handleAction("down");
  } else if (!boardGesture.moved && distance < 16 && elapsed < 320) {
    queueRotation(1);
  }

  boardGesture.active = false;
  boardGesture.pointerId = null;
  updateHud();
  draw();
}

function cancelBoardGesture(event) {
  if (!boardGesture.active || event.pointerId !== boardGesture.pointerId) return;
  boardGesture.active = false;
  boardGesture.pointerId = null;
}

function landingCells() {
  if (!state.active) return [];
  const ghost = { ...state.active };
  while (!collides({ ...ghost, y: ghost.y + 1 })) {
    ghost.y += 1;
  }
  return cellsFor(ghost);
}

function findMatches() {
  const hits = new Set();
  for (let y = 0; y < ROWS; y++) {
    let runColor = null;
    let run = [];
    for (let x = 0; x <= COLS; x++) {
      const cell = x < COLS ? state.board[y][x] : null;
      if (cell && cell.color === runColor) {
        run.push([x, y]);
      } else {
        if (runColor && run.length >= 4) run.forEach(([rx, ry]) => hits.add(`${rx},${ry}`));
        runColor = cell ? cell.color : null;
        run = cell ? [[x, y]] : [];
      }
    }
  }
  for (let x = 0; x < COLS; x++) {
    let runColor = null;
    let run = [];
    for (let y = 0; y <= ROWS; y++) {
      const cell = y < ROWS ? state.board[y][x] : null;
      if (cell && cell.color === runColor) {
        run.push([x, y]);
      } else {
        if (runColor && run.length >= 4) run.forEach(([rx, ry]) => hits.add(`${rx},${ry}`));
        runColor = cell ? cell.color : null;
        run = cell ? [[x, y]] : [];
      }
    }
  }
  return [...hits].map((key) => key.split(",").map(Number));
}

function clearMatches(matches) {
  let virusesCleared = 0;
  state.clearFlash.clear();
  for (const [x, y] of matches) {
    if (state.board[y][x]?.type === "virus") virusesCleared++;
    state.clearFlash.set(`${x},${y}`, {
      color: state.board[y][x]?.color || "yellow",
      started: performance.now()
    });
    state.board[y][x] = null;
  }
  state.viruses -= virusesCleared;
  state.score += matches.length * 100 + virusesCleared * 300;
  state.message = virusesCleared ? `-${virusesCleared} microbe` : "clear";
  state.messageTimer = 720;
}

function applyGravity() {
  let moved = false;
  const visited = new Set();
  const groups = [];
  for (let y = ROWS - 1; y >= 0; y--) {
    for (let x = COLS - 1; x >= 0; x--) {
      const key = `${x},${y}`;
      const cell = state.board[y][x];
      if (!cell || cell.type !== "capsule" || visited.has(key)) continue;
      const group = collectCapsuleGroup(x, y, visited);
      groups.push(group);
    }
  }
  groups.sort((a, b) => Math.max(...b.map((cell) => cell.y)) - Math.max(...a.map((cell) => cell.y)));
  for (const group of groups) {
    if (!canGroupFall(group)) continue;
    const cells = group.map(({ x, y }) => ({ x, y, cell: state.board[y][x] }));
    for (const { x, y } of cells) {
      state.board[y][x] = null;
    }
    for (const { x, y, cell } of cells) {
      state.board[y + 1][x] = cell;
    }
    moved = true;
  }
  return moved;
}

function collectCapsuleGroup(startX, startY, visited) {
  const origin = state.board[startY][startX];
  const group = [];
  const stack = [{ x: startX, y: startY }];
  while (stack.length) {
    const { x, y } = stack.pop();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    const cell = state.board[y][x];
    if (!cell || cell.type !== "capsule" || cell.pairId !== origin.pairId) continue;
    visited.add(key);
    group.push({ x, y });
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx >= 0 && nx < COLS && ny >= 0 && ny < ROWS) {
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return group;
}

function canGroupFall(group) {
  const own = new Set(group.map(({ x, y }) => `${x},${y}`));
  return group.every(({ x, y }) => {
    if (y + 1 >= ROWS) return false;
    const below = state.board[y + 1][x];
    return !below || own.has(`${x},${y + 1}`);
  });
}

function resolveBoard() {
  state.resolving = true;
  let chain = 0;
  const step = () => {
    const matches = findMatches();
    if (matches.length) {
      chain++;
      clearMatches(matches);
      updateHud();
      draw();
      setTimeout(step, 160);
      return;
    }
    if (applyGravity()) {
      draw();
      setTimeout(step, 70);
      return;
    }
    syncDxTrio(virusColorCounts(), performance.now(), true);
    state.resolving = false;
    if (state.viruses <= 0) {
      finishLevel();
    } else {
      if (chain > 1) {
        state.score += chain * 200;
        state.message = `${chain} chain`;
        state.messageTimer = 900;
      }
      spawn();
      updateHud();
    }
  };
  step();
}

function finishLevel() {
  if (state.demo) {
    startDemo();
    return;
  }
  metricFeature("ntv4x-game", "level-clear");
  playMusicCue("win", 32);
  const completedLevel = state.level;
  state.score += completedLevel * 1000;
  const shouldCutscene = ["medium", "high"].includes(difficultyEl.value) && completedLevel % 5 === 0 && completedLevel <= 20;
  state.resolving = true;
  state.message = "level clear";
  state.messageTimer = LEVEL_CLEAR_PAUSE;
  updateHud();
  draw();
  setTimeout(() => {
    if (state.demo || state.gameOver || !state.started) return;
    state.level = completedLevel + 1;
    state.resolving = false;
    if (shouldCutscene) {
      updateHud();
      showCutscene();
      return;
    }
    state.board = emptyBoard();
    resetDxTrio();
    seedViruses();
    spawn();
    updateHud();
  }, LEVEL_CLEAR_PAUSE);
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  levelEl.textContent = String(state.level);
  virusesEl.textContent = String(state.viruses);
  mobileScoreEl.textContent = String(state.score);
  mobileLevelEl.textContent = String(state.level);
  mobileVirusesEl.textContent = String(state.viruses);
  statusText.textContent = statusSummary();
  drawNext();
}

function virusColorCounts() {
  const counts = Object.fromEntries(COLORS.map((color) => [color, 0]));
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = state.board[y][x];
      if (cell?.type === "virus") counts[cell.color]++;
    }
  }
  return counts;
}

function resetDxTrio() {
  state.dxTrio.initialized = false;
  state.dxTrio.slots = {};
  state.dxTrio.previousSlots = {};
  state.dxTrio.transitionStart = 0;
  state.dxTrio.shockUntil = 0;
  state.dxTrio.visible = {};
  state.dxTrio.exiting = {};
  state.dxTrio.lastCounts = null;
}

function rankedVirusColors(counts, colors = COLORS) {
  return [...colors].sort((a, b) => counts[b] - counts[a] || COLORS.indexOf(a) - COLORS.indexOf(b));
}

function slotsForRankedColors(ranked) {
  const slots = {};
  ranked.forEach((color, rank) => {
    slots[color] = rank;
  });
  return slots;
}

function dxSlotsChanged(nextSlots) {
  return COLORS.some((color) => state.dxTrio.slots[color] !== nextSlots[color]);
}

function visibleDxColors(counts) {
  return COLORS.filter((color) => state.dxTrio.visible[color] && counts[color] > 0 && !state.dxTrio.exiting[color]);
}

function initializeDxTrio(counts, time) {
  const colors = COLORS.filter((color) => counts[color] > 0);
  const nextSlots = slotsForRankedColors(rankedVirusColors(counts, colors));
  state.dxTrio.initialized = true;
  state.dxTrio.visible = Object.fromEntries(COLORS.map((color) => [color, counts[color] > 0]));
  state.dxTrio.exiting = {};
  state.dxTrio.slots = { ...nextSlots };
  state.dxTrio.previousSlots = { ...nextSlots };
  state.dxTrio.transitionStart = time;
  state.dxTrio.shockUntil = 0;
  state.dxTrio.lastCounts = { ...counts };
}

function syncDxTrio(counts, time, boardSettled = false) {
  if (!state.dxTrio.initialized) {
    initializeDxTrio(counts, time);
    return;
  }
  if (!boardSettled) return;

  let changed = false;
  const previousSlots = { ...state.dxTrio.slots };
  for (const color of COLORS) {
    if (!state.dxTrio.visible[color] && counts[color] > 0) {
      state.dxTrio.visible[color] = true;
      changed = true;
    }
    if (state.dxTrio.visible[color] && counts[color] <= 0 && !state.dxTrio.exiting[color]) {
      state.dxTrio.exiting[color] = {
        start: time,
        slot: state.dxTrio.slots[color] ?? state.dxTrio.previousSlots[color] ?? 2
      };
      changed = true;
    }
  }

  const nextSlots = slotsForRankedColors(rankedVirusColors(counts, visibleDxColors(counts)));
  if (!changed && !dxSlotsChanged(nextSlots)) {
    state.dxTrio.lastCounts = { ...counts };
    return;
  }
  state.dxTrio.previousSlots = previousSlots;
  state.dxTrio.slots = { ...nextSlots };
  state.dxTrio.transitionStart = time;
  state.dxTrio.shockUntil = time + DX_SHOCK_DURATION;
  state.dxTrio.lastCounts = { ...counts };
}

function retireDxExits(time) {
  for (const color of COLORS) {
    const exit = state.dxTrio.exiting[color];
    if (!exit || time - exit.start < DX_EXIT_DURATION) continue;
    state.dxTrio.visible[color] = false;
    delete state.dxTrio.exiting[color];
    delete state.dxTrio.slots[color];
    delete state.dxTrio.previousSlots[color];
  }
}

function easeSwap(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return 1 - (1 - clamped) ** 3;
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function statusSummary() {
  const next = state.next ? `Next capsule ${state.next.a} and ${state.next.b}.` : "No next capsule.";
  const counts = virusColorCounts();
  return `Score ${state.score}. Level ${state.level}. Microbes ${state.viruses}. ${next} Dx red ${counts.red}, yellow ${counts.yellow}, blue ${counts.blue}.`;
}

function ensureAudio() {
  if (state.audio.context) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) {
    musicToggle.disabled = true;
    musicToggle.textContent = "Audio: Unavailable";
    return;
  }
  const context = new AudioCtor();
  const master = context.createGain();
  master.gain.value = 0.16;
  master.connect(context.destination);
  state.audio.context = context;
  state.audio.master = master;
  state.audio.nextNoteTime = context.currentTime;
}

function setCurrentMusicTrack(trackName, resetBeat = true) {
  if (!MUSIC[trackName]) return;
  state.audio.track = trackName;
  if (resetBeat) state.audio.beat = 0;
  if (state.audio.context) {
    state.audio.nextNoteTime = state.audio.context.currentTime + 0.04;
  }
}

function setGameplayTrack(trackName) {
  if (!MUSIC[trackName] || trackName === "win" || trackName === "loss" || trackName === "menu") return;
  state.audio.gameTrack = trackName;
  state.audio.cueEndTime = 0;
  setCurrentMusicTrack(trackName);
}

function restoreGameplayMusic() {
  state.audio.cueEndTime = 0;
  setCurrentMusicTrack(state.audio.gameTrack || musicTrack.value || "heat");
}

function playMusicCue(trackName, beats = 0) {
  if (!MUSIC[trackName]) return;
  if (beats > 0 && (!state.audio.enabled || !state.audio.context)) return;
  setCurrentMusicTrack(trackName);
  if (!state.audio.context || beats <= 0) {
    state.audio.cueEndTime = 0;
    return;
  }
  state.audio.cueEndTime = state.audio.context.currentTime + (60 / MUSIC[trackName].bpm) * beats;
}

function setMusicEnabled(enabled) {
  ensureAudio();
  if (!state.audio.context) return;
  state.audio.enabled = enabled;
  musicToggle.setAttribute("aria-pressed", String(enabled));
  musicToggle.textContent = enabled ? "Music: On" : "Music: Off";
  if (enabled) {
    state.audio.context.resume();
    state.audio.nextNoteTime = state.audio.context.currentTime + 0.04;
    if (!startScreen.classList.contains("is-hidden")) setCurrentMusicTrack("menu");
  }
}

function playTone(note, time, duration, type, gainValue) {
  if (note === null || !state.audio.context || !state.audio.master) return;
  const context = state.audio.context;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(midiToHz(note), time);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  osc.connect(gain);
  gain.connect(state.audio.master);
  osc.start(time);
  osc.stop(time + duration + 0.02);
}

function playNoise(time, duration, gainValue) {
  if (!state.audio.context || !state.audio.master) return;
  const context = state.audio.context;
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  const noise = context.createBufferSource();
  const gain = context.createGain();
  noise.buffer = buffer;
  gain.gain.setValueAtTime(gainValue, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  noise.connect(gain);
  gain.connect(state.audio.master);
  noise.start(time);
}

function scheduleBeat(time) {
  const track = MUSIC[state.audio.track];
  const step = state.audio.beat;
  const leadNote = track.lead[step % track.lead.length];
  const bassNote = track.bass[step % track.bass.length];
  const arpBase = track.arp[step % track.arp.length];
  const arpNote = arpBase === null ? null : arpBase + (step % 8 >= 4 ? 12 : 0);
  const beatLength = 60 / track.bpm;
  const isCool = state.audio.track === "cool";
  const isHeat = state.audio.track === "heat";
  const isWin = state.audio.track === "win";
  const isLoss = state.audio.track === "loss";
  const isMenu = state.audio.track === "menu";
  const section = track.sections?.[Math.floor((step % 64) / 16)];

  playTone(bassNote, time, beatLength * (isLoss ? 1.05 : isMenu ? 0.58 : 0.72), "triangle", isLoss ? 0.095 : isMenu ? 0.09 : isCool ? 0.07 : 0.085);
  if (step % (isLoss || isCool ? 2 : 1) === 0) {
    playTone(
      leadNote,
      time + beatLength * 0.04,
      beatLength * (isLoss ? 0.72 : isWin ? 0.56 : 0.46),
      isLoss ? "triangle" : "square",
      isLoss ? 0.05 : isMenu ? 0.052 : isCool ? 0.045 : isWin ? 0.07 : 0.06
    );
  }
  if (isMenu && section && step % 8 === 4) {
    playTone(section.accent, time + beatLength * 0.2, beatLength * 0.2, "square", 0.035);
  }
  if (isHeat && section && step % 8 === 6) {
    playTone(section.accent, time + beatLength * 0.25, beatLength * 0.24, "square", 0.04);
  }
  if (isCool && section && step % 16 === 8) {
    playTone(section.chord[2], time + beatLength * 0.16, beatLength * 1.4, "triangle", 0.024);
  }
  if (!isLoss && (!isCool || step % 4 === 2)) {
    playTone(arpNote, time + beatLength * (isMenu ? 0.38 : 0.52), beatLength * 0.26, "square", isMenu ? 0.026 : isCool ? 0.025 : isWin ? 0.045 : 0.035);
  }
  if (isCool && section && step % 16 === 0) {
    for (const note of section.chord) {
      playTone(note, time + beatLength * 0.08, beatLength * 2.8, "triangle", 0.012);
    }
  }
  if (step % 4 === 0) playNoise(time, isLoss ? 0.06 : isMenu ? 0.03 : isCool ? 0.018 : 0.035, isLoss ? 0.014 : isMenu ? 0.022 : isCool ? 0.008 : 0.028);
  if (!isCool && !isLoss && step % 4 === 2) playNoise(time + beatLength * 0.5, isMenu ? 0.018 : 0.025, isWin ? 0.024 : isMenu ? 0.011 : 0.018);

  state.audio.beat = (state.audio.beat + 1) % 64;
}

function scheduleMusic() {
  if (!state.audio.enabled || !state.audio.context) return;
  const context = state.audio.context;
  if (state.audio.cueEndTime && context.currentTime >= state.audio.cueEndTime) {
    restoreGameplayMusic();
  }
  const track = MUSIC[state.audio.track];
  const beatLength = 60 / track.bpm;
  if (state.audio.nextNoteTime < context.currentTime - beatLength) {
    const missedBeats = Math.floor((context.currentTime - state.audio.nextNoteTime) / beatLength);
    state.audio.beat = (state.audio.beat + missedBeats) % 64;
    state.audio.nextNoteTime += missedBeats * beatLength;
  }
  while (state.audio.nextNoteTime < context.currentTime + 0.12) {
    scheduleBeat(state.audio.nextNoteTime);
    state.audio.nextNoteTime += beatLength;
  }
}

function speedForLevel() {
  const base = DIFFICULTY[difficultyEl.value].speed;
  return Math.max(180, base - (state.level - 1) * 18);
}

function drawBottle() {
  const w = canvas.width;
  const h = canvas.height;
  const wallInset = 6;
  const neckLeft = 118;
  const neckRight = 202;
  const shoulderY = 92;
  const neckY = 42;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#111514";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#7f8c80";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(neckLeft, 4);
  ctx.lineTo(neckLeft, neckY);
  ctx.lineTo(wallInset, shoulderY);
  ctx.lineTo(wallInset, h - 18);
  ctx.quadraticCurveTo(wallInset, h - 4, wallInset + 14, h - 4);
  ctx.lineTo(w - wallInset - 14, h - 4);
  ctx.quadraticCurveTo(w - wallInset, h - 4, w - wallInset, h - 18);
  ctx.lineTo(w - wallInset, shoulderY);
  ctx.lineTo(neckRight, neckY);
  ctx.lineTo(neckRight, 4);
  ctx.stroke();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = "#f4f0df";
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL, 0);
    ctx.lineTo(x * CELL, h);
    ctx.stroke();
  }
  for (let y = 0; y <= VISIBLE_ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL);
    ctx.lineTo(w, y * CELL);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (isDangerZoneOccupied()) {
    const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
    ctx.fillStyle = `rgba(228, 83, 83, ${0.08 + pulse * 0.09})`;
    ctx.fillRect(0, 0, w, 120);
    ctx.strokeStyle = `rgba(228, 83, 83, ${0.58 + pulse * 0.34})`;
    ctx.lineWidth = 2 + pulse;
    ctx.setLineDash([8, 7]);
    ctx.strokeRect(neckLeft + 4, 4, neckRight - neckLeft - 8, 40);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(244, 240, 223, ${0.48 + pulse * 0.28})`;
    ctx.font = "700 12px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("NECK", w / 2, 34);
  }
}

function drawCell(x, y, cell, alpha = 1) {
  const px = x * CELL;
  const py = boardToCanvasY(y);
  ctx.save();
  ctx.globalAlpha = alpha;
  const color = COLOR_HEX[cell.color];
  const dark = DARK_HEX[cell.color];
  if (cell.type === "virus") {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.roundRect(px + 6, py + 7, 28, 27, 9);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px + 20, py + 20, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111514";
    ctx.fillRect(px + 12, py + 15, 5, 5);
    ctx.fillRect(px + 23, py + 15, 5, 5);
    ctx.fillRect(px + 15, py + 26, 10, 3);
    ctx.fillStyle = "#f4f0df";
    ctx.fillRect(px + 13, py + 16, 2, 2);
    ctx.fillRect(px + 24, py + 16, 2, 2);
  } else {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.roundRect(px + 4, py + 6, 32, 28, 13);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(px + 7, py + 9, 26, 22, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.36)";
    ctx.fillRect(px + 12, py + 12, 10, 4);
  }
  ctx.restore();
}

function draw() {
  drawBottle();
  for (const [key, flash] of state.clearFlash) {
    const [x, y] = key.split(",").map(Number);
    drawClearFlash(x, y, flash);
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cell = state.board[y][x];
      if (cell && cell.type === "virus") drawCell(x, y, cell);
    }
  }
  drawBoardCapsules();
  if (state.active) {
    drawCapsulePiece(landingCells(), 0.22, true);
    drawCapsulePiece(cellsFor(), 1, false, lockProgress());
    drawLockMeter();
  }
  drawMessage();
}

function lockProgress() {
  if (!state.active || activeCanFall()) return 0;
  return Math.max(0, Math.min(1, state.lockTimer / LOCK_DELAY));
}

function drawBoardCapsules() {
  const visited = new Set();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const key = `${x},${y}`;
      const cell = state.board[y][x];
      if (!cell || cell.type !== "capsule" || visited.has(key)) continue;
      const neighbor = pairNeighbor(x, y);
      if (neighbor && !visited.has(`${neighbor.x},${neighbor.y}`)) {
        visited.add(key);
        visited.add(`${neighbor.x},${neighbor.y}`);
        drawCapsulePiece([
          { x, y, color: cell.color },
          { x: neighbor.x, y: neighbor.y, color: neighbor.cell.color }
        ], 1, false);
      } else {
        visited.add(key);
        drawCapsulePiece([{ x, y, color: cell.color }], 1, false);
      }
    }
  }
}

function pairNeighbor(x, y) {
  const cell = state.board[y][x];
  if (!cell?.pairId) return null;
  for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
    const neighbor = state.board[ny][nx];
    if (neighbor?.type === "capsule" && neighbor.pairId === cell.pairId) {
      return { x: nx, y: ny, cell: neighbor };
    }
  }
  return null;
}

function drawCapsulePiece(parts, alpha = 1, ghost = false, restProgress = 0) {
  const visible = parts.filter((part) => boardToCanvasY(part.y) > -CELL);
  if (!visible.length) return;
  const minX = Math.min(...visible.map((part) => part.x));
  const minY = Math.min(...visible.map((part) => part.y));
  const maxX = Math.max(...visible.map((part) => part.x));
  const maxY = Math.max(...visible.map((part) => part.y));
  const px = minX * CELL + 4;
  const settle = restProgress > 0 ? Math.sin(restProgress * Math.PI) * 2 : 0;
  const py = boardToCanvasY(minY) + 6 + settle;
  const width = (maxX - minX + 1) * CELL - 8;
  const height = (maxY - minY + 1) * CELL - 12 - settle;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (ghost) {
    ctx.strokeStyle = "#f4f0df";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.roundRect(px + 3, py + 3, width - 6, height - 6, 12);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.fillStyle = "#151817";
  ctx.beginPath();
  ctx.roundRect(px, py, width, height, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(px + 3, py + 3, width - 6, height - 6, 11);
  ctx.clip();
  for (const part of visible) {
    ctx.fillStyle = COLOR_HEX[part.color];
    ctx.fillRect(part.x * CELL + 7, boardToCanvasY(part.y) + 9 + settle, 26, Math.max(18, 22 - settle));
    ctx.fillStyle = "rgba(255,255,255,0.36)";
    ctx.fillRect(part.x * CELL + 12, boardToCanvasY(part.y) + 12 + settle, 10, 4);
  }
  ctx.restore();

  if (visible.length === 2) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(17, 20, 19, 0.52)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (minY === maxY) {
      ctx.moveTo((minX + 1) * CELL, boardToCanvasY(minY) + 10);
      ctx.lineTo((minX + 1) * CELL, boardToCanvasY(minY) + 30);
    } else {
      ctx.moveTo(minX * CELL + 10, boardToCanvasY(minY + 1));
      ctx.lineTo(minX * CELL + 30, boardToCanvasY(minY + 1));
    }
    ctx.stroke();
    ctx.restore();
  }
}

function drawLockMeter() {
  const progress = lockProgress();
  if (progress <= 0) return;
  const parts = cellsFor().filter((part) => boardToCanvasY(part.y) > -CELL);
  if (!parts.length) return;
  const minX = Math.min(...parts.map((part) => part.x));
  const maxX = Math.max(...parts.map((part) => part.x));
  const maxY = Math.max(...parts.map((part) => part.y));
  const x = minX * CELL + 8;
  const y = Math.min(VISIBLE_ROWS * CELL - 7, boardToCanvasY(maxY + 1) - 6);
  const width = (maxX - minX + 1) * CELL - 16;
  ctx.save();
  ctx.globalAlpha = 0.42 + progress * 0.3;
  ctx.fillStyle = "rgba(244, 240, 223, 0.24)";
  ctx.fillRect(x, y, width, 3);
  ctx.fillStyle = "#f2ca52";
  ctx.fillRect(x, y, width * progress, 3);
  ctx.restore();
}

function drawClearFlash(x, y, flash) {
  const color = flash?.color || flash || "yellow";
  const age = performance.now() - (flash?.started || performance.now());
  const progress = Math.max(0, Math.min(1, age / 380));
  const pop = Math.sin(progress * Math.PI);
  const size = 30 - progress * 18 + pop * 8;
  const alpha = Math.max(0, 1 - progress);
  const px = x * CELL;
  const py = boardToCanvasY(y);
  ctx.save();
  ctx.globalAlpha = 0.7 * alpha;
  ctx.fillStyle = COLOR_HEX[color] || COLOR_HEX.yellow;
  ctx.beginPath();
  ctx.roundRect(px + 20 - size / 2, py + 20 - size / 2, size, size, Math.max(6, size * 0.32));
  ctx.fill();
  ctx.globalAlpha = 0.85 * alpha;
  ctx.strokeStyle = "rgba(244, 240, 223, 0.92)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawMessage() {
  if (state.messageTimer <= 0 || !state.message) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, state.messageTimer / 240);
  ctx.fillStyle = "rgba(12, 15, 14, 0.78)";
  ctx.beginPath();
  ctx.roundRect(54, 244, 212, 52, 8);
  ctx.fill();
  ctx.fillStyle = "#f4f0df";
  ctx.font = "700 24px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(state.message.toUpperCase(), 160, 278);
  ctx.restore();
}

function drawMenuCapsule(targetCtx, x, y, width, height, leftColor, rightColor, rotation = 0, alpha = 1) {
  const radius = height / 2;
  targetCtx.save();
  targetCtx.globalAlpha = alpha;
  targetCtx.translate(x + width / 2, y + height / 2);
  targetCtx.rotate(rotation);
  targetCtx.fillStyle = "rgba(0,0,0,0.24)";
  targetCtx.beginPath();
  targetCtx.ellipse(2, height / 2 + 3, width * 0.44, height * 0.18, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.translate(-width / 2, -height / 2);
  targetCtx.fillStyle = "#121514";
  targetCtx.beginPath();
  targetCtx.roundRect(0, 0, width, height, radius);
  targetCtx.fill();
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.roundRect(2, 2, width - 4, height - 4, Math.max(3, radius - 2));
  targetCtx.clip();
  targetCtx.fillStyle = COLOR_HEX[leftColor];
  targetCtx.fillRect(2, 2, width / 2 - 2, height - 4);
  targetCtx.fillStyle = COLOR_HEX[rightColor];
  targetCtx.fillRect(width / 2, 2, width / 2 - 2, height - 4);
  targetCtx.restore();
  targetCtx.strokeStyle = "rgba(17, 20, 19, 0.42)";
  targetCtx.lineWidth = 1.5;
  targetCtx.beginPath();
  targetCtx.moveTo(width / 2, 4);
  targetCtx.lineTo(width / 2, height - 4);
  targetCtx.stroke();
  targetCtx.fillStyle = "rgba(255,255,255,0.34)";
  targetCtx.fillRect(width * 0.18, height * 0.24, width * 0.17, 2);
  targetCtx.fillRect(width * 0.64, height * 0.24, width * 0.17, 2);
  targetCtx.restore();
}

function drawMenuJar(targetCtx, x, y, width, height, time) {
  const wobble = Math.sin(time * 0.0017) * 1.4;
  targetCtx.save();
  targetCtx.translate(0, wobble);

  targetCtx.fillStyle = "rgba(7, 10, 9, 0.32)";
  targetCtx.beginPath();
  targetCtx.ellipse(x + width / 2, y + height + 6, width * 0.42, 7, 0, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = "#3c4740";
  targetCtx.fillRect(x + width * 0.27, y + 8, width * 0.46, 10);
  targetCtx.fillStyle = "#232a26";
  targetCtx.fillRect(x + width * 0.31, y + 1, width * 0.38, 9);

  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.roundRect(x + 9, y + 16, width - 18, height - 20, 17);
  targetCtx.clip();
  targetCtx.fillStyle = "rgba(79, 142, 219, 0.1)";
  targetCtx.fillRect(x + 9, y + 16, width - 18, height - 20);
  targetCtx.fillStyle = "rgba(242, 202, 82, 0.05)";
  targetCtx.fillRect(x + 9, y + height * 0.57, width - 18, height * 0.26);

  const pills = [
    [18, 41, "red", "yellow", -0.48],
    [47, 38, "blue", "red", 0.2],
    [23, 66, "yellow", "blue", 0.52],
    [58, 70, "red", "red", -0.18],
    [35, 93, "blue", "yellow", -0.82],
    [65, 101, "yellow", "red", 0.62],
    [18, 119, "blue", "red", 0.14],
    [49, 124, "yellow", "blue", -0.28]
  ];
  pills.forEach((pill, index) => {
    const bob = Math.sin(time * 0.002 + index * 1.7) * 1.3;
    drawMenuCapsule(targetCtx, x + pill[0], y + pill[1] + bob, 38, 16, pill[2], pill[3], pill[4], 0.9);
  });
  targetCtx.restore();

  targetCtx.strokeStyle = "rgba(244, 240, 223, 0.5)";
  targetCtx.lineWidth = 2;
  targetCtx.beginPath();
  targetCtx.roundRect(x + 9, y + 16, width - 18, height - 20, 17);
  targetCtx.stroke();
  targetCtx.strokeStyle = "rgba(244, 240, 223, 0.2)";
  targetCtx.lineWidth = 5;
  targetCtx.beginPath();
  targetCtx.moveTo(x + 24, y + 28);
  targetCtx.lineTo(x + 24, y + height - 27);
  targetCtx.stroke();
  targetCtx.restore();
}

function drawMenuGoblin(targetCtx, x, y, time) {
  const blink = Math.sin(time * 0.004) > 0.96;
  const brow = Math.sin(time * 0.002) * 2;
  const handY = Math.sin(time * 0.003) * 2;

  targetCtx.save();
  targetCtx.translate(x, y);
  targetCtx.fillStyle = "rgba(0,0,0,0.28)";
  targetCtx.beginPath();
  targetCtx.ellipse(42, 77, 42, 8, 0, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = "#f4f0df";
  targetCtx.beginPath();
  targetCtx.moveTo(24, 55);
  targetCtx.lineTo(7, 128);
  targetCtx.lineTo(78, 128);
  targetCtx.lineTo(62, 55);
  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.fillStyle = "#d9d5c6";
  targetCtx.beginPath();
  targetCtx.moveTo(43, 64);
  targetCtx.lineTo(31, 128);
  targetCtx.lineTo(54, 128);
  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.fillStyle = "#e45353";
  targetCtx.fillRect(55, 79, 12, 12);
  targetCtx.fillStyle = "#f4f0df";
  targetCtx.fillRect(59, 81, 4, 8);
  targetCtx.fillRect(57, 83, 8, 4);

  targetCtx.strokeStyle = "#c4c0b2";
  targetCtx.lineWidth = 7;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(64, 77);
  targetCtx.quadraticCurveTo(91, 75, 105, 58 + handY);
  targetCtx.stroke();
  targetCtx.fillStyle = "#78a66a";
  targetCtx.beginPath();
  targetCtx.arc(107, 57 + handY, 6, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.strokeStyle = "#c4c0b2";
  targetCtx.beginPath();
  targetCtx.moveTo(22, 77);
  targetCtx.quadraticCurveTo(10, 85, 19, 99 + handY);
  targetCtx.stroke();
  targetCtx.fillStyle = "#78a66a";
  targetCtx.beginPath();
  targetCtx.arc(20, 100 + handY, 6, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = "#547f50";
  targetCtx.beginPath();
  targetCtx.moveTo(16, 39);
  targetCtx.lineTo(-4, 28);
  targetCtx.lineTo(13, 52);
  targetCtx.closePath();
  targetCtx.fill();
  targetCtx.beginPath();
  targetCtx.moveTo(70, 39);
  targetCtx.lineTo(95, 25);
  targetCtx.lineTo(74, 52);
  targetCtx.closePath();
  targetCtx.fill();

  targetCtx.fillStyle = "#78a66a";
  targetCtx.beginPath();
  targetCtx.roundRect(13, 23, 62, 45, 18);
  targetCtx.fill();
  targetCtx.fillStyle = "#5d8a56";
  targetCtx.beginPath();
  targetCtx.roundRect(24, 9, 39, 24, 11);
  targetCtx.fill();
  targetCtx.fillStyle = "#252b28";
  targetCtx.fillRect(21, 20, 49, 5);
  targetCtx.fillStyle = "#f4f0df";
  targetCtx.fillRect(28, 6, 32, 6);

  targetCtx.strokeStyle = "#253128";
  targetCtx.lineWidth = 3;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(26, 35 + brow);
  targetCtx.lineTo(37, 32);
  targetCtx.moveTo(50, 32);
  targetCtx.lineTo(62, 37 + brow);
  targetCtx.stroke();

  targetCtx.fillStyle = "#121514";
  if (blink) {
    targetCtx.fillRect(29, 41, 8, 2);
    targetCtx.fillRect(52, 41, 8, 2);
  } else {
    targetCtx.fillRect(30, 39, 6, 7);
    targetCtx.fillRect(53, 39, 6, 7);
  }
  targetCtx.strokeStyle = "#121514";
  targetCtx.lineWidth = 2;
  targetCtx.beginPath();
  targetCtx.arc(45, 55, 7, 0.18, Math.PI - 0.22);
  targetCtx.stroke();
  targetCtx.fillStyle = "#121514";
  targetCtx.font = "700 24px Segoe UI, sans-serif";
  targetCtx.fillText("?", 80, 17 + Math.sin(time * 0.003) * 2);
  targetCtx.restore();
}

function drawMenuArt(time = performance.now()) {
  if (!menuArtCtx) return;
  const width = menuArtCanvas.width;
  const height = menuArtCanvas.height;
  menuArtCtx.clearRect(0, 0, width, height);
  menuArtCtx.fillStyle = "#171b19";
  menuArtCtx.fillRect(0, 0, width, height);

  menuArtCtx.strokeStyle = "rgba(244, 240, 223, 0.07)";
  menuArtCtx.lineWidth = 1;
  for (let x = 16; x < width; x += 24) {
    menuArtCtx.beginPath();
    menuArtCtx.moveTo(x, 0);
    menuArtCtx.lineTo(x, height);
    menuArtCtx.stroke();
  }
  for (let y = 18; y < height; y += 24) {
    menuArtCtx.beginPath();
    menuArtCtx.moveTo(0, y);
    menuArtCtx.lineTo(width, y);
    menuArtCtx.stroke();
  }

  menuArtCtx.fillStyle = "rgba(242, 202, 82, 0.07)";
  menuArtCtx.fillRect(0, height - 44, width, 44);
  menuArtCtx.fillStyle = "#252b28";
  menuArtCtx.fillRect(0, height - 32, width, 6);
  drawMenuJar(menuArtCtx, 179, 35, 96, 145, time);
  drawMenuGoblin(menuArtCtx, 37, 55, time);
  drawMenuCapsule(menuArtCtx, 132, 159 + Math.sin(time * 0.003) * 1.4, 42, 17, "red", "blue", -0.12, 0.88);
  drawMenuCapsule(menuArtCtx, 111, 175, 34, 14, "yellow", "red", 0.28, 0.7);

  menuArtCtx.fillStyle = "rgba(244, 240, 223, 0.62)";
  menuArtCtx.font = "700 9px Segoe UI, sans-serif";
  menuArtCtx.fillText("RX?", 202, 56);
}

function drawNext(time = performance.now()) {
  drawNextCapsule(nextCtx, nextCanvas.width, nextCanvas.height, time);
  drawNextCapsule(nextMobileCtx, nextMobileCanvas.width, nextMobileCanvas.height, time);
  drawVirusWindow(virusWindowCtx, virusWindowCanvas.width, virusWindowCanvas.height, time);
  drawVirusWindow(virusMobileCtx, virusMobileCanvas.width, virusMobileCanvas.height, time);
  const description = state.next
    ? `Next capsule: ${state.next.a} and ${state.next.b}.`
    : "No next capsule.";
  const counts = virusColorCounts();
  const virusDescription = `Dx microbe trio. Red ${counts.red}, yellow ${counts.yellow}, blue ${counts.blue}.`;
  nextCanvas.setAttribute("aria-label", description);
  nextMobileCanvas.setAttribute("aria-label", description);
  virusWindowCanvas.setAttribute("aria-label", virusDescription);
  virusMobileCanvas.setAttribute("aria-label", virusDescription);
}

function previewDance(color, time, excited) {
  const speed = excited ? 1.75 : 1;
  const t = time * 0.001 * speed;
  if (color === "red") {
    const stomp = Math.abs(Math.sin(t * 5.4));
    return {
      x: 0,
      y: -stomp * (excited ? 7 : 4),
      rotation: Math.sin(t * 2.7) * 0.035,
      scaleX: 1 + (1 - stomp) * 0.08,
      scaleY: 1 - (1 - stomp) * 0.07
    };
  }
  if (color === "yellow") {
    return {
      x: Math.sin(t * 3.2) * (excited ? 5 : 3),
      y: -2 - Math.abs(Math.sin(t * 3.2)) * 2,
      rotation: Math.sin(t * 3.2) * (excited ? 0.3 : 0.18),
      scaleX: 1,
      scaleY: 1
    };
  }
  return {
    x: Math.sin(t * 2.4) * (excited ? 7 : 4),
    y: Math.sin(t * 4.8) * 1.2,
    rotation: Math.sin(t * 2.4) * 0.06,
    scaleX: 1 + Math.sin(t * 4.8) * 0.04,
    scaleY: 1 - Math.sin(t * 4.8) * 0.04
  };
}

function drawPreviewVirus(targetCtx, x, y, color, time, excited, shocked = false) {
  const motion = previewDance(color, time, excited);
  const fill = COLOR_HEX[color];
  const dark = DARK_HEX[color];
  targetCtx.save();
  targetCtx.translate(x + motion.x, y + motion.y);
  targetCtx.rotate(motion.rotation);
  targetCtx.scale(motion.scaleX, motion.scaleY);

  targetCtx.fillStyle = "rgba(0,0,0,0.28)";
  targetCtx.beginPath();
  targetCtx.ellipse(0, 15, 15, 4, 0, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = dark;
  if (color === "yellow") {
    targetCtx.beginPath();
    targetCtx.moveTo(-5, -16);
    targetCtx.lineTo(-9, -22);
    targetCtx.lineTo(-2, -18);
    targetCtx.moveTo(5, -16);
    targetCtx.lineTo(9, -22);
    targetCtx.lineTo(2, -18);
    targetCtx.lineWidth = 3;
    targetCtx.strokeStyle = dark;
    targetCtx.stroke();
  }
  targetCtx.beginPath();
  if (color === "blue") {
    targetCtx.roundRect(-18, -11, 36, 25, 10);
  } else if (color === "yellow") {
    targetCtx.roundRect(-13, -17, 26, 31, 11);
  } else {
    targetCtx.roundRect(-16, -14, 32, 28, 12);
  }
  targetCtx.fill();

  targetCtx.fillStyle = fill;
  targetCtx.beginPath();
  if (color === "blue") {
    targetCtx.roundRect(-15, -9, 30, 20, 8);
  } else if (color === "yellow") {
    targetCtx.roundRect(-10, -14, 20, 25, 9);
  } else {
    targetCtx.roundRect(-13, -11, 26, 22, 10);
  }
  targetCtx.fill();

  targetCtx.strokeStyle = dark;
  targetCtx.lineWidth = 3;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  if (color === "red") {
    targetCtx.moveTo(-13, 6);
    targetCtx.lineTo(-19, 10);
    targetCtx.moveTo(13, 6);
    targetCtx.lineTo(19, 10);
  } else if (color === "yellow") {
    targetCtx.moveTo(-9, 2);
    targetCtx.lineTo(-17, -3);
    targetCtx.moveTo(9, 2);
    targetCtx.lineTo(17, -3);
  } else {
    targetCtx.moveTo(-13, 5);
    targetCtx.lineTo(-20, 5);
    targetCtx.moveTo(13, 5);
    targetCtx.lineTo(20, 5);
  }
  targetCtx.stroke();

  targetCtx.fillStyle = "#111514";
  if (shocked) {
    targetCtx.fillRect(-9, -6, 5, 6);
    targetCtx.fillRect(4, -6, 5, 6);
    targetCtx.beginPath();
    targetCtx.arc(0, 6, excited ? 5 : 4, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.fillStyle = "rgba(244, 240, 223, 0.58)";
    targetCtx.fillRect(-8, -5, 2, 2);
    targetCtx.fillRect(5, -5, 2, 2);
  } else if (color === "red") {
    targetCtx.fillRect(-9, -5, 5, excited ? 6 : 4);
    targetCtx.fillRect(4, -5, 5, excited ? 6 : 4);
    targetCtx.fillRect(-5, 5, 10, 3);
  } else if (color === "yellow") {
    targetCtx.save();
    targetCtx.translate(0, excited ? -1 : 0);
    targetCtx.rotate(-0.12);
    targetCtx.fillRect(-8, -5, 4, 5);
    targetCtx.fillRect(4, -5, 4, 5);
    targetCtx.restore();
    targetCtx.beginPath();
    targetCtx.arc(0, 5, excited ? 4 : 2, 0, Math.PI * 2);
    targetCtx.fill();
  } else {
    targetCtx.fillRect(-10, -3, 7, 2);
    targetCtx.fillRect(3, -3, 7, 2);
    targetCtx.fillRect(-4, 5, 8, 2);
  }

  targetCtx.restore();
}

function colorRgba(color, alpha) {
  const [r, g, b] = COLOR_RGB[color] || [244, 240, 223];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawDxPoof(targetCtx, color, progress, time) {
  const fade = 1 - progress;
  targetCtx.save();
  targetCtx.lineWidth = 2;
  targetCtx.strokeStyle = `rgba(244, 240, 223, ${0.38 * fade})`;
  targetCtx.beginPath();
  targetCtx.arc(0, 0, 16 + progress * 13, 0, Math.PI * 2);
  targetCtx.stroke();
  for (let i = 0; i < 9; i++) {
    const angle = (Math.PI * 2 * i) / 9 + Math.sin(time * 0.006 + i) * 0.18;
    const distance = 10 + progress * 25 + Math.sin(time * 0.01 + i * 2.1) * 1.5;
    const size = 1.8 + (i % 3) * 0.7 + (1 - progress) * 1.4;
    targetCtx.fillStyle = i % 3 === 0 ? colorRgba(color, 0.34 * fade) : `rgba(244, 240, 223, ${0.28 * fade})`;
    targetCtx.beginPath();
    targetCtx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance * 0.68, size, 0, Math.PI * 2);
    targetCtx.fill();
  }
  targetCtx.restore();
}

function dxSlot(rank, width, height) {
  const slots = [
    { x: width * 0.52, y: height * 0.72, scale: 1.16, alpha: 1, layer: 2 },
    { x: width * 0.27, y: height * 0.64, scale: 0.9, alpha: 0.86, layer: 1 },
    { x: width * 0.74, y: height * 0.52, scale: 0.68, alpha: 0.58, layer: 0 }
  ];
  return slots[rank] || slots[2];
}

function drawVirusWindow(targetCtx, width, height, time) {
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.fillStyle = "#171b19";
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.strokeStyle = "rgba(127, 140, 128, 0.36)";
  targetCtx.lineWidth = 1;
  targetCtx.strokeRect(0.5, 0.5, width - 1, height - 1);
  targetCtx.fillStyle = "rgba(242, 202, 82, 0.09)";
  targetCtx.fillRect(0, height - 16, width, 16);
  targetCtx.strokeStyle = "rgba(244, 240, 223, 0.08)";
  for (let x = 10; x < width; x += 18) {
    targetCtx.beginPath();
    targetCtx.moveTo(x, 0);
    targetCtx.lineTo(x, height);
    targetCtx.stroke();
  }
  const counts = virusColorCounts();
  retireDxExits(time);
  syncDxTrio(counts, time, !state.resolving);
  const swapProgress = easeSwap((time - state.dxTrio.transitionStart) / DX_SWAP_DURATION);
  const excited = state.messageTimer > 0 || state.audio.track === "win";
  const baseScale = Math.min(width / 138, height / 68);
  const entries = COLORS.filter((color) => state.dxTrio.visible[color] || state.dxTrio.exiting[color]).map((color) => {
    const exit = state.dxTrio.exiting[color];
    if (exit) {
      const exitAge = Math.max(0, time - exit.start);
      const exitProgress = Math.max(0, Math.min(1, (exitAge - DX_POOF_START) / (DX_EXIT_DURATION - DX_POOF_START)));
      const slot = dxSlot(exit.slot, width, height);
      return {
        color,
        moved: true,
        exiting: true,
        exitProgress,
        shocked: exitAge < DX_POOF_START,
        layer: slot.layer + 3,
        x: slot.x + Math.sin(time * 0.04) * (exitProgress ? 0 : 1.5),
        y: slot.y - exitProgress * 5,
        scale: slot.scale * (1 + exitProgress * 0.08),
        alpha: slot.alpha * (1 - exitProgress)
      };
    }
    const fromSlot = dxSlot(state.dxTrio.previousSlots[color] ?? state.dxTrio.slots[color] ?? 2, width, height);
    const toSlot = dxSlot(state.dxTrio.slots[color] ?? 2, width, height);
    return {
      color,
      moved: (state.dxTrio.previousSlots[color] ?? state.dxTrio.slots[color]) !== state.dxTrio.slots[color],
      exiting: false,
      exitProgress: 0,
      shocked: false,
      layer: toSlot.layer,
      x: lerp(fromSlot.x, toSlot.x, swapProgress),
      y: lerp(fromSlot.y, toSlot.y, swapProgress),
      scale: lerp(fromSlot.scale, toSlot.scale, swapProgress),
      alpha: lerp(fromSlot.alpha, toSlot.alpha, swapProgress)
    };
  }).sort((a, b) => a.layer - b.layer || COLORS.indexOf(a.color) - COLORS.indexOf(b.color));

  entries.forEach((entry, index) => {
    targetCtx.save();
    targetCtx.translate(entry.x, entry.y);
    targetCtx.globalAlpha = Math.max(0, entry.alpha);
    targetCtx.scale(baseScale * entry.scale, baseScale * entry.scale);
    drawPreviewVirus(targetCtx, 0, 0, entry.color, time + index * 220, excited, entry.shocked || (entry.moved && time < state.dxTrio.shockUntil));
    if (entry.exiting && entry.exitProgress > 0) drawDxPoof(targetCtx, entry.color, entry.exitProgress, time + index * 37);
    targetCtx.restore();
  });

  targetCtx.font = "700 9px Segoe UI, sans-serif";
  targetCtx.fillStyle = "rgba(244, 240, 223, 0.58)";
  targetCtx.fillText("Dx", 7, 13);
}

function drawNextCapsule(targetCtx, width, height, time) {
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.fillStyle = "#171b19";
  targetCtx.fillRect(0, 0, width, height);
  targetCtx.strokeStyle = "rgba(127, 140, 128, 0.36)";
  targetCtx.lineWidth = 1;
  targetCtx.strokeRect(0.5, 0.5, width - 1, height - 1);
  if (!state.next) return;
  const capsuleWidth = Math.min(72, width - 20);
  const capsuleHeight = Math.max(18, Math.min(28, capsuleWidth * 0.38));
  const x = (width - capsuleWidth) / 2;
  const y = (height - capsuleHeight) / 2 + Math.sin(time * 0.003) * 1.5;
  const radius = capsuleHeight / 2;
  targetCtx.fillStyle = "#151817";
  targetCtx.beginPath();
  targetCtx.roundRect(x, y, capsuleWidth, capsuleHeight, radius);
  targetCtx.fill();
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.roundRect(x + 2, y + 2, capsuleWidth - 4, capsuleHeight - 4, 9);
  targetCtx.clip();
  targetCtx.fillStyle = COLOR_HEX[state.next.a];
  targetCtx.fillRect(x + 2, y + 2, capsuleWidth / 2 - 2, capsuleHeight - 4);
  targetCtx.fillStyle = COLOR_HEX[state.next.b];
  targetCtx.fillRect(x + capsuleWidth / 2, y + 2, capsuleWidth / 2 - 2, capsuleHeight - 4);
  targetCtx.restore();
  targetCtx.strokeStyle = "rgba(17, 20, 19, 0.52)";
  targetCtx.lineWidth = 2;
  targetCtx.beginPath();
  targetCtx.moveTo(x + capsuleWidth / 2, y + 4);
  targetCtx.lineTo(x + capsuleWidth / 2, y + capsuleHeight - 4);
  targetCtx.stroke();
  targetCtx.fillStyle = "rgba(255,255,255,0.36)";
  targetCtx.fillRect(x + capsuleWidth * 0.14, y + capsuleHeight * 0.22, capsuleWidth * 0.15, 3);
  targetCtx.fillRect(x + capsuleWidth * 0.64, y + capsuleHeight * 0.22, capsuleWidth * 0.15, 3);
}

function showOverlay(title, buttonText, menuText = "Menu") {
  overlayTitle.textContent = title;
  overlayButton.textContent = buttonText;
  overlayMenuButton.textContent = menuText;
  overlay.classList.remove("is-hidden");
}

function hideOverlay() {
  overlay.classList.add("is-hidden");
}

function setPaused(paused) {
  if (!state.started || state.gameOver || cutscene.classList.contains("is-hidden") === false) return;
  state.paused = paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  mobilePauseButton.textContent = paused ? "Resume" : "Pause";
  if (paused) showOverlay("Paused", "Resume", "Menu");
  else hideOverlay();
}

function showCutscene() {
  cutscene.classList.remove("is-hidden");
  state.cutsceneFrame = 0;
  drawCutscene();
}

function drawCutscene() {
  if (cutscene.classList.contains("is-hidden")) return;
  const f = state.cutsceneFrame++;
  cutCtx.clearRect(0, 0, 720, 360);
  cutCtx.fillStyle = "#18201b";
  cutCtx.fillRect(0, 0, 720, 360);
  cutCtx.fillStyle = "#6c5134";
  cutCtx.fillRect(95, 204, 530, 16);
  cutCtx.fillRect(420, 178, 26, 112);
  cutCtx.fillStyle = "#67a36a";
  cutCtx.beginPath();
  cutCtx.arc(430, 136, 86, 0, Math.PI * 2);
  cutCtx.fill();
  const labels = ["red", "yellow", "blue"];
  labels.forEach((color, i) => {
    const x = 270 + i * 78;
    const y = 174 + Math.sin((f + i * 20) / 18) * 5;
    cutCtx.fillStyle = COLOR_HEX[color];
    cutCtx.beginPath();
    cutCtx.arc(x, y, 23, 0, Math.PI * 2);
    cutCtx.fill();
    cutCtx.fillStyle = "#101413";
    cutCtx.fillRect(x - 8, y - 4, 5, 5);
    cutCtx.fillRect(x + 4, y - 4, 5, 5);
  });
  const flyX = 760 - (f * 4) % 860;
  cutCtx.fillStyle = "#f4f0df";
  cutCtx.beginPath();
  cutCtx.ellipse(flyX, 76, 34, 13, -0.18, 0, Math.PI * 2);
  cutCtx.fill();
  cutCtx.fillStyle = "#f2ca52";
  cutCtx.fillRect(flyX - 6, 63, 18, 5);
  cutCtx.fillStyle = "#f4f0df";
  cutCtx.font = "700 28px Segoe UI, sans-serif";
  cutCtx.fillText(`Level ${state.level - 1} clear`, 34, 320);
  requestAnimationFrame(drawCutscene);
}

function continueAfterCutscene() {
  cutscene.classList.add("is-hidden");
  restoreGameplayMusic();
  state.board = emptyBoard();
  resetDxTrio();
  seedViruses();
  spawn();
  updateHud();
}

function handleAction(action) {
  if (state.demo) return;
  switch (action) {
    case "left":
      tryMove(-1, 0);
      break;
    case "right":
      tryMove(1, 0);
      break;
    case "down":
      if (tryMove(0, 1)) state.score += 1;
      else if (state.active && state.lockTimer >= LOCK_DELAY) lockPiece();
      break;
    case "drop":
      hardDrop();
      break;
    case "rotate-cw":
      queueRotation(1);
      break;
    case "rotate-ccw":
      queueRotation(-1);
      break;
  }
  updateHud();
  draw();
}

function gameLoop(time) {
  const delta = time - state.lastTime;
  state.lastTime = time;
  scheduleMusic();
  if (!startScreen.classList.contains("is-hidden") && time - menuArtFrameTime >= 80) {
    menuArtFrameTime = time;
    drawMenuArt(time);
  }
  if (time - previewFrameTime >= 50) {
    previewFrameTime = time;
    drawNext(time);
  }
  if (state.messageTimer > 0) {
    state.messageTimer = Math.max(0, state.messageTimer - delta);
    if (state.messageTimer === 0) state.clearFlash.clear();
  }
  if ((state.started || state.demo) && !state.paused && !state.gameOver && !state.resolving && cutscene.classList.contains("is-hidden")) {
    updateDemoAutoplay(delta);
    updateHorizontalInput(delta);
    updateRotationBuffer(delta);
    if (state.active && !activeCanFall()) {
      state.lockTimer += delta;
    } else {
      state.lockTimer = 0;
    }
    if (state.openingGraceTimer > 0) {
      state.openingGraceTimer = Math.max(0, state.openingGraceTimer - delta);
    } else {
      state.dropTimer += delta;
      if (state.dropTimer >= speedForLevel()) {
        state.dropTimer = 0;
        tickDrop();
      }
    }
  }
  draw();
  requestAnimationFrame(gameLoop);
}

document.addEventListener("keydown", (event) => {
  const keyMap = {
    ArrowLeft: "left",
    a: "left",
    A: "left",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowDown: "down",
    s: "down",
    S: "down",
    " ": "drop",
    ArrowUp: "rotate-cw",
    w: "rotate-cw",
    W: "rotate-cw",
    x: "rotate-cw",
    X: "rotate-cw",
    z: "rotate-ccw",
    Z: "rotate-ccw"
  };
  if (event.key === "p" || event.key === "P") {
    setPaused(!state.paused);
    return;
  }
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    event.preventDefault();
    if (!event.repeat) setHorizontalInput(-1, true);
    updateHud();
    draw();
    return;
  }
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    event.preventDefault();
    if (!event.repeat) setHorizontalInput(1, true);
    updateHud();
    draw();
    return;
  }
  if (event.repeat && event.key !== "ArrowDown" && event.key !== "s" && event.key !== "S") return;
  const action = keyMap[event.key];
  if (action) {
    event.preventDefault();
    handleAction(action);
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
    setHorizontalInput(-1, false);
  }
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
    setHorizontalInput(1, false);
  }
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});

boardWrap.addEventListener("pointerdown", beginBoardGesture);
boardWrap.addEventListener("pointermove", moveBoardGesture);
boardWrap.addEventListener("pointerup", endBoardGesture);
boardWrap.addEventListener("pointercancel", cancelBoardGesture);

newGameButton.addEventListener("click", () => startGame(true));
pauseButton.addEventListener("click", () => setPaused(!state.paused));
mobilePauseButton.addEventListener("click", () => setPaused(!state.paused));
difficultyEl.addEventListener("change", () => {
  startDifficulty.value = difficultyEl.value;
  if (state.started) startGame(true);
});
startButton.addEventListener("click", startFromMenu);
startDifficulty.addEventListener("change", () => {
  difficultyEl.value = startDifficulty.value;
});
startMusic.addEventListener("change", () => {
  if (startMusic.value === "off") {
    setMusicEnabled(false);
    return;
  }
  musicTrack.value = startMusic.value;
  setGameplayTrack(startMusic.value);
  setMusicEnabled(true);
});
musicToggle.addEventListener("click", () => setMusicEnabled(!state.audio.enabled));
musicTrack.addEventListener("change", () => {
  startMusic.value = musicTrack.value;
  setGameplayTrack(musicTrack.value);
});
overlayButton.addEventListener("click", () => {
  if (state.gameOver) startGame(true);
  else setPaused(false);
});
overlayMenuButton.addEventListener("click", showMenu);
continueButton.addEventListener("click", continueAfterCutscene);

showMenu();
requestAnimationFrame(gameLoop);
