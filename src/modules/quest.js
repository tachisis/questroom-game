import { $, $$, el, createTimers, shuffle } from './util.js';

export function initQuest(cfg, msg, { music, lock, onUnlock }) {
  const cta = $('[data-quest-start]');
  const toast = $('[data-toast]');
  const layer = $('[data-phone]');
  const feed = $('[data-feed]');
  const status = $('[data-status]');
  const input = $('[data-reply]');
  const sendBtn = $('[data-send]');
  $('[data-sender]').textContent = msg.sender;

  const timers = createTimers();
  const retry = shuffle(msg.retry);
  const s = { started: false, intro: false, ready: false, done: false, closing: false, retryIdx: 0 };

  const scrollFeed = () => { feed.scrollTop = feed.scrollHeight; };
  const setTyping = (on) => {
    status.textContent = on ? 'печатает…' : 'был(а) недавно';
    status.classList.toggle('typ', on);
  };
  const addTyping = () => {
    const node = el('div', { class: 'typing', 'aria-label': `${msg.sender} печатает` }, [el('i'), el('i'), el('i')]);
    feed.append(node); setTyping(true); scrollFeed();
    return node;
  };
  const dropTyping = (node) => { node.remove(); setTyping(false); };
  const bubble = (side, paragraphs, time) => {
    const node = el('div', { class: `bub ${side}` }, [...paragraphs, el('time', { text: time })]);
    feed.append(node); scrollFeed();
    return node;
  };
  const p = (text, cls) => el('p', { class: cls, text });

  const setInput = (enabled) => {
    s.ready = enabled;
    input.disabled = !enabled;
    sendBtn.disabled = !enabled;
  };
  const clearFeed = () => { $$('.bub, .typing', feed).forEach((n) => n.remove()); setTyping(false); };

  function start() {
    if (s.started) return;
    s.started = true;
    cta.classList.add('gone');
    music.start();
    timers.later(() => { toast.hidden = false; music.ping(); }, cfg.toastDelayMs);
  }

  function openPhone() {
    toast.hidden = true;
    layer.classList.remove('closing');
    layer.hidden = false;
    if (s.intro) return;
    s.intro = true;
    let typing;
    timers.later(() => { typing = addTyping(); }, 1500);
    timers.later(() => {
      dropTyping(typing);
      bubble('in', [...msg.invite.map((t) => p(t)), p(msg.prizeLabel, 'lbl'), p(msg.prize, 'sum')], msg.timeIn);
    }, 3300);
    timers.later(() => { bubble('in', [p(msg.prompt)], msg.timeIn); setInput(true); }, 4600);
    timers.later(() => { try { input.focus({ preventScroll: true }); } catch { /* ignore */ } }, 4800);
  }

  function minimize() {
    if (layer.hidden || s.closing) return;
    s.closing = true;
    layer.classList.add('closing');
    setTimeout(() => {
      layer.hidden = true;
      layer.classList.remove('closing');
      s.closing = false;
      if (!s.done) toast.hidden = false;
    }, 500);
  }

  function reset() {
    if (layer.hidden || s.closing || s.done) return;
    timers.clear();
    s.closing = true;
    layer.classList.add('closing');
    music.stop();
    setTimeout(() => {
      layer.hidden = true;
      layer.classList.remove('closing');
      clearFeed();
      input.value = '';
      input.placeholder = 'Сообщение';
      setInput(false);
      Object.assign(s, { started: false, intro: false, closing: false, retryIdx: 0 });
      toast.hidden = true;
      cta.classList.remove('gone');
    }, 500);
  }

  const normalize = (v) => String(v || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[.!\s]+$/, '');

  function send() {
    if (!s.ready || s.done) return;
    const raw = input.value;
    const v = normalize(raw);
    if (!v) return;
    input.value = '';

    if (v !== msg.answer) {
      bubble('out', [p(raw.trim())], `${msg.timeOut} ✓✓`);
      let typing;
      timers.later(() => { typing = addTyping(); }, 500);
      timers.later(() => {
        dropTyping(typing);
        bubble('in', [p(retry[s.retryIdx % retry.length])], msg.timeOut);
        s.retryIdx += 1;
        music.ping();
      }, 1700);
      return;
    }

    s.done = true;
    setInput(false);
    input.placeholder = 'Ответ отправлен';
    bubble('out', [p('Да')], `${msg.timeOut} ✓✓`);
    let typing;
    timers.later(() => { typing = addTyping(); }, 700);
    timers.later(() => { dropTyping(typing); bubble('in', [p(msg.accepted)], msg.timeOut); music.ping(); }, 2200);
    timers.later(minimize, 4200);
    timers.later(() => { lock.unlock(); onUnlock(); }, 4600);
    timers.later(() => { document.getElementById('world').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, cfg.scrollToAfterYesMs);
  }

  cta.addEventListener('click', start);
  toast.addEventListener('click', openPhone);
  $$('[data-phone-minimize]').forEach((b) => b.addEventListener('click', minimize));
  $$('[data-phone-reset]').forEach((b) => b.addEventListener('click', reset));
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); send(); }
  });
}
