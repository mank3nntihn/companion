// Modul "Travel Buddy": Tickets (Flüge, Fähren, Busse) und Unterkünfte.

import { TRIP_NAME } from '../../config.js';
import * as db from '../../core/data.js';
import { state } from '../../core/data.js';
import { go, rerender } from '../../core/router.js';
import {
  $, $$, esc, safeUrl, icon, toast, canWrite, errText, copyBtn, todayLocal,
  sheet, openSheet, closeSheet, withBusy, factsHtml,
} from '../../core/ui.js';
import {
  ZONES, zoneLabel, localToUtc, toInputValue, hhmm, addMinutesLocal, dayLabel, dayKey,
  todayIn, nightsBetween, countdown,
} from '../../core/time.js';
import { PLATFORMS, parseStayLink, detectPlatform, extractUrl, mapsUrl } from './links.js';
import { demoData, demoTicketSvg } from './demo.js';

db.registerTable('stays', 'check_in');
db.registerTable('transports', 'departure_local');
db.registerDemo(demoData);
db.registerDocFallback((doc) => {
  if (!doc.storage_path.startsWith('demo/')) return null;
  const t = state.transports.find((x) => x.id === doc.transport_id);
  return new Blob([demoTicketSvg(doc.file_name.replace(/\.svg$/, ''), t?.confirmation_code || 'DEMO')], { type: 'image/svg+xml' });
});

const KINDS = {
  flight: { label: 'Flug', icon: 'flight', before: 120 },
  ferry: { label: 'Fähre / Boot', icon: 'ferry', before: 30 },
  bus: { label: 'Bus / Van', icon: 'bus', before: 20 },
  train: { label: 'Zug', icon: 'train', before: 20 },
  taxi: { label: 'Transfer', icon: 'taxi', before: 10 },
  other: { label: 'Sonstiges', icon: 'other', before: 15 },
};

// ================================================================ Abgeleitete Daten

function depUtc(t) { return localToUtc(t.departure_local, t.departure_tz); }
function endUtc(t) {
  if (t.arrival_local) return localToUtc(t.arrival_local, t.arrival_tz || t.departure_tz);
  return depUtc(t) + 60 * 60000;
}

function sortedTransports() {
  return [...state.transports].sort((a, b) => depUtc(a) - depUtc(b));
}

function nextTransport() {
  const now = Date.now();
  return sortedTransports().find((t) => depUtc(t) > now - 30 * 60000 && endUtc(t) > now);
}

function beThere(t) {
  if (!t.be_there_minutes) return null;
  return addMinutesLocal(t.departure_local, -t.be_there_minutes);
}

function routeHtml(t) {
  return `${esc(t.from_place)}<span class="arrow">→</span>${esc(t.to_place)}`;
}

const docCount = (field, id) => state.documents.filter((d) => d[field] === id).length;

// ================================================================ Seite: Tickets

function renderTickets() {
  const view = $('#view');
  const list = sortedTransports();
  if (!list.length) {
    view.innerHTML = `
      <div class="empty">
        <h2>Noch keine Tickets</h2>
        <p>Trag deinen ersten Flug oder die erste Fähre ein und häng das Ticket als Foto oder PDF an.</p>
        <button class="btn" data-action="new-transport">${icon('plus')}Ticket hinzufügen</button>
      </div>`;
    return;
  }

  const now = Date.now();
  const next = nextTransport();
  const upcoming = list.filter((t) => endUtc(t) > now && t !== next);
  const past = list.filter((t) => endUtc(t) <= now).reverse();

  let html = '';
  if (next) html += stubHtml(next);
  if (upcoming.length) {
    html += `<div class="section-title">Danach <small>${upcoming.length} ${upcoming.length === 1 ? 'Fahrt' : 'Fahrten'}</small></div>`;
    html += groupedByDay(upcoming);
  } else if (next) {
    html += `<p class="sync-line">Danach ist nichts mehr geplant.</p>`;
  }
  if (past.length) {
    html += `<details class="past"><summary>Vergangen (${past.length})</summary>${groupedByDay(past)}</details>`;
  }
  html += syncLine();
  view.innerHTML = html;
}

function stubHtml(t) {
  const k = KINDS[t.kind] || KINDS.other;
  const docs = docCount('transport_id', t.id);
  const bt = beThere(t);
  const cd = countdown((bt ? localToUtc(bt, t.departure_tz) : depUtc(t)) - Date.now());
  const place = t.departure_location || t.from_place;
  const sub = [t.carrier, t.number].filter(Boolean).join(' ');
  return `
  <article class="stub" aria-label="Nächste Abfahrt">
    <div class="stub-main">
      <div class="stub-kind">${icon(k.icon)}<span>Nächste Abfahrt</span>
        <span class="count">${esc(dayLabel(t.departure_local))}</span></div>
      <h2 class="stub-route">${routeHtml(t)}</h2>
      ${sub || t.title ? `<div class="stub-meta">${esc([t.title, sub].filter(Boolean).join(', '))}</div>` : ''}
      <div class="stub-times">
        ${bt ? `<div><div class="lbl">Da sein</div><div class="big">${hhmm(bt)}</div></div>
                <div><div class="lbl">Abfahrt</div><div class="mid">${hhmm(t.departure_local)}</div></div>`
             : `<div><div class="lbl">Abfahrt</div><div class="big">${hhmm(t.departure_local)}</div></div>`}
        <div class="countdown" data-countdown="${t.id}">${esc(cd)}</div>
      </div>
    </div>
    <div class="stub-perf"></div>
    <div class="stub-foot">
      <a class="stub-place" href="${mapsUrl(place + (t.departure_location ? ', ' + t.from_place : ''))}" target="_blank" rel="noopener">
        ${icon('pin')}<span>${esc(place)}${t.departure_location ? `<small>${esc(t.from_place)}, ${esc(zoneLabel(t.departure_tz))}-Zeit</small>` : `<small>${esc(zoneLabel(t.departure_tz))}-Zeit</small>`}</span>
      </a>
      <div class="stub-actions">
        ${docs ? `<button class="btn btn-dark" data-action="view-docs" data-id="${t.id}">${icon('other')}Tickets zeigen (${docs})</button>` : ''}
        <button class="btn btn-ghost" data-action="open-transport" data-id="${t.id}">Details</button>
        ${t.confirmation_code ? `<button class="btn btn-ghost" data-copy="${esc(t.confirmation_code)}">${icon('copy')}${esc(t.confirmation_code)}</button>` : ''}
      </div>
    </div>
  </article>`;
}

function groupedByDay(list) {
  let html = '';
  let last = '';
  for (const t of list) {
    const key = dayKey(t.departure_local);
    if (key !== last) {
      const isToday = key === todayIn(t.departure_tz);
      html += `<div class="day-head${isToday ? ' today' : ''}">${isToday ? 'Heute, ' : ''}${esc(dayLabel(key))}</div>`;
      last = key;
    }
    html += transportCard(t);
  }
  return html;
}

function transportCard(t) {
  const k = KINDS[t.kind] || KINDS.other;
  const docs = docCount('transport_id', t.id);
  const bt = beThere(t);
  const sub = [t.departure_location, [t.carrier, t.number].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return `
  <button class="card" data-action="open-transport" data-id="${t.id}">
    <div class="t-row">
      <div class="t-time">${hhmm(t.departure_local)}${bt ? `<small>da sein ${hhmm(bt)}</small>` : ''}</div>
      <div>
        <div class="t-route">${routeHtml(t)}</div>
        ${sub ? `<div class="t-sub">${esc(sub)}</div>` : ''}
      </div>
      <div class="t-side">${icon(k.icon)}${docs ? `<span class="chip">${icon('file')}${docs}</span>` : ''}</div>
    </div>
  </button>`;
}

// ================================================================ Seite: Unterkünfte

function renderStays() {
  const view = $('#view');
  const list = [...state.stays].sort((a, b) => a.check_in.localeCompare(b.check_in));
  if (!list.length) {
    view.innerHTML = `
      <div class="empty">
        <h2>Noch keine Unterkünfte</h2>
        <p>Füg den Link aus Booking.com, Airbnb oder Agoda ein, Name und Daten übernehme ich aus dem Link.</p>
        <button class="btn" data-action="new-stay">${icon('plus')}Unterkunft hinzufügen</button>
      </div>`;
    return;
  }
  const today = todayLocal();
  const upcoming = list.filter((s) => s.check_out >= today);
  const past = list.filter((s) => s.check_out < today).reverse();
  const current = upcoming.find((s) => s.check_in <= today && today < s.check_out);

  let html = '';
  if (upcoming.length) {
    const total = upcoming.reduce((n, s) => n + Math.max(0, nightsBetween(s.check_in, s.check_out)), 0);
    html += `<div class="section-title">${current ? 'Jetzt & danach' : 'Als Nächstes'} <small>${total} ${total === 1 ? 'Nacht' : 'Nächte'} gebucht</small></div>`;
    upcoming.forEach((s, i) => {
      const prev = upcoming[i - 1];
      if (prev && s.check_in > prev.check_out) {
        const n = nightsBetween(prev.check_out, s.check_in);
        html += `<div class="gap-note">${icon('bed')}${n} ${n === 1 ? 'Nacht' : 'Nächte'} ohne Unterkunft (${esc(dayLabel(prev.check_out))} bis ${esc(dayLabel(s.check_in))})</div>`;
      }
      html += stayCard(s, s === current);
    });
  } else {
    html += `<p class="sync-line">Keine kommenden Unterkünfte.</p>`;
  }
  if (past.length) html += `<details class="past"><summary>Vergangen (${past.length})</summary>${past.map((s) => stayCard(s)).join('')}</details>`;
  html += syncLine();
  view.innerHTML = html;
}

function stayCard(s, isNow = false) {
  const nights = nightsBetween(s.check_in, s.check_out);
  const docs = docCount('stay_id', s.id);
  const today = todayLocal();
  let status = '';
  if (isNow) status = s.check_out === addDay(today) ? '<span class="chip warn">Morgen Check-out</span>' : '<span class="chip">Jetzt hier</span>';
  else if (s.check_in === today) status = '<span class="chip">Heute Check-in</span>';
  else if (s.check_out === today) status = '<span class="chip warn">Heute Check-out</span>';
  return `
  <button class="card s-card${isNow ? ' now' : ''}" data-action="open-stay" data-id="${s.id}">
    <div class="s-band">
      <div class="s-dates"><div class="n">${nights}</div><div class="u">${nights === 1 ? 'Nacht' : 'Nächte'}</div></div>
      <div class="s-body">
        <div class="s-name">${esc(s.name)}</div>
        <div class="s-range">${esc(dayLabel(s.check_in))} bis ${esc(dayLabel(s.check_out))}</div>
        <div class="s-tags">
          ${status}
          <span class="chip plain">${esc(PLATFORMS[s.platform] || 'Sonstige')}</span>
          ${s.paid ? '' : '<span class="chip warn">nicht bezahlt</span>'}
          ${docs ? `<span class="chip">${icon('file')}${docs}</span>` : ''}
        </div>
      </div>
    </div>
  </button>`;
}

function addDay(d) {
  return new Date(Date.parse(d + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
}

function syncLine() {
  if (db.isDemo) return `<p class="sync-line">Vorschau mit Beispieldaten. Änderungen bleiben nur auf diesem Gerät.</p>`;
  if (!state.fetchedAt) return '';
  const total = state.documents.length;
  const cached = state.documents.filter((d) => state.cachedDocs.has(d.id)).length;
  const at = new Date(state.fetchedAt);
  const time = at.toLocaleString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const files = total ? ` ${cached} von ${total} Dateien offline verfügbar.` : '';
  return `<p class="sync-line">Stand ${esc(time)}.${files}</p>`;
}

// ================================================================ Detail: Ticket

function openTransportDetail(id) {
  const t = state.transports.find((x) => x.id === id);
  if (!t) return;
  const k = KINDS[t.kind] || KINDS.other;
  const bt = beThere(t);
  const facts = [
    ['Abfahrt', `${dayLabel(t.departure_local)}, ${hhmm(t.departure_local)} (${zoneLabel(t.departure_tz)})`],
    bt && ['Da sein', `${hhmm(bt)} (${t.be_there_minutes} Min. vorher)`],
    t.departure_location && ['Abfahrtsort', t.departure_location, mapsUrl(t.departure_location + ', ' + t.from_place)],
    t.arrival_local && ['Ankunft', `${dayLabel(t.arrival_local)}, ${hhmm(t.arrival_local)} (${zoneLabel(t.arrival_tz || t.departure_tz)})`],
    t.arrival_location && ['Ankunftsort', t.arrival_location, mapsUrl(t.arrival_location + ', ' + t.to_place)],
    (t.carrier || t.number) && ['Gesellschaft', [t.carrier, t.number].filter(Boolean).join(' ')],
    t.confirmation_code && ['Buchungsnr.', null, null, copyBtn(t.confirmation_code)],
    t.seats && ['Sitze', t.seats],
    t.baggage && ['Gepäck', t.baggage],
    t.notes && ['Notizen', t.notes],
  ].filter(Boolean);

  openSheet(`${esc(k.label)}${t.title ? ': ' + esc(t.title) : ''}`, `
    <p class="big-route">${routeHtml(t)}</p>
    ${factsHtml(facts)}
    <div class="detail-actions">
      ${safeUrl(t.booking_url) ? `<a class="btn btn-ghost" href="${esc(t.booking_url)}" target="_blank" rel="noopener">${icon('ext')}Buchung öffnen</a>` : ''}
    </div>
    <div class="section-title" style="margin-top:4px">Tickets & Bestätigungen</div>
    ${docsHtml('transport_id', t.id)}
  `, `
    <button class="btn btn-danger" data-action="delete-transport" data-id="${t.id}">Löschen</button>
    <button class="btn" data-action="edit-transport" data-id="${t.id}">Bearbeiten</button>`);
  loadThumbs();
}


function docsHtml(field, id) {
  const docs = state.documents.filter((d) => d[field] === id);
  return `
    <div class="docs">
      ${docs.map((d) => `
        <div class="doc">
          <button type="button" class="doc-open" data-action="view-doc" data-doc="${d.id}" style="all:unset;cursor:pointer;display:contents">
            <div class="thumb" data-thumb="${d.id}">${icon('file')}</div>
            <div class="name">${esc(d.label || d.file_name)}</div>
          </button>
          ${state.cachedDocs.has(d.id) ? `<span class="ok" title="Offline verfügbar">${icon('check')}</span>` : ''}
          <button type="button" class="doc-del" data-action="delete-doc" data-doc="${d.id}" aria-label="${esc(d.file_name)} löschen">${icon('close')}</button>
        </div>`).join('')}
      <label class="upload">${icon('plus')}Foto oder PDF hinzufügen
        <input type="file" accept="image/*,application/pdf" multiple hidden data-upload="${field}" data-parent="${id}">
      </label>
    </div>`;
}

async function loadThumbs() {
  for (const el of $$('[data-thumb]', sheet)) {
    const doc = state.documents.find((d) => d.id === el.dataset.thumb);
    if (!doc || !(doc.mime_type || '').startsWith('image/')) continue;
    try {
      const blob = await db.getDocBlob(doc);
      const url = URL.createObjectURL(blob);
      el.innerHTML = `<img src="${url}" alt="">`;
      el.querySelector('img').onload = () => URL.revokeObjectURL(url);
    } catch { /* bleibt Icon */ }
  }
}

// ================================================================ Detail: Unterkunft

function openStayDetail(id) {
  const s = state.stays.find((x) => x.id === id);
  if (!s) return;
  const nights = nightsBetween(s.check_in, s.check_out);
  const facts = [
    ['Check-in', `${dayLabel(s.check_in, true)}${s.check_in_time ? ', ' + s.check_in_time : ''}`],
    ['Check-out', `${dayLabel(s.check_out, true)}${s.check_out_time ? ', ' + s.check_out_time : ''}`],
    ['Nächte', String(nights)],
    s.address && ['Adresse', s.address, mapsUrl(s.address)],
    ['Gebucht über', PLATFORMS[s.platform] || 'Sonstige'],
    s.confirmation_code && ['Buchungsnr.', null, null, copyBtn(s.confirmation_code)],
    s.price != null && s.price !== '' && ['Preis', `${Number(s.price).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${s.currency || ''}${s.paid ? ', bezahlt' : ', noch nicht bezahlt'}`],
    s.contact && ['Kontakt', s.contact],
    s.notes && ['Notizen', s.notes],
  ].filter(Boolean);

  openSheet(esc(s.name), `
    ${factsHtml(facts)}
    <div class="detail-actions">
      ${safeUrl(s.booking_url) ? `<a class="btn" href="${esc(s.booking_url)}" target="_blank" rel="noopener">${icon('ext')}In ${esc(PLATFORMS[s.platform] === 'Sonstige' ? 'Browser' : PLATFORMS[s.platform])} öffnen</a>` : ''}
      ${s.address ? `<a class="btn btn-ghost" href="${esc(mapsUrl(s.address))}" target="_blank" rel="noopener">${icon('pin')}Karte</a>` : ''}
    </div>
    <div class="section-title" style="margin-top:4px">Bestätigungen</div>
    ${docsHtml('stay_id', s.id)}
  `, `
    <button class="btn btn-danger" data-action="delete-stay" data-id="${s.id}">Löschen</button>
    <button class="btn" data-action="edit-stay" data-id="${s.id}">Bearbeiten</button>`);
  loadThumbs();
}

// ================================================================ Formular: Unterkunft

let pendingFiles = [];

function fileField() {
  return `
    <div class="field"><span>Bestätigung / Tickets (optional)</span>
      <input class="input" type="file" accept="image/*,application/pdf" multiple data-pending>
      <small>Fotos, Screenshots oder PDFs. Werden auf beiden Handys offline gespeichert.</small>
    </div>`;
}

function openStayForm(id, prefill = {}) {
  const s = { ...(state.stays.find((x) => x.id === id) || {}), ...prefill };
  const lastStay = [...state.stays].sort((a, b) => b.check_out.localeCompare(a.check_out))[0];
  const ci = s.check_in || (id ? '' : lastStay?.check_out || '');
  pendingFiles = [];
  const platformOpts = Object.entries(PLATFORMS).map(([k, v]) => `<option value="${k}"${(s.platform || 'booking') === k ? ' selected' : ''}>${esc(v)}</option>`).join('');

  openSheet(id ? 'Unterkunft bearbeiten' : 'Neue Unterkunft', `
    <form id="stay-form" autocomplete="off">
      <div class="link-box">
        <label class="field"><span>Link aus Booking.com, Airbnb oder Agoda</span>
          <div class="link-row">
            <input class="input" name="booking_url" type="url" inputmode="url" placeholder="https://www.booking.com/hotel/…" value="${esc(s.booking_url)}">
            <button type="button" class="btn btn-ghost" data-action="paste-link">Einfügen</button>
          </div>
        </label>
        <div class="link-hint" id="link-hint">Name und Reisedaten werden aus dem Link übernommen, wenn sie drinstehen.</div>
      </div>
      <label class="field"><span>Name</span><input class="input" name="name" required value="${esc(s.name)}" placeholder="z. B. Lanta Palm Bungalows"></label>
      <div class="row-2">
        <label class="field"><span>Check-in</span><input class="input" type="date" name="check_in" required value="${esc(ci)}"${!s.check_in && ci ? ' data-auto="1"' : ''}></label>
        <label class="field"><span>Check-out</span><input class="input" type="date" name="check_out" required value="${esc(s.check_out)}"></label>
      </div>
      <div class="row-2">
        <label class="field"><span>Check-in-Zeit</span><input class="input" name="check_in_time" value="${esc(s.check_in_time)}" placeholder="ab 14:00"></label>
        <label class="field"><span>Check-out-Zeit</span><input class="input" name="check_out_time" value="${esc(s.check_out_time)}" placeholder="bis 11:00"></label>
      </div>
      <label class="field"><span>Adresse</span><input class="input" name="address" value="${esc(s.address)}" placeholder="Straße, Ort"></label>
      <div class="row-2">
        <label class="field"><span>Gebucht über</span><select class="input" name="platform">${platformOpts}</select></label>
        <label class="field"><span>Buchungsnummer</span><input class="input" name="confirmation_code" value="${esc(s.confirmation_code)}"></label>
      </div>
      <div class="row-3-1">
        <label class="field"><span>Preis</span><input class="input" name="price" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(s.price)}"></label>
        <label class="field"><span>Währung</span><select class="input" name="currency">
          ${['EUR', 'THB', 'IDR', 'MYR', 'USD', 'SGD', 'VND'].map((c) => `<option${(s.currency || 'EUR') === c ? ' selected' : ''}>${c}</option>`).join('')}
        </select></label>
      </div>
      <label class="check"><input type="checkbox" name="paid"${s.paid ? ' checked' : ''}> Schon bezahlt</label>
      <label class="field"><span>Kontakt (Host, Rezeption)</span><input class="input" name="contact" value="${esc(s.contact)}" placeholder="Telefon oder WhatsApp"></label>
      <label class="field"><span>Notizen</span><textarea class="input" name="notes" placeholder="Schlüsselbox-Code, Anfahrt, Frühstück …">${esc(s.notes)}</textarea></label>
      ${id ? '' : fileField()}
    </form>`, `
    <button class="btn btn-ghost" data-close>Abbrechen</button>
    <button class="btn" form="stay-form" type="submit">Speichern</button>`);

  const form = $('#stay-form');
  const urlInput = form.booking_url;
  form.check_in.addEventListener('input', () => { delete form.check_in.dataset.auto; });
  urlInput.addEventListener('input', () => applyLink(form));
  if (prefill.booking_url) applyLink(form);
  form.addEventListener('submit', (e) => { e.preventDefault(); submitStay(form, id); });
}

function applyLink(form) {
  const hint = $('#link-hint');
  const raw = form.booking_url.value.trim();
  if (!raw) { hint.textContent = 'Name und Reisedaten werden aus dem Link übernommen, wenn sie drinstehen.'; hint.classList.remove('ok'); return; }
  const info = parseStayLink(raw);
  if (!info) { hint.textContent = 'Das sieht nicht nach einem Link aus.'; hint.classList.remove('ok'); return; }
  form.booking_url.value = info.url;
  form.platform.value = info.platform;
  const got = [];
  if (info.name && !form.name.value) { form.name.value = info.name; got.push('Name'); }
  if (info.check_in && (!form.check_in.value || form.check_in.dataset.auto)) { form.check_in.value = info.check_in; form.check_in.dataset.auto = '1'; got.push('Check-in'); }
  if (info.check_out && !form.check_out.value) { form.check_out.value = info.check_out; got.push('Check-out'); }
  const p = PLATFORMS[info.platform];
  if (info.platform === 'other') hint.textContent = 'Link gespeichert. Die Details bitte selbst eintragen.';
  else if (got.length) hint.textContent = `${p} erkannt: ${got.join(', ')} übernommen.`;
  else if (info.platform === 'airbnb') hint.textContent = 'Airbnb erkannt. Den Namen bitte selbst eintragen, er steht nicht im Link.';
  else hint.textContent = `${p} erkannt.`;
  hint.classList.toggle('ok', info.platform !== 'other');
}

async function submitStay(form, id) {
  if (!canWrite()) return;
  const f = Object.fromEntries(new FormData(form));
  if (f.check_out < f.check_in) { toast('Check-out liegt vor dem Check-in.'); return; }
  const row = {
    ...(id ? { id } : {}),
    name: f.name.trim(),
    booking_url: f.booking_url.trim() || null,
    platform: f.platform,
    check_in: f.check_in,
    check_out: f.check_out,
    check_in_time: f.check_in_time.trim() || null,
    check_out_time: f.check_out_time.trim() || null,
    address: f.address.trim() || null,
    confirmation_code: f.confirmation_code.trim() || null,
    price: f.price === '' ? null : Number(f.price),
    currency: f.currency,
    paid: form.paid.checked,
    contact: f.contact.trim() || null,
    notes: f.notes.trim() || null,
  };
  await withBusy(async () => {
    const saved = await db.save('stays', row);
    await uploadPending({ stay_id: saved.id });
    closeSheet();
    go('#/travel/stays');
    toast(id ? 'Unterkunft gespeichert' : 'Unterkunft hinzugefügt');
  });
}

// ================================================================ Formular: Ticket

function openTransportForm(id) {
  const existing = state.transports.find((x) => x.id === id);
  const last = sortedTransports().at(-1);
  const t = existing || {
    kind: 'ferry',
    departure_tz: last?.arrival_tz || last?.departure_tz || 'Asia/Bangkok',
    from_place: last?.to_place || '',
  };
  pendingFiles = [];
  const zoneOpts = (sel) => ZONES.map(([z, l]) => `<option value="${z}"${sel === z ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const kindSeg = Object.entries(KINDS).map(([k, v]) => `
      <input type="radio" name="kind" id="kind-${k}" value="${k}"${(t.kind || 'ferry') === k ? ' checked' : ''}>
      <label for="kind-${k}">${icon(v.icon)}${esc(v.label)}</label>`).join('');

  openSheet(id ? 'Ticket bearbeiten' : 'Neues Ticket', `
    <form id="transport-form" autocomplete="off">
      <div class="seg" role="radiogroup" aria-label="Art">${kindSeg}</div>
      <div class="row-2">
        <label class="field"><span>Von</span><input class="input" name="from_place" required value="${esc(t.from_place)}" placeholder="Krabi"></label>
        <label class="field"><span>Nach</span><input class="input" name="to_place" required value="${esc(t.to_place)}" placeholder="Koh Lanta"></label>
      </div>

      <fieldset class="group"><legend>Abfahrt</legend>
        <div class="row-2">
          <label class="field"><span>Datum und Uhrzeit</span><input class="input" type="datetime-local" name="departure_local" required value="${esc(toInputValue(t.departure_local))}"></label>
          <label class="field"><span>Ortszeit</span><select class="input" name="departure_tz">${zoneOpts(t.departure_tz)}</select></label>
        </div>
        <label class="field"><span>Wo genau? (Pier, Terminal, Treffpunkt)</span><input class="input" name="departure_location" value="${esc(t.departure_location)}" placeholder="z. B. Klong Jilad Pier"></label>
        <label class="field"><span>Wie viele Minuten vorher da sein?</span>
          <input class="input" name="be_there_minutes" type="number" min="0" max="600" step="5" inputmode="numeric" value="${esc(t.be_there_minutes ?? KINDS[t.kind || 'ferry'].before)}"></label>
      </fieldset>

      <fieldset class="group"><legend>Ankunft (optional)</legend>
        <div class="row-2">
          <label class="field"><span>Datum und Uhrzeit</span><input class="input" type="datetime-local" name="arrival_local" value="${esc(toInputValue(t.arrival_local))}"></label>
          <label class="field"><span>Ortszeit</span><select class="input" name="arrival_tz">${zoneOpts(t.arrival_tz || t.departure_tz)}</select></label>
        </div>
        <label class="field"><span>Wo kommt ihr an?</span><input class="input" name="arrival_location" value="${esc(t.arrival_location)}" placeholder="z. B. Saladan Pier"></label>
      </fieldset>

      <fieldset class="group"><legend>Buchung</legend>
        <div class="row-2">
          <label class="field"><span>Gesellschaft</span><input class="input" name="carrier" value="${esc(t.carrier)}"></label>
          <label class="field"><span>Nummer</span><input class="input" name="number" value="${esc(t.number)}" placeholder="Flugnr."></label>
        </div>
        <label class="field"><span>Buchungsnummer</span><input class="input" name="confirmation_code" value="${esc(t.confirmation_code)}"></label>
        <label class="field"><span>Bezeichnung (optional)</span><input class="input" name="title" value="${esc(t.title)}" placeholder="z. B. Speedboat inkl. Hoteltransfer"></label>
        <label class="field"><span>Link zur Buchung</span><input class="input" name="booking_url" type="url" inputmode="url" value="${esc(t.booking_url)}" placeholder="https://…"></label>
        <div class="row-2">
          <label class="field"><span>Sitze</span><input class="input" name="seats" value="${esc(t.seats)}"></label>
          <label class="field"><span>Gepäck</span><input class="input" name="baggage" value="${esc(t.baggage)}"></label>
        </div>
        <label class="field"><span>Notizen</span><textarea class="input" name="notes" placeholder="Abholung am Hotel, Bargeld mitnehmen …">${esc(t.notes)}</textarea></label>
      </fieldset>
      ${id ? '' : fileField()}
    </form>`, `
    <button class="btn btn-ghost" data-close>Abbrechen</button>
    <button class="btn" form="transport-form" type="submit">Speichern</button>`);

  const form = $('#transport-form');
  const before = form.be_there_minutes;
  let touched = !!existing;
  before.addEventListener('input', () => { touched = true; });
  $$('input[name="kind"]', form).forEach((r) => r.addEventListener('change', () => {
    if (!touched) before.value = KINDS[r.value].before;
  }));
  form.departure_tz.addEventListener('change', () => {
    if (!form.arrival_local.value) form.arrival_tz.value = form.departure_tz.value;
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submitTransport(form, id); });
}

async function submitTransport(form, id) {
  if (!canWrite()) return;
  const f = Object.fromEntries(new FormData(form));
  const nul = (v) => (String(v ?? '').trim() || null);
  if (f.arrival_local && localToUtc(f.arrival_local, f.arrival_tz) < localToUtc(f.departure_local, f.departure_tz)) {
    toast('Die Ankunft liegt vor der Abfahrt.');
    return;
  }
  const row = {
    ...(id ? { id } : {}),
    kind: f.kind,
    title: nul(f.title),
    carrier: nul(f.carrier),
    number: nul(f.number),
    from_place: f.from_place.trim(),
    to_place: f.to_place.trim(),
    departure_location: nul(f.departure_location),
    arrival_location: nul(f.arrival_location),
    departure_local: f.departure_local,
    departure_tz: f.departure_tz,
    arrival_local: nul(f.arrival_local),
    arrival_tz: f.arrival_local ? f.arrival_tz : null,
    be_there_minutes: f.be_there_minutes === '' ? null : Number(f.be_there_minutes),
    confirmation_code: nul(f.confirmation_code),
    booking_url: nul(f.booking_url),
    seats: nul(f.seats),
    baggage: nul(f.baggage),
    notes: nul(f.notes),
  };
  await withBusy(async () => {
    const saved = await db.save('transports', row);
    await uploadPending({ transport_id: saved.id });
    closeSheet();
    go('#/travel/tickets');
    toast(id ? 'Ticket gespeichert' : 'Ticket hinzugefügt');
  });
}

// ================================================================ Uploads


async function uploadPending(parent) {
  const files = pendingFiles;
  pendingFiles = [];
  let ok = 0;
  for (const file of files) {
    try { await db.uploadDocument(file, parent); ok++; } catch (e) { toast(`${file.name}: ${errText(e)}`); }
  }
  return ok;
}

async function uploadNow(input) {
  if (!canWrite()) { input.value = ''; return; }
  const field = input.dataset.upload;
  const parentId = input.dataset.parent;
  const files = [...input.files];
  if (!files.length) return;
  toast(files.length === 1 ? 'Lade hoch …' : `Lade ${files.length} Dateien hoch …`);
  let ok = 0;
  for (const file of files) {
    try { await db.uploadDocument(file, { [field]: parentId }); ok++; } catch (e) { toast(`${file.name}: ${errText(e)}`); }
  }
  if (ok) toast(ok === 1 ? 'Datei gespeichert' : `${ok} Dateien gespeichert`);
  if (field === 'transport_id') openTransportDetail(parentId); else openStayDetail(parentId);
  rerender();
}

// ================================================================ Ticket-Viewer (Vollbild)

const viewer = $('#viewer');
let viewerUrls = [];
let wakeLock = null;

async function openViewer(docs, title) {
  if (!docs.length) return;
  viewer.innerHTML = `
    <div class="viewer-head"><h2>${esc(title)}</h2>
      <button class="icon-btn" data-vclose aria-label="Schließen">${icon('close')}</button></div>
    <div class="viewer-strip">${docs.map((d) => `
      <section class="viewer-page" data-vdoc="${d.id}">
        <div class="frame"><div class="viewer-msg">Wird geladen …</div></div>
        <div class="cap"><span>${esc(d.label || d.file_name)}</span></div>
      </section>`).join('')}</div>
    ${docs.length > 1 ? `<div class="viewer-dots">${docs.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : '<div class="viewer-dots"></div>'}`;
  viewer.showModal();
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* egal */ }

  const strip = $('.viewer-strip', viewer);
  strip.addEventListener('scroll', () => {
    const i = Math.round(strip.scrollLeft / strip.clientWidth);
    $$('.viewer-dots i', viewer).forEach((dot, j) => dot.classList.toggle('on', i === j));
  }, { passive: true });

  for (const d of docs) {
    const page = $(`[data-vdoc="${d.id}"]`, viewer);
    const frame = $('.frame', page);
    try {
      const blob = await db.getDocBlob(d);
      const url = URL.createObjectURL(blob);
      viewerUrls.push(url);
      const type = d.mime_type || blob.type;
      if (type.startsWith('image/')) {
        frame.innerHTML = `<img src="${url}" alt="${esc(d.file_name)}">`;
      } else if (type === 'application/pdf') {
        frame.innerHTML = `<iframe src="${url}#view=FitH" title="${esc(d.file_name)}"></iframe>`;
      } else {
        frame.innerHTML = `<div class="viewer-msg">Vorschau nicht möglich. Tipp auf „Öffnen“.</div>`;
      }
      const cap = $('.cap', page);
      cap.insertAdjacentHTML('beforeend', `<a class="btn" href="${url}" target="_blank" rel="noopener" download="${esc(d.file_name)}">${icon('ext')}Öffnen</a>`);
      if (navigator.canShare) {
        const file = new File([blob], d.file_name, { type });
        if (navigator.canShare({ files: [file] })) {
          const b = document.createElement('button');
          b.className = 'btn';
          b.textContent = 'Teilen';
          b.onclick = () => navigator.share({ files: [file] }).catch(() => {});
          cap.append(b);
        }
      }
    } catch (e) {
      frame.innerHTML = `<div class="viewer-msg">${esc(errText(e))}</div>`;
    }
  }
}

function closeViewer() {
  if (viewer.open) viewer.close();
}

viewer.addEventListener('close', () => {
  viewerUrls.forEach((u) => URL.revokeObjectURL(u));
  viewerUrls = [];
  wakeLock?.release?.().catch(() => {});
  wakeLock = null;
  viewer.innerHTML = '';
});
viewer.addEventListener('click', (e) => { if (e.target.closest('[data-vclose]')) closeViewer(); });

// ================================================================ Aktionen

function handleAction(action, el) {
  const { id } = el.dataset;
  switch (action) {
    case 'new-transport': openTransportForm(); return true;
    case 'new-stay': openStayForm(); return true;
    case 'open-transport': openTransportDetail(id); return true;
    case 'open-stay': openStayDetail(id); return true;
    case 'edit-transport': openTransportForm(id); return true;
    case 'edit-stay': openStayForm(id); return true;
    case 'view-docs': {
      const t = state.transports.find((x) => x.id === id);
      openViewer(db.docsFor('transport_id', id), `${t.from_place} → ${t.to_place}`);
      return true;
    }
    case 'view-doc': {
      const doc = state.documents.find((d) => d.id === el.dataset.doc);
      const field = doc.transport_id ? 'transport_id' : 'stay_id';
      const all = db.docsFor(field, doc[field]);
      openViewer([doc, ...all.filter((d) => d !== doc)], doc.label || doc.file_name);
      return true;
    }
    case 'delete-doc': {
      const doc = state.documents.find((d) => d.id === el.dataset.doc);
      if (!doc || !canWrite() || !confirm(`„${doc.file_name}“ löschen?`)) return true;
      db.deleteDocument(doc).then(() => {
        toast('Datei gelöscht');
        if (doc.transport_id) openTransportDetail(doc.transport_id); else openStayDetail(doc.stay_id);
        rerender();
      }).catch((err) => toast(errText(err)));
      return true;
    }
    case 'delete-transport':
    case 'delete-stay': {
      const table = action === 'delete-stay' ? 'stays' : 'transports';
      if (!canWrite() || !confirm('Wirklich löschen? Angehängte Dateien werden auch gelöscht.')) return true;
      db.remove(table, id).then(() => {
        closeSheet();
        rerender();
        toast('Gelöscht');
      }).catch((err) => toast(errText(err)));
      return true;
    }
    case 'paste-link':
      navigator.clipboard.readText().then((text) => {
        const form = $('#stay-form');
        form.booking_url.value = extractUrl(text) || text.trim();
        applyLink(form);
      }).catch(() => toast('Einfügen nicht erlaubt. Halte das Feld gedrückt und wähle „Einfügen“.'));
      return true;
    case 'share-as-stay': openStayForm(null, { booking_url: el.dataset.url }); return true;
    case 'share-as-transport':
      openTransportForm();
      $('#transport-form').booking_url.value = el.dataset.url;
      return true;
    default: return false;
  }
}

function handleChange(e) {
  const up = e.target.closest('[data-upload]');
  if (up) { uploadNow(up); return true; }
  const pend = e.target.closest('[data-pending]');
  if (pend) { pendingFiles = [...pend.files]; return true; }
  return false;
}

/** Geteilter Link (Android "Teilen"). true, wenn das Modul ihn übernimmt. */
function handleShare(raw) {
  if (detectPlatform(raw) !== 'other') {
    go('#/travel/stays');
    openStayForm(null, { booking_url: raw });
  } else {
    go('#/travel/tickets');
    openSheet('Link speichern', `
      <p style="margin-top:0;overflow-wrap:anywhere">${esc(raw)}</p>
      <div style="display:grid;gap:10px">
        <button class="btn" data-action="share-as-transport" data-url="${esc(raw)}">Als Ticket speichern</button>
        <button class="btn btn-ghost" data-action="share-as-stay" data-url="${esc(raw)}">Als Unterkunft speichern</button>
      </div>`);
  }
  return true;
}

// ================================================================ Kachel auf der Übersicht

function card() {
  const lines = [];
  const next = nextTransport();
  if (next) {
    const k = KINDS[next.kind] || KINDS.other;
    lines.push(`<li>${icon(k.icon)}<span><strong>${esc(next.from_place)} → ${esc(next.to_place)}</strong>
      ${esc(dayLabel(next.departure_local))}, ${hhmm(next.departure_local)} (${esc(countdown(depUtc(next) - Date.now()))})</span></li>`);
  }
  const today = todayLocal();
  const stay = [...state.stays].sort((a, b) => a.check_in.localeCompare(b.check_in))
    .find((s) => s.check_out > today);
  if (stay) {
    const now = stay.check_in <= today;
    lines.push(`<li>${icon('bed')}<span><strong>${esc(stay.name)}</strong>
      ${now ? `bis ${esc(dayLabel(stay.check_out))}` : `ab ${esc(dayLabel(stay.check_in))}`}</span></li>`);
  }
  if (!lines.length) return '<p class="tile-empty">Noch nichts eingetragen.</p>';
  return `<ul class="tile-list">${lines.join('')}</ul>`;
}

// ================================================================ Modul

export default {
  id: 'travel',
  name: 'Travel Buddy',
  description: 'Tickets und Unterkünfte, auch offline.',
  icon: 'ferry',
  title: () => TRIP_NAME,
  tabs: [
    { id: 'tickets', label: 'Tickets', icon: 'other' },
    { id: 'stays', label: 'Unterkünfte', icon: 'bed' },
  ],
  render(sub) {
    $('#add-btn').setAttribute('aria-label', sub === 'stays' ? 'Unterkunft hinzufügen' : 'Ticket hinzufügen');
    if (sub === 'stays') renderStays(); else renderTickets();
  },
  onAdd(sub) { if (sub === 'stays') openStayForm(); else openTransportForm(); },
  refreshEvery: 30000,
  isBusy: () => viewer.open,
  handleAction,
  handleChange,
  handleShare,
  card,
};
