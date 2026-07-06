(function () {
  const triggers = ['rx', 'cowboy', 'ntv4x'];
  const directHashes = new Set(['#ntv4x', '#rx']);
  const longPressMs = 700;
  const targetUrl = '/ntv4x/';
  let typed = '';
  let pressTimer = null;
  let longPressTriggered = false;

  function shouldIgnore(event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;
    const target = event.target;
    if (!target) return false;
    const tag = target.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function openNtv4x() {
    window.location.href = targetUrl;
  }

  function clearPressTimer() {
    if (!pressTimer) return;
    window.clearTimeout(pressTimer);
    pressTimer = null;
  }

  function launchFromUrl() {
    if (directHashes.has(window.location.hash.toLowerCase())) openNtv4x();
  }

  document.addEventListener('keydown', (event) => {
    if (shouldIgnore(event) || event.key.length !== 1) return;
    typed = (typed + event.key.toLowerCase()).replace(/[^a-z0-9]/g, '').slice(-32);
    if (triggers.some((trigger) => typed.endsWith(trigger))) {
      typed = '';
      openNtv4x();
    }
  });

  function bindTriggers() {
    document.querySelectorAll('.ntv4x-trigger').forEach((trigger) => {
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
          openNtv4x();
        }, longPressMs);
      });

      ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
        trigger.addEventListener(eventName, clearPressTimer);
      });

      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (longPressTriggered) {
          longPressTriggered = false;
          return;
        }
        openNtv4x();
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindTriggers();
      launchFromUrl();
    });
  } else {
    bindTriggers();
    launchFromUrl();
  }

  window.addEventListener('hashchange', launchFromUrl);
})();
