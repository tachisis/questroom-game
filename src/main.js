import { CONFIG } from './config.js';
import { loadJSON } from './modules/util.js';
import { createScrollLock } from './modules/scroll-lock.js';
import { createMusic } from './modules/music.js';
import { initHeader } from './modules/header.js';
import { initHero } from './modules/hero.js';
import { initQuest } from './modules/quest.js';
import { initCharacters } from './modules/characters.js';
import { initNeon } from './modules/neon.js';
import { initReveal } from './modules/reveal.js';

document.documentElement.classList.add('js');

async function boot() {
  const [chars, news, messenger] = await Promise.all([
    loadJSON('data/characters.json'),
    loadJSON('data/news.json'),
    loadJSON('data/messenger.json')
  ]);

  const lock = createScrollLock();
  const music = createMusic(CONFIG.music, { isUnlocked: () => lock.unlocked });
  const header = initHeader({ music, lock });
  initHero(CONFIG.hero, news.news);
  initCharacters(chars);
  const neon = initNeon();
  const reveal = initReveal(CONFIG.reveal);

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

  if (CONFIG.FLUID_CURSOR) {
    const { initFluidCursor } = await import('./lib/fluid-cursor.js');
    const canvas = document.getElementById('fluid');
    canvas.hidden = false;
    initFluidCursor(canvas);
  }
}

boot().catch((err) => console.error('[kvestrum]', err));
