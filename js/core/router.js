// Routen: "#/" = Übersicht, "#/<modul>/<unterseite>" = Modul.

let renderFn = () => {};

export function setRenderer(fn) { renderFn = fn; }
export function rerender() { renderFn(); }

/** Zu einer Route springen; wenn sie schon offen ist, neu zeichnen. */
export function go(hash) {
  if (location.hash === hash) renderFn();
  else location.hash = hash;
}

export function parseRoute() {
  let h = location.hash || '#/';
  // alte Links aus der ersten Version
  if (h === '#tickets') h = '#/travel/tickets';
  if (h === '#stays') h = '#/travel/stays';
  const [module = '', sub = ''] = h.replace(/^#\/?/, '').split('/');
  return { module, sub };
}
