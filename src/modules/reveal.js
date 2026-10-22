import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import SplitType from 'split-type';
import { $, prefersReducedMotion } from './util.js';

gsap.registerPlugin(ScrollTrigger);

export function initReveal(cfg) {
  const text = $('[data-reveal]');
  if (!text) return { arm() {} };

  const split = new SplitType(text, { types: 'words', tagName: 'span' });
  const words = split.words || [];
  text.classList.add('is-split');
  gsap.set(words, { display: 'inline-block', backfaceVisibility: 'hidden', force3D: true });

  if (prefersReducedMotion()) {
    gsap.set(words, { opacity: 1 });
    return { arm() {} };
  }

  gsap.set(words, { opacity: 0, y: 50, filter: 'blur(2px)', transformOrigin: '50% 100%', willChange: 'transform, opacity, filter' });

  let armed = false;
  return {
    // called after «Да»: the page was locked before, so positions are measured from here
    arm() {
      if (armed) return;
      armed = true;
      const tween = gsap.to(words, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: cfg.duration,
        ease: 'power4.out',
        stagger: { each: cfg.stagger, from: 'random' },
        paused: true
      });
      // scrolling back above the start point plays the tween in reverse (words scatter); coming back re-assembles it
      ScrollTrigger.create({
        trigger: text,
        start: cfg.start,
        onEnter: () => tween.timeScale(1).play(),
        onLeaveBack: () => tween.timeScale(1.5).reverse()
      });
      ScrollTrigger.refresh();
    }
  };
}
