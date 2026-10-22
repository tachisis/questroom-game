import { $, $$, narrowOrTouch } from './util.js';

const SECONDS = 30;
const PEEK_MS = 1200;
const PAUSE_MIN_MS = 600;
const PAUSE_MAX_MS = 1200;
const POP_MS = 700;

const plural = new Intl.PluralRules('ru');
const PELMENI = { one: 'пельмень', few: 'пельменя', many: 'пельменей' };
const pelmeni = (n) => `${n} ${PELMENI[plural.select(n)]}`;

const randomBetween = (min, max) => min + Math.random() * (max - min);

function once(fn) {
  let called = false;
  function wrapped(...args) {
    if (called) return;
    called = true;
    return fn(...args);
  }
  wrapped.reset = () => { called = false; };
  return wrapped;
}

function makeScore(node) {
  let value = 0;
  let best = 0;
  const render = () => { node.textContent = value; };
  return {
    add() { value += 1; render(); },
    reset() { value = 0; render(); },
    commit() {
      best = Math.max(best, value);
      return { value, best };
    }
  };
}

function makePop(node, ms) {
  let timerId = null;
  function hide() {
    clearTimeout(timerId);
    timerId = null;
    node.hidden = true;
  }
  return {
    show() {
      hide();
      void node.offsetWidth; // flush display: none so the CSS animation restarts
      node.hidden = false;
      timerId = setTimeout(hide, ms);
    },
    hide
  };
}

// onGone fires when the dog leaves on its own or is caught; hide() is silent.
function makeSpot(el, onCatch) {
  const dog = $('[data-dog]', el);
  let timerId = null;
  let onGone = null;

  function hide() {
    clearTimeout(timerId);
    timerId = null;
    onGone = null;
    dog.hidden = true;
    el.classList.remove('is-active');
  }

  function leave() {
    const gone = onGone;
    hide();
    if (gone) gone();
  }

  function catchDog() {
    if (dog.hidden) return;
    onCatch();
    leave();
  }
  // catch on press: a click needs the release too, and the dog may be gone by then
  dog.addEventListener('pointerdown', catchDog);
  dog.addEventListener('click', catchDog); // keyboard; after a press the dog is already hidden

  return {
    show(ms, gone) {
      hide();
      onGone = gone;
      dog.hidden = false;
      el.classList.add('is-active');
      timerId = setTimeout(leave, ms);
    },
    hide
  };
}

function makeCountdown(seconds, onTick, onEnd) {
  let timerId = null;
  let left = seconds;

  function tick() {
    left -= 1;
    onTick(left);
    if (left > 0) timerId = setTimeout(tick, 1000);
    else { timerId = null; onEnd(); }
  }

  return {
    start() {
      clearTimeout(timerId);
      left = seconds;
      onTick(left);
      timerId = setTimeout(tick, 1000);
    },
    stop() {
      clearTimeout(timerId);
      timerId = null;
    }
  };
}

// The next pause starts only after the dog is gone, so there is never more than one dog.
function makeSpawner(spots, peekMs) {
  let timerId = null;
  let last = null;

  function pick() {
    let spot;
    do spot = spots[Math.floor(Math.random() * spots.length)];
    while (spot === last);
    last = spot;
    return spot;
  }

  function schedule() {
    timerId = setTimeout(() => {
      timerId = null;
      pick().show(peekMs, schedule);
    }, randomBetween(PAUSE_MIN_MS, PAUSE_MAX_MS));
  }

  return {
    start() {
      last = null;
      schedule();
    },
    stop() {
      clearTimeout(timerId);
      timerId = null;
      spots.forEach((spot) => spot.hide());
    }
  };
}

export function openGame() {
  const dialog = $(narrowOrTouch.matches ? '[data-game-mobile]' : '[data-game]');
  if (dialog && !dialog.open) dialog.showModal();
}

export function initGame() {
  const dialog = $('[data-game]');
  if (!dialog) return;

  const q = (sel) => $(sel, dialog);
  const time = q('[data-game-time]');
  const startPanel = q('[data-game-start-panel]');
  const play = q('[data-game-screen="play"]');
  const over = q('[data-game-screen="over"]');

  const score = makeScore(q('[data-game-score]'));
  const pop = makePop(q('[data-game-pop]'), POP_MS);
  const spots = $$('[data-spot]', dialog).map((el) => makeSpot(el, () => {
    score.add();
    pop.show();
  }));
  const spawner = makeSpawner(spots, PEEK_MS);
  const countdown = makeCountdown(SECONDS, renderTime, finish);

  const start = once(() => {
    startPanel.hidden = true;
    score.reset();
    countdown.start();
    spawner.start();
  });

  function renderTime(left) {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    time.textContent = `${mm}:${ss}`;
    time.classList.toggle('is-ending', left <= 5);
  }

  function stopAll() {
    countdown.stop();
    spawner.stop();
    pop.hide();
  }

  function finish() {
    stopAll();
    const { value, best } = score.commit();
    q('[data-game-final]').textContent = pelmeni(value);
    q('[data-game-best]').textContent = best;
    play.hidden = true;
    over.hidden = false;
  }

  function reset() {
    stopAll();
    score.reset();
    renderTime(SECONDS);
    over.hidden = true;
    play.hidden = false;
    startPanel.hidden = false;
    start.reset();
  }

  q('[data-game-start]').addEventListener('click', start);
  q('[data-game-restart]').addEventListener('click', reset);
  q('[data-game-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', reset); // close button, Esc and dialog.close() all land here
}
