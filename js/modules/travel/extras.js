// Travel Buddy Extras: Dokumente-Safe, Notfall, Merkliste, To-dos, Kalender-Export.
// Erreichbar über das Menü (☰) oben rechts im Modul.

import * as db from '../../core/data.js';
import { state } from '../../core/data.js';
import { go, rerender } from '../../core/router.js';
import {
  $, esc, safeUrl, icon, toast, canWrite, errText, copyBtn, todayLocal,
  openSheet, closeSheet, withBusy, factsHtml,
} from '../../core/ui.js';
import { localToUtc, hhmm, dayLabel, dayKey, nightsBetween } from '../../core/time.js';
import { mapsUrl } from './links.js';
import {
  KINDS, depUtc, beThere, sortedTransports,
  docsHtml, loadThumbs, fileField, uploadPending, resetPending,
  openTransportDetail, openStayDetail,
} from './index.js';

db.registerTable('travel_docs', 'created_at');
db.registerTable('contacts', 'sort');
db.registerTable('places', 'created_at');
db.registerTable('todos', 'created_at');
db.registerDemo(() => ({
  travel_docs: [
    { id: 'd-doc1', title: 'Reisepass', category: 'passport', owner: 'Beispiel', expires_on: '2031-05-01' },
    { id: 'd-doc2', title: 'Auslandskrankenversicherung', category: 'insurance', owner: 'beide', number: 'AKV-123456', notes: 'Notfall-Hotline steht auf der Karte.' },
  ],
  contacts: [{ id: 'd-c1', label: 'Auslandskrankenversicherung', phone: '+49 000 0000000', note: 'Beispielnummer', sort: 10 }],
  places: [
    { id: 'd-p1', area: 'Koh Lanta', name: 'Long Beach', category: 'beach', done: false },
    { id: 'd-p2', area: 'Koh Lanta', name: 'Old Town Pier', category: 'sight', done: false },
    { id: 'd-p3', area: 'Koh Phi Phi', name: 'Viewpoint', category: 'sight', done: false },
  ],
  todos: [
    { id: 'd-td1', text: 'Bargeld für den Pier bereithalten', done: false, transport_id: 'd-t1', category: 'Unterwegs', sort: 10 },
    { id: 'd-td2', text: 'Online-Check-in erledigen', done: false, transport_id: 'd-t3', category: 'Unterwegs', sort: 20 },
    { id: 'd-td3', text: 'Sonnencreme kaufen', done: true, category: 'Packen', sort: 110 },
    { id: 'd-td4', text: 'Reiseapotheke', done: false, category: 'Packen', sort: 120 },
  ],
}));

export const PAGE_TITLES = {
  docs: 'Dokumente',
  emergency: 'Notfall',
  places: 'Merkliste',
  todos: 'To-dos',
};

export const MENU = [
  { route: 'docs', icon: 'id', label: 'Dokumente', hint: 'Pass, Visum, Versicherung offline' },
  { route: 'emergency', icon: 'sos', label: 'Notfall', hint: 'Notrufnummern, eure Adresse, Kontakte' },
  { route: 'places', icon: 'star', label: 'Merkliste', hint: 'Strände, Essen, Ausflüge pro Ort' },
  { route: 'todos', icon: 'todo', label: 'To-dos', hint: 'Was vor einer Fahrt zu erledigen ist' },
  { action: 'calendar-all', icon: 'cal', label: 'In Kalender übernehmen', hint: 'Alle Fahrten mit Erinnerung' },
];

export function render(sub) {
  if (sub === 'docs') renderDocs();
  else if (sub === 'emergency') renderEmergency();
  else if (sub === 'places') renderPlaces();
  else if (sub === 'todos') renderTodos();
}

export function onAdd(sub) {
  if (sub === 'docs') openDocForm();
  else if (sub === 'emergency') openContactForm();
  else if (sub === 'places') openPlaceForm();
  else if (sub === 'todos') openTodoForm();
}

// ================================================================ Wo sind wir gerade?

function nowLocal() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Aktuelle Unterkunft, sonst die nächste. */
function currentOrNextStay() {
  const today = todayLocal();
  const list = [...state.stays].sort((a, b) => a.check_in.localeCompare(b.check_in));
  return list.find((s) => s.check_in <= today && today < s.check_out)
    || list.find((s) => s.check_in >= today) || null;
}

/** Zeitzone des Ortes, an dem wir gerade sind (letzte angekommene Fahrt). */
function currentZone() {
  const now = Date.now();
  const done = sortedTransports().filter((t) => depUtc(t) <= now);
  const last = done.at(-1);
  if (last) return last.arrival_tz || last.departure_tz;
  return sortedTransports()[0]?.departure_tz || 'Asia/Bangkok';
}

/** Textstücke, die den aktuellen Ort beschreiben (für die Merkliste). */
function hereHints() {
  const hints = [];
  const today = todayLocal();
  const stay = state.stays.find((s) => s.check_in <= today && today < s.check_out);
  if (stay) hints.push(stay.name, stay.address || '');
  const now = Date.now();
  const last = sortedTransports().filter((t) => depUtc(t) <= now).at(-1);
  if (last) hints.push(last.to_place, last.arrival_location || '');
  return hints.join(' ').toLowerCase();
}

const cleanPlace = (p) => String(p || '').replace(/\s*\(.*?\)\s*/g, '').trim();

export function areaIsHere(area) {
  const h = hereHints();
  const a = cleanPlace(area).toLowerCase();
  return !!a && h.includes(a);
}

/** Für die Kachel auf der Startseite: offene Merkliste-Einträge am aktuellen Ort. */
export function placesHere() {
  const open = state.places?.filter((p) => !p.done && areaIsHere(p.area)) || [];
  return open.length ? { area: open[0].area, count: open.length } : null;
}

// ================================================================ Dokumente-Safe

const DOC_CATS = {
  passport: 'Reisepass / Ausweis',
  visa: 'Visum',
  insurance: 'Versicherung',
  health: 'Gesundheit / Impfpass',
  license: 'Führerschein',
  other: 'Sonstiges',
};

function expiryChip(d) {
  if (!d.expires_on) return '';
  const lastTripDay = [...state.transports.map((t) => dayKey(t.arrival_local || t.departure_local)), ...state.stays.map((s) => s.check_out)]
    .sort().at(-1) || todayLocal();
  const soon = nightsBetween(todayLocal(), d.expires_on) < 183;
  const beforeEnd = d.expires_on <= lastTripDay;
  const cls = beforeEnd || soon ? 'warn' : 'plain';
  const txt = beforeEnd ? `läuft während der Reise ab (${dayLabel(d.expires_on, true)})` : `gültig bis ${dayLabel(d.expires_on, true)}`;
  return `<span class="chip ${cls}">${esc(txt)}</span>`;
}

function renderDocs() {
  const view = $('#view');
  const list = [...(state.travel_docs || [])].sort((a, b) => (a.owner || '').localeCompare(b.owner || '') || a.title.localeCompare(b.title));
  if (!list.length) {
    view.innerHTML = `
      <div class="empty">
        <h2>Noch keine Dokumente</h2>
        <p>Fotografiert Pässe, Visum, Versicherungskarte und Impfpass. Die Bilder liegen dann offline auf beiden Handys, nur für eure Konten sichtbar.</p>
        <button class="btn" data-action="new-doc">${icon('plus')}Dokument hinzufügen</button>
      </div>`;
    return;
  }
  view.innerHTML = `
    <p class="page-intro">Nur für eure beiden Konten sichtbar und offline gespeichert.</p>
    ${list.map((d) => {
      const files = state.documents.filter((x) => x.travel_doc_id === d.id).length;
      return `
      <button class="card x-row" data-action="open-doc" data-id="${d.id}">
        <span class="x-icon">${icon('id')}</span>
        <span class="x-body">
          <span class="x-title">${esc(d.title)}</span>
          <span class="x-sub">${esc([DOC_CATS[d.category] || 'Sonstiges', d.owner].filter(Boolean).join(', '))}</span>
          <span class="r-tags">${expiryChip(d)}${files ? `<span class="chip">${icon('file')}${files}</span>` : '<span class="chip warn">noch kein Foto</span>'}</span>
        </span>
      </button>`;
    }).join('')}`;
}

export function openDocDetail(id) {
  const d = state.travel_docs.find((x) => x.id === id);
  if (!d) return;
  const facts = [
    ['Art', DOC_CATS[d.category] || 'Sonstiges'],
    d.owner && ['Für', d.owner],
    d.number && ['Nummer', null, null, copyBtn(d.number)],
    d.expires_on && ['Gültig bis', dayLabel(d.expires_on, true)],
    d.notes && ['Notizen', d.notes],
  ].filter(Boolean);
  openSheet(esc(d.title), `
    ${factsHtml(facts)}
    <div class="section-title" style="margin-top:4px">Fotos & PDFs</div>
    ${docsHtml('travel_doc_id', d.id)}
  `, `
    <button class="btn btn-danger" data-action="delete-traveldoc" data-id="${d.id}">Löschen</button>
    <button class="btn" data-action="edit-doc" data-id="${d.id}">Bearbeiten</button>`);
  loadThumbs();
}

function openDocForm(id) {
  const d = state.travel_docs?.find((x) => x.id === id) || {};
  resetPending();
  openSheet(id ? 'Dokument bearbeiten' : 'Neues Dokument', `
    <form id="doc-form" autocomplete="off">
      <label class="field"><span>Bezeichnung</span><input class="input" name="title" required value="${esc(d.title)}" placeholder="z. B. Reisepass Robin"></label>
      <div class="row-2">
        <label class="field"><span>Art</span><select class="input" name="category">
          ${Object.entries(DOC_CATS).map(([k, v]) => `<option value="${k}"${(d.category || 'passport') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Für wen</span><input class="input" name="owner" value="${esc(d.owner)}" placeholder="Name oder beide"></label>
      </div>
      <div class="row-2">
        <label class="field"><span>Nummer (optional)</span><input class="input" name="number" value="${esc(d.number)}"></label>
        <label class="field"><span>Gültig bis</span><input class="input" type="date" name="expires_on" value="${esc(d.expires_on)}"></label>
      </div>
      <label class="field"><span>Notizen</span><textarea class="input" name="notes" placeholder="z. B. Hotline der Versicherung, Visum gültig ab …">${esc(d.notes)}</textarea></label>
      ${id ? '' : fileField()}
    </form>`, `
    <button class="btn btn-ghost" data-close>Abbrechen</button>
    <button class="btn" form="doc-form" type="submit">Speichern</button>`);
  $('#doc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canWrite()) return;
    const f = Object.fromEntries(new FormData(e.target));
    const n = (v) => String(v ?? '').trim() || null;
    await withBusy(async () => {
      const saved = await db.save('travel_docs', {
        ...(id ? { id } : {}),
        title: f.title.trim(), category: f.category, owner: n(f.owner), number: n(f.number),
        expires_on: n(f.expires_on), notes: n(f.notes),
      });
      await uploadPending({ travel_doc_id: saved.id });
      closeSheet();
      go('#/travel/docs');
      toast(id ? 'Dokument gespeichert' : 'Dokument hinzugefügt');
    });
  });
}

// ================================================================ Notfall

const NUMBERS = {
  th: {
    name: 'Thailand',
    list: [
      ['1155', 'Touristenpolizei', 'spricht Englisch, auch bei Diebstahl oder Betrug'],
      ['1669', 'Rettungsdienst', 'medizinischer Notfall, Unfall'],
      ['191', 'Polizei', ''],
    ],
  },
  id: {
    name: 'Indonesien / Bali',
    list: [
      ['112', 'Notruf', 'allgemein, auch vom Handy'],
      ['118', 'Rettungsdienst', 'alternativ 119'],
      ['110', 'Polizei', ''],
      ['113', 'Feuerwehr', ''],
      ['115', 'Seenotrettung', 'BASARNAS'],
    ],
  },
};

function renderEmergency() {
  const view = $('#view');
  const zone = currentZone();
  const order = /Makassar|Jakarta|Jayapura/.test(zone) ? ['id', 'th'] : ['th', 'id'];
  const stay = currentOrNextStay();
  const contacts = [...(state.contacts || [])].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100) || a.label.localeCompare(b.label));
  const today = todayLocal();
  const stayLabel = stay && stay.check_in <= today ? 'Hier wohnt ihr gerade' : 'Nächste Unterkunft';

  view.innerHTML = `
    ${stay ? `
      <section class="sos-address">
        <div class="sos-label">${esc(stayLabel)}</div>
        <div class="sos-name">${esc(stay.name)}</div>
        ${stay.address ? `<div class="sos-addr">${esc(stay.address)}</div>` : '<div class="sos-addr">Keine Adresse eingetragen</div>'}
        <div class="sos-actions">
          <button class="btn btn-dark" data-action="show-address">Groß zeigen</button>
          ${stay.address ? `<a class="btn btn-ghost" href="${esc(mapsUrl(stay.address))}" target="_blank" rel="noopener">${icon('pin')}Karte</a>` : ''}
          ${stay.contact ? `<a class="btn btn-ghost" href="tel:${esc(stay.contact.replace(/[^\d+]/g, ''))}">${icon('phone')}Anrufen</a>` : ''}
        </div>
      </section>` : ''}

    ${order.map((c) => `
      <div class="section-title">${esc(NUMBERS[c].name)}</div>
      <div class="sos-grid">
        ${NUMBERS[c].list.map(([nr, label, note]) => `
          <a class="sos-call" href="tel:${nr}">
            <span class="sos-nr">${nr}</span>
            <span class="sos-what">${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</span>
          </a>`).join('')}
      </div>`).join('')}

    <div class="section-title">Eure Kontakte <small>Versicherung, Botschaft …</small></div>
    ${contacts.map((c) => `
      <div class="card x-row x-contact">
        <span class="x-icon">${icon('phone')}</span>
        <span class="x-body">
          <span class="x-title">${esc(c.label)}</span>
          ${c.phone ? `<a class="x-phone" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : ''}
          ${c.note ? `<span class="x-sub">${esc(c.note)}</span>` : ''}
        </span>
        <button class="icon-btn" data-action="edit-contact" data-id="${c.id}" aria-label="${esc(c.label)} bearbeiten">${icon('edit')}</button>
      </div>`).join('') || '<p class="page-intro">Tragt hier die Notfallnummer eurer Auslandskrankenversicherung und die Deutsche Botschaft ein.</p>'}
    <button class="btn btn-ghost btn-block" data-action="new-contact">${icon('plus')}Kontakt hinzufügen</button>

    <div class="section-title">Aus Deutschland</div>
    <a class="card x-row" href="tel:+49116116">
      <span class="x-icon">${icon('phone')}</span>
      <span class="x-body"><span class="x-title">Sperr-Notruf</span><span class="x-sub">+49 116 116, Bank- und Kreditkarten sperren</span></span>
    </a>
    <p class="sync-line">Notrufnummern laut den offiziellen Tourismusseiten von Thailand und Indonesien.</p>`;
}

function showAddress() {
  const stay = currentOrNextStay();
  if (!stay) return;
  const viewer = $('#viewer');
  viewer.innerHTML = `
    <div class="viewer-head"><h2>Bitte hierhin</h2>
      <button class="icon-btn" data-vclose aria-label="Schließen">${icon('close')}</button></div>
    <div class="big-address">
      <div class="ba-name">${esc(stay.name)}</div>
      <div class="ba-addr">${esc(stay.address || '')}</div>
      ${stay.contact ? `<div class="ba-phone">${esc(stay.contact)}</div>` : ''}
    </div>`;
  viewer.showModal();
}

function openContactForm(id) {
  const c = state.contacts?.find((x) => x.id === id) || {};
  openSheet(id ? 'Kontakt bearbeiten' : 'Neuer Kontakt', `
    <form id="contact-form" autocomplete="off">
      <label class="field"><span>Name</span><input class="input" name="label" required value="${esc(c.label)}" placeholder="z. B. Auslandskrankenversicherung"></label>
      <label class="field"><span>Telefon</span><input class="input" name="phone" type="tel" value="${esc(c.phone)}" placeholder="+49 …"></label>
      <label class="field"><span>Notiz</span><input class="input" name="note" value="${esc(c.note)}" placeholder="z. B. Policennummer, rund um die Uhr"></label>
    </form>`, `
    ${id ? `<button class="btn btn-danger" data-action="delete-contact" data-id="${id}">Löschen</button>` : '<button class="btn btn-ghost" data-close>Abbrechen</button>'}
    <button class="btn" form="contact-form" type="submit">Speichern</button>`);
  $('#contact-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canWrite()) return;
    const f = Object.fromEntries(new FormData(e.target));
    await withBusy(async () => {
      await db.save('contacts', {
        ...(id ? { id } : {}),
        label: f.label.trim(), phone: f.phone.trim() || null, note: f.note.trim() || null,
      });
      closeSheet();
      rerender();
      toast('Kontakt gespeichert');
    });
  });
}

// ================================================================ Merkliste

const PLACE_CATS = {
  beach: ['Strand', 'sun'],
  food: ['Essen & Trinken', 'food'],
  activity: ['Aktivität', 'star'],
  sight: ['Sehenswert', 'pin'],
  other: ['Sonstiges', 'star'],
};

function knownAreas() {
  const set = new Set();
  for (const t of state.transports) { set.add(cleanPlace(t.to_place)); set.add(cleanPlace(t.from_place)); }
  for (const p of state.places || []) set.add(p.area);
  set.delete('');
  return [...set].sort();
}

function renderPlaces() {
  const view = $('#view');
  const list = state.places || [];
  if (!list.length) {
    view.innerHTML = `
      <div class="empty">
        <h2>Merkliste ist leer</h2>
        <p>Sammelt Strände, Restaurants und Ausflüge pro Ort. Wenn ihr dort seid, stehen sie hier ganz oben.</p>
        <button class="btn" data-action="new-place">${icon('plus')}Eintrag hinzufügen</button>
      </div>`;
    return;
  }
  const groups = {};
  for (const p of list) (groups[p.area] ||= []).push(p);
  const areas = Object.keys(groups).sort((a, b) => (areaIsHere(b) - areaIsHere(a)) || a.localeCompare(b));
  view.innerHTML = areas.map((area) => {
    const items = groups[area].sort((a, b) => a.done - b.done || a.name.localeCompare(b.name));
    const here = areaIsHere(area);
    return `
      <div class="section-title">${esc(area)} ${here ? '<span class="chip">Hier seid ihr</span>' : `<small>${items.filter((p) => !p.done).length} offen</small>`}</div>
      <ul class="checklist">
        ${items.map((p) => {
          const [catLabel] = PLACE_CATS[p.category] || PLACE_CATS.other;
          return `
          <li class="${p.done ? 'is-done' : ''}">
            <button class="check-box" data-action="toggle-place" data-id="${p.id}" aria-label="${p.done ? 'Als offen markieren' : 'Als besucht markieren'}">${p.done ? icon('check') : ''}</button>
            <button class="check-text" data-action="edit-place" data-id="${p.id}">
              <span class="x-title">${esc(p.name)}</span>
              <span class="x-sub">${esc([catLabel, p.note].filter(Boolean).join(', '))}</span>
            </button>
            <a class="icon-btn" href="${esc(safeUrl(p.url) || mapsUrl(`${p.name}, ${area}`))}" target="_blank" rel="noopener" aria-label="${safeUrl(p.url) ? 'Link öffnen' : 'Auf Karte zeigen'}">${icon(safeUrl(p.url) ? 'ext' : 'pin')}</a>
          </li>`;
        }).join('')}
      </ul>`;
  }).join('');
}

function openPlaceForm(id) {
  const p = state.places?.find((x) => x.id === id) || {};
  const here = knownAreas().find((a) => areaIsHere(a)) || '';
  openSheet(id ? 'Eintrag bearbeiten' : 'Neuer Eintrag', `
    <form id="place-form" autocomplete="off">
      <label class="field"><span>Ort / Insel</span>
        <input class="input" name="area" required list="area-list" value="${esc(p.area || here)}" placeholder="z. B. Koh Tao">
        <datalist id="area-list">${knownAreas().map((a) => `<option value="${esc(a)}">`).join('')}</datalist></label>
      <label class="field"><span>Was?</span><input class="input" name="name" required value="${esc(p.name)}" placeholder="z. B. Freedom Beach"></label>
      <label class="field"><span>Kategorie</span><select class="input" name="category">
        ${Object.entries(PLACE_CATS).map(([k, [v]]) => `<option value="${k}"${(p.category || 'beach') === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}
      </select></label>
      <label class="field"><span>Link (optional)</span><input class="input" name="url" type="url" inputmode="url" value="${esc(p.url)}" placeholder="Google Maps, Instagram …"></label>
      <label class="field"><span>Notiz</span><input class="input" name="note" value="${esc(p.note)}" placeholder="z. B. Sonnenuntergang, nur bei Ebbe"></label>
    </form>`, `
    ${id ? `<button class="btn btn-danger" data-action="delete-place" data-id="${id}">Löschen</button>` : '<button class="btn btn-ghost" data-close>Abbrechen</button>'}
    <button class="btn" form="place-form" type="submit">Speichern</button>`);
  $('#place-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canWrite()) return;
    const f = Object.fromEntries(new FormData(e.target));
    await withBusy(async () => {
      await db.save('places', {
        ...(id ? { id } : {}),
        area: f.area.trim(), name: f.name.trim(), category: f.category,
        url: f.url.trim() || null, note: f.note.trim() || null,
      });
      closeSheet();
      go('#/travel/places');
      toast('Gespeichert');
    });
  });
}

// ================================================================ To-dos

function todoLink(t) {
  if (t.transport_id) {
    const tr = state.transports.find((x) => x.id === t.transport_id);
    if (tr) return { label: `${cleanPlace(tr.from_place)} → ${cleanPlace(tr.to_place)}, ${dayLabel(tr.departure_local)}`, sortKey: tr.departure_local, icon: (KINDS[tr.kind] || KINDS.other).icon };
  }
  if (t.stay_id) {
    const s = state.stays.find((x) => x.id === t.stay_id);
    if (s) return { label: `${s.name}, ab ${dayLabel(s.check_in)}`, sortKey: s.check_in, icon: 'bed' };
  }
  return null;
}

function todoSortKey(t) {
  return t.due_on || todoLink(t)?.sortKey || String(t.sort ?? 9999).padStart(6, '0');
}

const NO_CAT = 'Allgemein';

function todoItem(t, { showLink = true } = {}) {
  const link = showLink ? todoLink(t) : null;
  const overdue = !t.done && t.due_on && t.due_on < todayLocal();
  return `
    <li class="${t.done ? 'is-done' : ''}">
      <button class="check-box" data-action="toggle-todo" data-id="${t.id}" aria-label="${t.done ? 'Als offen markieren' : 'Als erledigt markieren'}">${t.done ? icon('check') : ''}</button>
      <button class="check-text" data-action="edit-todo" data-id="${t.id}">
        <span class="x-title">${esc(t.text)}</span>
        ${t.due_on || link ? `<span class="x-sub">${t.due_on ? `<span class="${overdue ? 'is-late' : ''}">bis ${esc(dayLabel(t.due_on))}</span>` : ''}${t.due_on && link ? ', ' : ''}${link ? esc(link.label) : ''}</span>` : ''}
      </button>
    </li>`;
}

/** Kategorien in der Reihenfolge, in der sie angelegt wurden */
function todoCategories() {
  const first = new Map();
  for (const t of state.todos || []) {
    const c = t.category || NO_CAT;
    const k = t.sort ?? 1e9;
    if (!first.has(c) || k < first.get(c)) first.set(c, k);
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
}

function nextSort(category) {
  const all = state.todos || [];
  const inCat = all.filter((t) => (t.category || NO_CAT) === (category || NO_CAT));
  const pool = inCat.length ? inCat : all;
  return Math.max(0, ...pool.map((t) => t.sort || 0)) + (inCat.length ? 10 : 100);
}

const openTodoCats = new Set();

function renderTodos() {
  const view = $('#view');
  const list = state.todos || [];
  if (!list.length) {
    view.innerHTML = `
      <div class="empty">
        <h2>Noch keine To-dos</h2>
        <p>Legt To-dos mit Kategorie an, oder hängt sie an eine Fahrt oder Unterkunft. Dann erscheinen sie auch dort in den Details.</p>
        <button class="btn" data-action="new-todo">${icon('plus')}To-do hinzufügen</button>
      </div>`;
    return;
  }
  const cats = todoCategories();
  const totalOpen = list.filter((t) => !t.done).length;
  view.innerHTML = `
    <p class="page-intro">${totalOpen} offen, ${list.length - totalOpen} erledigt. Für euch beide gleich.</p>
    ${cats.map((c) => {
      const items = list.filter((t) => (t.category || NO_CAT) === c);
      const open = items.filter((t) => !t.done).sort((a, b) => todoSortKey(a).localeCompare(todoSortKey(b)));
      const done = items.filter((t) => t.done).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
      const pct = Math.round((done.length / items.length) * 100);
      return `
      <section class="todo-cat${open.length ? '' : ' all-done'}">
        <div class="todo-head">
          <h3>${esc(c)}</h3>
          <span>${done.length} von ${items.length} erledigt</span>
        </div>
        <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <ul class="checklist">
          ${open.map((t) => todoItem(t)).join('')}
          <li class="add-row">
            <form class="quick-add inline" data-todo-cat="${esc(c)}" autocomplete="off">
              <span class="add-plus">${icon('plus')}</span>
              <input class="input" name="text" placeholder="Hinzufügen" aria-label="To-do in ${esc(c)} hinzufügen">
            </form>
          </li>
        </ul>
        ${done.length ? `<details class="done-list" data-cat="${esc(c)}"${openTodoCats.has(c) ? ' open' : ''}><summary>${done.length} erledigt</summary>
          <ul class="checklist">${done.map((t) => todoItem(t)).join('')}</ul></details>` : ''}
      </section>`;
    }).join('')}`;
  view.querySelectorAll('details.done-list').forEach((d) => d.addEventListener('toggle', () => {
    if (d.open) openTodoCats.add(d.dataset.cat); else openTodoCats.delete(d.dataset.cat);
  }));
}

// Schnell-Eingabe in einer Kategorie
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-todo-cat]');
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text || !canWrite()) return;
  const cat = form.dataset.todoCat;
  const category = cat === NO_CAT ? null : cat;
  try {
    await db.save('todos', { text, category, sort: nextSort(category) });
    rerender();
    // Fokus bleibt in derselben Kategorie, damit man mehrere hintereinander tippen kann
    const again = [...document.querySelectorAll('[data-todo-cat]')].find((f) => f.dataset.todoCat === cat);
    again?.text.focus();
  } catch (err) { toast(errText(err)); }
});

/** To-do-Abschnitt in den Details einer Fahrt oder Unterkunft. */
export function todosHtml(field, id) {
  const list = (state.todos || []).filter((t) => t[field] === id).sort((a, b) => a.done - b.done);
  return `
    <div class="section-title">To-dos</div>
    ${list.length ? `<ul class="checklist">${list.map((t) => todoItem(t, { showLink: false })).join('')}</ul>` : ''}
    <form class="quick-add" data-todo-for="${field}" data-todo-id="${id}" autocomplete="off">
      <input class="input" name="text" placeholder="z. B. Bargeld bereithalten" aria-label="To-do hinzufügen">
      <button class="btn" type="submit" aria-label="Hinzufügen">${icon('plus')}</button>
    </form>`;
}

// Schnell-Eingabe in Detailansichten (Formular wird bei jedem Öffnen neu gezeichnet)
document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-todo-for]');
  if (!form) return;
  e.preventDefault();
  const text = form.text.value.trim();
  if (!text || !canWrite()) return;
  const field = form.dataset.todoFor;
  const id = form.dataset.todoId;
  try {
    await db.save('todos', { text, [field]: id, category: 'Unterwegs', sort: nextSort('Unterwegs') });
    reopenParent(field, id);
    rerender();
  } catch (err) { toast(errText(err)); }
});

function reopenParent(field, id) {
  if (field === 'transport_id') openTransportDetail(id);
  else if (field === 'stay_id') openStayDetail(id);
}

function openTodoForm(id) {
  const t = state.todos?.find((x) => x.id === id) || {};
  const now = Date.now();
  const transports = sortedTransports().filter((x) => depUtc(x) > now - 86400000 || x.id === t.transport_id);
  const stays = [...state.stays].sort((a, b) => a.check_in.localeCompare(b.check_in)).filter((s) => s.check_out >= todayLocal() || s.id === t.stay_id);
  const cur = t.transport_id ? `t:${t.transport_id}` : t.stay_id ? `s:${t.stay_id}` : '';
  openSheet(id ? 'To-do bearbeiten' : 'Neues To-do', `
    <form id="todo-form" autocomplete="off">
      <label class="field"><span>Was?</span><input class="input" name="text" required value="${esc(t.text)}"></label>
      <label class="field"><span>Kategorie</span>
        <input class="input" name="category" list="todo-cats" value="${esc(t.category || '')}" placeholder="z. B. Wohnen & Umzug">
        <datalist id="todo-cats">${todoCategories().filter((c) => c !== NO_CAT).map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span>Erledigen bis (optional)</span><input class="input" type="date" name="due_on" value="${esc(t.due_on)}"></label>
      <label class="field"><span>Gehört zu (optional)</span><select class="input" name="link">
        <option value="">nichts</option>
        <optgroup label="Fahrten">${transports.map((x) => `<option value="t:${x.id}"${cur === `t:${x.id}` ? ' selected' : ''}>${esc(`${dayLabel(x.departure_local)}: ${cleanPlace(x.from_place)} → ${cleanPlace(x.to_place)}`)}</option>`).join('')}</optgroup>
        <optgroup label="Unterkünfte">${stays.map((s) => `<option value="s:${s.id}"${cur === `s:${s.id}` ? ' selected' : ''}>${esc(`${dayLabel(s.check_in)}: ${s.name}`)}</option>`).join('')}</optgroup>
      </select></label>
    </form>`, `
    ${id ? `<button class="btn btn-danger" data-action="delete-todo" data-id="${id}">Löschen</button>` : '<button class="btn btn-ghost" data-close>Abbrechen</button>'}
    <button class="btn" form="todo-form" type="submit">Speichern</button>`);
  $('#todo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!canWrite()) return;
    const f = Object.fromEntries(new FormData(e.target));
    const [kind, ref] = (f.link || ':').split(':');
    await withBusy(async () => {
      await db.save('todos', {
        ...(id ? { id } : {}),
        text: f.text.trim(), due_on: f.due_on || null,
        category: f.category.trim() || null,
        ...(id ? {} : { sort: nextSort(f.category.trim() || null) }),
        transport_id: kind === 't' ? ref : null, stay_id: kind === 's' ? ref : null,
      });
      closeSheet();
      rerender();
      toast('To-do gespeichert');
    });
  });
}

async function toggle(table, id) {
  if (!canWrite()) return;
  const row = state[table].find((x) => x.id === id);
  if (!row) return;
  try {
    await db.save(table, { id, done: !row.done });
    // Detailansicht offen? Dann dort aktualisieren
    const sheetOpen = $('#sheet').open;
    if (sheetOpen && table === 'todos' && (row.transport_id || row.stay_id)) {
      reopenParent(row.transport_id ? 'transport_id' : 'stay_id', row.transport_id || row.stay_id);
    }
    rerender();
  } catch (err) { toast(errText(err)); }
}

// ================================================================ Kalender (.ics)

const icsEsc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

function icsDate(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Lange Zeilen nach RFC 5545 umbrechen (max. 75 Byte, ohne Zeichen zu zerschneiden) */
const enc = new TextEncoder();
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const KIND_EMOJI = { flight: '✈️', ferry: '⛴️', bus: '🚐', train: '🚆', taxi: '🚕', other: '🎫' };

function transportEvent(t, stamp) {
  const start = depUtc(t);
  const end = t.arrival_local ? localToUtc(t.arrival_local, t.arrival_tz || t.departure_tz) : start + 3600000;
  const before = t.be_there_minutes ?? 30;
  const bt = beThere(t);
  const desc = [
    bt && `Da sein: ${hhmm(bt)} Uhr (Ortszeit)`,
    t.departure_location && `Abfahrt: ${t.departure_location}`,
    t.arrival_location && `Ankunft: ${t.arrival_location}`,
    [t.carrier, t.number].filter(Boolean).join(' '),
    t.confirmation_code && `Buchung: ${t.confirmation_code}`,
    t.notes,
  ].filter(Boolean).join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${t.id}@companion`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(Math.max(end, start + 900000))}`,
    `SUMMARY:${icsEsc(`${KIND_EMOJI[t.kind] || '🎫'} ${cleanPlace(t.from_place)} → ${cleanPlace(t.to_place)}`)}`,
    `LOCATION:${icsEsc([t.departure_location, t.from_place].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEsc(desc)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`In 1 Std. losgehen: ${cleanPlace(t.from_place)} → ${cleanPlace(t.to_place)}`)}`,
    `TRIGGER:-PT${before + 60}M`, 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(`Jetzt da sein: ${t.departure_location || t.from_place}`)}`,
    `TRIGGER:-PT${before}M`, 'END:VALARM',
    'END:VEVENT',
  ];
}

function stayEvent(s, stamp) {
  const d = (x) => x.replace(/-/g, '');
  return [
    'BEGIN:VEVENT',
    `UID:${s.id}@companion`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d(s.check_in)}`,
    `DTEND;VALUE=DATE:${d(s.check_out)}`,
    `SUMMARY:${icsEsc(`🛏 ${s.name}`)}`,
    s.address ? `LOCATION:${icsEsc(s.address)}` : null,
    `DESCRIPTION:${icsEsc([s.check_in_time && `Check-in ${s.check_in_time}`, s.check_out_time && `Check-out ${s.check_out_time}`, s.confirmation_code && `Buchung: ${s.confirmation_code}`].filter(Boolean).join('\n'))}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean);
}

function buildIcs(transports, stays) {
  const stamp = icsDate(Date.now());
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Companion//Travel Buddy//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...transports.flatMap((t) => transportEvent(t, stamp)),
    ...stays.flatMap((s) => stayEvent(s, stamp)),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

function downloadIcs(name, text) {
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function openCalendarSheet() {
  const now = Date.now();
  const upcoming = sortedTransports().filter((t) => depUtc(t) > now);
  const stays = state.stays.filter((s) => s.check_out >= todayLocal());
  openSheet('In Kalender übernehmen', `
    <p style="margin-top:0">Lädt eine Kalenderdatei mit <strong>${upcoming.length} kommenden Fahrten</strong>. Euer Handy fragt dann, ob es sie in den Kalender übernehmen soll.</p>
    <ul class="plain-list">
      <li>Erinnerung 1 Std. vor der „Da sein“-Zeit</li>
      <li>zweite Erinnerung, wenn ihr da sein solltet</li>
      <li>Pier/Terminal und Buchungsnummer im Termin</li>
    </ul>
    <label class="check"><input type="checkbox" id="ics-stays" checked> Auch die ${stays.length} Unterkünfte als ganztägige Einträge</label>
    <p class="page-intro">Nach Änderungen an einer Fahrt übernehmt ihr am besten nur diese neu (in den Details: „In Kalender“), sonst stehen Termine doppelt drin.</p>`, `
    <button class="btn btn-ghost" data-close>Abbrechen</button>
    <button class="btn" data-action="calendar-download">${icon('cal')}Kalenderdatei laden</button>`);
}

// ================================================================ Aktionen

export function handleAction(action, el) {
  const { id } = el.dataset;
  const del = (table, msg, after) => {
    if (!canWrite() || !confirm(msg)) return true;
    db.remove(table, id).then(() => { closeSheet(); after?.(); rerender(); toast('Gelöscht'); })
      .catch((err) => toast(errText(err)));
    return true;
  };
  switch (action) {
    case 'new-doc': openDocForm(); return true;
    case 'open-doc': openDocDetail(id); return true;
    case 'edit-doc': openDocForm(id); return true;
    case 'delete-traveldoc': return del('travel_docs', 'Dokument und alle Fotos löschen?');
    case 'new-contact': openContactForm(); return true;
    case 'edit-contact': openContactForm(id); return true;
    case 'delete-contact': return del('contacts', 'Kontakt löschen?');
    case 'show-address': showAddress(); return true;
    case 'new-place': openPlaceForm(); return true;
    case 'edit-place': openPlaceForm(id); return true;
    case 'delete-place': return del('places', 'Eintrag löschen?');
    case 'toggle-place': toggle('places', id); return true;
    case 'new-todo': openTodoForm(); return true;
    case 'edit-todo': openTodoForm(id); return true;
    case 'delete-todo': return del('todos', 'To-do löschen?');
    case 'toggle-todo': toggle('todos', id); return true;
    case 'calendar-all': closeDrawer(); openCalendarSheet(); return true;
    case 'calendar-download': {
      const now = Date.now();
      const withStays = $('#ics-stays')?.checked;
      const ts = sortedTransports().filter((t) => depUtc(t) > now);
      const ss = withStays ? state.stays.filter((s) => s.check_out >= todayLocal()) : [];
      downloadIcs('reise.ics', buildIcs(ts, ss));
      closeSheet();
      toast('Kalenderdatei geladen');
      return true;
    }
    case 'calendar-one': {
      const t = state.transports.find((x) => x.id === id);
      if (t) downloadIcs(`${cleanPlace(t.from_place)}-${cleanPlace(t.to_place)}.ics`.replace(/\s+/g, '-'), buildIcs([t], []));
      return true;
    }
    default: return false;
  }
}

function closeDrawer() {
  const d = $('#drawer');
  if (d?.open) d.close();
}

