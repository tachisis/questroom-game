export function createMusic(cfg, { isUnlocked }) {
  const tracks = {};
  let wanted = false;          // user wants music on
  let current = null;
  let token = 0;               // cancels stale switches
  let ctx = null;
  const listeners = new Set();

  const ext = (() => {
    try { return document.createElement('audio').canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp4'; }
    catch { return 'mp4'; }
  })();

  const get = (zone) => {
    if (!tracks[zone]) {
      const a = new Audio();
      a.preload = 'auto';
      a.loop = true;
      a.volume = 0;
      a.src = `${cfg.tracks[zone]}.${ext}`;
      tracks[zone] = a;
    }
    return tracks[zone];
  };

  const fade = (a, to, ms, done) => {
    if (a._fade) clearInterval(a._fade);
    const from = a.volume, t0 = performance.now();
    a._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(a._fade); a._fade = 0; done && done(); }
    }, 30);
  };

  const zoneNow = () => {
    if (document.querySelector('[data-game][open]')) return 'game';
    if (!isUnlocked()) return 'hero';
    const chars = document.getElementById('characters');
    if (chars && chars.getBoundingClientRect().top < window.innerHeight * cfg.charsZoneAt) return 'chars';
    return 'setting';
  };

  const play = (zone) => {
    if (!wanted) return;
    if (zone === current) {
      const a = get(zone);
      if (a.paused) a.play().catch(() => {});
      fade(a, cfg.volume, 1500);
      return;
    }
    const prev = current ? tracks[current] : null;
    current = zone;
    const my = ++token;
    const start = () => {
      if (my !== token || !wanted) return;
      const a = get(zone);
      a.volume = 0;
      a.play().catch(() => {});
      fade(a, cfg.volume, cfg.fadeInMs);
    };
    if (prev && !prev.paused && prev.volume > 0.01) fade(prev, 0, cfg.fadeOutMs, () => { prev.pause(); start(); });
    else start();
  };

  const emit = () => listeners.forEach((fn) => fn(wanted));

  const api = {
    get on() { return wanted; },
    onChange(fn) { listeners.add(fn); },
    start() {
      wanted = true;
      try {
        if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
        ctx && ctx.resume();
      } catch { /* no ping then */ }
      Object.keys(cfg.tracks).forEach((z) => { try { get(z).load(); } catch { /* ignore */ } });
      play(zoneNow());
      emit();
    },
    stop() {
      wanted = false;
      token++;
      Object.values(tracks).forEach((a) => { if (!a.paused) fade(a, 0, 900, () => a.pause()); });
      current = null;
      emit();
    },
    toggle() { wanted ? api.stop() : api.start(); },
    checkZone() {
      if (!wanted) return;
      const z = zoneNow();
      if (z !== current) play(z);
    },
    ping() {
      if (!ctx || !wanted) return;
      const t = ctx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const g = ctx.createGain(); const s = t + i * 0.12;
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.1, s + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, s + 0.35);
        o.connect(g); g.connect(ctx.destination); o.start(s); o.stop(s + 0.4);
      });
    }
  };

  let raf = 0;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; api.checkZone(); });
  }, { passive: true });

  return api;
}
