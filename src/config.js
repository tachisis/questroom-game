export const CONFIG = {
  DEV_SKIP_INTRO: false,              // debug: no phone / «Да», page is unlocked right away and fully visible
  hero: {
    firstBackground: 'city',          // 'city' | 'park' | 'forest'
    backgrounds: ['city', 'park', 'forest'],
    switchEveryMs: 15000,             // backgrounds change by themselves with a short flash
    glitch: true,                     // TV glitches on the hero
    grain: 0.6                        // 0…1, film grain strength
  },
  music: {
    volume: 0.55,
    fadeOutMs: 1400,                  // the previous track always fades to zero first…
    fadeInMs: 2000,                   // …then the next one fades in
    // zone → file (without extension); .webm (Opus) is used where supported, .mp4 (AAC) otherwise
    tracks: {
      hero: 'audio/hero',             // before the visitor answers «Да»
      setting: 'audio/setting',       // after «Да», in «Сеттинг»
      chars: 'audio/characters',      // «Персонажи» and everything below
      game: 'audio/game'              // while the «Поймай Пельменя» popup is open
    },
    charsZoneAt: 0.6                  // «Персонажи» counts as reached when its top passes 60% of the viewport
  },
  quest: {
    toastDelayMs: 1600,               // «1 новое сообщение» appears after «Начать квест»
    scrollToAfterYesMs: 4700
  },
  reveal: {
    start: 'top 50%',                 // prologue words start when the text reaches the middle of the screen
    duration: 6,                      // per-word settle time, s
    stagger: 0.14                     // delay between words (random order), s
  },
  FLUID_CURSOR: true                  // WebGL ink cursor (src/lib/fluid-cursor.js); hidden below 800px and on touch screens
};
