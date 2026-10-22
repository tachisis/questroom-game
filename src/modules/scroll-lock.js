export function createScrollLock() {
  const root = document.documentElement;
  const body = document.body;
  // everything after the hero stays out of Tab order and screen readers until «Да»
  const rest = [...document.querySelectorAll('main > :not(.hero)')];
  const state = { unlocked: false };

  const apply = () => {
    root.classList.toggle('is-locked', !state.unlocked);
    root.classList.toggle('is-unlocked', state.unlocked);
    body.classList.toggle('is-locked', !state.unlocked);
    rest.forEach((node) => { node.inert = !state.unlocked; });
  };
  window.scrollTo(0, 0);
  apply();

  return {
    get unlocked() { return state.unlocked; },
    unlock() { state.unlocked = true; apply(); },
    lock() { state.unlocked = false; apply(); window.scrollTo(0, 0); }
  };
}
