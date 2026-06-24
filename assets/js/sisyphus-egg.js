(function () {
  // Sisyphus easter egg: a deliberately unwinnable boulder climb.
  // Triggered by typing a word, or long-pressing the footer (or any .sisyphus-trigger element).
  const triggers = ['sisyphus', 'boulder'];
  const directHashes = new Set(['#sisyphus', '#boulder', '#rock']);
  const longPressMs = 700;
  let typed = '';
  let active = false;
  let stylesLoaded = false;
  let pressTimer = null;
  let longPressTriggered = false;

  // ----- crest messages: progress, then gravity wins -----
  const crestLines = [
    'ALMOST. The boulder remembers the way down.',
    'Summit tasted. Gravity disagreed.',
    'You reached the top. The top moved.',
    'Progress, briefly.',
    'A new model shipped. The hill got steeper.',
    'You out-climbed yesterday. Not today.'
  ];

  function loadStyles() {
    if (stylesLoaded) return;
    stylesLoaded = true;
    const style = document.createElement('style');
    style.textContent = `
      .sis-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(5, 5, 12, 0.78);
        backdrop-filter: blur(8px);
      }
      .sis-machine {
        width: min(560px, 94vw);
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        background: linear-gradient(180deg, #161623, #08080f);
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.5);
      }
      .sis-title {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid rgba(139, 104, 212, 0.45);
        border-radius: 6px;
        color: #c9b8ff;
        background: #05070a;
        font: 700 13px/1.3 Consolas, Monaco, monospace;
        letter-spacing: 0.04em;
      }
      .sis-title b { color: #8b68d4; }
      .sis-canvas {
        display: block;
        width: 100%;
        margin-top: 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: #06060d;
        touch-action: none;
        cursor: pointer;
      }
      .sis-status {
        min-height: 1.4em;
        margin-top: 10px;
        color: #72ffab;
        font: 600 13px/1.4 Consolas, Monaco, monospace;
        text-align: center;
      }
      .sis-hint {
        margin-top: 4px;
        color: rgba(245, 245, 245, 0.55);
        font: 400 12px/1.4 Consolas, Monaco, monospace;
        text-align: center;
      }
      .sis-close {
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
        .sis-overlay { padding: 14px; }
        .sis-title { font-size: 11px; }
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

  // ----- lifetime persistence: Sisyphus's curse outlives the tab -----
  const STORE_KEY = 'sisyphus.crests';
  function loadLifetime() {
    try { return parseInt(localStorage.getItem(STORE_KEY) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveLifetime(n) {
    try { localStorage.setItem(STORE_KEY, String(n)); } catch (e) {}
  }

  // ----- game instance (created per launch) -----
  function createGame(canvas, statusEl) {
    const W = 480;
    const H = 320;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const r = 17;
    const B = { x: 46, y: H - 36 };       // bottom of the hill (fixed)
    const baseS = { x: W - 64, y: 52 };   // summit at rest
    let steepen = 0;                      // grows each crest -> hill steepens, summit recedes

    // current hill geometry, recomputed as `steepen` grows
    function geom() {
      const S = { x: baseS.x - steepen, y: baseS.y };
      const dx = S.x - B.x, dy = S.y - B.y;
      const hillLen = Math.hypot(dx, dy);
      const dir = { x: dx / hillLen, y: dy / hillLen };
      const normal = { x: dir.y, y: -dir.x }; // points up-left, off the slope surface
      return { S, dir, normal, hillLen };
    }

    // physics in progress-space p in [0, 1]
    let p = 0;
    let v = 0;
    let pushPower = 0.92;   // accel up-slope while held
    let gravity = 0.34;     // accel down-slope, always on
    let pushing = false;
    let attempts = 0;
    let best = 0;
    let roll = 0;           // boulder rotation
    let flashUntil = 0;
    let impossibleNoted = false;
    let lifetime = loadLifetime();
    let raf = null;
    let last = performance.now();
    let destroyed = false;

    // returning visitors are greeted by the boulder's memory (the curse is eternal)
    if (lifetime > 0) {
      statusEl.textContent = `The boulder knows you: ${lifetime} crest${lifetime === 1 ? '' : 's'}, none final.`;
    }

    function pointOnHill(t, g) {
      return { x: B.x + g.dir.x * g.hillLen * t, y: B.y + g.dir.y * g.hillLen * t };
    }

    function crest() {
      attempts += 1;
      lifetime += 1;
      saveLifetime(lifetime);
      v = -0.85;                                    // shove it back down
      gravity += 0.035;                             // gravity grows
      pushPower = Math.max(0.18, pushPower - 0.05); // and you tire
      steepen = Math.min(150, steepen + 16);        // the summit visibly recedes
      flashUntil = performance.now() + 1500;
      statusEl.textContent = crestLines[(attempts - 1) % crestLines.length];
      if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }
    }

    function update(dt, g) {
      const net = (pushing ? pushPower : 0) - gravity;
      v += net * dt;
      v -= v * 0.9 * dt;            // friction / drag
      const prevP = p;
      p += v * dt;

      if (p <= 0) { p = 0; if (v < 0) v = 0; }
      if (p >= 1) { p = 1; crest(); }

      best = Math.max(best, p);
      // rotate boulder by linear distance travelled
      roll += (p - prevP) * g.hillLen / r;

      // once holding can no longer out-push gravity, the climb is impossible for good
      if (!impossibleNoted && pushPower < gravity) {
        impossibleNoted = true;
        statusEl.textContent = 'The hill has outpaced you for good. One must imagine Sisyphus happy.';
      }
    }

    function draw(now, g) {
      const S = g.S, dir = g.dir, normal = g.normal;
      ctx.clearRect(0, 0, W, H);

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#141a2c');
      sky.addColorStop(1, '#07070f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // hill mass
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(B.x, B.y);
      ctx.lineTo(S.x, S.y);
      ctx.lineTo(W, S.y + 8);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fillStyle = '#1b2233';
      ctx.fill();
      // slope edge — shifts from purple toward red as the climb grows hopeless
      const heat = Math.min(1, steepen / 150);
      ctx.beginPath();
      ctx.moveTo(B.x, B.y);
      ctx.lineTo(S.x, S.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${Math.round(139 + 100 * heat)}, ${Math.round(104 - 60 * heat)}, ${Math.round(212 - 120 * heat)}, 0.7)`;
      ctx.stroke();

      // summit flag
      ctx.beginPath();
      ctx.moveTo(S.x, S.y);
      ctx.lineTo(S.x, S.y - 26);
      ctx.strokeStyle = 'rgba(245,245,245,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(S.x, S.y - 26);
      ctx.lineTo(S.x + 16, S.y - 20);
      ctx.lineTo(S.x, S.y - 14);
      ctx.closePath();
      ctx.fillStyle = '#72ffab';
      ctx.fill();

      // boulder + Sisyphus
      const surf = pointOnHill(p, g);
      const c = { x: surf.x + normal.x * r, y: surf.y + normal.y * r };

      // figure, just downhill of the boulder, leaning in
      const fBase = pointOnHill(Math.max(0, p - 0.06), g);
      const hipX = fBase.x + normal.x * 6 - dir.x * 10;
      const hipY = fBase.y + normal.y * 6 - dir.y * 10;
      ctx.strokeStyle = '#e7e2ff';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();                 // back leg
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(hipX - dir.x * 12 + 2, hipY - dir.y * 12 + 12);
      ctx.stroke();
      ctx.beginPath();                 // torso, leaning toward boulder
      ctx.moveTo(hipX, hipY);
      const shX = hipX + dir.x * 12 - normal.x * 10;
      const shY = hipY + dir.y * 12 - normal.y * 10;
      ctx.lineTo(shX, shY);
      ctx.stroke();
      ctx.beginPath();                 // arms to the boulder
      ctx.moveTo(shX, shY);
      ctx.lineTo(c.x - normal.x * r, c.y - normal.y * r);
      ctx.stroke();
      ctx.beginPath();                 // head
      ctx.arc(shX + dir.x * 2 - normal.x * 6, shY + dir.y * 2 - normal.y * 6, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#e7e2ff';
      ctx.fill();

      // boulder
      const flashing = now < flashUntil;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(roll);
      const grd = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
      grd.addColorStop(0, flashing ? '#d16a8a' : '#9a93a8');
      grd.addColorStop(1, flashing ? '#532a72' : '#3a3550');
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      // texture marks so the roll reads
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const a = i * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        ctx.stroke();
      }
      ctx.restore();
    }

    function loop(now) {
      if (destroyed) return;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switch
      const g = geom();
      update(dt, g);
      draw(now, g);
      const pct = Math.round(best * 100);
      titleRight.textContent = `ATTEMPTS ${attempts}  ·  BEST ${pct}%`;
      raf = requestAnimationFrame(loop);
    }

    let titleRight = null;
    function start(rightEl) {
      titleRight = rightEl;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function setPushing(on) { pushing = on; }
    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
    }

    return { start, setPushing, destroy, canvas };
  }

  let current = null;

  function removeEgg() {
    if (current) { current.game.destroy(); current = null; }
    document.querySelector('.sis-overlay')?.remove();
    active = false;
    window.removeEventListener('keydown', onGameKeyDown, true);
    window.removeEventListener('keyup', onGameKeyUp, true);
  }

  function launchFromUrl() {
    if (directHashes.has(window.location.hash.toLowerCase())) {
      launchEgg();
    }
  }

  function onGameKeyDown(e) {
    if (e.key === 'Escape') { removeEgg(); return; }
    if (e.code === 'Space' && current) {
      e.preventDefault();
      current.game.setPushing(true);
    }
  }
  function onGameKeyUp(e) {
    if (e.code === 'Space' && current) {
      e.preventDefault();
      current.game.setPushing(false);
    }
  }

  function launchEgg() {
    if (active) return;
    active = true;
    loadStyles();

    const overlay = document.createElement('div');
    overlay.className = 'sis-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Sisyphus');
    overlay.innerHTML = `
      <button class="sis-close" type="button" aria-label="Close">x</button>
      <div class="sis-machine">
        <div class="sis-title"><b>SISYPHUS</b><span class="sis-meter">ATTEMPTS 0 · BEST 0%</span></div>
        <canvas class="sis-canvas" width="480" height="320" aria-label="Push the boulder up the hill"></canvas>
        <div class="sis-status">Push the boulder to the summit.</div>
        <div class="sis-hint">Hold SPACE, or press and hold the hill, to push. You cannot win.</div>
      </div>
    `;

    document.body.appendChild(overlay);
    const canvas = overlay.querySelector('.sis-canvas');
    const statusEl = overlay.querySelector('.sis-status');
    const meterEl = overlay.querySelector('.sis-meter');

    const game = createGame(canvas, statusEl);
    current = { game };
    game.start(meterEl);

    // pointer push on the canvas
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      game.setPushing(true);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
      canvas.addEventListener(name, () => game.setPushing(false));
    });

    overlay.querySelector('.sis-close').addEventListener('click', removeEgg);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) removeEgg(); });
    window.addEventListener('keydown', onGameKeyDown, true);
    window.addEventListener('keyup', onGameKeyUp, true);
  }

  document.addEventListener('keydown', (event) => {
    if (active) return; // game handles its own keys while open
    if (shouldIgnore(event) || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).replace(/[^a-z]/g, '').slice(-32);
    if (triggers.some((t) => typed.endsWith(t))) {
      typed = '';
      launchEgg();
    }
  });

  function bindLongPress() {
    // The footer copyright is the hidden mobile long-press target (parallel to the
    // pinball egg's nav dot). Any element can also opt in via class .sisyphus-trigger.
    document.querySelectorAll('footer, .sisyphus-trigger').forEach((trigger) => {
      // keep the 700ms hold from selecting text or popping the iOS callout menu
      trigger.style.webkitTouchCallout = 'none';
      trigger.style.webkitUserSelect = 'none';
      trigger.style.userSelect = 'none';
      trigger.addEventListener('contextmenu', (e) => e.preventDefault());
      trigger.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (pressTimer) window.clearTimeout(pressTimer);
        longPressTriggered = false;
        pressTimer = window.setTimeout(() => {
          pressTimer = null;
          longPressTriggered = true;
          launchEgg();
        }, longPressMs);
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => {
        trigger.addEventListener(name, () => {
          if (pressTimer) { window.clearTimeout(pressTimer); pressTimer = null; }
        });
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
