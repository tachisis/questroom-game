import { $, $$, el, prefersReducedMotion } from './util.js';
import { openGame } from './game.js';

export function initCharacters(data) {
  const byId = new Map(data.characters.map((c) => [c.id, c]));
  const ordered = [...data.characters.filter((c) => !c.pinLast), ...data.characters.filter((c) => c.pinLast)];

  const playersGrid = $('[data-cast="player"]');
  const npcGrid = $('[data-cast="npc"]');
  let playerNo = 0;
  for (const c of ordered) {
    const isPlayer = c.group === 'player';
    if (isPlayer) playerNo += 1;
    // alt="": the name is printed right under the photo, screen readers would hear it twice
    const photo = el('span', { class: 'photo' }, [
      c.photo
        ? el('img', { src: c.photo, alt: '', loading: 'lazy', style: c.photoPosition ? `object-position:${c.photoPosition}` : null })
        : el('span', { class: 'sil' }),
      isPlayer ? el('span', { class: 'tag', text: String(playerNo).padStart(2, '0') }) : null
    ]);
    const card = el('button', { class: 'card', type: 'button', 'data-id': c.id }, [
      photo,
      el('span', { class: 'c-name', text: c.name }),
      el('span', { class: 'c-sub', text: c.subtitle || '' })
    ]);
    (isPlayer ? playersGrid : npcGrid).append(card);
  }
  $('[data-players-count]').textContent = String(playerNo).padStart(2, '0');

  const types = data.relationTypes;
  const word = (v, gender) => (typeof v === 'string' ? v : v[gender] || v.male);

  function relationsOf(id) {
    const out = [];
    for (const [from, to, type] of data.relations) {
      const t = types[type];
      if (!t) continue;
      if (to === id && byId.has(from)) out.push({ id: from, role: word(t.forward, byId.get(from).gender) });
      if (from === id && byId.has(to)) out.push({ id: to, role: word(t.inverse, byId.get(to).gender) });
    }
    // brothers and sisters: children of the same father, and the father's brothers among themselves
    const fam = data.siblingsOf || {};
    const kids = data.relations.filter(([f, , t]) => f === fam.father && t === 'father').map(([, k]) => k);
    const groups = [kids, fam.uncles || []];
    for (const g of groups) {
      if (!g.includes(id)) continue;
      for (const other of g) if (other !== id && byId.has(other)) {
        out.push({ id: other, role: byId.get(other).gender === 'female' ? 'сестра' : 'брат' });
      }
    }
    return out;
  }

  const box = $('[data-dossier]');
  const panel = $('.panel', box);
  const f = (k) => $(`[data-d-${k}]`, box);
  const TBD = '[неизвестно]';

  function open(id) {
    const c = byId.get(id);
    if (!c) return;
    if (c.playGame) return openGame();
    const isPlayer = c.group === 'player';
    const img = f('photo');
    if (c.photo) { img.src = c.photo; img.alt = c.name; img.hidden = false; } else { img.hidden = true; }
    f('kind').textContent = isPlayer ? 'Главный персонаж' : 'Связанный персонаж';
    f('name').textContent = c.name;
    f('age').textContent = c.age || TBD;
    f('occupation').textContent = c.occupation || TBD;
    f('player').textContent = isPlayer ? (c.player || TBD) : 'НПС';
    f('status').textContent = c.status || TBD;
    const bio = c.bio && c.bio.length ? c.bio : [TBD];
    f('bio').replaceChildren(...bio.map((t) => el('p', { text: t })));
    f('secret').textContent = c.secret || TBD;
    f('secret').hidden = true;
    f('reveal').hidden = false;
    f('rels').replaceChildren(...relationsOf(id).map((r) =>
      el('button', { class: 'rel', type: 'button', onclick: () => open(r.id) }, [byId.get(r.id).name, el('span', { text: r.role })])
    ));
    // <dialog> keeps focus inside, closes on Esc and returns focus to the card by itself
    if (!box.open) box.showModal();
    panel.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    panel.focus({ preventScroll: true });
  }

  const close = () => box.close();

  $$('.card[data-id]').forEach((card) => card.addEventListener('click', () => open(card.dataset.id)));
  f('reveal').addEventListener('click', () => {
    f('secret').hidden = false;
    f('reveal').hidden = true;
    f('secret').focus(); // the button is gone, keep focus where the text appeared
  });
  $$('[data-dossier-close]', box).forEach((b) => b.addEventListener('click', close));
  box.addEventListener('click', (e) => { if (e.target === box) close(); }); // the dimmed area outside .panel
}
