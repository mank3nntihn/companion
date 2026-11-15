// Zeit-Hilfen. Tickets speichern die Ortszeit (Wanduhr) + Zeitzone des Ortes.

export const ZONES = [
  ['Asia/Bangkok', 'Thailand'],
  ['Asia/Makassar', 'Bali / Lombok'],
  ['Asia/Jakarta', 'Java / Sumatra'],
  ['Asia/Kuala_Lumpur', 'Malaysia'],
  ['Asia/Singapore', 'Singapur'],
  ['Asia/Ho_Chi_Minh', 'Vietnam'],
  ['Asia/Phnom_Penh', 'Kambodscha'],
  ['Asia/Vientiane', 'Laos'],
  ['Asia/Manila', 'Philippinen'],
  ['Asia/Hong_Kong', 'Hongkong'],
  ['Asia/Tokyo', 'Japan'],
  ['Asia/Dubai', 'Dubai'],
  ['Asia/Qatar', 'Katar'],
  ['Europe/Istanbul', 'Türkei'],
  ['Europe/Berlin', 'Deutschland'],
];

export function zoneLabel(tz) {
  const z = ZONES.find(([id]) => id === tz);
  return z ? z[1] : tz;
}

const pad = (n) => String(n).padStart(2, '0');

/** "2026-12-02T09:00:00" -> {y,m,d,h,mi} */
export function parseLocal(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5] };
}

/** Offset der Zeitzone (in Minuten) zum gegebenen UTC-Zeitpunkt. */
function zoneOffset(tz, utcMs) {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - utcMs) / 60000);
  } catch {
    return 0;
  }
}

/** Ortszeit + Zeitzone -> UTC-Millisekunden */
export function localToUtc(str, tz) {
  const p = parseLocal(str);
  if (!p) return NaN;
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  let utc = guess - zoneOffset(tz, guess) * 60000;
  utc = guess - zoneOffset(tz, utc) * 60000;
  return utc;
}

/** Wert für <input type="datetime-local"> */
export function toInputValue(str) {
  const p = parseLocal(str);
  return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}` : '';
}

export function hhmm(str) {
  const p = parseLocal(str);
  return p ? `${pad(p.h)}:${pad(p.mi)}` : '';
}

export function addMinutesLocal(str, minutes) {
  const p = parseLocal(str);
  if (!p) return null;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) + minutes * 60000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

const WD = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

/** Datum (YYYY-MM-DD oder lokaler Zeitstempel) -> "Mi., 2. Dez." */
export function dayLabel(str, withYear = false) {
  const m = String(str || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WD[dt.getUTCDay()]}, ${+m[3]}. ${MON[+m[2] - 1]}${withYear ? ' ' + m[1] : ''}`;
}

export function dayKey(str) {
  return String(str || '').slice(0, 10);
}

/** Heutiges Datum (YYYY-MM-DD) in einer Zeitzone */
export function todayIn(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function nightsBetween(a, b) {
  const da = Date.parse(a + 'T00:00:00Z');
  const db = Date.parse(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
}

/** Countdown-Text, z. B. "in 2 Tagen 4 Std." */
export function countdown(ms) {
  if (!isFinite(ms)) return '';
  if (ms < 0) {
    const ago = -ms;
    if (ago < 3600000) return `vor ${Math.max(1, Math.round(ago / 60000))} Min.`;
    return 'abgefahren';
  }
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'jetzt';
  if (min < 60) return `in ${min} Min.`;
  const h = Math.floor(min / 60);
  const rm = min % 60;
  if (h < 24) return `in ${h} Std.${rm ? ' ' + rm + ' Min.' : ''}`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return `in ${d} ${d === 1 ? 'Tag' : 'Tagen'}${rh ? ' ' + rh + ' Std.' : ''}`;
}
