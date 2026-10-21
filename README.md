# Квеструм — сайт-визитка

Статический сайт словесной ролевой игры «Квеструм». Сборка — [Vite](https://vitejs.dev), без фреймворка: обычные HTML, CSS и JS-модули. Анимация текста в прологе сделана на GSAP + ScrollTrigger + SplitType. Любые другие npm-библиотеки подключаются так же.

## Запуск

```bash
npm install
npm run dev       # локальный сервер с автообновлением
npm run build     # готовый сайт в dist/
npm run preview   # посмотреть собранный dist/
```

`dist/` собирается с относительными путями (`base: './'`), поэтому его можно залить на любой хостинг или в подпапку.

## Структура

```
index.html                 разметка всех блоков
src/
  main.js                  точка входа: грузит данные и запускает модули
  config.js                настройки: смена фонов, громкость и треки по зонам, тайминги, курсор
  styles/
    index.css              подключает остальные файлы
    tokens.css             палитра и шрифты (CSS-переменные)
    base.css  header.css  hero.css  messenger.css  setting.css
    characters.css  prologue.css  about.css  dossier.css  effects.css  responsive.css
  modules/
    scroll-lock.js         блокировка прокрутки до ответа «Да»
    music.js               музыка по зонам с затуханием + звук уведомления
    header.js              REC-часы, эквалайзер, меню
    hero.js                смена фонов со вспышкой, параллакс, бегущая строка
    quest.js               «Начать квест» → уведомление → телефон → «Да»
    characters.js          карточки и досье из JSON
    neon.js                неоновая фраза в «Сеттинге»
    reveal.js              проявление слов в прологе (GSAP)
    util.js
  lib/fluid-cursor.js      WebGL-курсор «жидкость» (выключен: CONFIG.FLUID_CURSOR)
public/                    копируется в сборку как есть
  data/characters.json     персонажи, подписи, связи, досье
  data/news.json           бегущая строка
  data/messenger.json      тексты мессенджера и ответы на неверный ввод
  img/hero/  img/characters/  img/fx/trees.webp
  audio/                   треки в двух форматах: .webm (Opus) и .mp4 (AAC, для Safari)
```

## Как добавить персонажа

1. Положите фото 3:4 (например 600×800) в `public/img/characters/<id>.jpg`.
2. Добавьте запись в `characters` в `public/data/characters.json`:
   ```json
   { "id": "new", "name": "Имя", "gender": "male", "group": "npc",
     "subtitle": "Друг Коли", "photo": "img/characters/new.jpg",
     "age": null, "occupation": null, "status": null, "bio": [], "secret": null }
   ```
   Порядок в массиве — это порядок карточек. Карточка с `"pinLast": true` (Пельмень) всегда остаётся последней.
3. Если нужна связь в досье, добавьте `["new", "nikolay", "friend"]` в `relations`. Типы связей и их подписи в обе стороны описаны в `relationTypes`.

Пустые поля досье (`null` / `[]`) показываются заглушками «[уточнить]» и «Рыба…».

## Музыка

- hero до ответа «Да» → `audio/hero`
- «Сеттинг» → `audio/setting`
- «Персонажи» и ниже → `audio/characters`

Сначала текущий трек затихает до нуля, потом включается следующий. Тайминги и громкость задаются в `src/config.js → music`. Звук стартует только после клика на «Начать квест»: так требуют браузеры.
