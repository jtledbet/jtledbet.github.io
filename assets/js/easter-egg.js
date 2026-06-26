(function () {
  const triggers = ['cowboy', 'wizard', 'drugstorecowboypinballwizard'];
  const longPressMs = 700;
  const highScoreKey = 'pinball.highScore.v1';
  const tableWidth = 480;
  const tableHeight = 640;
  const minLaunchPower = 0.42;
  const leftKeys = new Set(['a', 'A', 'ArrowLeft']);
  const rightKeys = new Set(['d', 'D', 'ArrowRight']);
  const launchKeys = new Set([' ', 'Spacebar', 'Enter', 'ArrowDown', 's', 'S']);

  let typed = '';
  let active = false;
  let stylesLoaded = false;
  let pressTimer = null;
  let longPressTriggered = false;
  let currentGame = null;
  let controlHintObserver = null;

  function trackPinball(name, data) {
    if (window.siteTelemetry?.track) {
      window.siteTelemetry.track(name, data || {}, 'pinball');
      return;
    }
    window.__ledsecTelemetryQueue = window.__ledsecTelemetryQueue || [];
    window.__ledsecTelemetryQueue.push({ name, data: data || {}, category: 'pinball' });
  }

  function loadStyles() {
    if (stylesLoaded) return;
    stylesLoaded = true;
    const style = document.createElement('style');
    style.textContent = `
      .egg-overlay {
        --egg-bg: var(--bg, #0d0d1a);
        --egg-card: var(--card, #1a1a30);
        --egg-border: var(--border, rgba(124, 92, 191, 0.2));
        --egg-accent: var(--purple, #8b68d4);
        --egg-accent-light: var(--purple-light, #a884f0);
        --egg-accent-dim: var(--purple-dim, rgba(139, 104, 212, 0.12));
        --egg-text: var(--text, #e2e8f0);
        --egg-muted: var(--muted, #8892a4);
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(13, 13, 26, 0.78);
        background: color-mix(in srgb, var(--egg-bg) 78%, transparent);
        backdrop-filter: blur(8px);
      }

      .egg-machine {
        width: min(520px, 94vw);
        padding: 16px;
        border: 1px solid var(--egg-border);
        border-radius: 8px;
        background: linear-gradient(180deg, var(--egg-card), var(--egg-bg));
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.48);
      }

      .egg-title {
        padding: 12px;
        border: 1px solid var(--egg-border);
        border-radius: 6px;
        color: var(--egg-accent-light);
        background: var(--egg-bg);
        font: 700 14px/1.2 Consolas, Monaco, monospace;
        letter-spacing: 0;
        text-align: center;
      }

      .egg-scoreboard {
        display: grid;
        gap: 8px;
        margin-top: 8px;
      }

      .egg-score-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: baseline;
        border: 1px solid var(--egg-border);
        border-radius: 6px;
        color: var(--egg-muted);
        background: rgba(13, 13, 26, 0.72);
        background: color-mix(in srgb, var(--egg-bg) 72%, transparent);
        font: 800 12px/1.2 Consolas, Monaco, monospace;
        padding: 9px 12px;
      }

      .egg-score-row strong {
        color: var(--egg-text);
        font-size: 20px;
        font-weight: 900;
      }

      .egg-state-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .egg-state-row > span {
        flex: 1 1 0;
        min-width: 0;
        border: 1px solid var(--egg-border);
        border-radius: 6px;
        color: var(--egg-muted);
        background: rgba(13, 13, 26, 0.72);
        background: color-mix(in srgb, var(--egg-bg) 72%, transparent);
        font: 800 11px/1.2 Consolas, Monaco, monospace;
        padding: 8px 10px;
      }

      .egg-state-row strong {
        margin-left: 0.4rem;
        color: var(--egg-text);
        font-size: 13px;
        font-weight: 900;
      }

      .egg-control-hint {
        flex: 2 1 190px;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 0 0.5rem;
        align-items: baseline;
      }

      .egg-control-copy {
        color: var(--egg-accent-light);
        white-space: nowrap;
      }

      .egg-playfield {
        position: relative;
        margin-top: 14px;
        width: min(100%, calc((100vh - 286px) * 0.75));
        margin-left: auto;
        margin-right: auto;
        overflow: hidden;
        border: 1px solid var(--egg-border);
        border-radius: 8px;
        background:
          radial-gradient(circle at 50% 18%, var(--egg-accent-dim), transparent 25%),
          linear-gradient(150deg, var(--egg-card), var(--egg-bg) 65%);
      }

      .egg-overlay,
      .egg-machine,
      .egg-playfield,
      .egg-canvas {
        -webkit-tap-highlight-color: transparent;
        overscroll-behavior: contain;
      }

      .egg-canvas {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 4;
        height: auto;
        touch-action: none;
        cursor: pointer;
      }

      .egg-playfield,
      .egg-canvas {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
      }

      .egg-canvas:focus {
        outline: none;
      }

      .egg-effect-status {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
      }

      .egg-close {
        position: fixed;
        top: 18px;
        right: 18px;
        width: 40px;
        height: 40px;
        border: 1px solid var(--egg-border);
        border-radius: 50%;
        color: var(--egg-text);
        background: rgba(13, 13, 26, 0.82);
        background: color-mix(in srgb, var(--egg-bg) 82%, transparent);
        font: 700 22px/1 Arial, sans-serif;
        cursor: pointer;
      }

      @media (max-width: 520px) {
        .egg-overlay { padding: 12px; }
        .egg-machine { padding: 12px; }
        .egg-title { font-size: 12px; }
        .egg-score-row { font-size: 11px; padding: 8px 10px; }
        .egg-score-row strong { font-size: 16px; }
        .egg-state-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
        .egg-state-row > span { font-size: 10px; padding: 7px 8px; }
        .egg-state-row strong { font-size: 12px; }
        .egg-control-hint { grid-column: 1 / -1; }
      }
    `;
    document.head.appendChild(style);
  }

  function shouldIgnore(event) {
    const target = event.target;
    const tagName = target && target.tagName ? target.tagName.toLowerCase() : '';
    return event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      tagName === 'input' ||
      tagName === 'textarea' ||
      target?.isContentEditable;
  }

  function removeEgg() {
    if (controlHintObserver) {
      controlHintObserver.disconnect();
      controlHintObserver = null;
    }

    if (currentGame) {
      trackPinball('pinball_close', currentGame.snapshot?.());
      currentGame.destroy();
      currentGame = null;
    }
    document.querySelector('.egg-overlay')?.remove();
    active = false;
  }

  function clearPressTimer() {
    if (!pressTimer) return;
    window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function mediaMatches(query) {
    return Boolean(window.matchMedia && window.matchMedia(query).matches);
  }

  function environmentValue(name) {
    return document.documentElement.getAttribute(`data-env-${name}`) || '';
  }

  function parseRgb(color, fallback = { r: 226, g: 232, b: 240 }) {
    const value = String(color || '').trim();
    const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const raw = hex[1];
      const full = raw.length === 3
        ? raw.split('').map((part) => part + part).join('')
        : raw;
      return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
      };
    }

    const channels = value.match(/[\d.]+/g);
    if (channels && channels.length >= 3) {
      return {
        r: Math.max(0, Math.min(255, Number(channels[0]))),
        g: Math.max(0, Math.min(255, Number(channels[1]))),
        b: Math.max(0, Math.min(255, Number(channels[2])))
      };
    }

    return fallback;
  }

  function colorWithAlpha(color, alpha, fallback) {
    const rgb = parseRgb(color, parseRgb(fallback));
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
  }

  function mixColors(from, to, amount = 0.5) {
    const a = parseRgb(from);
    const b = parseRgb(to);
    const mix = (left, right) => Math.round(left + (right - left) * amount);
    return `rgb(${mix(a.r, b.r)},${mix(a.g, b.g)},${mix(a.b, b.b)})`;
  }

  function resolvePinballTheme() {
    const styles = window.getComputedStyle
      ? window.getComputedStyle(document.documentElement)
      : null;
    const css = (name, fallback) => {
      const value = styles?.getPropertyValue(name).trim();
      return value || fallback;
    };
    const bg = css('--bg', '#0d0d1a');
    const card = css('--card', '#1a1a30');
    const border = css('--border', 'rgba(124, 92, 191, 0.2)');
    const accent = css('--purple', '#8b68d4');
    const accentLight = css('--purple-light', '#a884f0');
    const accentDim = css('--purple-dim', 'rgba(139, 104, 212, 0.12)');
    const text = css('--text', '#e2e8f0');
    const muted = css('--muted', '#8892a4');
    const alpha = (color, opacity, fallback = text) => colorWithAlpha(color, opacity, fallback);

    return {
      bg,
      card,
      border,
      accent,
      accentLight,
      accentDim,
      text,
      muted,
      tableTop: mixColors(card, accent, 0.14),
      tableMid: mixColors(bg, card, 0.42),
      tableBottom: mixColors(bg, '#000000', 0.34),
      panelBg: alpha(bg, 0.68, bg),
      panelDeep: alpha(bg, 0.82, bg),
      fieldGhost: alpha(accent, 0.08, accent),
      textStrong: text,
      textSoft: alpha(text, 0.46, text),
      textDim: alpha(text, 0.28, text),
      textFaint: alpha(text, 0.1, text),
      mutedSoft: alpha(muted, 0.42, muted),
      borderSoft: alpha(accentLight, 0.2, accentLight),
      rail: alpha(text, 0.44, text),
      railDim: alpha(text, 0.32, text),
      railGlow: alpha(accentLight, 0.12, accentLight),
      railGlowDim: alpha(accentLight, 0.075, accentLight),
      accentSoft: alpha(accent, 0.34, accent),
      accentMid: alpha(accent, 0.58, accent),
      accentFill: alpha(accent, 0.07, accent),
      accentGlow: alpha(accentLight, 0.42, accentLight),
      accentGlowSoft: alpha(accentLight, 0.2, accentLight),
      accentTrace: alpha(accentLight, 0.07, accentLight),
      accentTraceGlow: alpha(accentLight, 0.06, accentLight),
      lightGlow: alpha(accentLight, 0.72, accentLight),
      textGlow: alpha(text, 0.72, text),
      textGlowSoft: alpha(text, 0.34, text),
      hotFill: alpha(text, 0.11, text),
      darkStroke: alpha(bg, 0.5, bg),
      bumperInner: text,
      bumperLive: accentLight,
      bumperBody: accent,
      bumperDeep: mixColors(bg, accent, 0.26),
      ballMid: mixColors(text, muted, 0.32),
      ballOuter: muted
    };
  }

  function flipperHintCopy() {
    const pointer = environmentValue('pointer');
    const touch = environmentValue('touch');
    const coarsePointer = pointer === 'coarse' || mediaMatches('(pointer: coarse)');
    const finePointer = pointer === 'fine' || mediaMatches('(pointer: fine)');
    const touchAvailable = touch === 'available' ||
      navigator.maxTouchPoints > 0 ||
      mediaMatches('(any-pointer: coarse)');

    if (coarsePointer && !finePointer) {
      return {
        label: 'FLIPPERS',
        copy: 'TAP LEFT / RIGHT',
        aria: 'Controls: tap the left or right side to flip.'
      };
    }

    if (touchAvailable) {
      return {
        label: 'FLIPPERS',
        copy: 'A/D · ←/→ · TAP SIDES',
        aria: 'Controls: press A or D, press the left or right arrow key, or tap a side to flip.'
      };
    }

    return {
      label: 'FLIPPERS',
      copy: 'A/D OR ←/→',
      aria: 'Controls: press A or D, or press the left or right arrow key to flip.'
    };
  }

  function launchHintCopy() {
    const pointer = environmentValue('pointer');
    const touch = environmentValue('touch');
    const coarsePointer = pointer === 'coarse' || mediaMatches('(pointer: coarse)');
    const finePointer = pointer === 'fine' || mediaMatches('(pointer: fine)');
    const touchAvailable = touch === 'available' ||
      navigator.maxTouchPoints > 0 ||
      mediaMatches('(any-pointer: coarse)');

    if (coarsePointer && !finePointer) {
      return {
        label: 'LAUNCH',
        copy: 'HOLD + RELEASE',
        aria: 'Controls: hold and release on the table to launch.'
      };
    }

    if (touchAvailable) {
      return {
        label: 'LAUNCH',
        copy: 'HOLD OR SPACE',
        aria: 'Controls: hold and release on the table, or press and release Space or Enter to launch.'
      };
    }

    return {
      label: 'LAUNCH',
      copy: 'HOLD CLICK / SPACE',
      aria: 'Controls: hold and release the mouse, or hold Space or Enter, then release to launch.'
    };
  }

  function controlHintCopy(mode) {
    return mode === 'launch' ? launchHintCopy() : flipperHintCopy();
  }

  function updateControlHint(controlHintNode, mode) {
    if (!controlHintNode) return;
    const nextMode = mode || controlHintNode.dataset.pinballMode || 'flip';
    controlHintNode.dataset.pinballMode = nextMode;
    const labelNode = controlHintNode.querySelector('.egg-control-label');
    const copyNode = controlHintNode.querySelector('.egg-control-copy');
    const hint = controlHintCopy(nextMode);
    if (labelNode) labelNode.textContent = hint.label;
    if (copyNode) copyNode.textContent = hint.copy;
    controlHintNode.setAttribute('aria-label', hint.aria);
  }

  function watchControlHint(controlHintNode) {
    updateControlHint(controlHintNode);

    if (controlHintObserver) {
      controlHintObserver.disconnect();
      controlHintObserver = null;
    }

    if (!window.MutationObserver || !controlHintNode) return;

    controlHintObserver = new MutationObserver(() => updateControlHint(controlHintNode));
    controlHintObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-env-hover',
        'data-env-pointer',
        'data-env-touch',
        'data-env-viewport'
      ]
    });
  }

  function isDirectPinballLink() {
    return window.location.hash.toLowerCase() === '#pinball';
  }

  function launchFromUrl() {
    if (isDirectPinballLink()) {
      launchEgg('direct_link');
    }
  }

  function loadHighScore() {
    try {
      const value = Number(window.localStorage.getItem(highScoreKey) || '0');
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch (error) {
      return 0;
    }
  }

  function saveHighScore(score) {
    try {
      window.localStorage.setItem(highScoreKey, String(score));
    } catch (error) {
      // The game still plays if persistence is unavailable.
    }
  }

  function formatScore(score) {
    return String(score).padStart(6, '0');
  }

  function createPinballGame(canvas, scoreNode, ballNode, comboNode, highScoreNode, effectNode, controlHintNode) {
    const ctx = canvas.getContext('2d');
    const shooterLane = {
      centerX: 432,
      innerX: 416,
      outerX: 448,
      exitY: 166,
      bottomY: 612
    };
    const theme = resolvePinballTheme();
    const state = {
      score: 0,
      highScore: loadHighScore(),
      ball: 1,
      bestCombo: 0,
      combo: 0,
      leftHeld: false,
      rightHeld: false,
      running: true,
      lastTime: 0,
      animationId: 0,
      tableFlipTimer: 0,
      readyFlashTimer: 0,
      launchReady: false,
      launchCharging: false,
      launchCharge: 0,
      launchPulse: 0,
      ballSaveTimer: 0,
      ballSaveFlash: 0,
      particles: [],
      pet: {
        mood: 'idle',
        timer: 0,
        idleTime: 0
      },
      bumpers: [
        { x: 240, y: 204, r: 31, value: 100, flash: 0, cooldown: 0, label: '100' },
        { x: 154, y: 316, r: 32, value: 50, flash: 0, cooldown: 0, label: '50' },
        { x: 326, y: 316, r: 32, value: 50, flash: 0, cooldown: 0, label: '50' }
      ],
      lanes: [
        { x: 122, y1: 96, y2: 154, lit: 0 },
        { x: 200, y1: 82, y2: 144, lit: 0 },
        { x: 280, y1: 82, y2: 144, lit: 0 },
        { x: 358, y1: 96, y2: 154, lit: 0 }
      ],
      lowerGuides: [
        {
          side: 'left',
          ax: 32,
          ay: 520,
          bx: 142,
          by: 602,
          nx: 0.598,
          ny: -0.802,
          kickX: 112,
          cooldown: 0
        },
        {
          side: 'right',
          ax: 416,
          ay: 520,
          bx: 338,
          by: 602,
          nx: -0.725,
          ny: -0.689,
          kickX: -112,
          cooldown: 0
        }
      ],
      railBodies: [
        {
          points: [{ x: 108, y: 450 }, { x: 208, y: 474 }],
          shape: [{ x: 96, y: 442 }, { x: 220, y: 468 }, { x: 204, y: 492 }, { x: 110, y: 466 }],
          color: theme.textSoft,
          fill: theme.accentFill,
          glow: theme.accentGlowSoft,
          stroke: theme.borderSoft,
          width: 4.5,
          impulse: 118,
          cooldown: 0
        },
        {
          points: [{ x: 372, y: 450 }, { x: 272, y: 474 }],
          shape: [{ x: 384, y: 442 }, { x: 260, y: 468 }, { x: 276, y: 492 }, { x: 370, y: 466 }],
          color: theme.textSoft,
          fill: theme.accentFill,
          glow: theme.accentGlowSoft,
          stroke: theme.borderSoft,
          width: 4.5,
          impulse: 118,
          cooldown: 0
        }
      ],
      inShooterLane: false,
      ballState: null
    };
    const petPriority = {
      idle: 0,
      left: 1,
      right: 1,
      flip: 1,
      lane: 2,
      bump: 3,
      combo: 4,
      drain: 5
    };
    const petFaces = {
      idle: ['=^._.^=', '=^-.-^='],
      left: ['<^._.^='],
      right: ['=^._.^>'],
      flip: ['=^>.<^='],
      lane: ['=^?.?^='],
      bump: ['=^o.o^='],
      combo: ['=^*.*^='],
      drain: ['=^;.;^=']
    };

    function setControlMode(mode) {
      updateControlHint(controlHintNode, mode);
    }

    function resetBall(served) {
      state.ballState = {
        x: served ? shooterLane.centerX : 385,
        y: served ? 558 : 560,
        vx: served ? 0 : -80,
        vy: served ? 0 : -420,
        r: 9,
        spin: 0
      };
      state.inShooterLane = served;
      state.launchReady = served;
      state.launchCharging = false;
      state.launchCharge = 0;
      state.launchPulse = 0;
      state.ballSaveTimer = 0;
      state.combo = 0;
      setControlMode(served ? 'launch' : 'flip');
      updateScore();
    }

    function updateScore() {
      if (state.score > state.highScore) {
        state.highScore = state.score;
        saveHighScore(state.highScore);
      }

      scoreNode.textContent = formatScore(state.score);
      ballNode.textContent = String(state.ball);
      comboNode.textContent = String(state.bestCombo);
      highScoreNode.textContent = formatScore(state.highScore);
    }

    function cuePet(mood, duration) {
      const currentPriority = petPriority[state.pet.mood] || 0;
      const nextPriority = petPriority[mood] || 0;
      if (state.pet.timer > 0 && currentPriority > nextPriority) return;

      state.pet.mood = mood;
      state.pet.timer = duration;
    }

    function updatePet(dt) {
      state.pet.idleTime += dt;
      if (state.pet.timer <= 0) {
        state.pet.mood = 'idle';
        return;
      }

      state.pet.timer = Math.max(0, state.pet.timer - dt);
      if (state.pet.timer <= 0) {
        state.pet.mood = 'idle';
      }
    }

    function addScore(points, reaction) {
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.score += points * state.combo;
      if (state.combo >= 10 && state.combo % 5 === 0) {
        cuePet('combo', 0.72);
      } else if (reaction) {
        cuePet(reaction, 0.46);
      }
      updateScore();
    }

    function addParticles(x, y, color) {
      for (let i = 0; i < 8; i += 1) {
        state.particles.push({
          x,
          y,
          vx: -120 + Math.random() * 240,
          vy: -180 + Math.random() * 120,
          life: 0.42 + Math.random() * 0.24,
          color
        });
      }
    }

    function triggerTableFlip() {
      state.tableFlipTimer = 1.15;
      state.readyFlashTimer = 2.4;
      cuePet('drain', 1.15);
      if (effectNode) {
        effectNode.textContent = `Ball lost. Ball ${state.ball} ready.`;
      }
      trackPinball('pinball_drain', {
        ball: Math.max(1, state.ball - 1),
        score: state.score,
        bestCombo: state.bestCombo
      });
    }

    function triggerBallSave() {
      state.ballSaveFlash = 1.05;
      cuePet('lane', 0.7);
      addParticles(state.ballState.x, Math.min(state.ballState.y, tableHeight - 28), theme.accentLight);
      if (effectNode) {
        effectNode.textContent = `Ball ${state.ball} saved. Pull again.`;
      }
      trackPinball('pinball_ball_save', { ball: state.ball, score: state.score });
    }

    function launchBall() {
      if (!state.launchReady) return;

      const ball = state.ballState;
      const power = Math.max(minLaunchPower, state.launchCharge);
      state.launchReady = false;
      state.launchCharging = false;
      state.launchCharge = 0;
      state.readyFlashTimer = 0;
      state.ballSaveTimer = 6.5;
      state.ballSaveFlash = 0;
      ball.x = shooterLane.centerX;
      ball.vx = -2 - power * 5;
      ball.vy = -520 - power * 300;
      setControlMode('flip');
      addParticles(ball.x, ball.y, theme.accentLight);
      cuePet('lane', 0.42);
      if (effectNode) {
        effectNode.textContent = `Ball ${state.ball} launched.`;
      }
      trackPinball('pinball_launch', {
        ball: state.ball,
        power: Number(power.toFixed(2)),
        score: state.score
      });
    }

    function flipperLine(side, tier = 'lower') {
      const held = side === 'left' ? state.leftHeld : state.rightHeld;
      if (tier === 'upper') {
        const mirrorX = (x) => tableWidth - x;
        const rest = side === 'left'
          ? { ax: 82, ay: 404, bx: 146, by: 416 }
          : { ax: mirrorX(82), ay: 404, bx: mirrorX(146), by: 416 };
        const raised = side === 'left'
          ? { bx: 142, by: 380 }
          : { bx: mirrorX(142), by: 380 };

        return {
          ax: rest.ax,
          ay: rest.ay,
          bx: held ? raised.bx : rest.bx,
          by: held ? raised.by : rest.by,
          held,
          mini: true
        };
      }

      const rest = side === 'left'
        ? { ax: 140, ay: 550, bx: 218, by: 562 }
        : { ax: 340, ay: 550, bx: 262, by: 562 };
      const raised = side === 'left'
        ? { bx: 212, by: 514 }
        : { bx: 268, by: 514 };

      return {
        ax: rest.ax,
        ay: rest.ay,
        bx: held ? raised.bx : rest.bx,
        by: held ? raised.by : rest.by,
        held
      };
    }

    function distanceToSegment(px, py, line) {
      const vx = line.bx - line.ax;
      const vy = line.by - line.ay;
      const wx = px - line.ax;
      const wy = py - line.ay;
      const lengthSquared = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared));
      const x = line.ax + t * vx;
      const y = line.ay + t * vy;
      return { x, y, dx: px - x, dy: py - y, distance: Math.hypot(px - x, py - y) };
    }

    function limitBallSpeed(maxSpeed = 980) {
      const ball = state.ballState;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed <= maxSpeed) return;

      const scale = maxSpeed / speed;
      ball.vx *= scale;
      ball.vy *= scale;
    }

    function reflectBall(nx, ny, impulse) {
      const ball = state.ballState;
      const normalLength = Math.hypot(nx, ny) || 1;
      nx /= normalLength;
      ny /= normalLength;
      const dot = ball.vx * nx + ball.vy * ny;

      if (dot < 0) {
        ball.vx = ball.vx - 2 * dot * nx + nx * impulse;
        ball.vy = ball.vy - 2 * dot * ny + ny * impulse;
      } else if (impulse > 0) {
        ball.vx += nx * impulse * 0.42;
        ball.vy += ny * impulse * 0.42;
      } else {
        return false;
      }

      ball.vx *= 0.96;
      ball.vy *= 0.96;
      limitBallSpeed();
      return true;
    }

    function collideShooterLane(dt) {
      const ball = state.ballState;
      const minLaneX = shooterLane.innerX + ball.r;
      const maxLaneX = shooterLane.outerX - ball.r;
      const gateStartY = shooterLane.exitY + 72;
      const exitGateY = shooterLane.exitY + ball.r;

      if (state.inShooterLane) {
        const inExitFeed = ball.vy < 0 && ball.y <= gateStartY;
        if (inExitFeed) {
          const progress = Math.max(0, Math.min(1, (gateStartY - ball.y) / (gateStartY - shooterLane.exitY)));
          ball.vx = Math.max(-220, ball.vx - (105 + 175 * progress) * dt);
        }

        if (!inExitFeed && ball.x < minLaneX) {
          ball.x = minLaneX;
          ball.vx = Math.abs(ball.vx) * 0.32;
        }
        if (ball.x > maxLaneX) {
          ball.x = maxLaneX;
          ball.vx = -Math.abs(ball.vx) * 0.32;
        }

        if (ball.y <= exitGateY && ball.vy < 0) {
          state.inShooterLane = false;
          ball.vx = Math.min(ball.vx, -118);
          ball.vy = Math.min(ball.vy, -360);
          limitBallSpeed();
        }
        return;
      }

      const againstInnerWall = ball.y > shooterLane.exitY + ball.r
        && ball.y < shooterLane.bottomY
        && ball.x > shooterLane.innerX - ball.r;
      if (!againstInnerWall) return;

      ball.x = shooterLane.innerX - ball.r;
      if (ball.vx > 0) {
        reflectBall(-1, 0, 28);
      } else {
        ball.vx = Math.min(ball.vx, -36);
      }
    }

    function collideBumpers() {
      const ball = state.ballState;
      state.bumpers.forEach((bumper) => {
        const dx = ball.x - bumper.x;
        const dy = ball.y - bumper.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = ball.r + bumper.r;
        if (distance >= minDistance) return;

        const nx = dx / (distance || 1);
        const ny = dy / (distance || 1);
        ball.x = bumper.x + nx * minDistance;
        ball.y = bumper.y + ny * minDistance;
        const active = bumper.cooldown <= 0;
        reflectBall(nx, ny, active ? 280 : 110);

        if (active) {
          bumper.cooldown = 0.1;
          bumper.flash = 1;
          addScore(bumper.value, 'bump');
          addParticles(ball.x, ball.y, theme.textStrong);
          trackPinball('pinball_bumper', {
            value: bumper.value,
            score: state.score,
            combo: state.combo
          });
        }
      });
    }

    function collideFlipper(line, side) {
      const ball = state.ballState;
      const hit = distanceToSegment(ball.x, ball.y, line);
      const radius = line.mini ? 4.8 : 6.5;
      if (hit.distance > ball.r + radius) return;

      const fallbackX = side === 'left' ? -0.18 : 0.18;
      const nx = hit.distance > 0.001 ? hit.dx / hit.distance : fallbackX;
      const ny = hit.distance > 0.001 ? hit.dy / hit.distance : -0.98;
      const approach = ball.vx * nx + ball.vy * ny;
      if (approach > 24 && !line.held) return;

      ball.x = hit.x + nx * (ball.r + radius);
      ball.y = hit.y + ny * (ball.r + radius);
      const flipImpulse = line.held ? (line.mini ? 440 : 520) : (line.mini ? 120 : 160);
      reflectBall(nx, ny, flipImpulse);
      ball.vx += side === 'left' ? (line.mini ? 86 : 105) : (line.mini ? -86 : -105);
      ball.vy -= line.held ? (line.mini ? 170 : 230) : (line.mini ? 62 : 80);
      limitBallSpeed(line.mini ? 900 : 960);
      addScore(line.held ? (line.mini ? 18 : 25) : 5, line.held ? 'flip' : '');
    }

    function updateLanes(dt) {
      const ball = state.ballState;
      state.lanes.forEach((lane) => {
        lane.lit = Math.max(0, lane.lit - dt * 2.4);
        if (lane.lit <= 0 && Math.abs(ball.x - lane.x) < 14 && ball.y > lane.y1 && ball.y < lane.y2) {
          lane.lit = 1;
          addScore(15, 'lane');
          ball.vx += ball.x < tableWidth / 2 ? 24 : -24;
          trackPinball('pinball_lane', { score: state.score, combo: state.combo });
        }
      });
    }

    function collideLowerGuides(dt) {
      const ball = state.ballState;
      state.lowerGuides.forEach((guide) => {
        guide.cooldown = Math.max(0, guide.cooldown - dt);
        if (ball.y < 510 || ball.vy < -120 || guide.cooldown > 0) return;

        const hit = distanceToSegment(ball.x, ball.y, guide);
        const minDistance = ball.r + 6;
        if (hit.distance >= minDistance) return;

        const approach = ball.vx * guide.nx + ball.vy * guide.ny;
        if (approach > 80) return;

        ball.x = hit.x + guide.nx * minDistance;
        ball.y = hit.y + guide.ny * minDistance;
        ball.vy = -Math.abs(ball.vy) * 0.72 - 145;
        ball.vx = ball.vx * 0.64 + guide.kickX;

        if (guide.side === 'left') {
          ball.vx = Math.max(ball.vx, 78);
        } else {
          ball.vx = Math.min(ball.vx, -78);
        }

        guide.cooldown = 0.18;
        state.combo = 0;
        limitBallSpeed(850);
      });
    }

    function collideRailBodies(dt) {
      const ball = state.ballState;
      state.railBodies.forEach((rail) => {
        rail.cooldown = Math.max(0, rail.cooldown - dt);

        for (let i = 0; i < rail.points.length - 1; i += 1) {
          const start = rail.points[i];
          const end = rail.points[i + 1];
          const hit = distanceToSegment(ball.x, ball.y, {
            ax: start.x,
            ay: start.y,
            bx: end.x,
            by: end.y
          });
          const minDistance = ball.r + rail.width * 0.72;
          if (hit.distance >= minDistance) continue;

          let nx = hit.dx / (hit.distance || 1);
          let ny = hit.dy / (hit.distance || 1);
          if (hit.distance < 0.001) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const length = Math.hypot(dx, dy) || 1;
            nx = -dy / length;
            ny = dx / length;
          }

          const approach = ball.vx * nx + ball.vy * ny;
          if (approach > 70 && rail.cooldown > 0) continue;

          ball.x = hit.x + nx * minDistance;
          ball.y = hit.y + ny * minDistance;
          reflectBall(nx, ny, rail.impulse);
          ball.vx += nx * 18;
          ball.vy += ny * 18;
          limitBallSpeed(900);

          if (rail.cooldown <= 0) {
            rail.cooldown = 0.16;
            addScore(8, 'lane');
            addParticles(ball.x, ball.y, rail.color);
          }

          return;
        }
      });
    }

    function updateParticles(dt) {
      state.particles = state.particles.filter((particle) => {
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 420 * dt;
        return particle.life > 0;
      });
    }

    function update(time) {
      if (!state.running) return;
      const dt = Math.min(0.024, Math.max(0.001, (time - state.lastTime) / 1000 || 0.016));
      state.lastTime = time;

      const ball = state.ballState;
      if (state.launchReady) {
        state.launchPulse += dt;
        state.ballSaveFlash = Math.max(0, state.ballSaveFlash - dt);
        state.readyFlashTimer = Math.max(0, state.readyFlashTimer - dt);
        if (state.launchCharging) {
          state.launchCharge = Math.min(1, state.launchCharge + dt * 0.72);
        } else {
          state.launchCharge = Math.max(0, state.launchCharge - dt * 0.38);
        }
        ball.spin += dt * (0.5 + state.launchCharge * 1.4);
        state.tableFlipTimer = Math.max(0, state.tableFlipTimer - dt);
        updatePet(dt);
        updateParticles(dt);
        draw();
        state.animationId = window.requestAnimationFrame(update);
        return;
      }

      state.ballSaveTimer = Math.max(0, state.ballSaveTimer - dt);
      state.ballSaveFlash = Math.max(0, state.ballSaveFlash - dt);

      ball.vy += 300 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.spin += (ball.vx / 22) * dt;
      ball.vx *= 0.999;
      ball.vy *= 0.999;

      if (ball.x < 32 + ball.r) {
        ball.x = 32 + ball.r;
        reflectBall(1, 0, 18);
      }
      if (ball.x > tableWidth - 32 - ball.r) {
        ball.x = tableWidth - 32 - ball.r;
        reflectBall(-1, 0, 18);
      }
      if (ball.y < 34 + ball.r) {
        ball.y = 34 + ball.r;
        reflectBall(0, 1, 18);
      }

      collideShooterLane(dt);
      collideLowerGuides(dt);

      if (ball.y > tableHeight + 24) {
        if (state.ballSaveTimer > 0) {
          triggerBallSave();
        } else {
          state.ball += 1;
          triggerTableFlip();
        }
        resetBall(true);
        draw();
        state.animationId = window.requestAnimationFrame(update);
        return;
      }

      state.tableFlipTimer = Math.max(0, state.tableFlipTimer - dt);
      updatePet(dt);

      state.bumpers.forEach((bumper) => {
        bumper.flash = Math.max(0, bumper.flash - dt * 3.6);
        bumper.cooldown = Math.max(0, bumper.cooldown - dt);
      });

      collideBumpers();
      collideRailBodies(dt);
      updateLanes(dt);
      collideFlipper(flipperLine('left', 'upper'), 'left');
      collideFlipper(flipperLine('right', 'upper'), 'right');
      collideFlipper(flipperLine('left'), 'left');
      collideFlipper(flipperLine('right'), 'right');
      updateParticles(dt);
      draw();
      state.animationId = window.requestAnimationFrame(update);
    }

    function drawRail(points, options) {
      const config = typeof options === 'string'
        ? { color: options }
        : options;

      ctx.save();
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.lineWidth = config.width || 5;
      ctx.strokeStyle = config.color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = config.glow || 'transparent';
      ctx.shadowBlur = config.shadowBlur || 0;
      ctx.stroke();
      ctx.restore();
    }

    function drawFlipper(line, activeSide) {
      const mini = !!line.mini;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(line.ax, line.ay);
      ctx.lineTo(line.bx, line.by);
      ctx.lineWidth = mini ? 8 : 13;
      ctx.lineCap = 'round';
      ctx.strokeStyle = line.held ? theme.textStrong : theme.accentLight;
      ctx.shadowColor = line.held ? theme.textGlow : theme.accentGlow;
      ctx.shadowBlur = line.held ? (mini ? 12 : 20) : (mini ? 6 : 10);
      ctx.stroke();
      ctx.fillStyle = theme.bg;
      ctx.beginPath();
      ctx.arc(line.ax, line.ay, mini ? 4.5 : 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (mini) return;

      ctx.fillStyle = theme.textSoft;
      ctx.font = '700 12px Consolas, Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(activeSide === 'left' ? 'A' : 'D', line.ax, line.ay + 34);
    }

    function drawPet() {
      const mood = state.pet.mood;
      const faces = petFaces[mood] || petFaces.idle;
      const idleFrame = Math.floor(state.pet.idleTime * 1.6) % petFaces.idle.length;
      const activeFrame = Math.floor(state.pet.timer * 16) % faces.length;
      const face = mood === 'idle' ? petFaces.idle[idleFrame] : faces[activeFrame];
      const color = mood === 'drain'
        ? theme.accent
        : mood === 'combo' || mood === 'bump'
          ? theme.accentLight
          : theme.textStrong;
      const yNudge = mood === 'idle'
        ? Math.sin(state.pet.idleTime * 2.4) * 0.8
        : Math.sin(state.pet.timer * 30) * 1.6;

      ctx.save();
      ctx.translate(62, 196 + yNudge);
      ctx.globalAlpha = mood === 'idle' ? 0.74 : 0.94;
      ctx.fillStyle = theme.panelBg;
      ctx.strokeStyle = mood === 'idle' ? theme.borderSoft : color;
      ctx.lineWidth = 2;
      ctx.shadowColor = mood === 'idle' ? theme.railGlowDim : color;
      ctx.shadowBlur = mood === 'idle' ? 6 : 14;
      ctx.beginPath();
      ctx.roundRect(-42, -18, 84, 34, 9);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = mood === 'idle' ? 0 : 8;
      ctx.fillStyle = color;
      ctx.font = '900 14px Consolas, Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(face, 0, 0);
      ctx.restore();
    }

    function drawTableFlip() {
      if (state.tableFlipTimer <= 0) return;

      const alpha = Math.min(1, state.tableFlipTimer * 2.2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = theme.panelBg;
      ctx.strokeStyle = theme.borderSoft;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(126, 236, 228, 48, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = theme.textStrong;
      ctx.shadowColor = theme.textGlowSoft;
      ctx.shadowBlur = 12;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 11px Consolas, Monaco, monospace';
      ctx.fillText('BALL LOST', tableWidth / 2, 249);
      ctx.font = '900 17px Consolas, Monaco, monospace';
      ctx.fillText('(╯°□°)╯︵ ┻━┻', tableWidth / 2, 271);
      ctx.restore();
    }

    function drawLaneMessage() {
      const tiltActive = state.tableFlipTimer > 0;
      const saveActive = state.ballSaveFlash > 0;
      const launchActive = state.launchReady;
      const readyActive = launchActive && state.readyFlashTimer > 0;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (saveActive) {
        const alpha = Math.min(0.9, 0.38 + state.ballSaveFlash * 0.48);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.accentLight;
        ctx.shadowColor = theme.lightGlow;
        ctx.shadowBlur = 16;
        ctx.font = '900 27px Consolas, Monaco, monospace';
        ctx.fillText('BALL SAVE', tableWidth / 2, 122);
      } else if (tiltActive) {
        const alpha = Math.min(0.92, 0.34 + state.tableFlipTimer * 0.52);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.textStrong;
        ctx.shadowColor = theme.textGlow;
        ctx.shadowBlur = 20;
        ctx.font = '900 31px Consolas, Monaco, monospace';
        ctx.fillText('BALL LOST', tableWidth / 2, 122);

        ctx.globalAlpha = alpha * 0.28;
        ctx.strokeStyle = theme.accent;
        ctx.lineWidth = 2;
        ctx.strokeText('BALL LOST', tableWidth / 2, 122);
      } else if (readyActive) {
        const alpha = Math.min(0.9, 0.42 + state.readyFlashTimer * 0.2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.textStrong;
        ctx.strokeStyle = theme.accentLight;
        ctx.shadowColor = theme.textGlow;
        ctx.shadowBlur = 18;
        ctx.font = '900 25px Consolas, Monaco, monospace';
        ctx.lineWidth = 2.2;
        const label = `BALL ${state.ball} READY`;
        ctx.strokeText(label, tableWidth / 2, 122);
        ctx.fillText(label, tableWidth / 2, 122);
      } else if (launchActive) {
        const alpha = 0.72 + Math.sin(state.launchPulse * 7) * 0.16;
        const label = state.launchCharging ? 'RELEASE' : 'PULL TO LAUNCH';
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.textStrong;
        ctx.strokeStyle = state.launchCharging ? theme.accentLight : theme.accent;
        ctx.shadowColor = state.launchCharging ? theme.textGlow : theme.lightGlow;
        ctx.shadowBlur = state.launchCharging ? 18 : 14;
        ctx.font = '900 25px Consolas, Monaco, monospace';
        ctx.lineWidth = state.launchCharging ? 2.6 : 2;
        ctx.strokeText(label, tableWidth / 2, 122);
        ctx.fillText(label, tableWidth / 2, 122);
      } else {
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = theme.textDim;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(184, 86);
        ctx.lineTo(296, 86);
        ctx.stroke();
      }

      ctx.restore();
    }

    function drawLaunchCue(ball) {
      if (!state.launchReady) return;

      const pulse = 0.5 + Math.sin(state.launchPulse * 9) * 0.5;
      const charge = state.launchCharge;
      const radius = ball.r + 9 + pulse * 4 + charge * 6;
      const color = state.launchCharging ? theme.textStrong : theme.accentLight;

      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.globalAlpha = 0.32 + pulse * 0.22 + charge * 0.2;
      ctx.strokeStyle = theme.textStrong;
      ctx.lineWidth = 2.8;
      ctx.shadowColor = theme.textGlow;
      ctx.shadowBlur = 14 + charge * 8;
      ctx.beginPath();
      ctx.arc(0, 0, radius + 7, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(state.launchPulse * 1.6);
      ctx.globalAlpha = 0.38 + pulse * 0.16 + charge * 0.18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = state.launchCharging ? theme.textGlow : theme.lightGlow;
      ctx.shadowBlur = 12 + charge * 8;
      ctx.beginPath();
      ctx.arc(0, 0, radius, -0.35, Math.PI * 1.55);
      ctx.stroke();

      ctx.globalAlpha = 0.34;
      ctx.setLineDash([3, 7]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r + 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.rotate(-state.launchPulse * 1.6);
      ctx.globalAlpha = 0.42 + charge * 0.4;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, ball.r + 12 + charge * 16);
      ctx.lineTo(0, ball.r + 48);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        const y = ball.r + 19 + i * 7 + charge * 11;
        ctx.beginPath();
        ctx.moveTo(-5, y);
        ctx.lineTo(5, y + 2.5);
        ctx.stroke();
      }

      ctx.fillStyle = theme.textStrong;
      [0, 2.1, 4.2].forEach((angle, index) => {
        const dotPulse = index === Math.floor(state.launchPulse * 5) % 3 ? 1 : 0.42;
        ctx.globalAlpha = dotPulse;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * (ball.r + 20), Math.sin(angle) * (ball.r + 20), 2.2, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    function drawShooterLane() {
      ctx.save();
      ctx.fillStyle = colorWithAlpha(theme.bg, 0.22, theme.bg);
      ctx.strokeStyle = theme.textFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(
        shooterLane.innerX + 4,
        shooterLane.exitY + 6,
        shooterLane.outerX - shooterLane.innerX - 8,
        shooterLane.bottomY - shooterLane.exitY - 12,
        9
      );
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = theme.accentTrace;
      ctx.shadowColor = theme.accentTraceGlow;
      ctx.shadowBlur = 4;
      ctx.setLineDash([6, 18]);
      ctx.beginPath();
      ctx.moveTo(shooterLane.centerX, shooterLane.exitY + 28);
      ctx.lineTo(shooterLane.centerX, shooterLane.bottomY - 42);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      drawRail([{ x: shooterLane.outerX, y: 34 }, { x: shooterLane.outerX, y: shooterLane.bottomY }], {
        color: theme.rail,
        glow: theme.railGlow,
        shadowBlur: 6,
        width: 5.4
      });
      drawRail([{ x: shooterLane.innerX, y: shooterLane.exitY }, { x: shooterLane.innerX, y: shooterLane.bottomY - 6 }], {
        color: theme.railDim,
        glow: theme.railGlowDim,
        shadowBlur: 4,
        width: 4.2
      });
      drawRail([{ x: shooterLane.innerX, y: shooterLane.exitY }, { x: 388, y: 158 }, { x: 358, y: 154 }], {
        color: theme.textDim,
        glow: theme.railGlowDim,
        shadowBlur: 5,
        width: 3.2
      });
    }

    function drawSideGutters() {
      const gutters = [
        {
          fill: [
            { x: 50, y: 438 },
            { x: 72, y: 462 },
            { x: 78, y: 528 },
            { x: 136, y: 604 },
            { x: 124, y: 614 },
            { x: 56, y: 536 },
            { x: 48, y: 462 }
          ],
          rail: [{ x: 60, y: 444 }, { x: 64, y: 524 }, { x: 126, y: 596 }],
          drain: [{ x: 82, y: 526 }, { x: 138, y: 584 }],
          fillAlpha: 0.1,
          strokeAlpha: 0.06,
          railAlpha: 0.13,
          drainAlpha: 0.1
        },
        {
          fill: [
            { x: 408, y: 390 },
            { x: 384, y: 420 },
            { x: 378, y: 522 },
            { x: 344, y: 604 },
            { x: 356, y: 614 },
            { x: 404, y: 536 },
            { x: 414, y: 420 }
          ],
          rail: [{ x: 406, y: 396 }, { x: 400, y: 518 }, { x: 354, y: 596 }],
          drain: [{ x: 374, y: 520 }, { x: 342, y: 584 }],
          fillAlpha: 0.18,
          strokeAlpha: 0.11,
          railAlpha: 0.2,
          drainAlpha: 0.16
        }
      ];

      gutters.forEach((gutter) => {
        ctx.save();
        ctx.beginPath();
        gutter.fill.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y);
          else ctx.lineTo(point.x, point.y);
        });
        ctx.closePath();
        ctx.fillStyle = colorWithAlpha(theme.bg, gutter.fillAlpha, theme.bg);
        ctx.strokeStyle = colorWithAlpha(theme.accentLight, gutter.strokeAlpha, theme.accentLight);
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        drawRail(gutter.rail, {
          color: colorWithAlpha(theme.textStrong, gutter.railAlpha, theme.textStrong),
          glow: theme.railGlowDim,
          shadowBlur: 4,
          width: 2.6
        });
        drawRail(gutter.drain, {
          color: colorWithAlpha(theme.textStrong, gutter.drainAlpha, theme.textStrong),
          glow: theme.railGlowDim,
          shadowBlur: 3,
          width: 2
        });
      });
    }

    function drawLowerApron() {
      ctx.save();
      ctx.fillStyle = colorWithAlpha(theme.bg, 0.42, theme.bg);
      ctx.strokeStyle = theme.borderSoft;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(142, 602);
      ctx.lineTo(206, 566);
      ctx.quadraticCurveTo(240, 586, 274, 566);
      ctx.lineTo(338, 602);
      ctx.lineTo(338, 640);
      ctx.lineTo(142, 640);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      drawRail([{ x: 142, y: 594 }, { x: 198, y: 558 }], {
        color: theme.textDim,
        glow: theme.railGlow,
        shadowBlur: 6,
        width: 4
      });
      drawRail([{ x: 338, y: 594 }, { x: 282, y: 558 }], {
        color: theme.textDim,
        glow: theme.railGlow,
        shadowBlur: 6,
        width: 4
      });

      ctx.save();
      ctx.fillStyle = theme.panelDeep;
      ctx.strokeStyle = theme.borderSoft;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(222, 612, 36, 8, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    function draw() {
      const ball = state.ballState;
      ctx.clearRect(0, 0, tableWidth, tableHeight);

      const gradient = ctx.createLinearGradient(0, 0, tableWidth, tableHeight);
      gradient.addColorStop(0, theme.tableTop);
      gradient.addColorStop(0.58, theme.tableMid);
      gradient.addColorStop(1, theme.tableBottom);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, tableWidth, tableHeight);

      ctx.fillStyle = theme.fieldGhost;
      ctx.beginPath();
      ctx.roundRect(104, 62, 272, 94, 14);
      ctx.fill();

      drawShooterLane();
      drawSideGutters();
      drawLowerApron();

      drawRail([{ x: 32, y: 34 }, { x: 32, y: 520 }, { x: 142, y: 602 }], {
        color: theme.rail,
        glow: theme.railGlow,
        shadowBlur: 7,
        width: 6
      });
      drawRail([{ x: shooterLane.innerX, y: 520 }, { x: 338, y: 602 }], {
        color: theme.railDim,
        glow: theme.railGlow,
        shadowBlur: 6,
        width: 5
      });
      state.railBodies.forEach((rail) => {
        const hot = rail.cooldown > 0;
        if (rail.shape) {
          ctx.save();
          ctx.beginPath();
          rail.shape.forEach((point, index) => {
            if (index === 0) ctx.moveTo(point.x, point.y);
            else ctx.lineTo(point.x, point.y);
          });
          ctx.closePath();
          ctx.fillStyle = hot ? theme.hotFill : rail.fill;
          ctx.strokeStyle = hot ? theme.textDim : rail.stroke;
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          ctx.shadowColor = hot ? theme.textGlowSoft : rail.glow;
          ctx.shadowBlur = hot ? 10 : 5;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        drawRail(rail.points, {
          color: hot ? colorWithAlpha(theme.textStrong, 0.64, theme.textStrong) : rail.color,
          glow: hot ? theme.textGlowSoft : rail.glow,
          shadowBlur: hot ? 12 : 7,
          width: hot ? rail.width + 1 : rail.width
        });
      });

      state.lanes.forEach((lane) => {
        const hot = lane.lit > 0;
        const glow = hot ? 0.44 + lane.lit * 0.38 : 0.26;

        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = hot ? colorWithAlpha(theme.textStrong, glow, theme.textStrong) : theme.accentSoft;
        ctx.lineWidth = hot ? 9 : 7;
        ctx.shadowColor = hot ? theme.textGlow : theme.accentGlow;
        ctx.shadowBlur = hot ? 18 : 9;
        ctx.beginPath();
        ctx.moveTo(lane.x, lane.y1);
        ctx.lineTo(lane.x, lane.y2);
        ctx.stroke();

        ctx.strokeStyle = hot ? theme.textStrong : theme.accent;
        ctx.lineWidth = hot ? 4 : 3;
        ctx.shadowBlur = hot ? 10 : 5;
        ctx.beginPath();
        ctx.moveTo(lane.x, lane.y1);
        ctx.lineTo(lane.x, lane.y2);
        ctx.stroke();

        ctx.fillStyle = hot ? colorWithAlpha(theme.textStrong, 0.9, theme.textStrong) : theme.accentMid;
        [lane.y1, lane.y2].forEach((capY) => {
          ctx.beginPath();
          ctx.arc(lane.x, capY, hot ? 3.8 : 2.8, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      });

      drawPet();

      state.bumpers.forEach((bumper) => {
        ctx.save();
        const hot = bumper.flash > 0;
        ctx.shadowColor = hot ? theme.textGlow : theme.accentGlow;
        ctx.shadowBlur = hot ? 24 : 10;
        const bumperGradient = ctx.createRadialGradient(
          bumper.x - 7, bumper.y - 9, 4,
          bumper.x, bumper.y, bumper.r
        );
        bumperGradient.addColorStop(0, theme.bumperInner);
        bumperGradient.addColorStop(0.34, hot ? theme.bumperLive : theme.bumperBody);
        bumperGradient.addColorStop(0.72, theme.accent);
        bumperGradient.addColorStop(1, theme.bumperDeep);
        ctx.fillStyle = bumperGradient;
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.lineWidth = 4;
        ctx.strokeStyle = hot ? colorWithAlpha(theme.textStrong, 0.82, theme.textStrong) : colorWithAlpha(theme.textStrong, 0.56, theme.textStrong);
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = theme.darkStroke;
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y, bumper.r - 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = theme.bg;
        ctx.font = `900 ${bumper.label.length > 2 ? 14 : 16}px Consolas, Monaco, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bumper.label, bumper.x, bumper.y + 1);
        ctx.restore();
      });

      drawFlipper(flipperLine('left', 'upper'), 'left');
      drawFlipper(flipperLine('right', 'upper'), 'right');
      drawFlipper(flipperLine('left'), 'left');
      drawFlipper(flipperLine('right'), 'right');
      drawTableFlip();

      state.particles.forEach((particle) => {
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      drawLaunchCue(ball);

      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.spin);
      const ballGradient = ctx.createRadialGradient(-3, -5, 2, 0, 0, ball.r);
      ballGradient.addColorStop(0, theme.textStrong);
      ballGradient.addColorStop(0.52, theme.ballMid);
      ballGradient.addColorStop(1, theme.ballOuter);
      ctx.fillStyle = ballGradient;
      ctx.shadowColor = colorWithAlpha(theme.textStrong, 0.76, theme.textStrong);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colorWithAlpha(theme.bg, 0.42, theme.bg);
      ctx.beginPath();
      ctx.moveTo(-ball.r + 3, 0);
      ctx.lineTo(ball.r - 3, 0);
      ctx.stroke();
      ctx.restore();

      drawLaneMessage();
    }

    function setFlipper(side, pressed) {
      if (side === 'left') {
        if (pressed && !state.leftHeld) {
          cuePet('left', 0.24);
          trackPinball('pinball_flip', { side: 'left', ball: state.ball, score: state.score });
        }
        state.leftHeld = pressed;
      }
      if (side === 'right') {
        if (pressed && !state.rightHeld) {
          cuePet('right', 0.24);
          trackPinball('pinball_flip', { side: 'right', ball: state.ball, score: state.score });
        }
        state.rightHeld = pressed;
      }
    }

    function setLauncher(pressed) {
      if (!state.launchReady) return false;

      if (pressed) {
        state.launchCharging = true;
        state.launchCharge = Math.max(state.launchCharge, 0.08);
        cuePet('lane', 0.28);
      } else if (state.launchCharging) {
        launchBall();
      }

      return true;
    }

    resetBall(true);
    state.animationId = window.requestAnimationFrame(update);

    return {
      setFlipper,
      setLauncher,
      snapshot() {
        return {
          ball: state.ball,
          score: state.score,
          bestCombo: state.bestCombo
        };
      },
      destroy() {
        state.running = false;
        window.cancelAnimationFrame(state.animationId);
      }
    };
  }

  function launchEgg(source = 'trigger') {
    if (active) return;
    active = true;
    trackPinball('pinball_open', { source });

    const overlay = document.createElement('div');
    overlay.className = 'egg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Drugstore Cowboy Pinball Wizard');
    overlay.innerHTML = `
      <button class="egg-close" type="button" aria-label="Close">x</button>
      <div class="egg-machine">
        <div class="egg-title">DRUGSTORE COWBOY / PINBALL WIZARD</div>
        <div class="egg-scoreboard" aria-live="polite">
          <div class="egg-score-row"><span>CURRENT SCORE</span><strong class="egg-score-value">000000</strong></div>
          <div class="egg-score-row"><span>HI-SCORE</span><strong class="egg-highscore-value">000000</strong></div>
        </div>
        <div class="egg-state-row" aria-live="polite">
          <span>BALL<strong class="egg-ball-readout">1</strong></span>
          <span>COMBO<strong class="egg-combo-readout">0</strong></span>
          <span class="egg-control-hint">
            <span class="egg-control-label" aria-hidden="true">FLIPPERS</span> <strong class="egg-control-copy">A/D OR ←/→</strong>
          </span>
        </div>
        <div class="egg-playfield">
          <canvas class="egg-canvas" width="480" height="640" aria-label="Playable pinball table"></canvas>
          <span class="egg-effect-status" aria-live="polite"></span>
        </div>
      </div>
    `;

    loadStyles();
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('.egg-canvas');
    const scoreNode = overlay.querySelector('.egg-score-value');
    const ballNode = overlay.querySelector('.egg-ball-readout');
    const comboNode = overlay.querySelector('.egg-combo-readout');
    const highScoreNode = overlay.querySelector('.egg-highscore-value');
    const effectNode = overlay.querySelector('.egg-effect-status');
    const controlHintNode = overlay.querySelector('.egg-control-hint');
    currentGame = createPinballGame(canvas, scoreNode, ballNode, comboNode, highScoreNode, effectNode, controlHintNode);
    watchControlHint(controlHintNode);

    function pointerSide(event) {
      const rect = canvas.getBoundingClientRect();
      return event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      if (currentGame?.setLauncher(true)) return;
      currentGame?.setFlipper(pointerSide(event), true);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
      canvas.addEventListener(eventName, () => {
        if (currentGame?.setLauncher(false)) return;
        currentGame?.setFlipper('left', false);
        currentGame?.setFlipper('right', false);
      });
    });

    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    ['touchstart', 'touchmove'].forEach((eventName) => {
      canvas.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
    });

    overlay.querySelector('.egg-close').addEventListener('click', removeEgg);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeEgg();
    });
  }

  function handleKeyDown(event) {
    if (active && event.key === 'Escape') {
      removeEgg();
      return;
    }

    if (active && leftKeys.has(event.key)) {
      event.preventDefault();
      currentGame?.setFlipper('left', true);
      return;
    }

    if (active && rightKeys.has(event.key)) {
      event.preventDefault();
      currentGame?.setFlipper('right', true);
      return;
    }

    if (active && launchKeys.has(event.key)) {
      event.preventDefault();
      currentGame?.setLauncher(true);
      return;
    }

    if (shouldIgnore(event) || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).replace(/[^a-z]/g, '').slice(-32);
    if (triggers.some((trigger) => typed.endsWith(trigger))) {
      typed = '';
      launchEgg('typed');
    }
  }

  function handleKeyUp(event) {
    if (leftKeys.has(event.key)) {
      currentGame?.setFlipper('left', false);
    }

    if (rightKeys.has(event.key)) {
      currentGame?.setFlipper('right', false);
    }

    if (launchKeys.has(event.key)) {
      currentGame?.setLauncher(false);
    }
  }

  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);

  function bindLongPress() {
    document.querySelectorAll('.egg-trigger').forEach((trigger) => {
      trigger.style.webkitTouchCallout = 'none';
      trigger.style.webkitUserSelect = 'none';
      trigger.style.userSelect = 'none';

      trigger.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });

      trigger.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        clearPressTimer();
        longPressTriggered = false;
        pressTimer = window.setTimeout(() => {
          pressTimer = null;
          longPressTriggered = true;
          launchEgg('long_press');
        }, longPressMs);
      });

      ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
        trigger.addEventListener(eventName, clearPressTimer);
      });

      trigger.addEventListener('click', (event) => {
        if (!longPressTriggered) return;
        event.preventDefault();
        event.stopPropagation();
        longPressTriggered = false;
      }, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindLongPress();
      launchFromUrl();
    });
  } else {
    bindLongPress();
    launchFromUrl();
  }

  window.addEventListener('hashchange', launchFromUrl);
})();
