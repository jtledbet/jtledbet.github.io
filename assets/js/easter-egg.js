(function () {
  const triggers = ['cowboy', 'wizard', 'drugstorecowboypinballwizard'];
  const longPressMs = 700;
  const tableWidth = 480;
  const tableHeight = 640;
  const leftKeys = new Set(['a', 'A', 'ArrowLeft']);
  const rightKeys = new Set(['d', 'D', 'ArrowRight']);

  let typed = '';
  let active = false;
  let stylesLoaded = false;
  let pressTimer = null;
  let longPressTriggered = false;
  let currentGame = null;

  function loadStyles() {
    if (stylesLoaded) return;
    stylesLoaded = true;
    const style = document.createElement('style');
    style.textContent = `
      .egg-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(5, 5, 12, 0.76);
        backdrop-filter: blur(8px);
      }

      .egg-machine {
        width: min(560px, 94vw);
        padding: 16px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 8px;
        background: linear-gradient(180deg, #171727, #07070f);
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.48);
      }

      .egg-score {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 8px;
        padding: 12px;
        border: 1px solid rgba(114, 255, 171, 0.35);
        border-radius: 6px;
        color: #72ffab;
        background: #05070a;
        font: 700 14px/1.2 Consolas, Monaco, monospace;
        letter-spacing: 0;
      }

      .egg-score strong {
        color: #f9f4d0;
        font-weight: 900;
      }

      .egg-playfield {
        position: relative;
        margin-top: 14px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 8px;
        background:
          radial-gradient(circle at 50% 18%, rgba(139, 104, 212, 0.24), transparent 25%),
          linear-gradient(150deg, #1a2030, #0a0a12 65%);
      }

      .egg-canvas {
        display: block;
        width: 100%;
        aspect-ratio: 3 / 4;
        max-height: min(70vh, 680px);
        touch-action: none;
        cursor: pointer;
      }

      .egg-touch-zones {
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        pointer-events: none;
      }

      .egg-touch-zones span {
        align-self: end;
        margin: 0 10px 10px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 999px;
        color: rgba(245, 245, 245, 0.78);
        background: rgba(5, 5, 12, 0.42);
        font: 800 11px/1 Consolas, Monaco, monospace;
        padding: 9px 10px;
        text-align: center;
      }

      .egg-help {
        margin: 10px 2px 0;
        color: rgba(245, 245, 245, 0.72);
        font: 600 13px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .egg-close {
        position: fixed;
        top: 18px;
        right: 18px;
        width: 40px;
        height: 40px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 50%;
        color: #f5f5f5;
        background: rgba(5, 5, 12, 0.78);
        font: 700 22px/1 Arial, sans-serif;
        cursor: pointer;
      }

      @media (max-width: 520px) {
        .egg-overlay { padding: 12px; }
        .egg-machine { padding: 12px; }
        .egg-score { font-size: 12px; }
        .egg-help { font-size: 12px; }
        .egg-touch-zones span { margin: 0 8px 8px; padding: 8px; }
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
    if (currentGame) {
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

  function createPinballGame(canvas, scoreNode, ballNode) {
    const ctx = canvas.getContext('2d');
    const state = {
      score: 0,
      ball: 1,
      bestCombo: 0,
      combo: 0,
      leftHeld: false,
      rightHeld: false,
      running: true,
      lastTime: 0,
      animationId: 0,
      particles: [],
      bumpers: [
        { x: 150, y: 185, r: 34, value: 50, flash: 0, label: 'C' },
        { x: 322, y: 210, r: 34, value: 75, flash: 0, label: 'W' },
        { x: 235, y: 330, r: 38, value: 100, flash: 0, label: 'P' }
      ],
      lanes: [
        { x: 92, y1: 86, y2: 190, lit: 0 },
        { x: 388, y1: 86, y2: 190, lit: 0 }
      ],
      ballState: null
    };

    function resetBall(served) {
      state.ballState = {
        x: served ? 392 : 385,
        y: served ? 110 : 560,
        vx: served ? -210 : -80,
        vy: served ? -80 : -420,
        r: 9,
        spin: 0
      };
      state.combo = 0;
      updateScore();
    }

    function updateScore() {
      scoreNode.innerHTML = '<span>DRUGSTORE COWBOY / PINBALL WIZARD</span><strong>' +
        String(state.score).padStart(6, '0') + '</strong>';
      ballNode.textContent = 'BALL ' + state.ball + ' · COMBO ' + state.bestCombo;
    }

    function addScore(points) {
      state.combo += 1;
      state.bestCombo = Math.max(state.bestCombo, state.combo);
      state.score += points * state.combo;
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

    function flipperLine(side) {
      const held = side === 'left' ? state.leftHeld : state.rightHeld;
      const anchor = side === 'left' ? { x: 176, y: 545 } : { x: 304, y: 545 };
      const length = 112;
      const angle = side === 'left'
        ? (held ? -0.56 : 0.34)
        : (held ? Math.PI + 0.56 : Math.PI - 0.34);
      return {
        ax: anchor.x,
        ay: anchor.y,
        bx: anchor.x + Math.cos(angle) * length,
        by: anchor.y + Math.sin(angle) * length,
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

    function reflectBall(nx, ny, impulse) {
      const ball = state.ballState;
      const dot = ball.vx * nx + ball.vy * ny;
      if (dot > 0 && impulse < 1) return;
      ball.vx = ball.vx - 2 * dot * nx + nx * impulse;
      ball.vy = ball.vy - 2 * dot * ny + ny * impulse;
      ball.vx *= 0.96;
      ball.vy *= 0.96;
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
        reflectBall(nx, ny, 280);
        bumper.flash = 1;
        addScore(bumper.value);
        addParticles(ball.x, ball.y, '#f9f4d0');
      });
    }

    function collideFlipper(line, side) {
      const ball = state.ballState;
      const hit = distanceToSegment(ball.x, ball.y, line);
      if (hit.distance > ball.r + 7 || ball.vy < -760) return;

      const nx = hit.dx / (hit.distance || 1);
      const ny = hit.dy / (hit.distance || 1);
      ball.x = hit.x + nx * (ball.r + 7);
      ball.y = hit.y + ny * (ball.r + 7);
      const flipImpulse = line.held ? 520 : 160;
      reflectBall(nx, ny, flipImpulse);
      ball.vx += side === 'left' ? 105 : -105;
      ball.vy -= line.held ? 230 : 80;
      addScore(line.held ? 25 : 5);
    }

    function updateLanes(dt) {
      const ball = state.ballState;
      state.lanes.forEach((lane) => {
        lane.lit = Math.max(0, lane.lit - dt * 2.4);
        if (lane.lit <= 0 && Math.abs(ball.x - lane.x) < 14 && ball.y > lane.y1 && ball.y < lane.y2) {
          lane.lit = 1;
          addScore(15);
          ball.vx += ball.x < tableWidth / 2 ? 24 : -24;
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

      if (ball.y > 580 && ball.x < 170) {
        ball.y = 580;
        ball.vy = -Math.abs(ball.vy) * 0.74 - 130;
        ball.vx += 90;
        state.combo = 0;
      }

      if (ball.y > 580 && ball.x > 310) {
        ball.y = 580;
        ball.vy = -Math.abs(ball.vy) * 0.74 - 130;
        ball.vx -= 90;
        state.combo = 0;
      }

      if (ball.y > tableHeight + 24) {
        state.ball += 1;
        resetBall(true);
      }

      state.bumpers.forEach((bumper) => {
        bumper.flash = Math.max(0, bumper.flash - dt * 3.6);
      });

      collideBumpers();
      updateLanes(dt);
      collideFlipper(flipperLine('left'), 'left');
      collideFlipper(flipperLine('right'), 'right');
      updateParticles(dt);
      draw();
      state.animationId = window.requestAnimationFrame(update);
    }

    function drawRail(points, color) {
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.lineWidth = 5;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    function drawFlipper(line, activeSide) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(line.ax, line.ay);
      ctx.lineTo(line.bx, line.by);
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.strokeStyle = line.held ? '#f9f4d0' : '#72ffab';
      ctx.shadowColor = line.held ? 'rgba(249,244,208,0.78)' : 'rgba(114,255,171,0.46)';
      ctx.shadowBlur = line.held ? 22 : 12;
      ctx.stroke();
      ctx.fillStyle = '#08080f';
      ctx.beginPath();
      ctx.arc(line.ax, line.ay, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(245,245,245,0.48)';
      ctx.font = '700 12px Consolas, Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(activeSide === 'left' ? 'A' : 'D', line.ax, line.ay + 34);
    }

    function draw() {
      const ball = state.ballState;
      ctx.clearRect(0, 0, tableWidth, tableHeight);

      const gradient = ctx.createLinearGradient(0, 0, tableWidth, tableHeight);
      gradient.addColorStop(0, '#202942');
      gradient.addColorStop(0.58, '#0c0d19');
      gradient.addColorStop(1, '#05050a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, tableWidth, tableHeight);

      ctx.fillStyle = 'rgba(139,104,212,0.18)';
      ctx.beginPath();
      ctx.arc(tableWidth / 2, 126, 116, 0, Math.PI * 2);
      ctx.fill();

      drawRail([{ x: 32, y: 34 }, { x: 32, y: 520 }, { x: 142, y: 602 }], 'rgba(255,255,255,0.42)');
      drawRail([{ x: 448, y: 34 }, { x: 448, y: 520 }, { x: 338, y: 602 }], 'rgba(255,255,255,0.42)');
      drawRail([{ x: 100, y: 96 }, { x: 132, y: 88 }, { x: 164, y: 98 }], 'rgba(114,255,171,0.42)');
      drawRail([{ x: 316, y: 98 }, { x: 350, y: 88 }, { x: 382, y: 96 }], 'rgba(114,255,171,0.42)');

      state.lanes.forEach((lane) => {
        ctx.strokeStyle = lane.lit ? '#f9f4d0' : 'rgba(245,245,245,0.32)';
        ctx.lineWidth = lane.lit ? 5 : 3;
        ctx.beginPath();
        ctx.moveTo(lane.x, lane.y1);
        ctx.lineTo(lane.x, lane.y2);
        ctx.stroke();
      });

      state.bumpers.forEach((bumper) => {
        ctx.save();
        ctx.shadowColor = bumper.flash ? 'rgba(249,244,208,0.96)' : 'rgba(209,106,138,0.55)';
        ctx.shadowBlur = bumper.flash ? 34 : 18;
        const bumperGradient = ctx.createRadialGradient(
          bumper.x - 8, bumper.y - 10, 6,
          bumper.x, bumper.y, bumper.r
        );
        bumperGradient.addColorStop(0, '#f9f4d0');
        bumperGradient.addColorStop(0.36, bumper.flash ? '#72ffab' : '#d16a8a');
        bumperGradient.addColorStop(1, '#532a72');
        ctx.fillStyle = bumperGradient;
        ctx.beginPath();
        ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255,255,255,0.72)';
        ctx.stroke();
        ctx.fillStyle = '#08080f';
        ctx.font = '900 18px Consolas, Monaco, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bumper.label, bumper.x, bumper.y + 1);
        ctx.restore();
      });

      drawFlipper(flipperLine('left'), 'left');
      drawFlipper(flipperLine('right'), 'right');

      state.particles.forEach((particle) => {
        ctx.globalAlpha = Math.max(0, particle.life);
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(ball.spin);
      const ballGradient = ctx.createRadialGradient(-3, -5, 2, 0, 0, ball.r);
      ballGradient.addColorStop(0, '#ffffff');
      ballGradient.addColorStop(0.52, '#dfe7eb');
      ballGradient.addColorStop(1, '#7f8b92');
      ctx.fillStyle = ballGradient;
      ctx.shadowColor = 'rgba(255,255,255,0.76)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, 0, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(5,5,12,0.42)';
      ctx.beginPath();
      ctx.moveTo(-ball.r + 3, 0);
      ctx.lineTo(ball.r - 3, 0);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = 'rgba(245,245,245,0.26)';
      ctx.font = '900 42px Consolas, Monaco, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PINBALL', tableWidth / 2, 82);
    }

    function setFlipper(side, pressed) {
      if (side === 'left') state.leftHeld = pressed;
      if (side === 'right') state.rightHeld = pressed;
    }

    resetBall(true);
    state.animationId = window.requestAnimationFrame(update);

    return {
      setFlipper,
      destroy() {
        state.running = false;
        window.cancelAnimationFrame(state.animationId);
      }
    };
  }

  function launchEgg() {
    if (active) return;
    active = true;

    const overlay = document.createElement('div');
    overlay.className = 'egg-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Drugstore Cowboy Pinball Wizard');
    overlay.innerHTML = `
      <button class="egg-close" type="button" aria-label="Close">x</button>
      <div class="egg-machine">
        <div class="egg-score" aria-live="polite">
          <span>DRUGSTORE COWBOY / PINBALL WIZARD</span><strong>000000</strong>
        </div>
        <div class="egg-playfield">
          <canvas class="egg-canvas" width="480" height="640" aria-label="Playable pinball table"></canvas>
          <div class="egg-touch-zones" aria-hidden="true"><span>LEFT</span><span>RIGHT</span></div>
        </div>
        <div class="egg-help"><span class="egg-ball-readout">BALL 1 · COMBO 0</span> · A/D, arrow keys, or tap either side.</div>
      </div>
    `;

    loadStyles();
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('.egg-canvas');
    const scoreNode = overlay.querySelector('.egg-score');
    const ballNode = overlay.querySelector('.egg-ball-readout');
    currentGame = createPinballGame(canvas, scoreNode, ballNode);

    function pointerSide(event) {
      const rect = canvas.getBoundingClientRect();
      return event.clientX - rect.left < rect.width / 2 ? 'left' : 'right';
    }

    canvas.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      currentGame?.setFlipper(pointerSide(event), true);
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
      canvas.addEventListener(eventName, () => {
        currentGame?.setFlipper('left', false);
        currentGame?.setFlipper('right', false);
      });
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

    if (shouldIgnore(event) || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).replace(/[^a-z]/g, '').slice(-32);
    if (triggers.some((trigger) => typed.endsWith(trigger))) {
      typed = '';
      launchEgg();
    }
  }

  function handleKeyUp(event) {
    if (leftKeys.has(event.key)) {
      currentGame?.setFlipper('left', false);
    }

    if (rightKeys.has(event.key)) {
      currentGame?.setFlipper('right', false);
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
          launchEgg();
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
    document.addEventListener('DOMContentLoaded', bindLongPress);
  } else {
    bindLongPress();
  }
})();
