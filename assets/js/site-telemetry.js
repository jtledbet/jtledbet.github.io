(function () {
  const optOutKey = 'ledsec.telemetry.optout.v1';
  const telemetrySetting = new URLSearchParams(window.location.search).get('telemetry');
  try {
    if (telemetrySetting === 'off') window.localStorage.setItem(optOutKey, '1');
    if (telemetrySetting === 'on') window.localStorage.removeItem(optOutKey);
    if (telemetrySetting === 'off' || telemetrySetting === 'on') {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('telemetry');
      window.history.replaceState(null, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
    }
  } catch {
    // Storage can be unavailable in hardened browsing modes.
  }

  const configuredEndpoint = String(window.LEDSEC_TELEMETRY_ENDPOINT || '').trim();
  const localEndpoint = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
    ? 'http://127.0.0.1:8790/v1/collect'
    : '';
  const endpoint = configuredEndpoint || localEndpoint;
  let localOptOut = false;
  try { localOptOut = window.localStorage.getItem(optOutKey) === '1'; } catch { localOptOut = false; }
  const optedOut = localOptOut || navigator.globalPrivacyControl === true || navigator.doNotTrack === '1';
  if (!endpoint || optedOut) return;

  const visitorKey = 'ledsec.telemetry.visitor.v1';
  const visitKey = 'ledsec.telemetry.visit.v1';
  const startedKey = 'ledsec.telemetry.started.v1';
  const queue = [];
  const scrollMilestones = new Set();
  let sequence = 0;
  let flushTimer = 0;
  let maxScroll = 0;

  function createId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function storedId(storage, key) {
    try {
      const existing = storage.getItem(key);
      if (existing) return existing;
      const next = createId();
      storage.setItem(key, next);
      return next;
    } catch {
      return createId();
    }
  }

  function storedStart() {
    try {
      const existing = sessionStorage.getItem(startedKey);
      if (existing) return existing;
      const next = new Date().toISOString();
      sessionStorage.setItem(startedKey, next);
      return next;
    } catch {
      return new Date().toISOString();
    }
  }

  const visitorId = storedId(localStorage, visitorKey);
  const visitId = storedId(sessionStorage, visitKey);
  const startedAt = storedStart();

  function matches(query) {
    return Boolean(window.matchMedia?.(query).matches);
  }

  function browserName() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return 'Edge';
    if (/OPR\//.test(ua)) return 'Opera';
    if (/Firefox\//.test(ua)) return 'Firefox';
    if (/CriOS\//.test(ua)) return 'Chrome iOS';
    if (/Chrome\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua) && /Version\//.test(ua)) return 'Safari';
    return 'Unknown';
  }

  function osName() {
    const ua = navigator.userAgent;
    if (/Windows NT/.test(ua)) return 'Windows';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/CrOS/.test(ua)) return 'ChromeOS';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  function deviceClass() {
    const ua = navigator.userAgent;
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
    if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'phone';
    if (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) >= 600 && matches('(pointer: coarse)')) return 'tablet';
    return 'desktop';
  }

  function contrastPreference() {
    if (matches('(prefers-contrast: more)')) return 'more';
    if (matches('(prefers-contrast: less)')) return 'less';
    if (matches('(prefers-contrast: custom)')) return 'custom';
    return 'no-preference';
  }

  function profile() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      visitId,
      visitorId,
      startedAt,
      path: `${location.pathname}${location.search}${location.hash}`,
      referrer: document.referrer,
      browser: browserName(),
      os: osName(),
      deviceClass: deviceClass(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenWidth: screen.width,
      screenHeight: screen.height,
      pixelRatio: window.devicePixelRatio || 1,
      touchPoints: navigator.maxTouchPoints || 0,
      pointerType: matches('(pointer: coarse)') ? 'coarse' : matches('(pointer: fine)') ? 'fine' : 'none',
      hoverCapability: matches('(hover: hover)') ? 'hover' : 'none',
      colorScheme: matches('(prefers-color-scheme: light)') ? 'light' : 'dark',
      reducedMotion: matches('(prefers-reduced-motion: reduce)') ? 'reduce' : 'no-preference',
      contrastPreference: contrastPreference(),
      forcedColors: matches('(forced-colors: active)') ? 'active' : 'none',
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      connectionType: connection?.effectiveType || '',
      saveData: connection?.saveData === true
    };
  }

  function cleanData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const result = {};
    Object.entries(data).forEach(([key, value]) => {
      if (!/^[a-zA-Z0-9_.-]{1,40}$/.test(key)) return;
      if (typeof value === 'string') result[key] = value.slice(0, 240);
      else if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
      else if (typeof value === 'boolean' || value === null) result[key] = value;
    });
    return result;
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = window.setTimeout(() => {
      flushTimer = 0;
      flush(false);
    }, 1000);
  }

  function track(name, data, category) {
    queue.push({
      eventId: createId(),
      occurredAt: new Date().toISOString(),
      category: String(category || 'site').slice(0, 40),
      name: String(name || 'event').slice(0, 80),
      path: `${location.pathname}${location.search}${location.hash}`,
      sequence: sequence += 1,
      data: cleanData(data)
    });
    if (queue.length >= 20) flush(false);
    else scheduleFlush();
  }

  function flush(leaving) {
    if (!queue.length) return;
    const events = queue.splice(0, 50);
    const payload = JSON.stringify({ visit: profile(), events });
    if (leaving && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'text/plain;charset=UTF-8' }));
      if (sent) return;
    }
    fetch(endpoint, {
      method: 'POST',
      body: payload,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      mode: 'cors'
    }).catch(() => {
      if (!leaving && events.length + queue.length <= 50) queue.unshift(...events);
    });
  }

  window.siteTelemetry = Object.freeze({ track });
  (window.__ledsecTelemetryQueue || []).splice(0).forEach((event) => {
    track(event.name, event.data, event.category);
  });

  track('page_view', {
    title: document.title,
    referrerHost: document.referrer ? new URL(document.referrer).host : 'direct'
  }, 'navigation');

  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    let destination;
    try { destination = new URL(link.href, location.href); } catch { return; }
    track('link_click', {
      destinationHost: destination.host,
      destinationPath: `${destination.pathname}${destination.hash}`,
      external: destination.origin !== location.origin,
      label: (link.getAttribute('aria-label') || link.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80)
    }, 'interaction');
  }, { capture: true, passive: true });

  window.addEventListener('scroll', () => {
    const pageHeight = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    maxScroll = Math.max(maxScroll, Math.min(100, Math.round((window.scrollY / pageHeight) * 100)));
    [25, 50, 75, 100].forEach((milestone) => {
      if (maxScroll >= milestone && !scrollMilestones.has(milestone)) {
        scrollMilestones.add(milestone);
        track('scroll_depth', { percent: milestone }, 'engagement');
      }
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    track('visibility', { state: document.visibilityState }, 'engagement');
  });

  window.addEventListener('pagehide', () => {
    track('session_end', {
      durationSeconds: Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 1000)),
      maxScrollPercent: maxScroll
    }, 'engagement');
    flush(true);
  });
})();
