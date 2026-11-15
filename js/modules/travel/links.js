// Erkennt Unterkunfts-Links und liest daraus Plattform, Name und Reisedaten.

export const PLATFORMS = {
  booking: 'Booking.com',
  airbnb: 'Airbnb',
  agoda: 'Agoda',
  hostelworld: 'Hostelworld',
  direct: 'Direkt gebucht',
  other: 'Sonstige',
};

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

function titleCase(slug) {
  return decodeURIComponent(slug)
    .replace(/[-_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function addDays(date, n) {
  const t = new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000);
  return t.toISOString().slice(0, 10);
}

/** Findet die erste URL in einem Text (z. B. aus "Teilen"). */
export function extractUrl(text) {
  const m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
}

export function detectPlatform(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'other'; }
  if (/(^|\.)booking\.com$/.test(host)) return 'booking';
  if (/(^|\.)airbnb\.[a-z.]+$/.test(host) || host === 'abnb.me') return 'airbnb';
  if (/(^|\.)agoda\.(com|[a-z.]+)$/.test(host)) return 'agoda';
  if (/(^|\.)hostelworld\.com$/.test(host)) return 'hostelworld';
  return 'other';
}

/**
 * Liefert {platform, name, check_in, check_out, url}. Felder, die sich
 * nicht aus dem Link lesen lassen, bleiben leer.
 */
export function parseStayLink(input) {
  const raw = extractUrl(input) || input;
  let u;
  try { u = new URL(raw); } catch { return null; }
  const platform = detectPlatform(u.href);
  const q = u.searchParams;
  const parts = u.pathname.split('/').filter(Boolean);
  const out = { platform, url: u.href, name: '', check_in: '', check_out: '' };

  if (platform === 'booking') {
    // /hotel/th/baan-krating-phuket.de.html
    const i = parts.indexOf('hotel');
    if (i >= 0 && parts[i + 2]) out.name = titleCase(parts[i + 2].replace(/(\.[a-z]{2}(-[a-z]{2})?)?\.html$/i, ''));
    out.check_in = q.get('checkin') || '';
    out.check_out = q.get('checkout') || '';
    if (!out.check_in && q.get('checkin_year')) {
      const p = (k) => String(q.get(k) || '').padStart(2, '0');
      out.check_in = `${q.get('checkin_year')}-${p('checkin_month')}-${p('checkin_monthday')}`;
      out.check_out = `${q.get('checkout_year')}-${p('checkout_month')}-${p('checkout_monthday')}`;
    }
  } else if (platform === 'agoda') {
    // /de-de/the-slate/hotel/phuket-th.html
    const i = parts.indexOf('hotel');
    if (i > 0) out.name = titleCase(parts[i - 1]);
    const ci = q.get('checkIn') || q.get('checkin') || '';
    out.check_in = ci.slice(0, 10);
    const co = q.get('checkOut') || q.get('checkout') || '';
    out.check_out = co.slice(0, 10);
    const los = parseInt(q.get('los') || '', 10);
    if (isDate(out.check_in) && !out.check_out && los > 0) out.check_out = addDays(out.check_in, los);
  } else if (platform === 'airbnb') {
    out.check_in = q.get('check_in') || q.get('checkin') || '';
    out.check_out = q.get('check_out') || q.get('checkout') || '';
  } else if (platform === 'hostelworld') {
    // /pwa/hosteldetails.php/Name/City/12345  oder  /hostels/p/12345/name-slug/
    const i = parts.indexOf('hosteldetails.php');
    if (i >= 0 && parts[i + 1]) out.name = titleCase(parts[i + 1]);
    const j = parts.indexOf('p');
    if (!out.name && j >= 0 && parts[j + 2]) out.name = titleCase(parts[j + 2]);
    out.check_in = q.get('from') || '';
    out.check_out = q.get('to') || '';
  }

  if (!isDate(out.check_in)) out.check_in = '';
  if (!isDate(out.check_out)) out.check_out = '';
  return out;
}

export function mapsUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
