(function () {
  'use strict';

  const SESSION_KEY = 'ledsec.metrics.session';
  const DEPTH_KEY = 'ledsec.metrics.depth';
  const PAGE_IDS = {
    '/': 'home',
    '/portfolio/': 'portfolio',
    '/contact/': 'contact',
    '/support/': 'support',
    '/coffee/': 'coffee',
    '/cummings/': 'cummings',
    '/projects/charlotte-skyline/': 'charlotte-skyline',
    '/projects/qkd/': 'qkd',
    '/ntv4x/': 'ntv4x',
    '/projects/ntv4x/': 'ntv4x',
    '/projects/ntv4x/audio/': 'ntv4x-audio'
  };
  const ALLOWED_ACTIONS = new Set([
    'internal-link', 'external-link', 'download', 'email', 'support', 'payment',
    'project-open', 'filter', 'search', 'randomize', 'simulate', 'step', 'encrypt',
    'reveal', 'approve', 'reject', 'play', 'pause', 'reset', 'submit', 'copy',
    'other-button'
  ]);
  const CONTENT_IDS = {
    home: ['home-intro', 'home-background', 'home-credentials', 'home-traffic'],
    portfolio: ['portfolio-featured', 'portfolio-catalog'],
    contact: ['contact-channels', 'contact-support'],
    support: ['support-payments', 'support-services'],
    coffee: ['coffee-support'],
    cummings: [
      'cummings-library', 'cummings-reader', 'cummings-countdown',
      'cummings-book-tulips', 'cummings-book-ampersand', 'cummings-book-xli',
      'cummings-book-is-5'
    ],
    'charlotte-skyline': ['charlotte-request', 'charlotte-preview', 'charlotte-workflow'],
    qkd: ['qkd-simulator', 'qkd-otp', 'qkd-explainer'],
    ntv4x: ['ntv4x-game', 'ntv4x-controls'],
    'ntv4x-audio': ['ntv4x-audio-player']
  };
  const FEATURE_STAGES = {
    'portfolio-filter': ['use', 'zero-result'],
    'cummings-search': ['use', 'zero-result'],
    'cummings-filter': ['use', 'zero-result'],
    'cummings-random': ['use'],
    'qkd-exchange': ['start', 'secure', 'eavesdrop-detected', 'eavesdrop-missed', 'inconclusive', 'abandon'],
    'qkd-encryption': ['start', 'complete', 'too-long', 'abandon'],
    'ntv4x-game': ['start', 'level-clear', 'loss', 'abandon'],
    'charlotte-request': ['start', 'submit', 'abandon'],
    'charlotte-review': ['approve', 'reject'],
    'resume-download': ['start'],
    'support-payment': ['start'],
    'contact-email': ['start'],
    'audio-playback': ['start', 'complete', 'failure', 'abandon']
  };
  const TERMINAL_FEATURE_STAGES = {
    'qkd-exchange': new Set(['secure', 'eavesdrop-detected', 'eavesdrop-missed', 'inconclusive', 'abandon']),
    'qkd-encryption': new Set(['complete', 'too-long', 'abandon']),
    'ntv4x-game': new Set(['loss', 'abandon']),
    'charlotte-request': new Set(['submit', 'abandon']),
    'audio-playback': new Set(['complete', 'failure', 'abandon'])
  };
  const script = document.currentScript;

  function metricsEndpoint(value) {
    if (!value) return value;
    const localPreview = ['127.0.0.1', 'localhost'].includes(window.location.hostname) &&
      ['8080', '8081'].includes(window.location.port);
    if (!localPreview) return value;
    try {
      const url = new URL(value);
      if (url.origin === 'https://metrics.ledsec.dev') {
        return 'http://127.0.0.1:8790' + url.pathname + url.search;
      }
    } catch {}
    return value;
  }

  const collectEndpoint = metricsEndpoint(script && script.dataset.collectEndpoint);
  const observeEndpoint = metricsEndpoint(script && script.dataset.observeEndpoint);
  const summaryEndpoint = metricsEndpoint(script && script.dataset.summaryEndpoint);
  const panel = document.getElementById('public-metrics');
  const label = document.getElementById('public-metrics-label');
  const integer = new Intl.NumberFormat();
  const page = pageId(window.location.pathname);
  const activeFeatures = new Set();
  const seenContent = new Set();

  function privacySignalEnabled() {
    return navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' ||
      navigator.msDoNotTrack === '1' ||
      window.doNotTrack === '1';
  }

  function normalizedPath(pathname) {
    if (!pathname) return '/';
    return pathname.endsWith('/') ? pathname : pathname + '/';
  }

  function pageId(pathname) {
    return PAGE_IDS[normalizedPath(pathname)] || null;
  }

  function referrerUrl() {
    if (!document.referrer) return null;
    try {
      return new URL(document.referrer);
    } catch {
      return null;
    }
  }

  function entrySource() {
    const referrer = referrerUrl();
    if (!referrer) return 'direct';
    if (referrer.origin === window.location.origin) return 'internal';
    const hostname = referrer.hostname.toLowerCase();
    const matches = function (domains) {
      return domains.some(function (domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
      });
    };
    if (matches([
      'google.com', 'bing.com', 'duckduckgo.com', 'search.brave.com',
      'search.yahoo.com', 'kagi.com', 'ecosia.org'
    ])) return 'search';
    if (matches([
      'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com',
      'tiktok.com', 'bsky.app', 'mastodon.social'
    ])) return 'social';
    if (matches([
      'github.com', 'stackoverflow.com', 'stackexchange.com', 'dev.to',
      'hashnode.com', 'npmjs.com'
    ])) return 'developer';
    return 'other-external';
  }

  function entryLooksNew() {
    return entrySource() !== 'internal';
  }

  function previousPage() {
    const referrer = referrerUrl();
    if (!referrer || referrer.origin !== window.location.origin) return null;
    return pageId(referrer.pathname);
  }

  function depthBucket(depth) {
    if (depth <= 1) return '1';
    if (depth === 2) return '2';
    if (depth <= 5) return '3-5';
    return '6+';
  }

  function sessionState() {
    try {
      const newVisit = window.sessionStorage.getItem(SESSION_KEY) !== '1';
      if (newVisit) window.sessionStorage.setItem(SESSION_KEY, '1');
      const storedDepth = Number.parseInt(window.sessionStorage.getItem(DEPTH_KEY) || '0', 10);
      const depth = Number.isFinite(storedDepth) && storedDepth >= 0 ? storedDepth + 1 : 1;
      window.sessionStorage.setItem(DEPTH_KEY, String(depth));
      return { newVisit: newVisit, depth: depthBucket(depth), depthCount: depth };
    } catch {
      return { newVisit: entryLooksNew(), depth: '1', depthCount: 1 };
    }
  }

  function mediaMatches(query) {
    try {
      return window.matchMedia(query).matches;
    } catch {
      return false;
    }
  }

  function viewportBucket() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (width < 640) return 'small';
    if (width < 1024) return 'medium';
    if (width < 1440) return 'large';
    return 'wide';
  }

  function deviceClass() {
    const width = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    if (width < 640) return 'phone';
    if (width < 1024 || mediaMatches('(pointer: coarse)')) return 'tablet';
    return 'desktop';
  }

  function operatingSystemFamily() {
    const clientHints = navigator.userAgentData;
    const platform = clientHints && typeof clientHints.platform === 'string'
      ? clientHints.platform
      : typeof navigator.platform === 'string' ? navigator.platform : '';
    const normalized = platform.toLowerCase();
    if (!normalized) return 'unknown';
    if (normalized.includes('android')) return 'android';
    if (normalized.includes('iphone') || normalized.includes('ipad') ||
        normalized.includes('ipod') || normalized === 'ios') return 'ios';
    if (normalized.includes('chrome os') || normalized.includes('cros')) return 'chromeos';
    if (normalized.includes('win')) return 'windows';
    if (normalized.includes('mac')) {
      return Number(navigator.maxTouchPoints || 0) > 1 ? 'ios' : 'macos';
    }
    if (normalized.includes('linux')) return 'linux';
    return 'other';
  }

  function inputCapability() {
    const coarse = mediaMatches('(any-pointer: coarse)');
    const fine = mediaMatches('(any-pointer: fine)');
    if (coarse && fine) return 'mixed';
    if (coarse) return 'touch';
    if (fine) return 'pointer';
    return 'unknown';
  }

  function connectionInfo() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return { connection: 'unknown', save_data: 'unknown' };
    const constrained = connection.saveData === true ||
      connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
    return {
      connection: constrained ? 'constrained' : 'standard',
      save_data: connection.saveData === true ? 'yes' : 'no'
    };
  }

  function dimensions() {
    const connection = connectionInfo();
    return {
      viewport: viewportBucket(),
      os: operatingSystemFamily(),
      device: deviceClass(),
      input: inputCapability(),
      color_scheme: mediaMatches('(prefers-color-scheme: dark)') ? 'dark' : 'light',
      reduced_motion: mediaMatches('(prefers-reduced-motion: reduce)') ? 'yes' : 'no',
      language: String(navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'non-en',
      connection: connection.connection,
      save_data: connection.save_data
    };
  }

  function post(endpoint, payload) {
    if (!endpoint || privacySignalEnabled()) return;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      keepalive: true,
      mode: 'cors'
    }).catch(function () {});
  }

  function feature(featureId, stage) {
    if (!page || !Object.prototype.hasOwnProperty.call(FEATURE_STAGES, featureId)) return;
    if (!FEATURE_STAGES[featureId].includes(stage)) return;
    if (stage === 'start') {
      if (activeFeatures.has(featureId)) return;
      activeFeatures.add(featureId);
    }
    if (stage === 'abandon' && !activeFeatures.has(featureId)) return;
    const terminal = TERMINAL_FEATURE_STAGES[featureId];
    if (terminal && terminal.has(stage)) activeFeatures.delete(featureId);
    post(observeEndpoint, { type: 'feature', page: page, feature: featureId, stage: stage });
  }

  function content(contentId) {
    const allowed = page && CONTENT_IDS[page];
    if (!allowed || !allowed.includes(contentId) || seenContent.has(contentId)) return;
    seenContent.add(contentId);
    post(observeEndpoint, { type: 'content', page: page, content: contentId });
  }

  window.ledsecMetrics = Object.freeze({ feature: feature, content: content });

  function collect(state) {
    post(collectEndpoint, { newVisit: state.newVisit });
  }

  function observePage(state) {
    if (!page) return;
    post(observeEndpoint, {
      type: 'page',
      page: page,
      newVisit: state.newVisit,
      source: entrySource(),
      previous: previousPage(),
      depth: state.depth,
      dimensions: dimensions()
    });
  }

  function rating(value, good, needsImprovement) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'unavailable';
    if (value <= good) return 'good';
    if (value <= needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  function experienceTracker() {
    if (!page || !observeEndpoint || privacySignalEnabled()) return;

    let visibleMilliseconds = 0;
    let visibleSince = document.visibilityState === 'visible' ? performance.now() : null;
    let maxScroll = 0;
    let interactions = 0;
    let sent = false;
    let fcp = null;
    let lcp = null;
    let cls = null;
    let inp = null;
    let longTasks = 0;
    const interactionModes = new Set();

    function observePerformance(type, callback) {
      try {
        const observer = new PerformanceObserver(function (list) {
          list.getEntries().forEach(callback);
        });
        observer.observe({ type: type, buffered: true });
        return true;
      } catch {
        return false;
      }
    }

    observePerformance('largest-contentful-paint', function (entry) {
      lcp = entry.startTime;
    });
    observePerformance('paint', function (entry) {
      if (entry.name === 'first-contentful-paint') fcp = entry.startTime;
    });
    if (observePerformance('layout-shift', function (entry) {
      if (!entry.hadRecentInput) cls = (cls || 0) + entry.value;
    })) cls = 0;
    observePerformance('event', function (entry) {
      if (entry.interactionId && (inp === null || entry.duration > inp)) inp = entry.duration;
    });
    observePerformance('longtask', function () {
      longTasks += 1;
    });

    function updateVisibleTime() {
      if (visibleSince === null) return;
      visibleMilliseconds += Math.max(0, performance.now() - visibleSince);
      visibleSince = null;
    }

    function updateScroll() {
      const root = document.documentElement;
      const height = Math.max(root.scrollHeight || 0, document.body ? document.body.scrollHeight : 0, 1);
      const bottom = Math.max(window.scrollY || 0, root.scrollTop || 0) + (window.innerHeight || root.clientHeight || 0);
      maxScroll = Math.max(maxScroll, Math.min(100, Math.round((bottom / height) * 100)));
    }

    function visibleBucket(seconds) {
      if (seconds < 10) return '0-10s';
      if (seconds < 30) return '10-30s';
      if (seconds < 120) return '30-120s';
      return '120s+';
    }

    function scrollBucket(percent) {
      if (percent < 25) return '0-25%';
      if (percent < 50) return '25-50%';
      if (percent < 75) return '50-75%';
      return '75-100%';
    }

    function interactionBucket(count) {
      if (count === 0) return '0';
      if (count === 1) return '1';
      if (count <= 5) return '2-5';
      return '6+';
    }

    function navigationEntry() {
      try {
        return performance.getEntriesByType('navigation')[0] || null;
      } catch {
        return null;
      }
    }

    function ttfbValue() {
      const navigation = navigationEntry();
      return navigation ? navigation.responseStart : null;
    }

    function longTaskBucket() {
      if (longTasks === 0) return '0';
      if (longTasks <= 2) return '1-2';
      if (longTasks <= 5) return '3-5';
      return '6+';
    }

    function cacheBucket() {
      const navigation = navigationEntry();
      if (!navigation) return 'unknown';
      if (navigation.type === 'back_forward') return 'back-forward';
      if (navigation.transferSize === 0 && navigation.decodedBodySize > 0) return 'hit';
      if (typeof navigation.transferSize === 'number' && navigation.transferSize > 0) return 'miss';
      return 'unknown';
    }

    function interactionMode() {
      if (interactionModes.size === 0) return 'none';
      if (interactionModes.size > 1) return 'mixed';
      return Array.from(interactionModes)[0];
    }

    function sendExperience() {
      if (sent) return;
      sent = true;
      updateVisibleTime();
      updateScroll();
      post(observeEndpoint, {
        type: 'experience',
        page: page,
        visibleTime: visibleBucket(visibleMilliseconds / 1000),
        scrollDepth: scrollBucket(maxScroll),
        interactions: interactionBucket(interactions),
        fcp: rating(fcp, 1800, 3000),
        lcp: rating(lcp, 2500, 4000),
        cls: rating(cls, 0.1, 0.25),
        inp: rating(inp, 200, 500),
        ttfb: rating(ttfbValue(), 800, 1800),
        longTasks: longTaskBucket(),
        cache: cacheBucket(),
        online: navigator.onLine === false ? 'offline' : 'online',
        interactionMode: interactionMode()
      });
    }

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointerdown', function (event) {
      interactions += 1;
      const type = event.pointerType;
      interactionModes.add(type === 'touch' || type === 'pen' ? type : 'mouse');
    }, { passive: true });
    window.addEventListener('keydown', function (event) {
      if (!event.repeat) {
        interactions += 1;
        interactionModes.add('keyboard');
      }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        visibleSince = performance.now();
      } else {
        updateVisibleTime();
        sendExperience();
      }
    });
    window.addEventListener('pagehide', sendExperience, { once: true });
  }

  function classifiedAction(element) {
    const explicit = element.dataset && element.dataset.metricEvent;
    if (explicit && ALLOWED_ACTIONS.has(explicit)) return explicit;

    if (element.matches('button, input[type="submit"], input[type="button"]')) {
      return element.matches('[type="submit"]') ? 'submit' : 'other-button';
    }

    if (!element.matches('a[href]')) return null;
    if (element.hasAttribute('download')) return 'download';
    let url;
    try {
      url = new URL(element.href, window.location.href);
    } catch {
      return null;
    }
    if (url.protocol === 'mailto:') return 'email';
    if (/\/(assets\/resume|downloads?)\//.test(url.pathname)) return 'download';
    if (/paypal|venmo|cash\.app/.test(url.hostname)) return 'payment';
    if (url.origin !== window.location.origin) return 'external-link';
    if (url.pathname.startsWith('/support/')) return 'support';
    if (url.pathname.startsWith('/projects/') || url.pathname.startsWith('/portfolio/')) return 'project-open';
    return 'internal-link';
  }

  function actionTracker() {
    if (!page || !observeEndpoint || privacySignalEnabled()) return;
    const searched = new WeakSet();
    document.addEventListener('click', function (event) {
      const target = event.target instanceof Element
        ? event.target.closest('[data-metric-event], [data-metric-feature], a[href], button, input[type="submit"], input[type="button"]')
        : null;
      if (!target) return;
      if (target.dataset && target.dataset.metricFeature && target.dataset.metricStage) {
        feature(target.dataset.metricFeature, target.dataset.metricStage);
      }
      const action = classifiedAction(target);
      if (action) {
        post(observeEndpoint, { type: 'action', page: page, action: action });
        if (action === 'payment') feature('support-payment', 'start');
        if (action === 'email' && page === 'contact') feature('contact-email', 'start');
        if (action === 'download') {
          try {
            const url = new URL(target.href, window.location.href);
            if (/\/assets\/resume\//.test(url.pathname)) feature('resume-download', 'start');
          } catch {}
        }
      }
    });
    document.addEventListener('input', function (event) {
      const target = event.target;
      if (!target || !target.matches || !target.matches('input[type="search"]')) return;
      if (!target.value || searched.has(target)) return;
      searched.add(target);
      post(observeEndpoint, { type: 'action', page: page, action: 'search' });
    });
    document.addEventListener('play', function (event) {
      const target = event.target;
      if (target && target.matches && target.matches('audio, video')) {
        post(observeEndpoint, { type: 'action', page: page, action: 'play' });
        if (page === 'ntv4x-audio') feature('audio-playback', 'start');
      }
    }, true);
    document.addEventListener('ended', function (event) {
      const target = event.target;
      if (page === 'ntv4x-audio' && target && target.matches && target.matches('audio, video')) {
        feature('audio-playback', 'complete');
      }
    }, true);
    document.addEventListener('error', function (event) {
      const target = event.target;
      if (page === 'ntv4x-audio' && target && target.matches && target.matches('audio, video, source')) {
        feature('audio-playback', 'failure');
      }
    }, true);
    document.addEventListener('focusin', function (event) {
      const form = event.target && event.target.closest
        ? event.target.closest('form[data-metric-feature]')
        : null;
      if (form) feature(form.dataset.metricFeature, 'start');
    });
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (form && form.matches && form.matches('form[data-metric-feature]')) {
        feature(form.dataset.metricFeature, 'submit');
      }
    });
  }

  function contentTracker() {
    if (!page || !observeEndpoint || privacySignalEnabled()) return;
    if (typeof IntersectionObserver !== 'function' || !document.querySelectorAll) return;
    const timers = new Map();
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        const contentId = entry.target.dataset && entry.target.dataset.metricContent;
        if (!contentId || seenContent.has(contentId)) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          if (timers.has(entry.target)) return;
          timers.set(entry.target, window.setTimeout(function () {
            timers.delete(entry.target);
            content(contentId);
            observer.unobserve(entry.target);
          }, 750));
        } else if (timers.has(entry.target)) {
          window.clearTimeout(timers.get(entry.target));
          timers.delete(entry.target);
        }
      });
    }, { threshold: [0.5] });
    document.querySelectorAll('[data-metric-content]').forEach(function (element) {
      observer.observe(element);
    });
  }

  function departureTracker(state) {
    if (!page || !observeEndpoint || privacySignalEnabled()) return;
    let knownInternalDeparture = false;
    let resetTimer = null;

    function markInternal() {
      knownInternalDeparture = true;
      if (resetTimer) window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(function () { knownInternalDeparture = false; }, 2000);
    }

    document.addEventListener('click', function (event) {
      if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      try {
        const url = new URL(link.href, window.location.href);
        const sameDocumentHash = url.origin === window.location.origin &&
          url.pathname === window.location.pathname && url.search === window.location.search && url.hash;
        if (url.origin === window.location.origin && !sameDocumentHash) markInternal();
      } catch {}
    }, true);

    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (!form || !form.action || (form.target && form.target !== '_self')) return;
      try {
        if (new URL(form.action, window.location.href).origin === window.location.origin) markInternal();
      } catch {}
    }, true);

    window.addEventListener('pagehide', function (event) {
      Array.from(activeFeatures).forEach(function (featureId) {
        feature(featureId, 'abandon');
      });
      if (event.persisted || knownInternalDeparture) return;
      post(observeEndpoint, {
        type: 'departure',
        page: page,
        singlePage: state.depthCount === 1
      });
    }, { once: true });
  }

  function resourceErrorType(target) {
    const tag = String(target && target.tagName || '').toUpperCase();
    if (tag === 'SCRIPT') return 'resource-script';
    if (tag === 'LINK') return 'resource-style';
    if (tag === 'IMG' || tag === 'PICTURE') return 'resource-image';
    if (tag === 'AUDIO' || tag === 'VIDEO' || tag === 'SOURCE') return 'resource-media';
    return 'resource-other';
  }

  function errorTracker() {
    if (!page || !observeEndpoint || privacySignalEnabled()) return;
    window.addEventListener('error', function (event) {
      const type = event.target && event.target !== window ? resourceErrorType(event.target) : 'script';
      post(observeEndpoint, { type: 'error', page: page, error: type });
    }, true);
    window.addEventListener('unhandledrejection', function () {
      post(observeEndpoint, { type: 'error', page: page, error: 'promise' });
    });
    window.addEventListener('offline', function () {
      post(observeEndpoint, { type: 'error', page: page, error: 'offline' });
    });
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingerror', function () {
        post(observeEndpoint, { type: 'error', page: page, error: 'resource-font' });
      });
    }
  }

  function validMetric(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function validCountry(value) {
    return value &&
      typeof value === 'object' &&
      /^[A-Z]{2}$/.test(value.code) &&
      typeof value.name === 'string' &&
      value.name.trim().length > 0;
  }

  function validSummary(value) {
    return value &&
      typeof value === 'object' &&
      value.periodDays === 30 &&
      typeof value.generatedAt === 'string' &&
      validMetric(value.visits) &&
      validMetric(value.pageViews) &&
      validMetric(value.countryCount) &&
      Array.isArray(value.recentCountries) &&
      value.recentCountries.length <= 6 &&
      value.recentCountries.every(validCountry);
  }

  function setMetric(name, value) {
    const node = panel.querySelector('[data-metric="' + name + '"]');
    if (node) node.textContent = integer.format(value);
  }

  function hidePanel() {
    panel.hidden = true;
    panel.setAttribute('aria-busy', 'false');
    if (label) label.hidden = true;
  }

  function render(summary, source) {
    setMetric('visits', summary.visits);
    setMetric('pageViews', summary.pageViews);
    setMetric('countryCount', summary.countryCount);

    const countries = panel.querySelector('[data-metric="recentCountries"]');
    if (countries) {
      countries.textContent = summary.recentCountries.length
        ? summary.recentCountries.map(function (country) { return country.name; }).join(' · ')
        : 'No country data yet';
    }

    const preview = panel.querySelector('[data-metric="preview"]');
    if (preview) preview.hidden = source !== 'fixture';

    panel.title = 'Updated ' + new Date(summary.generatedAt).toLocaleString();
    panel.dataset.state = 'ready';
    panel.setAttribute('aria-busy', 'false');
  }

  async function loadSummary() {
    const controller = new AbortController();
    const timeout = window.setTimeout(function () { controller.abort(); }, 4000);
    try {
      const response = await fetch(summaryEndpoint, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        cache: 'no-store',
        mode: 'cors',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('Metrics unavailable');
      const summary = await response.json();
      if (!validSummary(summary)) throw new Error('Invalid metrics response');
      if (summary.visits === 0 && summary.pageViews === 0 && summary.countryCount === 0) {
        hidePanel();
        return;
      }
      render(summary, response.headers.get('X-Metrics-Source'));
    } catch {
      hidePanel();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (!privacySignalEnabled()) {
    const state = sessionState();
    collect(state);
    observePage(state);
    experienceTracker();
    actionTracker();
    contentTracker();
    departureTracker(state);
    errorTracker();
  }
  if (summaryEndpoint && panel) loadSummary();
})();
