import { CONFIG } from './config.js';
import { loadJSON, narrowOrTouch, prefersReducedMotion } from './modules/util.js';
import { createScrollLock } from './modules/scroll-lock.js';
import { createMusic } from './modules/music.js';
import { initHeader } from './modules/header.js';
import { initHero } from './modules/hero.js';
import { initQuest } from './modules/quest.js';
import { initCharacters } from './modules/characters.js';
import { initNeon } from './modules/neon.js';
import { initReveal } from './modules/reveal.js';
import { initGame } from './modules/game.js';

document.documentElement.classList.add('js');

// Safari on macOS 10.15 and older can't decode WebP: an <img> that fails gets the .jpg next to it
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.src.endsWith('.webp')) img.src = img.src.replace(/\.webp$/, '.jpg');
}, true);

async function boot() {
  // Safari before 15.4 has no <dialog>, and without it the quest phone never opens: the polyfill is downloaded only there
  if (!('showModal' in document.createElement('dialog'))) {
    const [{ default: dialogPolyfill }] = await Promise.all([
      import('dialog-polyfill'),
      import('dialog-polyfill/dist/dialog-polyfill.css')
    ]);
    document.querySelectorAll('dialog').forEach((d) => {
      dialogPolyfill.registerDialog(d);
      // the native dialog gives focus back on close, the polyfill doesn't
      const showModal = d.showModal;
      let back = null;
      d.showModal = () => { back = document.activeElement; showModal(); };
      d.addEventListener('close', () => back && back.focus());
    });
  }

  // lock first: the page must not scroll while the data is still on its way
  const lock = createScrollLock();
  // the cards are below the locked part, so the hero and the quest don't wait for them
  loadJSON('data/characters.json').then(initCharacters).catch((err) => console.error('[kvestrum]', err));
  const [news, messenger] = await Promise.all([
    loadJSON('data/news.json'),
    loadJSON('data/messenger.json')
  ]);

  const music = createMusic(CONFIG.music, { isUnlocked: () => lock.unlocked });
  const header = initHeader({ music, lock });
  initHero(CONFIG.hero, news.news);
  const neon = initNeon();
  const reveal = initReveal(CONFIG.reveal);
  initGame();
  // showModal() has no event of its own, so the game music follows the dialog's open attribute
  new MutationObserver(() => music.checkZone()).observe(document.querySelector('[data-game]'), { attributes: true, attributeFilter: ['open'] });

  initQuest(CONFIG.quest, messenger, {
    music,
    lock,
    onUnlock() {
      header.showNav();
      neon.arm();
      reveal.arm();
      music.checkZone();
    }
  });

  if (CONFIG.DEV_SKIP_INTRO) {
    document.querySelector('[data-quest-start]').classList.add('gone');
    lock.unlock();
    header.showNav();
    neon.arm();
    reveal.arm();
  }

  // the cursor is hidden by CSS on narrow/touch screens, so don't even download it there
  if (CONFIG.FLUID_CURSOR && !narrowOrTouch.matches && !prefersReducedMotion()) {
    const { initFluidCursor } = await import('./lib/fluid-cursor.js');
    const canvas = document.getElementById('fluid');
    canvas.hidden = false;
    initFluidCursor(canvas);
  }
}

boot().catch((err) => console.error('[kvestrum]', err));
