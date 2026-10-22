export function createMusic(cfg, { isUnlocked }) {
  const tracks = {};
  let wanted = false;          // user wants music on
  let current = null;
  let token = 0;               // cancels stale switches
  let ctx = null;
  const listeners = new Set();
  let charsReached = false;    // set by the observer at the bottom

  const ext = (() => {
    try { return document.createElement('audio').canPlayType('audio/webm; codecs="opus"') ? 'webm' : 'mp4'; }
    catch { return 'mp4'; }
  })();

  const get = (zone) => {
    if (!tracks[zone]) {
      const a = new Audio();
      a.preload = 'auto';
      a.loop = true;
      a.src = `${cfg.tracks[zone]}.${ext}`;
      // iOS ignores audio.volume, so the level goes through a Web Audio gain wherever there is one
      if (ctx) {
        a._gain = ctx.createGain();
        ctx.createMediaElementSource(a).connect(a._gain).connect(ctx.destination);
      }
      vol(a, 0);
      // Safari may still start a track after the pause() that follows the unlock in start(): only the current one may play
      a.addEventListener('playing', () => { if (!wanted || tracks[current] !== a) a.pause(); });
      tracks[zone] = a;
    }
    return tracks[zone];
  };

  function vol(a, v) {
    if (v === undefined) return a._gain ? a._gain.gain.value : a.volume;
    if (a._gain) a._gain.gain.value = v; else a.volume = v;
  }

  const fade = (a, to, ms, done) => {
    if (a._fade) clearInterval(a._fade);
    const from = vol(a), t0 = performance.now();
    a._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      vol(a, Math.max(0, Math.min(1, from + (to - from) * k)));
      if (k >= 1) { clearInterval(a._fade); a._fade = 0; done && done(); }
    }, 30);
  };

  const zoneNow = () => {
    if (document.querySelector('[data-game][open]')) return 'game';
    if (!isUnlocked()) return 'hero';
    return charsReached ? 'chars' : 'setting';
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
      vol(a, 0);
      a.play().catch(() => {});
      fade(a, cfg.volume, cfg.fadeInMs);
    };
    if (prev && !prev.paused && vol(prev) > 0.01) fade(prev, 0, cfg.fadeOutMs, () => { prev.pause(); start(); });
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
      play(zoneNow());
      // iOS lets an <audio> play() without a tap only once a tap has called play() on it: unlock the other tracks inside this one.
      // pause() right away, not after the promise: Safari may never settle it and the track would keep playing
      Object.keys(cfg.tracks).forEach((z) => {
        const a = get(z);
        if (z === current || !a.paused) return;
        a.play().catch(() => {});
        a.pause();
      });
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

  // iOS pauses the audio by itself (screen lock, a call, a long idle) and never resumes it: the next tap brings it back
  const revive = () => {
    if (!wanted || !current) return;
    if (ctx && ctx.state !== 'running') ctx.resume();
    if (Object.values(tracks).every((a) => a.paused)) play(current); // not mid-crossfade
  };
  ['touchend', 'click'].forEach((t) => document.addEventListener(t, revive));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) revive(); });

  // «Персонажи» is reached when its top passes charsZoneAt of the viewport, and stays reached everywhere below
  const chars = document.getElementById('characters');
  if (chars) new IntersectionObserver(([e]) => {
    charsReached = e.isIntersecting || e.boundingClientRect.top < 0;
    api.checkZone();
  }, { rootMargin: `0px 0px -${Math.round((1 - cfg.charsZoneAt) * 100)}% 0px` }).observe(chars);

  return api;
}
