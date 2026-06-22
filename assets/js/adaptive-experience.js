(function () {
  const root = document.documentElement;
  const attributes = {
    colorScheme: 'data-env-color-scheme',
    contrast: 'data-env-contrast',
    dataSaver: 'data-env-data-saver',
    forcedColors: 'data-env-forced-colors',
    hover: 'data-env-hover',
    motion: 'data-env-motion',
    orientation: 'data-env-orientation',
    pointer: 'data-env-pointer',
    touch: 'data-env-touch',
    viewport: 'data-env-viewport'
  };

  let pending = false;

  function matches(query) {
    return Boolean(window.matchMedia && window.matchMedia(query).matches);
  }

  function contrastPreference() {
    if (matches('(prefers-contrast: more)')) return 'more';
    if (matches('(prefers-contrast: less)')) return 'less';
    if (matches('(prefers-contrast: custom)')) return 'custom';
    return 'no-preference';
  }

  function pointerProfile() {
    if (matches('(pointer: coarse)')) return 'coarse';
    if (matches('(pointer: fine)')) return 'fine';
    return 'none';
  }

  function hoverProfile() {
    return matches('(hover: hover)') ? 'hover' : 'none';
  }

  function viewportBucket() {
    const width = window.innerWidth || root.clientWidth || 0;
    if (width < 640) return 'compact';
    if (width < 1024) return 'medium';
    return 'wide';
  }

  function orientationBucket() {
    const width = window.innerWidth || root.clientWidth || 0;
    const height = window.innerHeight || root.clientHeight || 0;
    return width >= height ? 'landscape' : 'portrait';
  }

  function dataSaverProfile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return 'unknown';
    if (connection.saveData) return 'on';
    if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') return 'slow';
    return 'off';
  }

  function buildProfile() {
    return {
      colorScheme: matches('(prefers-color-scheme: light)') ? 'light' : 'dark',
      contrast: contrastPreference(),
      dataSaver: dataSaverProfile(),
      forcedColors: matches('(forced-colors: active)') ? 'active' : 'none',
      hover: hoverProfile(),
      motion: matches('(prefers-reduced-motion: reduce)') ? 'reduce' : 'no-preference',
      orientation: orientationBucket(),
      pointer: pointerProfile(),
      touch: navigator.maxTouchPoints > 0 || matches('(any-pointer: coarse)') ? 'available' : 'none',
      viewport: viewportBucket()
    };
  }

  function applyProfile(profile) {
    Object.keys(attributes).forEach((key) => {
      root.setAttribute(attributes[key], profile[key]);
    });
    root.classList.add('adaptive-experience-ready');
  }

  function update() {
    pending = false;
    applyProfile(buildProfile());
  }

  function scheduleUpdate() {
    if (pending) return;
    pending = true;
    window.requestAnimationFrame ? window.requestAnimationFrame(update) : window.setTimeout(update, 0);
  }

  function installStyles() {
    if (document.getElementById('adaptive-experience-style')) return;

    const style = document.createElement('style');
    style.id = 'adaptive-experience-style';
    style.textContent = `
      html[data-env-motion="reduce"] *,
      html[data-env-motion="reduce"] *::before,
      html[data-env-motion="reduce"] *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
      }

      html[data-env-contrast="more"] {
        --bg: #05050a;
        --card: #141424;
        --border: rgba(255, 255, 255, 0.42);
        --muted: #c3cad8;
        --purple: #a884f0;
        --purple-light: #d8c9ff;
      }

      html[data-env-contrast="more"] a:focus-visible,
      html[data-env-contrast="more"] button:focus-visible,
      html[data-env-contrast="more"] input:focus-visible,
      html[data-env-contrast="more"] textarea:focus-visible,
      html[data-env-contrast="more"] select:focus-visible {
        outline: 3px solid #f9f4d0 !important;
        outline-offset: 3px !important;
      }

      html[data-env-forced-colors="active"] *,
      html[data-env-forced-colors="active"] *::before,
      html[data-env-forced-colors="active"] *::after {
        box-shadow: none !important;
        text-shadow: none !important;
      }

      html[data-env-pointer="coarse"] a,
      html[data-env-pointer="coarse"] button,
      html[data-env-pointer="coarse"] input,
      html[data-env-pointer="coarse"] textarea,
      html[data-env-pointer="coarse"] select,
      html[data-env-pointer="coarse"] [role="button"] {
        min-height: 44px;
      }

      html[data-env-pointer="coarse"] .nav-links a,
      html[data-env-pointer="coarse"] .social-link,
      html[data-env-pointer="coarse"] .btn,
      html[data-env-pointer="coarse"] .filter-btn,
      html[data-env-pointer="coarse"] .tab {
        align-items: center;
        display: inline-flex;
        padding-bottom: 0.7rem;
        padding-top: 0.7rem;
      }

      html[data-env-hover="none"] a:hover,
      html[data-env-hover="none"] button:hover {
        transform: none !important;
      }

      html[data-env-data-saver="on"] *,
      html[data-env-data-saver="slow"] * {
        transition-duration: 0.001ms !important;
      }

      html[data-env-viewport="compact"] main {
        overflow-wrap: anywhere;
      }
    `;
    document.head.appendChild(style);
  }

  function watchMedia(query) {
    if (!window.matchMedia) return;
    const media = window.matchMedia(query);
    if (media.addEventListener) {
      media.addEventListener('change', scheduleUpdate);
    } else if (media.addListener) {
      media.addListener(scheduleUpdate);
    }
  }

  installStyles();
  update();

  [
    '(prefers-reduced-motion: reduce)',
    '(prefers-color-scheme: light)',
    '(prefers-contrast: more)',
    '(prefers-contrast: less)',
    '(prefers-contrast: custom)',
    '(forced-colors: active)',
    '(pointer: coarse)',
    '(pointer: fine)',
    '(hover: hover)',
    '(any-pointer: coarse)'
  ].forEach(watchMedia);

  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('orientationchange', scheduleUpdate, { passive: true });

  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection && connection.addEventListener) {
    connection.addEventListener('change', scheduleUpdate);
  }
})();
