import { $, $$, narrowOrTouch } from './util.js';

const SECONDS = 30;
const PEEK_MS = 1000;
const PAUSE_MIN_MS = 600;
const PAUSE_MAX_MS = 1200;
const POP_MS = 700;

const plural = new Intl.PluralRules('ru');
const PELMENI = { one: 'пельмень', few: 'пельменя', many: 'пельменей' };
const pelmeni = (n) => `${n} ${PELMENI[plural.select(n)]}`;

const randomBetween = (min, max) => min + Math.random() * (max - min);

// Хранит флаг «уже вызывали».
// Возвращает обёртку над fn: первый вызов запускает fn, остальные ничего не делают.
// reset() снимает флаг, и следующий вызов снова сработает.
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

// Хранит текущий счёт и рекорд за сессию.
// Возвращает { add, reset, commit }: add() прибавляет очко и выводит его,
// reset() обнуляет счёт (рекорд не трогает), commit() обновляет рекорд и отдаёт { value, best }.
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

// Хранит timerId надписи «+1 пельмень».
// Возвращает { show, hide }: show() показывает надпись заново (старый таймер отменяется,
// анимация перезапускается) и прячет её через ms; hide() прячет сразу и отменяет таймер.
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
      void node.offsetWidth; // браузер «замечает» display: none, поэтому CSS-анимация стартует с начала
      node.hidden = false;
      timerId = setTimeout(hide, ms);
    },
    hide
  };
}

// Хранит timerId скрытия пса в этом укрытии и колбэк onGone («пёс ушёл»).
// Возвращает { show, hide }: show(ms, onGone) показывает пса на ms и вызовет onGone,
// когда он уйдёт сам или его поймают; hide() прячет пса молча, без onGone.
// Клик по видимому псу вызывает onCatch; клики по уже спрятанному псу игнорируются.
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

  dog.addEventListener('click', () => {
    if (dog.hidden) return;
    onCatch();
    leave();
  });

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

// Хранит timerId следующего тика и сколько секунд осталось.
// Возвращает { start, stop }: start() показывает полное время и раз в секунду
// вызывает onTick(left), на нуле — onEnd(); stop() обрывает цепочку.
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

// Хранит timerId паузы перед следующим появлением и укрытие, где пёс был в прошлый раз.
// Возвращает { start, stop }: start() запускает цепочку «пауза → пёс выглядывает → пауза…»,
// следующая пауза начинается только когда пёс ушёл, поэтому пёс всегда один;
// stop() отменяет паузу и молча прячет всех псов.
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
  dialog.addEventListener('close', reset); // крестик, Esc и dialog.close() приходят сюда
}
