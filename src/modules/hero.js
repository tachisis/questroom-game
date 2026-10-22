import { $, $$, el } from './util.js';

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
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY || 0;
      bg.style.transform = `translate3d(0, ${y * 0.35}px, 0)`;
      title.style.transform = `translate3d(0, ${y * 0.18}px, 0)`;
      title.style.opacity = String(Math.max(0, 1 - y / 700));
    });
  }, { passive: true });

  // ticker: the list twice in a row for a seamless loop
  const track = $('[data-ticker]');
  news.concat(news).forEach((t) => track.append(el('div', { class: 'tk-item' }, [el('span', { text: '///' }), t])));
}
