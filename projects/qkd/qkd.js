"use strict";

(function () {
  // ---- CONSTANTS ----------------------------------------------------------
  const BASIS = { RECT: "+", DIAG: "x" };
  const BASIS_LABEL = { "+": "+", "x": "×" };
  // Polarization glyphs: rectilinear basis encodes 0 as →, 1 as ↑;
  // diagonal basis encodes 0 as ↗, 1 as ↘.
  const POLARIZATION = { "+": ["→", "↑"], "x": ["↗", "↘"] };

  // ~11% is the Shor–Preskill security bound: at or above it, no secure key
  // can be distilled even with error correction + privacy amplification.
  // This simulation models a noiseless channel, so a clean run always shows
  // 0% and any nonzero QBER is Eve's doing — but a small sample can still
  // let her slip under the bound by luck, and the UI says so when it happens.
  const QBER_SECURITY_BOUND = 0.11;
  const SAMPLE_FRACTION = 0.5;
  const SMALL_SAMPLE_CUTOFF = 20;

  const STEP_TRAVEL_MS = 900;
  const TOTAL_AUTO_MS = 4500;
  const PHASE_BEAT_MS = 500;

  // ---- DOM REFS -----------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const el = {
    cryptoError: $("cryptoError"),
    modeStep: $("modeStep"),
    modeAuto: $("modeAuto"),
    photonCount: $("photonCount"),
    eveToggle: $("eveToggle"),
    runBtn: $("runBtn"),
    stepBtn: $("stepBtn"),
    resetBtn: $("resetBtn"),
    channel: $("channel"),
    photonEl: $("photonEl"),
    eveNode: $("eveNode"),
    aliceBit: $("aliceBit"),
    aliceBasis: $("aliceBasis"),
    eveBasis: $("eveBasis"),
    bobBasis: $("bobBasis"),
    bobResult: $("bobResult"),
    channelStatus: $("channelStatus"),
    protocolTable: $("protocolTable"),
    protocolBody: $("protocolBody"),
    logEmpty: $("logEmpty"),
    logKey: $("logKey"),
    tableScroll: document.querySelector(".table-scroll"),
    statSent: $("statSent"),
    statSifted: $("statSifted"),
    statSample: $("statSample"),
    statQber: $("statQber"),
    verdictBadge: $("verdictBadge"),
    qberCaveat: $("qberCaveat"),
    keyPreview: $("keyPreview"),
    keyLen: $("keyLen"),
    keyBits: $("keyBits"),
    otpMessage: $("otpMessage"),
    otpEncryptBtn: $("otpEncryptBtn"),
    otpWarn: $("otpWarn"),
    otpOutput: $("otpOutput"),
    otpCipher: $("otpCipher"),
    otpRevealBtn: $("otpRevealBtn"),
    otpPlainRow: $("otpPlainRow"),
    otpPlain: $("otpPlain"),
  };

  // ---- RANDOMNESS ---------------------------------------------------------
  // All protocol randomness comes from the browser CSPRNG. Real QKD derives
  // its randomness from the quantum measurements themselves (vacuum noise,
  // photon arrival times); crypto.getRandomValues() is the classical stand-in
  // for that physical entropy source. If it's unavailable we fail loudly —
  // never silently degrade to Math.random().
  const hasCrypto = typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function";

  function randomBit() {
    const b = new Uint8Array(1);
    crypto.getRandomValues(b);
    return b[0] & 1;
  }

  function randomBasis() {
    return randomBit() ? BASIS.DIAG : BASIS.RECT;
  }

  // Unbiased integer in [0, maxExclusive) via rejection sampling (avoids
  // modulo bias).
  function randomInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    const buf = new Uint32Array(1);
    let v;
    do {
      crypto.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % maxExclusive;
  }

  // First k indices of an unbiased partial Fisher–Yates shuffle of [0, n).
  function randomSubsetIndices(n, k) {
    const pool = Array.from({ length: n }, (_, i) => i);
    for (let i = 0; i < k; i++) {
      const j = i + randomInt(n - i);
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, k);
  }

  // ---- PROTOCOL ENGINE (pure — no DOM, no animation) ----------------------
  function generatePhoton(index) {
    return {
      index,
      alice: { bit: randomBit(), basis: randomBasis() },
      eve: null,
      bob: null,
      sifted: false,
      sacrificed: false,
      qberMismatch: null,
    };
  }

  // Intercept-resend attack: Eve measures in a random basis, then resends a
  // fresh photon encoding *her* result in *her* basis. Alice's original state
  // is destroyed — the no-cloning theorem forbids her keeping a copy.
  function applyEveIntercept(photon) {
    const basis = randomBasis();
    const measuredBit = basis === photon.alice.basis ? photon.alice.bit : randomBit();
    photon.eve = { basis, measuredBit, resent: { bit: measuredBit, basis } };
    return photon;
  }

  // Bob measures whatever actually arrives (Eve's resend if she intercepted).
  // Matching basis → the encoded bit with certainty; mismatched basis → a
  // uniformly random outcome.
  function applyBobMeasurement(photon) {
    const incoming = photon.eve ? photon.eve.resent : photon.alice;
    const basis = randomBasis();
    const result = basis === incoming.basis ? incoming.bit : randomBit();
    photon.bob = { basis, result };
    // Sifting compares Alice's and Bob's *bases* over the public channel —
    // never the bits themselves.
    photon.sifted = photon.alice.basis === basis;
    return photon;
  }

  function runProtocolOnPhoton(index, eveEnabled) {
    const p = generatePhoton(index);
    if (eveEnabled) applyEveIntercept(p);
    return applyBobMeasurement(p);
  }

  function siftPhotons(photons) {
    return photons.filter((p) => p.sifted);
  }

  // Sacrifice a random subset of sifted bits: Alice and Bob disclose them
  // publicly and compare. Disclosed bits are burned — they must be excluded
  // from the final key (reusing them is a classic implementation bug).
  function estimateQber(sifted) {
    const sampleSize = Math.floor(sifted.length * SAMPLE_FRACTION);
    if (sampleSize === 0) {
      return { sampleSize: 0, errorCount: 0, qber: null, keyPhotons: [] };
    }
    const indices = randomSubsetIndices(sifted.length, sampleSize);
    let errorCount = 0;
    for (const i of indices) {
      const p = sifted[i];
      p.sacrificed = true;
      p.qberMismatch = p.alice.bit !== p.bob.result;
      if (p.qberMismatch) errorCount++;
    }
    return {
      sampleSize,
      errorCount,
      qber: errorCount / sampleSize,
      keyPhotons: sifted.filter((p) => !p.sacrificed),
    };
  }

  function deriveFinalKey(keyPhotons) {
    return keyPhotons.map((p) => p.alice.bit);
  }

  function verdictForQber(qber) {
    return qber >= QBER_SECURITY_BOUND ? "compromised" : "clean";
  }

  function bitsToBytes(bits) {
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
      bytes[i] = b;
    }
    return bytes;
  }

  function xorBytes(data, keyBytes) {
    return data.map((byte, i) => byte ^ keyBytes[i]);
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
  }

  // ---- STATE --------------------------------------------------------------
  const state = {
    phase: "idle", // idle | running | sifting | qber-check | key-ready | compromised
    mode: "step",
    eveEnabled: false,
    photonCount: 16,
    photons: [],
    cursor: 0,
    awaitingStep: false,
    animating: false,
    qberResult: null,
    key: null,
    runId: 0, // bumped on start/reset so stale timers/animations abort
    autoTimer: null,
  };

  function setPhase(next) {
    state.phase = next;
    document.body.dataset.phase = next;
    updateControls();
  }

  function prefersReducedMotion() {
    if (document.documentElement.dataset.envMotion === "reduce") return true;
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // Pedagogical pause between protocol stages; skipped under reduced motion.
  // The runId guard means a Reset during the pause cancels the continuation.
  function beat(cb) {
    if (prefersReducedMotion()) {
      cb();
      return;
    }
    const id = state.runId;
    setTimeout(() => {
      if (state.runId === id) cb();
    }, PHASE_BEAT_MS);
  }

  // ---- RENDERING ----------------------------------------------------------
  function setStatus(text) {
    el.channelStatus.textContent = text;
  }

  function basisSpan(basis) {
    const cls = basis === BASIS.RECT ? "b-rect" : "b-diag";
    return '<span class="' + cls + '">' + BASIS_LABEL[basis] + "</span>";
  }

  function buildRow(p) {
    const tr = document.createElement("tr");
    tr.dataset.index = p.index;
    if (!p.sifted) tr.className = "row-discarded";
    const photonGlyph = POLARIZATION[p.alice.basis][p.alice.bit];
    let cells =
      "<td>" + (p.index + 1) + "</td>" +
      "<td>" + p.alice.bit + "</td>" +
      "<td>" + basisSpan(p.alice.basis) + "</td>" +
      "<td>" + photonGlyph + "</td>";
    cells += p.eve
      ? '<td class="col-eve cell-eve">' + BASIS_LABEL[p.eve.basis] + "</td>"
      : '<td class="col-eve">–</td>';
    cells +=
      "<td>" + basisSpan(p.bob.basis) + "</td>" +
      "<td>" + p.bob.result + "</td>" +
      "<td>" + (p.sifted ? '<span class="sift-yes">✓</span>' : '<span class="sift-no">✗</span>') + "</td>";
    tr.innerHTML = cells;
    return tr;
  }

  function appendRows(photons) {
    const frag = document.createDocumentFragment();
    for (const p of photons) frag.appendChild(buildRow(p));
    el.protocolBody.appendChild(frag);
    el.logEmpty.hidden = true;
    el.tableScroll.scrollTop = el.tableScroll.scrollHeight;
  }

  // After QBER estimation, restyle sacrificed/error rows in place.
  function markSacrificedRows() {
    for (const p of state.photons) {
      if (!p.sacrificed) continue;
      const row = el.protocolBody.querySelector('tr[data-index="' + p.index + '"]');
      if (!row) continue;
      row.classList.add(p.qberMismatch ? "row-error" : "row-sacrificed");
    }
    el.logKey.hidden = false;
  }

  function renderAliceState(p) {
    el.aliceBit.textContent = p.alice.bit;
    el.aliceBasis.innerHTML = basisSpan(p.alice.basis);
  }

  function renderEveState(p) {
    el.eveBasis.innerHTML = p.eve ? basisSpan(p.eve.basis) : "–";
  }

  function renderBobState(p) {
    el.bobBasis.innerHTML = basisSpan(p.bob.basis);
    el.bobResult.textContent = p.bob.result;
  }

  function renderChannelState(p) {
    renderAliceState(p);
    renderEveState(p);
    renderBobState(p);
  }

  function clearChannelState() {
    el.aliceBit.textContent = "–";
    el.aliceBasis.textContent = "–";
    el.eveBasis.textContent = "–";
    el.bobBasis.textContent = "–";
    el.bobResult.textContent = "–";
  }

  function renderStats() {
    el.statSent.textContent = state.photons.length;
    el.statSifted.textContent = siftPhotons(state.photons).length;
    if (state.qberResult && state.qberResult.sampleSize > 0) {
      el.statSample.textContent = state.qberResult.sampleSize + " bits";
      el.statQber.textContent = (state.qberResult.qber * 100).toFixed(1) + "%";
      el.qberCaveat.hidden = state.qberResult.sampleSize >= SMALL_SAMPLE_CUTOFF;
    } else {
      el.statSample.textContent = "–";
      el.statQber.textContent = "–";
      el.qberCaveat.hidden = true;
    }
  }

  function renderVerdict(kind, label) {
    el.verdictBadge.className = "verdict-badge verdict-" + kind;
    el.verdictBadge.textContent = label;
  }

  function renderKeyPreview() {
    if (!state.key || state.key.length === 0) {
      el.keyPreview.hidden = true;
      return;
    }
    el.keyLen.textContent = state.key.length;
    const groups = [];
    for (let i = 0; i < state.key.length; i += 8) {
      groups.push(state.key.slice(i, i + 8).join(""));
    }
    el.keyBits.textContent = groups.join(" ");
    el.keyPreview.hidden = false;
  }

  function updateControls() {
    const idle = state.phase === "idle";
    const running = state.phase === "running";
    el.runBtn.disabled = !idle;
    el.stepBtn.disabled = !(running && state.mode === "step" && state.awaitingStep && !state.animating);
    el.resetBtn.disabled = idle;
    el.eveToggle.disabled = !idle;
    el.modeStep.disabled = !idle;
    el.modeAuto.disabled = !idle;
    el.photonCount.disabled = !idle;

    const keyReady = state.phase === "key-ready" && state.key && state.key.length >= 8;
    el.otpMessage.disabled = !keyReady;
    el.otpEncryptBtn.disabled = !keyReady;
  }

  // ---- ANIMATION (cosmetic — never touches protocol state) ----------------
  function photonClass(basis) {
    return basis === BASIS.RECT ? "photon-rect" : "photon-diag";
  }

  // Move the photon element to a track position, calling cb exactly once on
  // arrival (transitionend, with a timer fallback for hidden tabs).
  function moveTo(left, ms, cb) {
    let called = false;
    const finish = () => {
      if (called) return;
      called = true;
      el.photonEl.removeEventListener("transitionend", onEnd);
      cb();
    };
    const onEnd = (e) => {
      if (e.propertyName === "left") finish();
    };
    el.photonEl.addEventListener("transitionend", onEnd);
    setTimeout(finish, ms + 150);
    el.photonEl.style.left = left;
  }

  function animatePhoton(p, done) {
    if (prefersReducedMotion()) {
      done();
      return;
    }
    const id = state.runId;
    const guarded = () => {
      if (state.runId === id) done();
    };
    el.photonEl.textContent = POLARIZATION[p.alice.basis][p.alice.bit];
    el.photonEl.className = "photon " + photonClass(p.alice.basis);
    el.photonEl.style.transitionDuration = "0ms";
    el.photonEl.style.left = "0%";
    el.photonEl.hidden = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (state.runId !== id) return;
        const legMs = p.eve ? STEP_TRAVEL_MS / 2 : STEP_TRAVEL_MS;
        el.photonEl.style.transitionDuration = legMs + "ms";
        if (!p.eve) {
          moveTo("100%", legMs, () => {
            el.photonEl.hidden = true;
            guarded();
          });
          return;
        }
        moveTo("50%", legMs, () => {
          if (state.runId !== id) return;
          // Eve intercepts: the photon that continues is her resend.
          const r = p.eve.resent;
          el.photonEl.textContent = POLARIZATION[r.basis][r.bit];
          el.photonEl.className = "photon photon-intercepted " + photonClass(r.basis);
          renderEveState(p);
          el.eveNode.classList.add("eve-flash");
          setTimeout(() => el.eveNode.classList.remove("eve-flash"), 350);
          moveTo("100%", legMs, () => {
            el.photonEl.hidden = true;
            guarded();
          });
        });
      });
    });
  }

  // ---- RUN DRIVERS --------------------------------------------------------
  function takePhoton() {
    const p = runProtocolOnPhoton(state.cursor, state.eveEnabled);
    state.photons.push(p);
    state.cursor++;
    return p;
  }

  function startRun() {
    if (state.phase !== "idle" || !hasCrypto) return;
    state.runId++;
    state.photonCount = parseInt(el.photonCount.value, 10);
    state.photons = [];
    state.cursor = 0;
    state.qberResult = null;
    state.key = null;
    el.channel.classList.add("wire-active");
    el.protocolTable.classList.toggle("has-eve", state.eveEnabled);
    setPhase("running");
    if (state.mode === "step") {
      state.awaitingStep = true;
      setStatus("Press Step to send photon 1 of " + state.photonCount + ".");
      updateControls();
    } else {
      advanceAutoRun();
    }
  }

  function stepOnce() {
    if (state.phase !== "running" || !state.awaitingStep || state.animating) return;
    state.awaitingStep = false;
    state.animating = true;
    updateControls();
    const p = takePhoton();
    renderAliceState(p);
    el.eveBasis.textContent = "–";
    el.bobBasis.textContent = "–";
    el.bobResult.textContent = "–";
    setStatus("Photon " + state.cursor + " of " + state.photonCount + " in flight…");
    animatePhoton(p, () => {
      renderEveState(p);
      renderBobState(p);
      appendRows([p]);
      renderStats();
      state.animating = false;
      if (state.cursor >= state.photonCount) {
        finishTransmission();
      } else {
        state.awaitingStep = true;
        const match = p.alice.basis === p.bob.basis;
        setStatus(
          "Bob measured " + p.bob.result + " in the " + BASIS_LABEL[p.bob.basis] + " basis — bases " +
          (match ? "match: bit kept. " : "differ: bit will be discarded. ") +
          "Press Step for photon " + (state.cursor + 1) + " of " + state.photonCount + "."
        );
        updateControls();
      }
    });
  }

  function advanceAutoRun() {
    const id = state.runId;
    const total = state.photonCount;
    if (prefersReducedMotion()) {
      const batch = [];
      while (state.cursor < total) batch.push(takePhoton());
      appendRows(batch);
      renderChannelState(batch[batch.length - 1]);
      renderStats();
      finishTransmission();
      return;
    }
    const ticks = Math.min(total, 30);
    const perTick = Math.ceil(total / ticks);
    const tickMs = TOTAL_AUTO_MS / ticks;
    const tick = () => {
      if (state.runId !== id || state.phase !== "running") return;
      const batch = [];
      for (let i = 0; i < perTick && state.cursor < total; i++) batch.push(takePhoton());
      appendRows(batch);
      renderChannelState(batch[batch.length - 1]);
      renderStats();
      setStatus("Transmitting… " + state.cursor + " / " + total + " photons.");
      if (state.cursor >= total) {
        finishTransmission();
      } else {
        state.autoTimer = setTimeout(tick, tickMs);
      }
    };
    tick();
  }

  function finishTransmission() {
    el.channel.classList.remove("wire-active");
    setPhase("sifting");
    setStatus("Comparing measurement bases over the public channel… (bases only — never bits)");
    beat(() => {
      const sifted = siftPhotons(state.photons);
      setPhase("qber-check");
      setStatus(
        "Sifting kept " + sifted.length + " of " + state.photons.length +
        " bits. Sacrificing half of them to estimate the error rate…"
      );
      beat(() => {
        state.qberResult = estimateQber(sifted);
        markSacrificedRows();
        renderStats();
        if (state.qberResult.sampleSize === 0) {
          setPhase("compromised");
          renderVerdict("pending", "Inconclusive");
          setStatus("Too few sifted bits to check for eavesdropping. Reset and try more photons.");
          return;
        }
        const verdict = verdictForQber(state.qberResult.qber);
        const pct = (state.qberResult.qber * 100).toFixed(1);
        if (verdict === "clean") {
          state.key = deriveFinalKey(state.qberResult.keyPhotons);
          renderKeyPreview();
          setPhase("key-ready");
          renderVerdict("clean", "Channel clean");
          setStatus(
            "QBER " + pct + "% — below the security bound. " + state.key.length +
            " secret bits established." +
            (state.eveEnabled
              ? " (Eve was listening but this sample missed her — detection is probabilistic. Run again.)"
              : state.key.length >= 8 ? " Try encrypting a message below." : "")
          );
        } else {
          state.key = null;
          renderKeyPreview();
          setPhase("compromised");
          renderVerdict("compromised", "Channel compromised");
          setStatus(
            "QBER " + pct + "% — at or above the ~11% security bound. " +
            "Someone measured these photons in transit. Key discarded."
          );
        }
      });
    });
  }

  function resetRun() {
    state.runId++;
    if (state.autoTimer) clearTimeout(state.autoTimer);
    state.photons = [];
    state.cursor = 0;
    state.awaitingStep = false;
    state.animating = false;
    state.qberResult = null;
    state.key = null;
    el.protocolBody.innerHTML = "";
    el.logEmpty.hidden = false;
    el.logKey.hidden = true;
    el.photonEl.hidden = true;
    el.channel.classList.remove("wire-active");
    clearChannelState();
    renderStats();
    renderVerdict("pending", "Awaiting data");
    renderKeyPreview();
    resetOtp();
    setPhase("idle");
    setStatus("Idle — configure a run and press Run.");
  }

  // ---- ONE-TIME PAD -------------------------------------------------------
  let lastCipher = null;

  function resetOtp() {
    lastCipher = null;
    el.otpMessage.value = "";
    el.otpWarn.hidden = true;
    el.otpOutput.hidden = true;
    el.otpPlainRow.hidden = true;
  }

  function encryptMessage() {
    if (!state.key) return;
    const text = el.otpMessage.value;
    if (!text) return;
    const msgBytes = new TextEncoder().encode(text);
    const keyBytes = bitsToBytes(state.key);
    el.otpPlainRow.hidden = true;
    if (msgBytes.length > keyBytes.length) {
      el.otpOutput.hidden = true;
      el.otpWarn.hidden = false;
      el.otpWarn.textContent =
        "Key too short: this message needs " + msgBytes.length * 8 + " key bits but only " +
        state.key.length + " were established. A one-time pad never stretches or reuses key " +
        "material — run 256 photons for a longer key, or shorten the message.";
      return;
    }
    lastCipher = xorBytes(msgBytes, keyBytes);
    el.otpWarn.hidden = true;
    el.otpCipher.textContent = bytesToHex(lastCipher);
    el.otpOutput.hidden = false;
  }

  function revealDecryption() {
    if (!lastCipher || !state.key) return;
    const keyBytes = bitsToBytes(state.key);
    const plainBytes = xorBytes(lastCipher, keyBytes);
    el.otpPlain.textContent = new TextDecoder().decode(plainBytes);
    el.otpPlainRow.hidden = false;
  }

  // ---- EVENT WIRING / INIT ------------------------------------------------
  function setMode(mode) {
    if (state.phase !== "idle") return;
    state.mode = mode;
    el.modeStep.classList.toggle("is-active", mode === "step");
    el.modeAuto.classList.toggle("is-active", mode === "auto");
    el.modeStep.setAttribute("aria-pressed", String(mode === "step"));
    el.modeAuto.setAttribute("aria-pressed", String(mode === "auto"));
  }

  function toggleEve() {
    if (state.phase !== "idle") return;
    state.eveEnabled = !state.eveEnabled;
    el.eveToggle.classList.toggle("eve-on", state.eveEnabled);
    el.eveToggle.setAttribute("aria-pressed", String(state.eveEnabled));
    el.eveToggle.textContent = state.eveEnabled ? "🕵️ Eve: on" : "🕵️ Eve: off";
    el.channel.classList.toggle("has-eve", state.eveEnabled);
  }

  function bindControls() {
    el.modeStep.addEventListener("click", () => setMode("step"));
    el.modeAuto.addEventListener("click", () => setMode("auto"));
    el.eveToggle.addEventListener("click", toggleEve);
    el.runBtn.addEventListener("click", startRun);
    el.stepBtn.addEventListener("click", stepOnce);
    el.resetBtn.addEventListener("click", resetRun);
    el.otpEncryptBtn.addEventListener("click", encryptMessage);
    el.otpMessage.addEventListener("keydown", (e) => {
      if (e.key === "Enter") encryptMessage();
    });
    el.otpRevealBtn.addEventListener("click", revealDecryption);
  }

  function init() {
    if (!hasCrypto) {
      el.cryptoError.hidden = false;
      el.runBtn.disabled = true;
      el.stepBtn.disabled = true;
      el.resetBtn.disabled = true;
      return;
    }
    bindControls();
    setPhase("idle");
    updateControls();
  }

  init();
})();
