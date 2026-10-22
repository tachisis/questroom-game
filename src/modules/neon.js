import { $ } from './util.js';

// Armed only after the page is unlocked, so neither can fire unseen behind the hero.
export function initNeon() {
  const targets = [
    [$('[data-neon]'), { threshold: 1, rootMargin: '0px 0px -15% 0px' }],
    [$('[data-rewrite]'), { rootMargin: '-45% 0px -45% 0px' }]
  ];
  let armed = false;
  return {
    arm() {
      if (armed) return;
      armed = true;
      for (const [node, opts] of targets) {
        if (!node) continue;
        if (!('IntersectionObserver' in window)) { node.classList.add('on'); continue; }
        const io = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) { node.classList.add('on'); io.disconnect(); }
        }, opts);
        io.observe(node);
      }
    }
  };
}
