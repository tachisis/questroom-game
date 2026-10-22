import { $, el, shuffle, prefersReducedMotion } from './util.js';

// Prologue words fly in one by one in random order. The motion itself is a CSS transition
// (prologue.css); here the text is split into words, each word gets its delay, and an observer
// toggles .on when the text crosses the start line.
export function initReveal(cfg) {
  const text = $('[data-reveal]');
  if (!text) return { arm() {} };

  const parts = text.textContent.trim().split(/(\s+)/);
  text.replaceChildren(...parts.map((p) => (/^\s+$/.test(p) ? p : el('span', { class: 'word', text: p }))));
  const words = [...text.querySelectorAll('.word')];
  // random order = shuffled positions; on the way back the last word to arrive leaves first, 3× tighter so the scatter is seen
  const order = shuffle(words.map((_, i) => i));
  words.forEach((w, i) => {
    w.style.setProperty('--in', `${order[i] * cfg.stagger}s`);
    w.style.setProperty('--out', `${((words.length - 1 - order[i]) * cfg.stagger) / 3}s`);
  });
  text.style.setProperty('--dur', `${cfg.duration}s`);
  text.classList.add('is-split');

  if (prefersReducedMotion()) {
    text.classList.add('on');
    return { arm() {} };
  }

  let armed = false;
  return {
    // called after «Да»: before that the page is locked and the text can't be reached anyway
    arm() {
      if (armed) return;
      armed = true;
      // the start line sits cfg.start of the viewport from the top; scrolling back above it scatters the words again
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) text.classList.add('on');
        else if (e.boundingClientRect.top > e.rootBounds.bottom) text.classList.remove('on');
      }, { rootMargin: `0px 0px -${Math.round((1 - cfg.start) * 100)}% 0px` }).observe(text);
    }
  };
}
