// The page can't be scrolled until the visitor answers «Да» in the messenger.
export function createScrollLock() {
  const root = document.documentElement;
  const body = document.body;
  const state = { unlocked: false };

  const apply = () => {
    root.classList.toggle('is-locked', !state.unlocked);
    body.classList.toggle('is-locked', !state.unlocked);
  };
  window.scrollTo(0, 0);
  apply();

  return {
    get unlocked() { return state.unlocked; },
    unlock() { state.unlocked = true; apply(); },
    lock() { state.unlocked = false; apply(); window.scrollTo(0, 0); }
  };
}
