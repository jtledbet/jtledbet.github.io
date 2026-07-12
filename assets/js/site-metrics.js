(function () {
  const SESSION_KEY = 'ledsec.metrics.session';
  const script = document.currentScript;
  const collectEndpoint = script && script.dataset.collectEndpoint;
  const summaryEndpoint = script && script.dataset.summaryEndpoint;
  const panel = document.getElementById('public-metrics');
  const label = document.getElementById('public-metrics-label');
  const integer = new Intl.NumberFormat();

  function privacySignalEnabled() {
    return navigator.globalPrivacyControl === true ||
      navigator.doNotTrack === '1' ||
      navigator.msDoNotTrack === '1' ||
      window.doNotTrack === '1';
  }

  function entryLooksNew() {
    if (!document.referrer) return true;
    try {
      return new URL(document.referrer).origin !== window.location.origin;
    } catch {
      return true;
    }
  }

  function isNewVisit() {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === '1') return false;
      window.sessionStorage.setItem(SESSION_KEY, '1');
      return true;
    } catch {
      return entryLooksNew();
    }
  }

  function collect() {
    if (!collectEndpoint || privacySignalEnabled()) return;
    fetch(collectEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newVisit: isNewVisit() }),
      credentials: 'omit',
      keepalive: true,
      mode: 'cors'
    }).catch(function () {});
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

  collect();
  if (summaryEndpoint && panel) loadSummary();
})();
