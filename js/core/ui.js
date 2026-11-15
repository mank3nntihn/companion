// Gemeinsame UI-Bausteine für alle Module: Helfer, Toast, Sheet, Faktenliste.

import * as db from './data.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
export const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;

let toastTimer;
export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export function canWrite() {
  if (db.isDemo || navigator.onLine) return true;
  toast('Du bist offline. Speichern geht erst wieder mit Internet.');
  return false;
}

export function errText(e) {
  const m = e?.message || String(e);
  if (/row-level security|permission denied/i.test(m)) return 'Keine Berechtigung – ist dein Konto freigeschaltet?';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Keine Verbindung. Bitte später nochmal versuchen.';
  return m;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Kopiert: ' + text);
  } catch {
    toast(text);
  }
}

export const copyBtn = (text) => text ? `<button type="button" class="copy" data-copy="${esc(text)}">${esc(text)}${icon('copy')}</button>` : '';

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- Sheet (Dialog)

export const sheet = $('#sheet');

export function openSheet(title, body, foot = '') {
  sheet.innerHTML = `
    <div class="sheet-head"><h2>${title}</h2>
      <button class="icon-btn" data-close aria-label="Schließen">${icon('close')}</button></div>
    <div class="sheet-body">${body}</div>
    ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}`;
  if (!sheet.open) sheet.showModal();
  $('.sheet-body', sheet).scrollTop = 0;
  return sheet;
}

export function closeSheet() { if (sheet.open) sheet.close(); }

sheet.addEventListener('click', (e) => {
  if (e.target === sheet || e.target.closest('[data-close]')) closeSheet();
});

/** Sperrt die Sheet-Buttons, solange fn läuft, und zeigt Fehler als Toast. */
export async function withBusy(fn) {
  const btns = $$('.sheet-foot .btn', sheet);
  btns.forEach((b) => { b.disabled = true; });
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(errText(e));
  } finally {
    btns.forEach((b) => { b.disabled = false; });
  }
}

/** Liste aus [Label, Wert, Link?, rohes HTML?] */
export function factsHtml(facts) {
  return `<dl class="facts">${facts.map(([k, v, link, raw]) => `
    <div class="fact"><dt>${esc(k)}</dt><dd>${raw || (link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v))}</dd></div>`).join('')}</dl>`;
}
