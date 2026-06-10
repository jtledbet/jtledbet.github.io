(function () {
  const triggers = ['cowboy', 'wizard', 'drugstorecowboypinballwizard'];
  const longPressMs = 700;
  let typed = '';
  let active = false;
  let stylesLoaded = false;
  let pressTimer = null;
  let longPressTriggered = false;

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
        background: rgba(5, 5, 12, 0.72);
        backdrop-filter: blur(8px);
      }

      .egg-machine {
        width: min(520px, 92vw);
        padding: 18px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 8px;
        background: linear-gradient(180deg, #161623, #08080f);
        box-shadow: 0 24px 90px rgba(0, 0, 0, 0.45);
      }

      .egg-score {
        padding: 12px;
        border: 1px solid rgba(114, 255, 171, 0.35);
        border-radius: 6px;
        color: #72ffab;
        background: #05070a;
        font: 700 14px/1.2 Consolas, Monaco, monospace;
        text-align: center;
        letter-spacing: 0;
      }

      .egg-playfield {
        position: relative;
        height: 340px;
        margin-top: 14px;
        overflow: hidden;
        border-radius: 8px;
        background:
          radial-gradient(circle at 50% 18%, rgba(139, 104, 212, 0.28), transparent 24%),
          linear-gradient(150deg, #1a2030, #0a0a12 65%);
        border: 1px solid rgba(255, 255, 255, 0.14);
      }

      .egg-playfield::before,
      .egg-playfield::after {
        content: "";
        position: absolute;
        bottom: 32px;
        width: 42%;
        height: 3px;
        background: #f5f5f5;
        opacity: 0.72;
      }

      .egg-playfield::before {
        left: -8%;
        transform: rotate(36deg);
      }

      .egg-playfield::after {
        right: -8%;
        transform: rotate(-36deg);
      }

      .egg-bumper,
      .egg-ball,
      .egg-flipper {
        position: absolute;
        display: block;
      }

      .egg-bumper {
        width: 62px;
        height: 62px;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.7);
        background: radial-gradient(circle, #f9f4d0 0 24%, #d16a8a 25% 58%, #532a72 59%);
        box-shadow: 0 0 28px rgba(209, 106, 138, 0.55);
      }

      .egg-bumper-a { left: 18%; top: 22%; }
      .egg-bumper-b { right: 18%; top: 28%; }
      .egg-bumper-c { left: 42%; top: 46%; }

      .egg-ball {
        width: 18px;
        height: 18px;
        left: 10%;
        top: 7%;
        border-radius: 50%;
        background: #f5f5f5;
        box-shadow: 0 0 14px rgba(255, 255, 255, 0.9);
        animation: egg-roll 2.8s linear infinite;
      }

      .egg-flipper {
        bottom: 34px;
        width: 96px;
        height: 12px;
        border-radius: 999px;
        background: #72ffab;
        transform-origin: center;
        box-shadow: 0 0 18px rgba(114, 255, 171, 0.4);
      }

      .egg-flipper-left {
        left: 25%;
        transform: rotate(22deg);
        animation: egg-left-flip 1.4s ease-in-out infinite;
      }

      .egg-flipper-right {
        right: 25%;
        transform: rotate(-22deg);
        animation: egg-right-flip 1.4s ease-in-out infinite;
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

      @keyframes egg-roll {
        0% { left: 10%; top: 7%; }
        18% { left: 82%; top: 24%; }
        34% { left: 38%; top: 45%; }
        54% { left: 86%; top: 68%; }
        76% { left: 25%; top: 80%; }
        100% { left: 10%; top: 7%; }
      }

      @keyframes egg-left-flip {
        0%, 76%, 100% { transform: rotate(22deg); }
        84% { transform: rotate(-16deg); }
      }

      @keyframes egg-right-flip {
        0%, 45%, 100% { transform: rotate(-22deg); }
        53% { transform: rotate(16deg); }
      }

      @media (max-width: 520px) {
        .egg-overlay { padding: 14px; }
        .egg-playfield { height: 300px; }
        .egg-bumper { width: 52px; height: 52px; }
        .egg-flipper { width: 76px; }
        .egg-score { font-size: 12px; }
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
    document.querySelector('.egg-overlay')?.remove();
    active = false;
  }

  function clearPressTimer() {
    if (!pressTimer) return;
    window.clearTimeout(pressTimer);
    pressTimer = null;
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
      <div class="egg-machine" aria-hidden="true">
        <div class="egg-score">DRUGSTORE COWBOY / PINBALL WIZARD</div>
        <div class="egg-playfield">
          <span class="egg-bumper egg-bumper-a"></span>
          <span class="egg-bumper egg-bumper-b"></span>
          <span class="egg-bumper egg-bumper-c"></span>
          <span class="egg-ball"></span>
          <span class="egg-flipper egg-flipper-left"></span>
          <span class="egg-flipper egg-flipper-right"></span>
        </div>
      </div>
    `;

    loadStyles();
    document.body.appendChild(overlay);
    overlay.querySelector('.egg-close').addEventListener('click', removeEgg);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) removeEgg();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (active && event.key === 'Escape') {
      removeEgg();
      return;
    }

    if (shouldIgnore(event) || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).replace(/[^a-z]/g, '').slice(-32);
    if (triggers.some((trigger) => typed.endsWith(trigger))) {
      typed = '';
      launchEgg();
    }
  });

  function bindLongPress() {
    document.querySelectorAll('.nav-logo').forEach((logo) => {
      logo.addEventListener('pointerdown', (event) => {
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
        logo.addEventListener(eventName, clearPressTimer);
      });

      logo.addEventListener('click', (event) => {
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
