// ──────────────────────────────────────────────────────────────
//  ui.js  –  delegated DOM event wiring (replaces inline handlers)
//
//  index.html declares intent via data attributes:
//    <button data-action="apply-preset" data-arg="clean">   → click
//    <input  data-input="update-val">                       → input
//    <select data-change="set-quality">                     → change
//
//  main.js builds the handler registry from its imports and calls
//  registerActions() + initUI() during init. Handler signature:
//  (arg, el, event) — arg is data-arg (may be undefined), el is the
//  element carrying the attribute.
//
//  Note: the mobile touch pads also use data-action ("up"/"down"/
//  "left"/"right") for foil.js's own touch listeners — those names
//  are never registered here, so the click delegate must ignore
//  unknown actions silently.
// ──────────────────────────────────────────────────────────────

const actions = {};

function registerActions(map) {
  Object.assign(actions, map);
}

function dispatch(attr, ev) {
  const el = ev.target.closest('[data-' + attr + ']');
  if (!el) return;
  const fn = actions[el.dataset[attr]];
  if (!fn) return; // unregistered names (e.g. touch-pad zones) are not ours
  fn(el.dataset.arg, el, ev);
}

function initUI() {
  document.addEventListener('click', (ev) => dispatch('action', ev));
  document.addEventListener('input', (ev) => dispatch('input', ev));
  document.addEventListener('change', (ev) => dispatch('change', ev));
}

export { registerActions, initUI };
