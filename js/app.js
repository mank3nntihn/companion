// App-Hülle: Anmeldung, Übersicht mit allen Modulen, Navigation, Konto-Menü, Sync.

import { APP_NAME, BUILD } from './config.js';
import * as db from './core/data.js';
import { state } from './core/data.js';
import { setRenderer, parseRoute, go } from './core/router.js';
import {
  $, $$, esc, icon, toast, canWrite, errText, copyText,
  sheet, openSheet, closeSheet, withBusy, factsHtml,
} from './core/ui.js';
import { modules, findModule } from './modules/index.js';
import { extractUrl } from './modules/travel/links.js';

let current = null; // aktives Modul oder null (Übersicht)
let currentSub = '';
let userName = '';

// ================================================================ Übersicht

function greeting() {
  const h = new Date().getHours();
  const part = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  return userName ? `${part}, ${userName.charAt(0).toUpperCase()}${userName.slice(1)}` : part;
}

function renderHome() {
  $('#view').innerHTML = `
    <section class="home">
      <p class="home-hello">${esc(greeting())}</p>
      <div class="tiles">
        ${modules.map((m) => `
          <a class="tile" href="#/${m.id}">
            <div class="tile-head">
              <span class="tile-icon">${icon(m.icon)}</span>
              <span class="tile-name">${esc(m.name)}<small>${esc(m.description)}</small></span>
            </div>
            ${m.card ? m.card() : ''}
          </a>`).join('')}
        <div class="tile tile-soon">
          <span class="tile-icon">${icon('plus')}</span>
          <span class="tile-name">Bald mehr<small>Hier kommen weitere Erweiterungen dazu.</small></span>
        </div>
      </div>
      <button class="btn btn-ghost btn-block home-update" data-action="update-app">${icon('refresh')}Aktualisieren</button>
      ${syncLine()}
    </section>`;
}

function syncLine() {
  if (db.isDemo) return `<p class="sync-line">Vorschau mit Beispieldaten. Änderungen bleiben nur auf diesem Gerät.</p>`;
  if (!state.fetchedAt) return '';
  const at = new Date(state.fetchedAt).toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<p class="sync-line">Stand ${esc(at)}</p>`;
}

// ================================================================ Router

function render() {
  const { module, sub } = parseRoute();
  const m = findModule(module);
  current = m || null;

  const back = $('#back-btn');
  const title = $('#page-title');
  const menuBtn = $('#drawer-btn');
  const tabbar = $('#tabbar');
  const add = $('#add-btn');

  if (!m) {
    back.hidden = true;
    menuBtn.hidden = true;
    title.textContent = APP_NAME;
    tabbar.hidden = true;
    add.hidden = true;
    document.body.classList.remove('has-tabs');
    renderHome();
    return;
  }

  currentSub = sub || m.tabs?.[0]?.id || '';
  back.hidden = false;
  menuBtn.hidden = !m.menu?.length;
  title.textContent = m.pageTitle?.(currentSub) || (m.title ? m.title() : m.name);
  add.hidden = !m.onAdd;

  if (m.tabs?.length) {
    tabbar.hidden = false;
    document.body.classList.add('has-tabs');
    tabbar.style.gridTemplateColumns = `repeat(${m.tabs.length}, 1fr)`;
    tabbar.innerHTML = m.tabs.map((t) => `
      <a href="#/${m.id}/${t.id}" ${t.id === currentSub ? 'aria-current="page"' : ''}>${icon(t.icon)}<span>${esc(t.label)}</span></a>`).join('');
  } else {
    tabbar.hidden = true;
    document.body.classList.remove('has-tabs');
  }
  m.render(currentSub);
}

setRenderer(render);

// ================================================================ Modul-Menü (☰)

const drawer = $('#drawer');

function openDrawer() {
  if (!current?.menu?.length) return;
  drawer.innerHTML = `
    <div class="drawer-head">
      <h2>${esc(current.name)}</h2>
      <button class="icon-btn" data-drawer-close aria-label="Menü schließen">${icon('close')}</button>
    </div>
    <nav class="drawer-list">
      ${current.menu.map((it) => {
        const inner = `<span class="drawer-icon">${icon(it.icon)}</span>
          <span class="drawer-text">${esc(it.label)}<small>${esc(it.hint || '')}</small></span>`;
        return it.route
          ? `<a href="#/${current.id}/${it.route}" ${it.route === currentSub ? 'aria-current="page"' : ''}>${inner}</a>`
          : `<button data-action="${esc(it.action)}">${inner}</button>`;
      }).join('')}
    </nav>
    <a class="drawer-home" href="#/">${icon('back')}Zur Startseite</a>`;
  drawer.showModal();
}

drawer.addEventListener('click', (e) => {
  if (e.target === drawer || e.target.closest('[data-drawer-close]') || e.target.closest('a')) drawer.close();
});

// ================================================================ Konto-Menü

async function openMenu() {
  const session = await db.getSession();
  const user = db.emailToUsername(session?.user?.email);
  const total = state.documents.length;
  const cached = state.documents.filter((d) => state.cachedDocs.has(d.id)).length;
  openSheet('Konto & Offline', `
    ${factsHtml([
      ['Angemeldet', db.isDemo ? 'Vorschau (Beispieldaten)' : (user || 'nicht angemeldet')],
      ['Offline', total ? `${cached} von ${total} Dateien auf diesem Gerät` : 'Noch keine Dateien'],
      ['Stand', state.fetchedAt ? new Date(state.fetchedAt).toLocaleString('de-DE') : '–'],
      ['App-Version', BUILD === 'dev' ? 'lokal' : BUILD],
    ])}
    <div style="display:grid;gap:10px">
      ${db.isDemo ? '' : '<button class="btn" data-action="sync">Jetzt aktualisieren</button>'}
      ${db.isDemo ? '<button class="btn btn-ghost" data-action="leave-demo">Vorschau beenden</button>' : ''}
      ${!db.isDemo && user ? '<button class="btn btn-ghost" data-action="change-password">Passwort ändern</button>' : ''}
      ${!db.isDemo && user ? '<button class="btn btn-danger" data-action="sign-out">Abmelden</button>' : ''}
    </div>
    <p class="sync-line">Tipp: Im Browser-Menü „Zum Home-Bildschirm“ wählen, dann startet ${esc(APP_NAME)} wie eine App und funktioniert offline.</p>`);
}

// ================================================================ Sync

let syncing = false;
async function sync({ quiet = true } = {}) {
  if (db.isDemo) { await db.syncDocuments(); render(); return; }
  if (syncing || !navigator.onLine) return;
  syncing = true;
  try {
    await db.refresh();
    if (!sheet.open) render();
    const added = await db.syncDocuments();
    if (added && !sheet.open) render();
    if (!quiet) toast('Alles aktuell');
  } catch (e) {
    console.warn(e);
    if (!quiet) toast(errText(e));
  } finally {
    syncing = false;
  }
}

// ================================================================ App-Updates

let swReg = null;
let reloading = false;

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  // Neue Version hat übernommen: einmal neu laden (nicht beim allerersten Start)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => { swReg = reg; })
    .catch((e) => console.warn('SW', e));
}

/** Fragt beim Server nach einer neuen Version. true, wenn eine installiert wird. */
async function checkForUpdate() {
  if (!swReg || !navigator.onLine) return false;
  try { await swReg.update(); } catch { return false; }
  const next = swReg.installing || swReg.waiting;
  if (!next) return false;
  if (swReg.waiting) swReg.waiting.postMessage('skip-waiting');
  return true;
}

async function updateApp(btn) {
  if (!navigator.onLine) { toast('Offline. Aktualisieren geht nur mit Internet.'); return; }
  if (btn) btn.disabled = true;
  toast('Wird aktualisiert …');
  const [hasUpdate] = await Promise.all([checkForUpdate(), sync({ quiet: true })]);
  if (hasUpdate) {
    toast('Neue Version wird geladen …');
    // Fallback, falls controllerchange ausbleibt
    setTimeout(() => { if (!reloading) location.reload(); }, 4000);
    return;
  }
  if (btn) btn.disabled = false;
  toast('Alles aktuell');
}

// ================================================================ Ereignisse

async function handleCoreAction(action) {
  switch (action) {
    case 'sync': await sync({ quiet: false }); openMenu(); return true;
    case 'update-app': await updateApp($('.home-update')); return true;
    case 'sign-out':
      if (!confirm('Abmelden? Die offline gespeicherten Daten werden von diesem Gerät gelöscht.')) return true;
      await db.signOut();
      location.reload();
      return true;
    case 'leave-demo':
      localStorage.removeItem('tb-demo');
      location.href = location.pathname;
      return true;
    case 'demo':
      localStorage.setItem('tb-demo', '1');
      location.href = location.pathname + '?demo';
      return true;
    case 'change-password':
      openSheet('Passwort ändern', `
        <form id="pw-form" autocomplete="on">
          <label class="field"><span>Neues Passwort</span>
            <input class="input" type="password" name="pw" minlength="8" required autocomplete="new-password"></label>
          <label class="field"><span>Noch einmal</span>
            <input class="input" type="password" name="pw2" minlength="8" required autocomplete="new-password">
            <small>Mindestens 8 Zeichen.</small></label>
        </form>`, `
        <button class="btn btn-ghost" data-close>Abbrechen</button>
        <button class="btn" form="pw-form" type="submit">Passwort speichern</button>`);
      return true;
    default: return false;
  }
}

document.addEventListener('click', async (e) => {
  const copyEl = e.target.closest('[data-copy]');
  if (copyEl) { e.preventDefault(); copyText(copyEl.dataset.copy); return; }

  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action } = el.dataset;
  if (await handleCoreAction(action)) return;
  const order = current ? [current, ...modules.filter((m) => m !== current)] : modules;
  for (const m of order) if (m.handleAction?.(action, el)) return;
});

document.addEventListener('change', (e) => {
  const order = current ? [current, ...modules.filter((m) => m !== current)] : modules;
  for (const m of order) if (m.handleChange?.(e)) return;
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (form.id === 'login-form') {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const msg = $('#login-msg');
    btn.disabled = true;
    msg.textContent = '';
    try {
      await db.signIn(form.username.value, form.password.value);
      location.reload();
    } catch (err) {
      const m = err?.message || '';
      msg.textContent = /invalid login|invalid credentials/i.test(m)
        ? 'Benutzername oder Passwort stimmt nicht.'
        : errText(err);
      btn.disabled = false;
    }
  } else if (form.id === 'pw-form') {
    e.preventDefault();
    if (form.pw.value !== form.pw2.value) { toast('Die Passwörter sind nicht gleich.'); return; }
    if (!canWrite()) return;
    await withBusy(async () => {
      await db.changePassword(form.pw.value);
      closeSheet();
      toast('Passwort gespeichert');
    });
  }
});

$('#add-btn').addEventListener('click', () => current?.onAdd?.(currentSub));
$('#back-btn').addEventListener('click', () => {
  // Von einer Menü-Seite zurück ins Modul, sonst zur Startseite
  const onTab = !current?.tabs?.length || current.tabs.some((t) => t.id === currentSub);
  go(onTab ? '#/' : `#/${current.id}`);
});
$('#drawer-btn').addEventListener('click', openDrawer);
$('#menu-btn').addEventListener('click', openMenu);
window.addEventListener('hashchange', () => { if (drawer.open) drawer.close(); render(); });

function updateNet() { $('#net-status').hidden = navigator.onLine || db.isDemo; }
window.addEventListener('online', () => { updateNet(); sync(); });
window.addEventListener('offline', updateNet);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!sheet.open) render();
  sync();
  checkForUpdate();
});

// Ansichten mit Countdown regelmäßig auffrischen
setInterval(() => {
  if (sheet.open || current?.isBusy?.()) return;
  if (!current || current.refreshEvery) render();
}, 30000);

// ================================================================ Start

function showGate(text, actions) {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('#gate-text').innerHTML = text;
  $('#gate-actions').innerHTML = actions;
}

function showApp(name) {
  userName = name || '';
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('#menu-btn').textContent = (name || APP_NAME).slice(0, 1).toUpperCase();
  updateNet();
  render();
}

function handleShare() {
  const p = new URLSearchParams(location.search);
  const raw = p.get('share_url') || extractUrl(p.get('share_text')) || extractUrl(p.get('share_title'));
  if (!raw) return;
  history.replaceState(null, '', location.pathname + (db.isDemo ? '?demo' : '') + location.hash);
  for (const m of modules) if (m.handleShare?.(raw)) return;
}

async function start() {
  document.title = APP_NAME;
  $('#gate-title').textContent = APP_NAME;

  setupServiceWorker();

  const hasCache = db.loadCache();

  if (db.isDemo) {
    showApp('');
    await db.syncDocuments();
    render();
    handleShare();
    return;
  }

  if (!db.isConfigured || !db.sb) {
    showGate(
      'Die Datenbank ist noch nicht verbunden. Trag die Supabase-URL und den Publishable Key in <code>js/config.js</code> ein.',
      '<button class="btn btn-light" data-action="demo">Vorschau mit Beispieldaten</button>',
    );
    return;
  }

  let session = null;
  try { session = await db.getSession(); } catch { /* offline */ }

  if (!session) {
    if (!navigator.onLine && hasCache) { showApp(''); return; }
    showGate(
      'Eure gemeinsamen Helfer an einem Ort, auch ohne Internet.',
      `<form id="login-form" class="login" autocomplete="on">
         <label class="field"><span>Benutzername</span>
           <input class="input" name="username" required autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username"></label>
         <label class="field"><span>Passwort</span>
           <input class="input" type="password" name="password" required autocomplete="current-password"></label>
         <p id="login-msg" class="login-msg" role="alert"></p>
         <button class="btn btn-light btn-block" type="submit">Anmelden</button>
       </form>
       <button class="btn btn-ghost" data-action="demo">Vorschau mit Beispieldaten</button>`,
    );
    return;
  }

  const email = session.user.email;
  const name = session.user.user_metadata?.username || db.emailToUsername(email);
  showApp(name);
  handleShare();

  if (navigator.onLine) {
    const member = await db.checkMembership(email);
    if (member === false) {
      showGate(
        `Das Konto <strong>${esc(name)}</strong> ist noch nicht freigeschaltet.`,
        '<button class="btn btn-ghost" data-action="sign-out">Abmelden</button>',
      );
      return;
    }
    await sync();
  }

  db.sb.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') location.reload();
  });
}

start();
