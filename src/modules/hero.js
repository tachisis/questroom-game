import { $, $$, el, prefersReducedMotion } from './util.js';

export function initHero(cfg, news) {
  const hero = $('.hero');
  const layers = $$('[data-bg]', hero);
  let current = cfg.firstBackground;
  let flip = 0;

  hero.classList.toggle('noglitch', !cfg.glitch);
  $('.grain', hero).style.opacity = cfg.grain;

  const show = (name) => {
    current = name;
    cfg.backgrounds.forEach((b) => hero.classList.toggle(b, b === name));
    layers.forEach((l) => l.classList.toggle('on', l.dataset.bg === name));
  };
  show(current);

  const loadAll = () => hero.classList.add('all-bgs');
  if (document.readyState === 'complete') loadAll();
  else window.addEventListener('load', loadAll, { once: true });

  new IntersectionObserver(([e]) => hero.classList.toggle('is-off', !e.isIntersecting)).observe(hero);

  setInterval(() => {
    const i = cfg.backgrounds.indexOf(current);
    flip += 1;
    hero.classList.remove('flip-a', 'flip-b');
    void hero.offsetWidth; // restart the flash animation
    hero.classList.add(flip % 2 ? 'flip-a' : 'flip-b');
    show(cfg.backgrounds[(i + 1) % cfg.backgrounds.length]);
  }, cfg.switchEveryMs);

  const bg = $('[data-parallax-bg]');
  const title = $('[data-parallax-title]');
  let raf = 0;
  if (!prefersReducedMotion()) window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY || 0;
      bg.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
      title.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
      title.style.opacity = String(Math.max(0, 1 - y / 700));
    });
  }, { passive: true });

  // ticker: the list twice in a row for a seamless loop; screen readers get only the first copy
  const track = $('[data-ticker]');
  [false, true].forEach((copy) => news.forEach((t) =>
    track.append(el('div', { class: 'tk-item', 'aria-hidden': copy ? 'true' : null }, [el('span', { text: '///' }), t]))));

  // moved from JS, not a CSS animation: iOS Safari paints only part of an animated layer this wide, and the text vanishes
  if (prefersReducedMotion()) return;
  const ticker = track.closest('.ticker');
  const mouse = matchMedia('(hover: hover)'); // on touch screens :hover sticks after a tap
  let x = 0, last = 0;
  const step = (t) => {
    const dt = last ? t - last : 0;
    last = t;
    // paused while hovered or keyboard-focused (WCAG 2.2.2) and while the hero is off screen
    const hold = hero.classList.contains('is-off') || ticker.matches(':focus-visible') || (mouse.matches && ticker.matches(':hover'));
    if (!hold) {
      const half = track.offsetWidth / 2;
      x = (x + dt * half / cfg.tickerMs) % half;
      track.style.transform = `translateX(${-x}px)`;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
