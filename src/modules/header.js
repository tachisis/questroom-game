import { $, $$ } from './util.js';

// REC clock (03:14:07 → 59 → 00, the 14th minute never ends), equalizer = music toggle, menu guard.
export function initHeader({ music, lock }) {
  const secEl = $('[data-rec-sec]');
  let sec = 7;
  setInterval(() => { sec = (sec + 1) % 60; secEl.textContent = String(sec).padStart(2, '0'); }, 1000);

  // favicon REC light blinks in step with .rec b; browsers don't animate SVG favicons, so swap the href
  const icon = $('link[rel="icon"]');
  const iconOn = icon.href;
  const iconOff = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#06070a"/><circle cx="16" cy="16" r="9" fill="#3a0d10"/></svg>')}`;
  let iconLit = true;
  setInterval(() => { iconLit = !iconLit; icon.href = iconLit ? iconOn : iconOff; }, 600);

  const eq = $('[data-music-toggle]');
  const render = (on) => {
    eq.classList.toggle('on', on);
    eq.setAttribute('aria-pressed', String(on));
    eq.setAttribute('aria-label', on ? 'Выключить музыку' : 'Включить музыку');
  };
  eq.addEventListener('click', () => music.toggle());
  music.onChange(render);
  render(music.on);

  const nav = $('.nav');
  $$('[data-nav-guard]').forEach((a) => a.addEventListener('click', (e) => { if (!lock.unlocked) e.preventDefault(); }));

  return {
    showNav() { nav.classList.remove('locked'); nav.removeAttribute('aria-hidden'); },
    hideNav() { nav.classList.add('locked'); nav.setAttribute('aria-hidden', 'true'); }
  };
}
